/**
 * Classification engine v3 — token-based classification (Part 2 of the prompt).
 *
 * CRITICAL CHANGE vs. v2: matching is TOKEN-based, NEVER substring.
 *  (§2.1) "OVOS" cannot match "NOVOS" — see src/lib/tokenizer.ts.
 *  (§2.2) Single-token rules use `tokenEquals`; multi-token phrases use
 *         `phraseMatches` (contiguous sub-sequence of tokens).
 *  (§2.3) Multi-word expressions ("AMAZON PRIME", "MERCADO LIVRE") are matched
 *         as complete phrases and win over shorter/generic matches (§2.5).
 *
 * Scoring layers (highest priority wins):
 *  0. Credit-card payment descriptions → synthetic invoice item (unchanged)
 *  1. Named ClassificationRules (priority order, active only) — token-based
 *  2. Learned exact-match rules (legacy LearnedMapping, normalized full match)
 *  3. Known merchants (src/lib/merchants.ts) — phrases + aliases
 *  4. Item keywords + aliases — token/phrase scoring
 *  5. Legacy category keyword map (fallback, mapped to an item id)
 *
 * Each suggestion carries a numeric confidence (§2.12) so the caller can send
 * low-confidence suggestions to review (§2.13) instead of auto-applying them.
 */
import { ClassificationRule, FinancialItem, Transaction, LearnedMapping } from '../types/finance'
import {
  normalizeDescription,
  classifyByExactMatch,
  buildLearnedRulesMap,
  suggestCategoryByKeywords,
  isCreditCardPaymentDescription,
} from './learningEngine'
import { MERCHANTS, Merchant, DEFAULT_REVIEW_THRESHOLD, ConfidenceLevel } from './merchants'
import {
  tokenize,
  tokenEquals,
  tokenSet,
  phraseMatches,
  phraseTokens,
  normalizeRaw,
} from './tokenizer'

export interface ClassifyResult {
  itemId: string | null
  /** confidence level for the suggestion (§2.12) */
  confidence: 'rule' | 'exact' | 'merchant' | 'keyword' | 'none'
  /** numeric confidence 0..100 (§2.12); callers compare against the review threshold */
  confidenceScore: number
  /** human-readable reason (pt-BR), shown in tooltips */
  reason: string | null
  /** true when the suggestion is below the review threshold → should be sent to review */
  needsReview: boolean
}

/**
 * Evaluate a single classification rule against a transaction.
 *
 * Token-based matching (§2.1, §2.2): "contains" no longer uses substring — it
 * uses token equality (single word) or phrase containment (multi word). This
 * is what makes `token = OVOS` NOT match "MERCADO LIVRE NOVOS".
 *
 * The `contains` operator is preserved by name for backward compatibility with
 * rules stored in localStorage, but its semantics are now token-based.
 */
export function evaluateRule(rule: ClassificationRule, tx: Transaction): boolean {
  if (rule.status !== 'active') return false
  const { field, operator, value } = rule.condition

  switch (field) {
    case 'description': {
      // 'contains' → token equality (single word) or phrase containment
      if (operator === 'contains') {
        const v = normalizeRaw(value)
        if (!v) return false
        // multi-word phrase → contiguous token sub-sequence
        if (v.includes(' ')) return phraseMatches(tx.description, value)
        // single word → token equality (NOT substring)
        return tokenEquals(tx.description, value)
      }
      if (operator === 'equals') {
        return normalizeRaw(tx.description) === normalizeRaw(value)
      }
      if (operator === 'startsWith') {
        const descTokens = tokenize(tx.description)
        const vTokens = phraseTokens(value)
        if (vTokens.length === 0 || vTokens.length > descTokens.length) return false
        return vTokens.every((t, i) => t === descTokens[i])
      }
      if (operator === 'endsWith') {
        const descTokens = tokenize(tx.description)
        const vTokens = phraseTokens(value)
        if (vTokens.length === 0 || vTokens.length > descTokens.length) return false
        return vTokens.every((t, i) => t === descTokens[descTokens.length - vTokens.length + i])
      }
      if (operator === 'regex') {
        try {
          const re = new RegExp(value, 'i')
          return re.test(tx.description)
        } catch {
          return false
        }
      }
      return false
    }
    case 'amount': {
      const a = tx.amount
      const v = Number(value)
      if (isNaN(v)) return false
      switch (operator) {
        case 'gt':
          return a > v
        case 'lt':
          return a < v
        case 'gte':
          return a >= v
        case 'lte':
          return a <= v
        case 'equals':
          return a === v
        default:
          return false
      }
    }
    case 'type':
      return normalizeRaw(tx.type) === normalizeRaw(value)
    case 'source':
      return normalizeRaw(tx.source ?? '') === normalizeRaw(value)
    default:
      return false
  }
}

/**
 * Build a quick lookup of active rules sorted by priority (lowest priority
 * number = highest precedence, evaluated first).
 */
export function sortRulesByPriority(rules: ClassificationRule[]): ClassificationRule[] {
  return [...rules].filter((r) => r.status === 'active').sort((a, b) => a.priority - b.priority)
}

/**
 * Test a rule against an arbitrary description string (§2.16).
 * Returns whether the rule matches, plus a short human reason.
 *
 * Used by the Regras page's "testar regra" feature before saving.
 */
export function testRuleAgainstDescription(
  rule: Pick<ClassificationRule, 'condition' | 'status'>,
  description: string,
): { matches: boolean; reason: string } {
  if (rule.status !== 'active') return { matches: false, reason: 'Regra inativa' }
  const fakeTx = {
    description,
    amount: 0,
    type: 'expense',
    source: '',
  } as unknown as Transaction
  const matches = evaluateRule(rule as ClassificationRule, fakeTx)
  return {
    matches,
    reason: matches ? `Corresponde (operador ${rule.condition.operator})` : 'Não corresponde',
  }
}

/**
 * Token-based scoring of an item against a description (§2.2).
 * Single-token keywords use `tokenEquals`; multi-token phrases use
 * `phraseMatches`. Longer phrases win (§2.5) via specificity weighting.
 */
function scoreItem(
  description: string,
  item: FinancialItem,
): { score: number; matchedTerm: string | null; confidence: number } {
  if (!description) return { score: 0, matchedTerm: null, confidence: 0 }
  const terms: string[] = []
  for (const kw of item.keywords) terms.push(kw)
  for (const al of item.aliases) terms.push(al)
  terms.push(item.name)

  type Hit = { term: string; isPhrase: boolean; tokenLen: number; charLen: number }
  const hits: Hit[] = []

  for (const term of terms) {
    if (!term) continue
    const pTokens = phraseTokens(term)
    if (pTokens.length === 0) continue
    if (pTokens.length === 1) {
      // single token → token equality (NOT substring)
      if (tokenEquals(description, term)) {
        hits.push({ term, isPhrase: false, tokenLen: 1, charLen: pTokens[0].length })
      }
    } else {
      // multi-word phrase → contiguous token sub-sequence
      if (phraseMatches(description, term)) {
        hits.push({
          term,
          isPhrase: true,
          tokenLen: pTokens.length,
          charLen: pTokens.join('').length,
        })
      }
    }
  }

  if (hits.length === 0) return { score: 0, matchedTerm: null, confidence: 0 }

  // Confidence tiers (§2.12):
  //   multi-token phrase → 90 (expressão específica)
  //   2+ single-token matches → 75 (conjunto forte de palavras)
  //   single token that IS the item NAME → 75 (specific enough to auto-apply)
  //   single generic keyword → 50 (palavra genérica → review)
  const phraseHits = hits.filter((h) => h.isPhrase)
  const singleHits = hits.filter((h) => !h.isPhrase)
  const itemNameNorm = normalizeRaw(item.name)

  let best: { score: number; matchedTerm: string | null; confidence: number } = {
    score: 0,
    matchedTerm: null,
    confidence: 0,
  }

  if (phraseHits.length > 0) {
    const longest = phraseHits.sort((a, b) => b.tokenLen - a.tokenLen)[0]
    best = { score: 70 + longest.charLen, matchedTerm: longest.term, confidence: 90 }
  } else if (singleHits.length >= 2) {
    const longest = singleHits.sort((a, b) => b.charLen - a.charLen)[0]
    best = { score: 50 + longest.charLen, matchedTerm: longest.term, confidence: 75 }
  } else {
    const m = singleHits[0]
    const isName = normalizeRaw(m.term) === itemNameNorm
    best = {
      score: 30 + m.charLen,
      matchedTerm: m.term,
      confidence: isName ? 75 : 50,
    }
  }
  return best
}

/**
 * Match the transaction description against the merchant registry (§2.4, §2.5).
 *
 * Priority order (§2.4 hierarchy):
 *   1. Known merchant (phrase)            — confidence 98
 *   2. Merchant alias (phrase)            — confidence 98
 *   3. Composite specific rule            — handled by ClassificationRules
 *   4. Generic keywords (single token)    — confidence 50
 *
 * Specificity (§2.5): longer phrases win. So "AMAZON PRIME" (subscription)
 * beats "AMAZON" (marketplace). Intermediators are detected first and stripped
 * before the merchant name is evaluated (§2.11).
 *
 * Returns the winning merchant (if any) and the remaining description after
 * stripping the leading intermediator prefix.
 */
export function matchMerchant(description: string): {
  merchant: Merchant | null
  reason: string | null
} {
  if (!description) return { merchant: null, reason: null }

  const tokens = tokenize(description)

  // --- Detect + strip a leading payment intermediator (§2.11) ---
  // Intermediators (Mercado Pago, PayPal, etc.) are NEVER the final merchant.
  // Detect one as a LEADING token/phrase, strip it, then evaluate the rest.
  let cleanedDesc = description
  for (const m of MERCHANTS) {
    if (!m.active || m.kind !== 'intermediator') continue
    let matched = false
    for (const alias of m.aliases) {
      const aNorm = normalizeRaw(alias)
      if (!aNorm) continue
      if (!aNorm.includes(' ')) {
        // single-token alias: match leading token equality or prefix
        if (tokens.length > 0 && (tokens[0] === aNorm || tokens[0].startsWith(aNorm))) {
          cleanedDesc = tokens.filter((t) => !(t === aNorm || t.startsWith(aNorm))).join(' ')
          matched = true
          break
        }
      } else {
        // multi-word phrase alias: match as a LEADING phrase
        const pTokens = aNorm.split(' ')
        if (pTokens.length <= tokens.length && pTokens.every((t, i) => tokens[i] === t)) {
          cleanedDesc = tokens.slice(pTokens.length).join(' ')
          matched = true
          break
        }
      }
    }
    if (matched) break
  }

  // --- Match non-intermediator merchants by phrase specificity (§2.5) ---
  // Priority hierarchy: 1 estabelecimento → 2 alias → (3 regra composta is
  // handled by ClassificationRules above) → 4 palavra completa → 5 genérico.
  // Specificity: longer phrases win. "AMAZON PRIME" (2 tokens) beats "AMAZON"
  // (1 token) so the subscription wins over the marketplace (§2.9).
  const candidates: { merchant: Merchant; alias: string; specificity: number }[] = []
  for (const m of MERCHANTS) {
    if (!m.active || m.kind === 'intermediator') continue
    for (const alias of m.aliases) {
      const aNorm = normalizeRaw(alias)
      if (!aNorm) continue
      if (phraseMatches(cleanedDesc, alias)) {
        candidates.push({ merchant: m, alias, specificity: phraseTokens(alias).length })
      }
    }
  }
  if (candidates.length === 0) {
    // fall back to single-token merchant matches (generic, confidence 50)
    const cleanedTokens = tokenSet(cleanedDesc)
    for (const m of MERCHANTS) {
      if (!m.active || m.kind !== 'generic') continue
      for (const alias of m.aliases) {
        const aNorm = normalizeRaw(alias)
        if (!aNorm || aNorm.includes(' ')) continue
        if (cleanedTokens.has(aNorm)) {
          return { merchant: m, reason: `Estabelecimento genérico: token '${aNorm}'` }
        }
      }
    }
    return { merchant: null, reason: null }
  }

  // Specificity wins: longest phrase, then highest priority (§2.5, §2.4)
  candidates.sort((a, b) => {
    if (b.specificity !== a.specificity) return b.specificity - a.specificity
    return b.merchant.priority - a.merchant.priority
  })
  const winner = candidates[0]
  return {
    merchant: winner.merchant,
    reason: `Estabelecimento: ${winner.merchant.name} (expressão '${normalizeRaw(winner.alias)}')`,
  }
}

/**
 * Main classification entrypoint. Returns the suggested itemId (or null),
 * a confidence level, a numeric confidence score, and a pt-BR explanation.
 *
 * Callers should compare `confidenceScore` against `DEFAULT_REVIEW_THRESHOLD`
 * (or their own threshold) and route low-confidence suggestions to review
 * (§2.12, §2.13) instead of auto-applying them.
 */
export function classifyTransaction(
  tx: Transaction,
  items: FinancialItem[],
  rules: ClassificationRule[],
  learnedRules: LearnedMapping[] | Map<string, LearnedMapping>,
  legacyCategories?: { id: string; name: string }[],
  reviewThreshold: number = DEFAULT_REVIEW_THRESHOLD,
): ClassifyResult {
  if (!tx.description) {
    return { itemId: null, confidence: 'none', confidenceScore: 0, reason: null, needsReview: true }
  }

  // 0. Credit-card payment descriptions → synthetic invoice item (unchanged)
  if (isCreditCardPaymentDescription(tx.description)) {
    const ccItem = items.find(
      (i) =>
        i.name.toLowerCase().includes('fatura') ||
        i.name.toLowerCase().includes('cartao') ||
        i.name.toLowerCase().includes('cartão'),
    )
    if (ccItem) {
      return {
        itemId: ccItem.id,
        confidence: 'keyword',
        confidenceScore: 90,
        reason: 'Descrição corresponde a pagamento de fatura/cartão',
        needsReview: false,
      }
    }
  }

  // 1. Named rules (priority order) — token-based (§2.2)
  const sortedRules = sortRulesByPriority(rules)
  for (const rule of sortedRules) {
    if (evaluateRule(rule, tx)) {
      const item = items.find((i) => i.id === rule.action.itemId)
      if (item) {
        return {
          itemId: item.id,
          confidence: 'rule',
          confidenceScore: 100,
          reason: `Regra "${rule.name}": ${rule.condition.operator} '${rule.condition.value}'`,
          needsReview: false,
        }
      }
    }
  }

  // 2. Learned exact-match rules (legacy) — full normalized description match
  const exact = classifyByExactMatch(tx.description, learnedRules)
  if (exact.matched && exact.categoryId) {
    const byLegacyId = legacyCategoryToItem(exact.categoryId, items)
    if (byLegacyId) {
      return {
        itemId: byLegacyId.id,
        confidence: 'exact',
        confidenceScore: 100,
        reason: `Correspondência exata aprendida`,
        needsReview: false,
      }
    }
  }

  // 3. Known merchants (§2.4 hierarchy)
  const { merchant, reason } = matchMerchant(tx.description)
  if (merchant) {
    // find the item matching the merchant's itemId (must exist in the catalog)
    const item = items.find((i) => i.id === merchant.itemId)
    if (item) {
      return {
        itemId: item.id,
        confidence: 'merchant',
        confidenceScore: merchant.confidence,
        reason,
        needsReview: merchant.confidence < reviewThreshold,
      }
    }
  }

  // 4. Item keyword + alias scoring (token-based, §2.2)
  let bestItem: {
    item: FinancialItem
    score: number
    term: string | null
    confidence: number
  } | null = null
  for (const item of items) {
    if (!item.active) continue
    const { score, matchedTerm, confidence } = scoreItem(tx.description, item)
    if (!bestItem || score > bestItem.score) {
      if (score > 0) bestItem = { item, score, term: matchedTerm, confidence }
    }
  }
  if (bestItem && bestItem.score > 0) {
    return {
      itemId: bestItem.item.id,
      confidence: 'keyword',
      confidenceScore: bestItem.confidence,
      reason: bestItem.term
        ? `Palavra-chave: token '${normalizeRaw(bestItem.term)}'`
        : `Item: ${bestItem.item.name}`,
      needsReview: bestItem.confidence < reviewThreshold,
    }
  }

  // 5. Legacy category keyword map fallback (now token-based — see learningEngine)
  if (legacyCategories && legacyCategories.length) {
    const legacyCatId = suggestCategoryByKeywords(tx.description, legacyCategories as any)
    if (legacyCatId) {
      const item = legacyCategoryToItem(legacyCatId, items)
      if (item) {
        return {
          itemId: item.id,
          confidence: 'keyword',
          confidenceScore: 50,
          reason: `Categoria sugerida por palavra-chave (token)`,
          needsReview: true, // generic fallback → always review
        }
      }
    }
  }

  // No confident match → pending review (§2.13)
  const tokens = tokenize(tx.description)
  if (tokens.length === 0) {
    return {
      itemId: null,
      confidence: 'none',
      confidenceScore: 0,
      reason: 'Descrição sem tokens relevantes',
      needsReview: true,
    }
  }
  return {
    itemId: null,
    confidence: 'none',
    confidenceScore: 0,
    reason: 'Sem correspondência confiável — pendente de classificação',
    needsReview: true,
  }
}

/** Map a legacy category id (or name) to an item in the catalog. */
function legacyCategoryToItem(legacyId: string, items: FinancialItem[]): FinancialItem | null {
  const direct = items.find((i) => i.id === legacyId)
  if (direct) return direct
  const map: Record<string, string> = {
    'cat-alimentacao': 'item-supermercado',
    'cat-transporte': 'item-combustivel',
    'cat-moradia': 'item-aluguel',
    'cat-saude': 'item-plano-saude',
    'cat-lazer': 'item-restaurantes-bares',
    'cat-assinaturas': 'item-assinaturas',
    'cat-educacao': 'item-curso',
    'cat-impostos': 'item-das',
    'cat-cartao': 'item-nao-lembro',
    'cat-outros': 'item-nao-lembro',
  }
  const targetId = map[legacyId]
  if (targetId) {
    const found = items.find((i) => i.id === targetId)
    if (found) return found
  }
  return null
}

/**
 * Create a new ClassificationRule from a confirmed transaction + chosen item.
 * Used by the "create rule from transaction" UI action (§2.14).
 *
 * The rule uses a token-equality operator so that a rule for "OVOS" never
 * matches "NOVOS" (§2.2). For multi-word descriptions, the full normalized
 * description is used as a phrase.
 */
export function buildRuleFromTransaction(
  tx: Transaction,
  itemId: string,
  name?: string,
): ClassificationRule {
  const now = new Date().toISOString()
  const norm = normalizeDescription(tx.description)
  const tokens = norm.split(' ').filter(Boolean)
  // use the full normalized description as a phrase when multi-word, else the
  // single token (token-equality semantics under 'contains')
  const term = tokens.length > 1 ? norm : tokens[0] || tx.description
  return {
    id: `rule-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    name: name || `Token '${term}'`,
    priority: 100,
    condition: {
      field: 'description',
      operator: 'contains',
      value: term,
    },
    action: { itemId },
    status: 'active',
    applicationCount: 0,
    lastAppliedAt: null,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Increment the application counter + lastAppliedAt of a rule (in-memory).
 */
export function markRuleApplied(rule: ClassificationRule): ClassificationRule {
  return {
    ...rule,
    applicationCount: (rule.applicationCount || 0) + 1,
    lastAppliedAt: new Date().toISOString(),
  }
}

/**
 * Re-export the legacy map builder so callers don't need two imports.
 */
export { buildLearnedRulesMap, normalizeDescription }

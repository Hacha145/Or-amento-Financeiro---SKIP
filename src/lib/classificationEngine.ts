/**
 * Classification engine v2.
 *
 * Evolves the legacy learningEngine (which only knew about flat Category ids)
 * to work with the new 3-tier hierarchy: it suggests a leaf FinancialItem id.
 *
 * Scoring layers (highest priority wins):
 *  1. Named ClassificationRules (priority order, active only)
 *  2. Learned exact-match rules (legacy LearnedMapping, normalized)
 *  3. Item keywords + aliases (scoring, best match wins)
 *  4. Legacy category keyword map (fallback, mapped to an item id)
 *
 * Also exposes a `classifyTransaction` helper returning an explanation string
 * ("Regra: contém 'UBER'") for the UI tooltip.
 */
import { ClassificationRule, FinancialItem, Transaction, LearnedMapping } from '../types/finance'
import {
  normalizeDescription,
  classifyByExactMatch,
  buildLearnedRulesMap,
  suggestCategoryByKeywords,
  isCreditCardPaymentDescription,
} from './learningEngine'

export interface ClassifyResult {
  itemId: string | null
  /** confidence level for the suggestion */
  confidence: 'rule' | 'exact' | 'keyword' | 'none'
  /** human-readable reason (pt-BR), shown in tooltips */
  reason: string | null
}

/**
 * Evaluate a single classification rule against a transaction.
 * Returns true if the rule matches.
 */
export function evaluateRule(rule: ClassificationRule, tx: Transaction): boolean {
  if (rule.status !== 'active') return false
  const { field, operator, value } = rule.condition
  let actual = ''
  switch (field) {
    case 'description':
      actual = normalizeDescription(tx.description)
      break
    case 'amount':
      actual = String(tx.amount)
      break
    case 'type':
      actual = tx.type
      break
    case 'source':
      actual = tx.source ?? ''
      break
  }
  const expected =
    operator.startsWith('gt') || operator.startsWith('lt') ? value : normalizeDescription(value)

  switch (operator) {
    case 'contains':
      return actual.includes(expected)
    case 'equals':
      return actual === expected
    case 'startsWith':
      return actual.startsWith(expected)
    case 'endsWith':
      return actual.endsWith(expected)
    case 'regex':
      try {
        const re = new RegExp(value, 'i')
        return re.test(tx.description) || re.test(actual)
      } catch {
        return false
      }
    case 'gt':
      return Number(actual) > Number(value)
    case 'lt':
      return Number(actual) < Number(value)
    case 'gte':
      return Number(actual) >= Number(value)
    case 'lte':
      return Number(actual) <= Number(value)
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
 * Score how well an item matches a normalized description, using the item's
 * keywords + aliases + name. Mirrors the legacy keyword scoring approach.
 */
function scoreItem(
  normDesc: string,
  item: FinancialItem,
): { score: number; matchedTerm: string | null } {
  if (!normDesc) return { score: 0, matchedTerm: null }

  const terms: string[] = []
  for (const kw of item.keywords) terms.push(normalizeDescription(kw))
  for (const al of item.aliases) terms.push(normalizeDescription(al))
  terms.push(normalizeDescription(item.name))

  let best = { score: 0, matchedTerm: null as string | null }

  for (const term of terms) {
    if (!term) continue
    let score = 0
    if (normDesc === term) score = 100 + term.length
    else if (normDesc.includes(term)) score = 50 + term.length
    else {
      // word-level prefix matching
      const words = normDesc.split(' ')
      for (const w of words) {
        if (w === term) score = Math.max(score, 40 + term.length)
        else if (term.length >= 4 && w.length > term.length && w.startsWith(term)) {
          score = Math.max(score, 20 + term.length)
        } else if (w.length >= 4 && term.length > w.length && term.startsWith(w)) {
          score = Math.max(score, 15 + w.length)
        }
      }
    }
    if (score > best.score) best = { score, matchedTerm: term }
  }
  return best
}

/**
 * Main classification entrypoint. Returns the suggested itemId (or null),
 * a confidence level, and a pt-BR explanation.
 */
export function classifyTransaction(
  tx: Transaction,
  items: FinancialItem[],
  rules: ClassificationRule[],
  learnedRules: LearnedMapping[] | Map<string, LearnedMapping>,
  legacyCategories?: { id: string; name: string }[],
): ClassifyResult {
  const norm = normalizeDescription(tx.description)
  if (!norm) return { itemId: null, confidence: 'none', reason: null }

  // Credit-card payment descriptions get routed to a synthetic "invoice payment"
  // item if one exists, otherwise left unclassified (the type can also be
  // explicitly set to credit_card_payment in the form).
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
        reason: 'Descrição corresponde a pagamento de fatura/cartão',
      }
    }
  }

  // 1. Named rules (priority order)
  const sortedRules = sortRulesByPriority(rules)
  for (const rule of sortedRules) {
    if (evaluateRule(rule, tx)) {
      const item = items.find((i) => i.id === rule.action.itemId)
      if (item) {
        return {
          itemId: item.id,
          confidence: 'rule',
          reason: `Regra "${rule.name}": ${rule.condition.operator} '${rule.condition.value}'`,
        }
      }
    }
  }

  // 2. Learned exact-match rules (legacy) — map category id → item
  const exact = classifyByExactMatch(tx.description, learnedRules)
  if (exact.matched && exact.categoryId) {
    // Try to find an item whose id or aliases line up with the legacy category.
    // The migration already mapped legacy category ids → item ids, so look up
    // by a synthetic id `cat-...` -> item via the catalog's mapLegacyCategoryIdToItem.
    const byLegacyId = legacyCategoryToItem(exact.categoryId, items)
    if (byLegacyId) {
      return {
        itemId: byLegacyId.id,
        confidence: 'exact',
        reason: `Correspondência exata aprendida (categoria legada)`,
      }
    }
  }

  // 3. Item keyword + alias scoring
  let bestItem: { item: FinancialItem; score: number; term: string | null } | null = null
  for (const item of items) {
    if (!item.active) continue
    const { score, matchedTerm } = scoreItem(norm, item)
    if (bestItem && score > bestItem.score) {
      bestItem = { item, score, term: matchedTerm }
    } else if (!bestItem && score > 0) {
      bestItem = { item, score, term: matchedTerm }
    }
  }
  if (bestItem && bestItem.score > 0) {
    return {
      itemId: bestItem.item.id,
      confidence: 'keyword',
      reason: bestItem.term
        ? `Palavra-chave: contém '${bestItem.term}'`
        : `Item: ${bestItem.item.name}`,
    }
  }

  // 4. Legacy category keyword map fallback
  if (legacyCategories && legacyCategories.length) {
    const legacyCatId = suggestCategoryByKeywords(tx.description, legacyCategories as any)
    if (legacyCatId) {
      const item = legacyCategoryToItem(legacyCatId, items)
      if (item) {
        return {
          itemId: item.id,
          confidence: 'keyword',
          reason: `Categoria sugerida por palavra-chave`,
        }
      }
    }
  }

  return { itemId: null, confidence: 'none', reason: null }
}

/** Map a legacy category id (or name) to an item in the catalog. */
function legacyCategoryToItem(legacyId: string, items: FinancialItem[]): FinancialItem | null {
  // direct id match against items (some legacy ids were reused as item ids)
  const direct = items.find((i) => i.id === legacyId)
  if (direct) return direct
  // synthetic mapping for default categories
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
 * Used by the "create rule from transaction" UI action.
 */
export function buildRuleFromTransaction(
  tx: Transaction,
  itemId: string,
  name?: string,
): ClassificationRule {
  const now = new Date().toISOString()
  // default: contains the (normalized) description
  const term = normalizeDescription(tx.description).split(' ')[0] || tx.description
  return {
    id: `rule-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    name: name || `Contém '${term}'`,
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

import { Category, LearnedMapping } from '../types/finance'
import { tokenEquals, phraseMatches, normalizeRaw, extractTokens } from './tokenizer'

/**
 * Intelligent normalization for transaction descriptions:
 * 1. Trim & Lowercase
 * 2. Remove accents and diacritics (e.g. "JOÃO" -> "joao", "AÇÚCAR" -> "acucar")
 * 3. Replace punctuation and special characters with space or strip (e.g. "S.A." -> "sa", "PAG*" -> "pag", "*TRIP" -> "trip")
 * 4. Collapse consecutive whitespace and trim again
 *
 * Example:
 * "JOÃO PEDRO  S.A." -> "joao pedro sa"
 * "JOÃO PEDRO SA" -> "joao pedro sa"
 * "Posto Ipiranga - Combustível" -> "posto ipiranga combustivel"
 * "PAG*PadariaBellaVista" -> "pag padariabellavista"
 */
export function normalizeDescription(description: string): string {
  if (!description) return ''

  return (
    description
      .toLowerCase()
      // Normalize unicode to NFD and strip diacritical marks (accents, cedilhas, etc.)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      // Replace common banking punctuation/delimiters (*, -, _, /, \, ., ,, :, ;, #, @, |, +, ~) with a space
      .replace(/[.\-_*/\\,;:|#@+~!?()[\]{}"'`]/g, ' ')
      // Remove any other non-alphanumeric characters except spaces
      .replace(/[^a-z0-9\s]/g, ' ')
      // Collapse multiple spaces into single space
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/**
 * Alias for backward compatibility if any legacy code imports this name
 */
export function normalizeExactDescription(description: string): string {
  return normalizeDescription(description)
}

/**
 * Builds an O(1) lookup map from learned rules using their normalized description.
 * Ensures backward compatibility by generating normalizedDescription on-the-fly if missing.
 */
export function buildLearnedRulesMap(learnedRules: LearnedMapping[]): Map<string, LearnedMapping> {
  const map = new Map<string, LearnedMapping>()
  for (const rule of learnedRules) {
    const key = rule.normalizedDescription || normalizeDescription(rule.exactDescription)
    if (key && !map.has(key)) {
      map.set(key, {
        ...rule,
        normalizedDescription: key,
      })
    }
  }
  return map
}

/**
 * Exact Matcher with Intelligent Normalization:
 * Matches ONLY when the FULL normalized description is identical to a learned rule.
 *
 * Strict Rule Preserved:
 * "JOÃO PEDRO SA" -> "joao pedro sa"
 * "joão pedro s.a." -> "joao pedro sa" (MATCHES!)
 * "JOÃO PEDRO" -> "joao pedro" (DOES NOT MATCH "joao pedro sa", strict full match required!)
 */
export function classifyByExactMatch(
  description: string,
  learnedRules: LearnedMapping[] | Map<string, LearnedMapping>,
): {
  matched: boolean
  categoryId: string | null
  confidence: 'exact' | 'none'
  normalizedKey?: string
  originalDescription?: string
} {
  const norm = normalizeDescription(description)
  if (!norm) return { matched: false, categoryId: null, confidence: 'none' }

  let rule: LearnedMapping | undefined

  if (learnedRules instanceof Map) {
    rule = learnedRules.get(norm)
  } else {
    // Fast lookup if learnedRules is an array
    for (const r of learnedRules) {
      const ruleKey = r.normalizedDescription || normalizeDescription(r.exactDescription)
      if (ruleKey === norm) {
        rule = r
        break
      }
    }
  }

  if (rule) {
    return {
      matched: true,
      categoryId: rule.categoryId,
      confidence: 'exact',
      normalizedKey: norm,
      originalDescription: rule.exactDescription,
    }
  }

  return { matched: false, categoryId: null, confidence: 'none' }
}

/**
 * Keyword-based suggestion for unclassified transactions:
 * Uses normalized strings for both transaction description and keywords,
 * providing accurate suggestions without accent/case mismatches.
 */
/**
 * Detects whether a description represents a credit card invoice payment / received payment.
 * These transactions sum up the individual expenses already recorded and create duplication if counted as regular expense.
 */
export function isCreditCardPaymentDescription(description: string): boolean {
  const norm = normalizeDescription(description)
  if (!norm) return false

  const ccKeywords = [
    'pagamento recebido',
    'pagamento de fatura',
    'fatura cartao',
    'pgto fatura',
    'pagamento cartao',
    'cartao de credito pagamento',
    'cartao de credito pgto',
    'pgto cartao',
    'pagto fatura',
    'pagto cartao',
    'pag fatura',
    'pgto fatura cartao',
    'pagamento fatura cartao',
    'fatura do cartao',
    'liquidacao fatura',
    'debito fatura cartao',
  ]

  return ccKeywords.some((kw) => {
    const normKw = normalizeDescription(kw)
    return norm.includes(normKw) || norm === normKw
  })
}

export function suggestCategoryByKeywords(
  description: string,
  categories: Category[],
): string | null {
  const norm = normalizeDescription(description)
  if (!norm) return null

  // If detected as credit card payment, prioritize Pagamento de Cartão
  if (isCreditCardPaymentDescription(description)) {
    const cardCat = categories.find(
      (c) =>
        c.id === 'cat-cartao' ||
        c.name.toLowerCase().includes('cart') ||
        c.name.toLowerCase().includes('fatura'),
    )
    if (cardCat) return cardCat.id
  }

  const keywordMap: Record<string, string[]> = {
    'cat-alimentacao': [
      'restaurante',
      'mercado',
      'supermercado',
      'padaria',
      'lanche',
      'pizza',
      'pizzaria',
      'ifood',
      'rappi',
      'ze delivery',
      'acougue',
      'hortifruti',
      'cafe',
      'cafeteria',
      'mcdonald',
      'burger',
      'pao de acucar',
      'carrefour',
      'atacadao',
      'extra',
      'bar',
      'churrascaria',
      'alimentacao',
      'lanchonete',
      'sorveteria',
      'bistro',
      'sushi',
      'pastelaria',
      'confeitaria',
      'doceria',
      'delivery',
      'superpao',
      'emporio',
      'hortifrute',
      'marmita',
      'cantina',
      'panificadora',
      'acai',
    ],
    'cat-transporte': [
      'uber',
      '99app',
      '99 app',
      '99pop',
      '99 pop',
      'taxi',
      'posto',
      'gasolina',
      'combustivel',
      'etanol',
      'diesel',
      'estacionamento',
      'pedagio',
      'sem parar',
      'veloe',
      'auto posto',
      'ipiranga',
      'shell',
      'petrobras',
      'onibus',
      'metro',
      'passagem',
      'autopass',
      'bilhete unico',
      'conectcar',
      'movida',
      'localiza',
      'unidas',
      'oficina',
      'mecanica',
      'auto pecas',
      'pneu',
      'troca de oleo',
      'combust',
      'estac',
    ],
    'cat-moradia': [
      'aluguel',
      'condominio',
      'luz',
      'enel',
      'copel',
      'cemig',
      'sabesp',
      'sanepar',
      'corsan',
      'agua',
      'gas',
      'ultragaz',
      'liquigas',
      'supergasbras',
      'internet',
      'claro',
      'vivo',
      'tim',
      'oi',
      'iptu',
      'energia',
      'eletropaulo',
      'neoenergia',
      'cpfl',
      'condominio residencial',
      'edificio',
      'resd',
      'residencia',
    ],
    'cat-saude': [
      'farmacia',
      'droga raia',
      'drogasil',
      'pague menos',
      'drogaria',
      'sao paulo drogaria',
      'panvel',
      'medico',
      'medica',
      'medicamento',
      'medicina',
      'medic',
      'consulta',
      'hospital',
      'laboratorio',
      'unimed',
      'bradesco saude',
      'sulamerica',
      'amil',
      'notredame',
      'dentista',
      'odontologia',
      'odonto',
      'exame',
      'psicologo',
      'psicologia',
      'otica',
      'clinica',
      'fisioterapia',
      'lab',
      'hosp',
      'farm',
    ],
    'cat-assinaturas': [
      'assinatura',
      'netflix',
      'spotify',
      'amazon prime',
      'disney',
      'hbo max',
      'hbomax',
      'max',
      'streaming',
      'apple music',
      'google one',
      'google drive',
      'dropbox',
      'youtube premium',
      'onlyfans',
      'linkedin premium',
      'kindle unlimited',
      'audible',
      'plano',
      'mensalidade',
      'recorrencia',
      'assinante',
      'deezer',
      'globoplay',
      'prime video',
    ],
    'cat-lazer': [
      'cinema',
      'cinemark',
      'cinepolis',
      'star plus',
      'globo play',
      'globoplay',
      'steam',
      'playstation',
      'psn',
      'xbox',
      'nintendo',
      'show',
      'teatro',
      'hotel',
      'booking',
      'airbnb',
      'ingressos',
      'sympla',
      'eventim',
      'parque',
      'clube',
      'viagem',
      'resort',
      'pousada',
      'baralho',
      'festa',
      'jogos',
    ],
    'cat-educacao': [
      'escola',
      'faculdade',
      'curso',
      'universidade',
      'udemy',
      'alura',
      'coursera',
      'livro',
      'livraria',
      'leitura',
      'papelaria',
      'mensalidade escolar',
      'idiomas',
      'ingles',
      'wizard',
      'cna',
      'cultura inglesa',
      'colegio',
      'educacao',
      'treinamento',
      'apostila',
    ],
    'cat-impostos': [
      'imposto',
      'impostos',
      'tributo',
      'tributos',
      'darf',
      'das',
      'mei',
      'simples nacional',
      'receita federal',
      'ipva',
      'iptu',
      'irrf',
      'irpf',
      'fgts',
      'inss',
      'gps inss',
      'taxa licen',
      'dpvat',
      'taxa judiciaria',
      'guia darf',
      'guia das',
      'taxas e impostos',
      'taxa',
      'multa',
    ],
    'cat-cartao': [
      'pagamento recebido',
      'pagamento de fatura',
      'fatura cartao',
      'pagamento cartao',
      'cartao de credito pagamento',
      'cartao de credito pgto',
      'pgto fatura',
      'pgto cartao',
      'pagto fatura',
      'pagto cartao',
      'pgto fatura cartao',
      'pag fatura',
      'fatura nubank',
      'fatura itaucard',
      'fatura bradesco cartoes',
      'fatura c6',
      'fatura inter',
      'fatura santander',
    ],
  }

  // --- Token-based matching (Part 2 of the prompt) ---
  // CRITICAL: "OVOS" must match the token "OVOS", NOT the substring "OVOS"
  // inside "NOVOS". Single-word keywords use token equality; multi-word
  // keywords use contiguous token sub-sequence matching. Substring matching is
  // gone. (§2.1, §2.2, §2.5)

  const getKeywordMatchScore = (kw: string): number => {
    if (!kw) return 0
    const kNorm = normalizeRaw(kw)
    if (!kNorm) return 0

    // Exact full-description match
    if (normalizeRaw(description) === kNorm) {
      return 100 + kNorm.length
    }

    const kTokens = kNorm.split(' ').filter(Boolean)
    if (kTokens.length === 0) return 0

    // Multi-word phrase → contiguous token sub-sequence (§2.3)
    if (kTokens.length > 1) {
      if (phraseMatches(description, kw)) {
        return 60 + kNorm.length
      }
      return 0
    }

    // Single-token → token equality (§2.2). NEVER substring.
    if (tokenEquals(description, kw)) {
      return 40 + kNorm.length
    }

    // No match. We intentionally do NOT fall back to substring here.
    return 0
  }

  let bestCatId: string | null = null
  let highestScore = 0

  for (const cat of categories) {
    const catId = cat.id
    const keywords = keywordMap[catId] || []

    for (const kw of keywords) {
      const score = getKeywordMatchScore(kw)
      if (score > highestScore) {
        highestScore = score
        bestCatId = cat.id
      }
    }

    // Category name itself as a keyword (token-based)
    const catNameNorm = normalizeRaw(cat.name)
    if (catNameNorm.length >= 3) {
      const score = getKeywordMatchScore(cat.name)
      if (score > highestScore) {
        highestScore = score
        bestCatId = cat.id
      }
    }
  }

  return bestCatId
}

/**
 * Updates or adds an exact learned rule when a user manually confirms or classifies a transaction.
 * Stores both the original display description and the normalized description for fast O(1) matching.
 */
export function learnExactRule(
  existingRules: LearnedMapping[],
  description: string,
  categoryId: string,
): LearnedMapping[] {
  const norm = normalizeDescription(description)
  if (!norm || !categoryId) return existingRules

  // Special handling: Credit card invoice payments should NOT generate generic learned rules
  // that might incorrectly classify other distinct transactions
  if (isCreditCardPaymentDescription(description)) {
    return existingRules
  }

  const index = existingRules.findIndex(
    (r) => (r.normalizedDescription || normalizeDescription(r.exactDescription)) === norm,
  )

  const now = new Date().toISOString()

  if (index >= 0) {
    const updated = [...existingRules]
    updated[index] = {
      ...updated[index],
      categoryId,
      normalizedDescription: norm,
      confirmCount: (updated[index].confirmCount || 0) + 1,
      lastUsedAt: now,
    }
    return updated
  }

  return [
    ...existingRules,
    {
      exactDescription: description.trim(),
      normalizedDescription: norm,
      categoryId,
      confirmCount: 1,
      lastUsedAt: now,
    },
  ]
}

/**
 * Suggest candidate terms for creating a classification rule from a corrected
 * transaction's description (§2.14). Token/phrase-based — NEVER substring.
 *
 * Returns candidates ordered from most specific (full normalized description)
 * to least specific (individual tokens), so the UI can offer the user a choice
 * of which term to use in the new rule's condition.
 *
 * A rule created from a more specific term (full phrase) always wins over a
 * rule created from a generic single token, because the classification engine
 * evaluates rules by priority and matches phrases by specificity.
 */
export function suggestRuleTerms(description: string): {
  full: string
  phrases: string[]
  tokens: string[]
} {
  const { normalized, phrases, uniqueTokens } = extractTokens(description)
  return { full: normalized, phrases, tokens: uniqueTokens }
}

/**
 * Normalizes all rules in an array, ensuring `normalizedDescription` is populated.
 * Used for migrations and backward compatibility.
 */
export function sanitizeLearnedRules(rules: LearnedMapping[]): LearnedMapping[] {
  if (!Array.isArray(rules)) return []

  const seen = new Set<string>()
  const result: LearnedMapping[] = []

  for (const r of rules) {
    if (!r.exactDescription || !r.categoryId) continue
    const norm = r.normalizedDescription || normalizeDescription(r.exactDescription)
    if (!norm) continue

    if (seen.has(norm)) {
      // Merge confirm counts if duplicate normalized keys exist
      const existingIdx = result.findIndex((item) => item.normalizedDescription === norm)
      if (existingIdx >= 0) {
        result[existingIdx].confirmCount =
          (result[existingIdx].confirmCount || 1) + (r.confirmCount || 1)
      }
      continue
    }

    seen.add(norm)
    result.push({
      exactDescription: r.exactDescription.trim(),
      normalizedDescription: norm,
      categoryId: r.categoryId,
      confirmCount: r.confirmCount || 1,
      lastUsedAt: r.lastUsedAt || new Date().toISOString(),
    })
  }

  return result
}

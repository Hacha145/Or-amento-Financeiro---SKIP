import { Category, LearnedMapping } from '../types/finance'

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
export function suggestCategoryByKeywords(
  description: string,
  categories: Category[],
): string | null {
  const norm = normalizeDescription(description)
  if (!norm) return null

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
      'bistrô',
      'bistro',
      'sushi',
      'pastelaria',
      'confeitaria',
      'hortifruti',
      'doceria',
      'delivery',
      'superpao',
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
    ],
    'cat-lazer': [
      'netflix',
      'spotify',
      'cinema',
      'cinemark',
      'cinepolis',
      'hbomax',
      'max',
      'amazon prime',
      'prime video',
      'disney',
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
    ],
  }

  // Find category that matches any known keyword
  for (const cat of categories) {
    const catId = cat.id
    const keywords = keywordMap[catId] || []
    for (const kw of keywords) {
      const normKw = normalizeDescription(kw)
      // Check word boundary or substring match with normalized keyword
      if (norm.includes(normKw)) {
        return cat.id
      }
    }

    // Also check category name itself as keyword
    const catNameNorm = normalizeDescription(cat.name)
    if (catNameNorm.length > 3 && norm.includes(catNameNorm)) {
      return cat.id
    }
  }

  return null
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

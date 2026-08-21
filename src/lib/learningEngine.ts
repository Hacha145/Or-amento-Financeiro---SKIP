import { Category, LearnedMapping } from '../types/finance'

/**
 * Normalizes description for EXACT matching
 * Trimmed, whitespace-collapsed, uppercase
 */
export function normalizeExactDescription(description: string): string {
  if (!description) return ''
  return description.trim().replace(/\s+/g, ' ').toUpperCase()
}

/**
 * Exact Matcher with strict historical learning:
 * Rule 3: ONLY identical full description is automatically classified.
 * "JOÃO PEDRO SA" -> "Restaurante"
 * "JOÃO PEDRO" (partial) -> MUST NOT auto-classify! It will only suggest if keyword matches.
 */
export function classifyByExactMatch(
  description: string,
  learnedRules: LearnedMapping[],
): {
  matched: boolean
  categoryId: string | null
  confidence: 'exact' | 'none'
} {
  const norm = normalizeExactDescription(description)
  if (!norm) return { matched: false, categoryId: null, confidence: 'none' }

  // Exact full match only
  const rule = learnedRules.find((r) => normalizeExactDescription(r.exactDescription) === norm)

  if (rule) {
    return {
      matched: true,
      categoryId: rule.categoryId,
      confidence: 'exact',
    }
  }

  return { matched: false, categoryId: null, confidence: 'none' }
}

/**
 * Keyword-based suggestion for unclassified transactions:
 * Suggests a possible category when there is NO exact match, but marks needsReview: true
 */
export function suggestCategoryByKeywords(
  description: string,
  categories: Category[],
): string | null {
  const norm = description.toLowerCase()

  const keywordMap: Record<string, string[]> = {
    'cat-alimentacao': [
      'restaurante',
      'mercado',
      'supermercado',
      'padaria',
      'lanche',
      'pizza',
      'ifood',
      'rappi',
      'ze delivery',
      'acougue',
      'hortifruti',
      'cafe',
      'mcdonald',
      'burger',
      'pao de acucar',
      'carrefour',
      'atacadão',
      'extra',
      'bar',
      'churrascaria',
      'alimentacao',
    ],
    'cat-transporte': [
      'uber',
      '99app',
      '99 app',
      '99pop',
      'taxi',
      'posto',
      'gasolina',
      'combustivel',
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
      'agua',
      'gas',
      'internet',
      'claro',
      'vivo',
      'tim',
      'iptu',
      'energia',
      'eletropaulo',
    ],
    'cat-saude': [
      'farmacia',
      'droga raia',
      'drogasil',
      'pague menos',
      'drogaria',
      'medico',
      'consulta',
      'hospital',
      'laboratorio',
      'unimed',
      'dentista',
      'exame',
      'psicologo',
      'otica',
    ],
    'cat-lazer': [
      'netflix',
      'spotify',
      'cinema',
      'hbomax',
      'max',
      'amazon prime',
      'disney',
      'steam',
      'playstation',
      'show',
      'teatro',
      'hotel',
      'airbnb',
      'ingressos',
    ],
    'cat-educacao': [
      'escola',
      'faculdade',
      'curso',
      'udemy',
      'alura',
      'livro',
      'livraria',
      'papelaria',
      'mensalidade',
      'idiomas',
      'ingles',
    ],
  }

  // Find category that matches any known keyword
  for (const cat of categories) {
    const catId = cat.id
    const keywords = keywordMap[catId] || []
    for (const kw of keywords) {
      if (norm.includes(kw)) {
        return cat.id
      }
    }

    // Also check category name itself as keyword
    const catNameLower = cat.name.toLowerCase()
    if (catNameLower.length > 3 && norm.includes(catNameLower)) {
      return cat.id
    }
  }

  return null
}

/**
 * Updates or adds an exact learned rule when a user manually confirms or classifies a transaction
 */
export function learnExactRule(
  existingRules: LearnedMapping[],
  description: string,
  categoryId: string,
): LearnedMapping[] {
  const norm = normalizeExactDescription(description)
  if (!norm || !categoryId) return existingRules

  const index = existingRules.findIndex(
    (r) => normalizeExactDescription(r.exactDescription) === norm,
  )

  const now = new Date().toISOString()

  if (index >= 0) {
    const updated = [...existingRules]
    updated[index] = {
      ...updated[index],
      categoryId,
      confirmCount: updated[index].confirmCount + 1,
      lastUsedAt: now,
    }
    return updated
  }

  return [
    ...existingRules,
    {
      exactDescription: description.trim(),
      categoryId,
      confirmCount: 1,
      lastUsedAt: now,
    },
  ]
}

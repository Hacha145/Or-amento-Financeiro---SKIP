/**
 * Tokenizer for transaction descriptions (Part 2 of the prompt).
 *
 * Core principle (§2.1, §2.2): matching is TOKEN-based, NEVER substring.
 * "OVOS" must match the token "OVOS", NOT the substring "OVOS" inside "NOVOS".
 *
 * The tokenizer:
 *  (§2.6) 1. Uppercases, strips accents, collapses punctuation/whitespace.
 *         2. Removes banking-noise tokens (COMPRA, CARTAO, PIX, AUT, ...) and
 *            bare authorization numbers ("1234567890").
 *         3. Splits into ordered tokens.
 *         4. Keeps the original (display) description separately.
 *
 * Phrases (§2.3): a multi-word expression like "AMAZON PRIME" or "MERCADO LIVRE"
 * is matched as a contiguous sub-sequence of tokens. Longer/more-specific
 * phrases win over shorter ones (§2.5).
 */

import { BANK_NOISE_TOKENS, AUTH_NUMBER_REGEX } from './merchants'

/**
 * Normalize a raw description: uppercase, no accents, punctuation → space,
 * collapsed whitespace. (Same normalization as merchants.ts aliases.)
 */
export function normalizeRaw(description: string): string {
  if (!description) return ''
  return (
    description
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      // punctuation → space
      .replace(/[.\-_*/\\,;:|#@+~!?()[\]{}"'`]/g, ' ')
      // strip remaining non-alphanumeric except space
      .replace(/[^A-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/**
 * Tokenize a description into an ordered array of tokens.
 * Banking noise and bare authorization numbers are removed (§2.6).
 */
export function tokenize(description: string): string[] {
  const norm = normalizeRaw(description)
  if (!norm) return []
  const noiseSet = new Set(BANK_NOISE_TOKENS)
  return norm.split(' ').filter((w) => {
    if (!w) return false
    if (noiseSet.has(w)) return false
    if (AUTH_NUMBER_REGEX.test(w)) return false
    return true
  })
}

/**
 * Token set for fast `has(token)` lookups. Order is lost; use `tokenize` when
 * phrase order matters.
 */
export function tokenSet(description: string): Set<string> {
  return new Set(tokenize(description))
}

/**
 * Normalize a phrase expression the same way descriptions are normalized, then
 * return its tokens. Used to compare multi-word rules/aliases against the
 * description token stream.
 */
export function phraseTokens(phrase: string): string[] {
  return tokenize(phrase)
}

/**
 * Does the description contain the given phrase as a contiguous token
 * sub-sequence? (§2.3 — expressions with more than one word.)
 *
 * "MERCADO LIVRE NOVOS" with phrase "MERCADO LIVRE" → true.
 * "MERCADO LIVRE NOVOS" with phrase "OVOS"   → false (OVOS is not a token).
 */
export function phraseMatches(description: string, phrase: string): boolean {
  const descTokens = tokenize(description)
  const pTokens = phraseTokens(phrase)
  if (pTokens.length === 0) return false
  if (pTokens.length > descTokens.length) return false
  outer: for (let i = 0; i <= descTokens.length - pTokens.length; i++) {
    for (let j = 0; j < pTokens.length; j++) {
      if (descTokens[i + j] !== pTokens[j]) continue outer
    }
    return true
  }
  return false
}

/**
 * Does any token of the description equal the given single token? (§2.2)
 *
 * "COMPRA DE OVOS"  with token "OVOS" → true  (OVOS is a whole token).
 * "NOVOS SERVICOS"  with token "OVOS" → false (OVOS is NOT a token; NOVOS is).
 * "MERCADO LIVRE NOVOS" with token "OVOS" → false.
 */
export function tokenEquals(description: string, token: string): boolean {
  const t = normalizeRaw(token)
  if (!t) return false
  return tokenSet(description).has(t)
}

/**
 * Does any token of the description START WITH the given prefix?
 * Kept for backward-compat with prefix-style keywords (e.g. "SUPERMERC" →
 * "SUPERMERCADO"), but only ever evaluated against WHOLE tokens — it can never
 * match "OVOS" inside "NOVOS", because NOVOS is a single token and its prefix
 * is N/O/V/O/S, not "OVOS".
 */
export function tokenStartsWith(description: string, prefix: string): boolean {
  const p = normalizeRaw(prefix)
  if (!p) return false
  for (const tok of tokenize(description)) {
    if (tok.startsWith(p)) return true
  }
  return false
}

/**
 * Specificity score for a phrase: longer phrases are more specific and win
 * (§2.5). Single tokens score lower than multi-token phrases.
 */
export function phraseSpecificity(phrase: string): number {
  return phraseTokens(phrase).length
}

// ---------------------------------------------------------------------------
// Part-2 / Step-1 API (described in the prompt).
// Token-based variants operating on token arrays (so callers can tokenize once
// and reuse). The original string-based functions above are kept for the legacy
// classificationEngine / learningEngine callers.
// ---------------------------------------------------------------------------

/**
 * Normalize a raw description for the Step-1 tokenizer contract:
 * uppercase, strip accents, remove punctuation, collapse whitespace.
 *
 * Returns the normalized string (no noise-token removal — that's `tokenize`'s
 * job; this is the pure normalization used to build the `{original,normalized,tokens}`
 * triplet in `normalizeDescription`).
 */
export function normalizeToTokens(text: string): string {
  if (!text) return ''
  return text
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.\-_*/\\,;:|#@+~!?()[\]{}"'`]/g, ' ')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Full Step-1 tokenizer entrypoint.
 *
 * Uppercases, strips accents, removes duplicated spaces and punctuation, splits
 * by spaces, and drops banking-noise tokens + bare authorization numbers.
 */
export function tokenizeText(text: string): string[] {
  return tokenize(text)
}

/**
 * Step-1 triplet: original description preserved verbatim, the normalized form
 * (uppercase, no accents, no punctuation, collapsed spaces), and the token
 * array (noise tokens removed).
 *
 *   normalizeDescription('MP * Mercado Livre') ->
 *     { original: 'MP * Mercado Livre',
 *       normalized: 'MP MERCADO LIVRE',
 *       tokens: ['MERCADO', 'LIVRE'] }  // MP is a banking-noise token here
 */
export function normalizeDescriptionObj(raw: string): {
  original: string
  normalized: string
  tokens: string[]
} {
  return {
    original: raw ?? '',
    normalized: normalizeToTokens(raw ?? ''),
    tokens: tokenize(raw ?? ''),
  }
}

/**
 * Step-1 token-equality: compare two tokens after normalization. NEVER substring.
 *
 *   tokenEqualsToken('OVOS', 'ovos')  → true
 *   tokenEqualsToken('OVOS', 'NOVOS') → false   (different tokens)
 */
export function tokenEqualsToken(a: string, b: string): boolean {
  const na = normalizeToTokens(a)
  const nb = normalizeToTokens(b)
  if (!na || !nb) return false
  return na === nb
}

/**
 * Step-1 phrase containment: does `tokens` contain the phrase as a contiguous
 * sub-sequence of tokens? `phrase` is normalized the same way as the tokens.
 *
 *   phraseMatchesTokens(['MERCADO','LIVRE','NOVOS'], 'MERCADO LIVRE') → true
 *   phraseMatchesTokens(['MERCADO','LIVRE','NOVOS'], 'OVOS')          → false
 */
export function phraseMatchesTokens(tokens: string[], phrase: string): boolean {
  const p = phraseTokens(phrase)
  if (p.length === 0) return false
  if (p.length > tokens.length) return false
  for (let i = 0; i <= tokens.length - p.length; i++) {
    let ok = true
    for (let j = 0; j < p.length; j++) {
      if (tokens[i + j] !== p[j]) {
        ok = false
        break
      }
    }
    if (ok) return true
  }
  return false
}

/**
 * Step-1 `findPhrases`: among the known phrases, return the ones that appear in
 * `tokens`, ordered from longest (most specific) to shortest (least specific).
 *
 * Each entry of `phrases` is a pre-tokenized phrase (array of normalized tokens),
 * so callers tokenize their phrase tables once and reuse them across many
 * descriptions.
 */
export function findPhrases(tokens: string[], phrases: string[][]): string[] {
  const hits: { phrase: string; len: number }[] = []
  for (const p of phrases) {
    if (!p || p.length === 0) continue
    if (p.length > tokens.length) continue
    let found = false
    for (let i = 0; i <= tokens.length - p.length && !found; i++) {
      let ok = true
      for (let j = 0; j < p.length; j++) {
        if (tokens[i + j] !== p[j]) {
          ok = false
          break
        }
      }
      if (ok) found = true
    }
    if (found) hits.push({ phrase: p.join(' '), len: p.length })
  }
  hits.sort((a, b) => b.len - a.len)
  return hits.map((h) => h.phrase)
}

/**
 * Extract meaningful tokens + phrases from a description for rule suggestion
 * (§2.14). Token/phrase-based — NEVER substring.
 *
 * Returns:
 *   - tokens: the ordered token array (noise removed)
 *   - uniqueTokens: deduplicated tokens
 *   - normalized: the full normalized string (use as a phrase rule value)
 *   - phrases: contiguous sub-sequences of length 2..4, longest first
 *
 * Used by the learning engine to offer rule-creation candidates when the user
 * corrects a transaction.
 */
export function extractTokens(description: string): {
  tokens: string[]
  uniqueTokens: string[]
  normalized: string
  phrases: string[]
} {
  const tokens = tokenize(description)
  const uniqueTokens = Array.from(new Set(tokens))
  const normalized = normalizeRaw(description)
  const phrases: string[] = []
  for (let len = Math.min(tokens.length, 4); len >= 2; len--) {
    for (let i = 0; i <= tokens.length - len; i++) {
      const phrase = tokens.slice(i, i + len).join(' ')
      if (!phrases.includes(phrase)) phrases.push(phrase)
    }
  }
  return { tokens, uniqueTokens, normalized, phrases }
}

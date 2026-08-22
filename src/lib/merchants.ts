/**
 * Centralized registry of known merchants (estabelecimentos) and payment
 * intermediaries (intermediadores de pagamento).
 *
 * Part 2 of the prompt: inteligência de classificação de transações.
 *
 * Each merchant carries a stable `id`, the stable ids of its target class /
 * category / item (see src/lib/catalog.ts), a priority, a confidence level,
 * and an active flag.
 *
 * CRITICAL RULES:
 *  - Matching is TOKEN-based, never substring. "OVOS" must match the token
 *    "OVOS", NOT the substring "OVOS" inside "NOVOS". The matcher is in
 *    classificationEngine.ts (`tokenize`, `phraseMatches`).
 *  - Multi-word expressions ("AMAZON PRIME", "MERCADO LIVRE") are matched as
 *    complete phrases and win over shorter / generic matches.
 *  - Intermediators ("MP", "PAYPAL") never classify a transaction on their own:
 *    the matcher strips the leading intermediator prefix and re-evaluates.
 *  - "AMAZON PRIME" → Assinaturas, NOT marketplace.
 */

export type ConfidenceLevel =
  | 100 // regra manual do usuário
  | 98 // estabelecimento + alias inequívoco
  | 90 // expressão específica composta
  | 75 // conjunto forte de palavras
  | 50 // palavra genérica
  | 0 // abaixo do limiar → revisão

export interface Merchant {
  /** Stable unique id, e.g. 'meli', 'amazon', 'amazon-prime' */
  id: string
  /** Canonical display name (pt-BR) */
  name: string
  /** Aliases — additional tokens / expressions that identify this merchant.
   *  Already normalized (uppercase, no accents) — the matcher normalizes the
   *  transaction description the same way before comparison. */
  aliases: string[]
  /** Stable id of the target financial class (see catalog.ts) */
  classId: string
  /** Stable id of the target financial category (see catalog.ts) */
  categoryId: string | null
  /** Stable id of the target financial item / leaf (see catalog.ts) */
  itemId: string
  /** Higher = evaluated earlier. Same-priority entries compete by specificity. */
  priority: number
  /** Confidence of a match against this merchant (see ConfidenceLevel). */
  confidence: ConfidenceLevel
  /** When false, the merchant is ignored by the matcher. */
  active: boolean
  /** Tag used by the matcher to route special handling (e.g. "intermediator"). */
  kind?: 'merchant' | 'marketplace' | 'subscription' | 'intermediator' | 'generic'
}

/**
 * The canonical marketplace destination, per prompt §2.8:
 *   Despesas adicionais → Outros → Compras marketplace
 */
export const MARKETPLACE_DESTINATION = {
  classId: 'despesas_adicionais',
  categoryId: 'cat-adicionais-outros',
  itemId: 'item-compras-marketplace',
} as const

/**
 * Canonical subscription destination, per prompt §2.9:
 *   Despesas adicionais → Lazer → Assinaturas
 */
export const SUBSCRIPTION_DESTINATION = {
  classId: 'despesas_adicionais',
  categoryId: 'cat-adicionais-lazer',
  itemId: 'item-assinaturas',
} as const

/**
 * Canonical supermarket destination:
 *   Despesas variáveis → Alimentação → Supermercado
 */
export const SUPERMERCADO_DESTINATION = {
  classId: 'despesas_variaveis',
  categoryId: 'cat-variaveis-alimentacao',
  itemId: 'item-supermercado',
} as const

/**
 * Canonical restaurant destination:
 *   Despesas adicionais → Lazer → Restaurantes/bares
 */
export const RESTAURANTE_DESTINATION = {
  classId: 'despesas_adicionais',
  categoryId: 'cat-adicionais-lazer',
  itemId: 'item-restaurantes-bares',
} as const

/**
 * Canonical Uber destination:
 *   Despesas adicionais → Outros → Uber
 */
export const UBER_DESTINATION = {
  classId: 'despesas_adicionais',
  categoryId: 'cat-adicionais-outros',
  itemId: 'item-uber',
} as const

/**
 * Initial merchant registry. Add freely — matching is exact-token, so adding a
 * merchant never risks mis-classifying unrelated transactions.
 *
 * Marketplaces (§2.8) default to Compras marketplace. Two overrides:
 *   AMAZON + "PRIME"      → Assinaturas (§2.9)
 *   AMAZON without "PRIME" → Compras marketplace
 */
export const MERCHANTS: Merchant[] = [
  // ----- Marketplaces (§2.8) -----
  {
    id: 'meli',
    name: 'Mercado Livre',
    aliases: ['MERCADO LIVRE', 'MERCADOLIVRE', 'MELI'],
    ...MARKETPLACE_DESTINATION,
    priority: 1000,
    confidence: 98,
    active: true,
    kind: 'marketplace',
  },
  {
    id: 'amazon',
    name: 'Amazon',
    aliases: ['AMAZON', 'AMAZON BR', 'AMAZON.COM.BR'],
    ...MARKETPLACE_DESTINATION,
    priority: 950,
    confidence: 90,
    active: true,
    kind: 'marketplace',
  },
  {
    // §2.9: AMAZON PRIME is a subscription, NOT a marketplace purchase.
    id: 'amazon-prime',
    name: 'Amazon Prime',
    aliases: ['AMAZON PRIME', 'PRIME VIDEO'],
    ...SUBSCRIPTION_DESTINATION,
    priority: 1000,
    confidence: 98,
    active: true,
    kind: 'subscription',
  },
  {
    id: 'shopee',
    name: 'Shopee',
    aliases: ['SHOPEE', 'SHOPEE BR'],
    ...MARKETPLACE_DESTINATION,
    priority: 950,
    confidence: 98,
    active: true,
    kind: 'marketplace',
  },
  {
    id: 'aliexpress',
    name: 'AliExpress',
    aliases: ['ALIEXPRESS', 'ALI EXPRESS'],
    ...MARKETPLACE_DESTINATION,
    priority: 950,
    confidence: 98,
    active: true,
    kind: 'marketplace',
  },
  {
    id: 'temu',
    name: 'Temu',
    aliases: ['TEMU'],
    ...MARKETPLACE_DESTINATION,
    priority: 950,
    confidence: 98,
    active: true,
    kind: 'marketplace',
  },
  {
    id: 'shein',
    name: 'SHEIN',
    aliases: ['SHEIN', 'SHEIN BR'],
    ...MARKETPLACE_DESTINATION,
    priority: 950,
    confidence: 98,
    active: true,
    kind: 'marketplace',
  },
  {
    id: 'magalu',
    name: 'Magalu',
    aliases: ['MAGALU', 'MAGAZINE LUIZA', 'MAGAZINELUIZA'],
    ...MARKETPLACE_DESTINATION,
    priority: 950,
    confidence: 98,
    active: true,
    kind: 'marketplace',
  },
  {
    id: 'americanas',
    name: 'Americanas',
    aliases: ['AMERICANAS', 'LOJAS AMERICANAS'],
    ...MARKETPLACE_DESTINATION,
    priority: 950,
    confidence: 98,
    active: true,
    kind: 'marketplace',
  },
  {
    id: 'casas-bahia',
    name: 'Casas Bahia',
    aliases: ['CASAS BAHIA', 'CASASBAHIA'],
    ...MARKETPLACE_DESTINATION,
    priority: 950,
    confidence: 98,
    active: true,
    kind: 'marketplace',
  },
  {
    id: 'ponto',
    name: 'Ponto',
    aliases: ['PONTO', 'PONTO FRIO', 'PONTOFRIO'],
    ...MARKETPLACE_DESTINATION,
    priority: 950,
    confidence: 98,
    active: true,
    kind: 'marketplace',
  },
  {
    id: 'extra',
    name: 'Extra',
    aliases: ['EXTRA', 'EXTRA.COM'],
    ...MARKETPLACE_DESTINATION,
    priority: 900,
    confidence: 90,
    active: true,
    kind: 'marketplace',
  },
  {
    id: 'carrefour',
    name: 'Carrefour',
    aliases: ['CARREFOUR', 'CARREFOUR BR'],
    ...SUPERMERCADO_DESTINATION,
    priority: 900,
    confidence: 90,
    active: true,
    kind: 'merchant',
  },
  {
    id: 'kabum',
    name: 'KaBuM!',
    aliases: ['KABUM', 'KA BUM', 'KABUM!'],
    ...MARKETPLACE_DESTINATION,
    priority: 950,
    confidence: 98,
    active: true,
    kind: 'marketplace',
  },
  {
    id: 'netshoes',
    name: 'Netshoes',
    aliases: ['NETSHOES'],
    ...MARKETPLACE_DESTINATION,
    priority: 950,
    confidence: 98,
    active: true,
    kind: 'marketplace',
  },
  {
    id: 'dafiti',
    name: 'Dafiti',
    aliases: ['DAFITI'],
    ...MARKETPLACE_DESTINATION,
    priority: 950,
    confidence: 98,
    active: true,
    kind: 'marketplace',
  },
  {
    id: 'madeiramadeira',
    name: 'MadeiraMadeira',
    aliases: ['MADEIRA MADEIRA', 'MADEIRAMADEIRA'],
    ...MARKETPLACE_DESTINATION,
    priority: 950,
    confidence: 98,
    active: true,
    kind: 'marketplace',
  },
  {
    id: 'mobly',
    name: 'Mobly',
    aliases: ['MOBLY'],
    ...MARKETPLACE_DESTINATION,
    priority: 950,
    confidence: 98,
    active: true,
    kind: 'marketplace',
  },
  {
    id: 'enjoei',
    name: 'Enjoei',
    aliases: ['ENJOEI'],
    ...MARKETPLACE_DESTINATION,
    priority: 950,
    confidence: 98,
    active: true,
    kind: 'marketplace',
  },
  {
    id: 'olx',
    name: 'OLX',
    aliases: ['OLX', 'OLX BR'],
    ...MARKETPLACE_DESTINATION,
    priority: 950,
    confidence: 98,
    active: true,
    kind: 'marketplace',
  },

  // ----- Other known merchants (high priority) -----
  {
    id: 'ifood',
    name: 'iFood',
    aliases: ['IFOOD', 'IFOOD BR'],
    ...RESTAURANTE_DESTINATION,
    priority: 900,
    confidence: 98,
    active: true,
    kind: 'merchant',
  },
  {
    id: 'uber',
    name: 'Uber',
    aliases: ['UBER', 'UBER BR', 'UBER TRIP'],
    ...UBER_DESTINATION,
    priority: 900,
    confidence: 98,
    active: true,
    kind: 'merchant',
  },
  {
    id: 'netflix',
    name: 'Netflix',
    aliases: ['NETFLIX', 'NETFLIX.COM'],
    ...SUBSCRIPTION_DESTINATION,
    priority: 900,
    confidence: 98,
    active: true,
    kind: 'subscription',
  },
  {
    id: 'spotify',
    name: 'Spotify',
    aliases: ['SPOTIFY', 'SPOTIFY BR'],
    ...SUBSCRIPTION_DESTINATION,
    priority: 900,
    confidence: 98,
    active: true,
    kind: 'subscription',
  },
  {
    id: 'disney',
    name: 'Disney+',
    aliases: ['DISNEY+', 'DISNEY PLUS', 'DISNEY'],
    ...SUBSCRIPTION_DESTINATION,
    priority: 900,
    confidence: 98,
    active: true,
    kind: 'subscription',
  },
  {
    id: 'hbo',
    name: 'HBO Max',
    aliases: ['HBO MAX', 'HBOMAX', 'MAX'],
    ...SUBSCRIPTION_DESTINATION,
    priority: 900,
    confidence: 98,
    active: true,
    kind: 'subscription',
  },

  // ----- Payment intermediators (§2.11) — never classify on their own -----
  {
    id: 'mercado-pago',
    name: 'Mercado Pago',
    aliases: ['MERCADO PAGO', 'MERCADOPAGO', 'MP', 'MP*'],
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-outros',
    itemId: 'item-nao-lembro',
    priority: 10,
    confidence: 0,
    active: true,
    kind: 'intermediator',
  },
  {
    id: 'paypal',
    name: 'PayPal',
    aliases: ['PAYPAL', 'PAYPAL*'],
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-outros',
    itemId: 'item-nao-lembro',
    priority: 10,
    confidence: 0,
    active: true,
    kind: 'intermediator',
  },
  {
    id: 'pagbank',
    name: 'PagBank',
    aliases: ['PAGBANK', 'PAGBANK*'],
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-outros',
    itemId: 'item-nao-lembro',
    priority: 10,
    confidence: 0,
    active: true,
    kind: 'intermediator',
  },
  {
    id: 'picpay',
    name: 'PicPay',
    aliases: ['PICPAY', 'PICPAY*'],
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-outros',
    itemId: 'item-nao-lembro',
    priority: 10,
    confidence: 0,
    active: true,
    kind: 'intermediator',
  },
  {
    id: 'nubank',
    name: 'Nubank',
    aliases: ['NUBANK', 'NU PAGOS', 'NU*'],
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-outros',
    itemId: 'item-nao-lembro',
    priority: 10,
    confidence: 0,
    active: true,
    kind: 'intermediator',
  },
  {
    id: 'stone',
    name: 'Stone',
    aliases: ['STONE', 'STONE*'],
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-outros',
    itemId: 'item-nao-lembro',
    priority: 10,
    confidence: 0,
    active: true,
    kind: 'intermediator',
  },
  {
    id: 'sumup',
    name: 'SumUp',
    aliases: ['SUMUP', 'SUMUP*'],
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-outros',
    itemId: 'item-nao-lembro',
    priority: 10,
    confidence: 0,
    active: true,
    kind: 'intermediator',
  },
  {
    id: 'infinitepay',
    name: 'InfinitePay',
    aliases: ['INFINITEPAY', 'INFINITEPAY*'],
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-outros',
    itemId: 'item-nao-lembro',
    priority: 10,
    confidence: 0,
    active: true,
    kind: 'intermediator',
  },
  {
    id: 'stripe',
    name: 'Stripe',
    aliases: ['STRIPE', 'STRIPE*'],
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-outros',
    itemId: 'item-nao-lembro',
    priority: 10,
    confidence: 0,
    active: true,
    kind: 'intermediator',
  },
  {
    id: 'google-pay',
    name: 'Google Pay',
    aliases: ['GOOGLE PAY', 'GOOGLEPAY'],
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-outros',
    itemId: 'item-nao-lembro',
    priority: 10,
    confidence: 0,
    active: true,
    kind: 'intermediator',
  },
  {
    id: 'apple-pay',
    name: 'Apple Pay',
    aliases: ['APPLE PAY', 'APPLEPAY'],
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-outros',
    itemId: 'item-nao-lembro',
    priority: 10,
    confidence: 0,
    active: true,
    kind: 'intermediator',
  },
]

/**
 * Tokens that indicate a banking artifact rather than a real merchant name.
 * Used by the matcher to clean the description before attempting matches
 * (§2.6 — remove bank-irrelevant identifiers and authorization numbers).
 *
 * These are matched as whole tokens (not substrings) by the tokenizer.
 */
export const BANK_NOISE_TOKENS: string[] = [
  'COMPRA',
  'CARTAO',
  'DEBITO',
  'CREDITO',
  'PARCELA',
  'PG',
  'PGTO',
  'PAGTO',
  'PAG',
  'PAGAMENTO',
  'PAGAMENTOS',
  'AUT',
  'AUTORIZACAO',
  'AUTH',
  'DOC',
  'TED',
  'PIX',
  'TRANSF',
  'TRANSFERENCIA',
  'SAQUE',
  'DEP',
  'DEPOSITO',
  'RECIBO',
  'LIQUIDACAO',
  'SALDO',
  'RESGATE',
  'APORTE',
  'ENTRADA',
  'SAIDA',
  'IOF',
]

/**
 * Pattern that matches a bare authorization / reference number token such as
 * "1234567890" or "12345-6". Matched at the token level so the matcher can
 * decide a description like "PAGAMENTO 12345" is too sparse to classify (§2.13).
 */
export const AUTH_NUMBER_REGEX = /^\d{3,}([-/]\d+)*$/

/**
 * Default confidence threshold below which a suggestion is sent to review
 * instead of auto-applied (§2.12). Configurable by the caller.
 */
export const DEFAULT_REVIEW_THRESHOLD: number = 75

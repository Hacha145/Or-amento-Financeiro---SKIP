/**
 * Centralized registry of known merchants (estabelecimentos) and payment
 * intermediaries (intermediadores de pagamento).
 *
 * Part 2 of the prompt: inteligência de classificação de transações.
 *
 * Each merchant carries the stable ids of its target class / category / item
 * (see src/lib/catalog.ts), a priority, a confidence level, and an active flag.
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
    name: 'Mercado Livre',
    aliases: ['MERCADO LIVRE', 'MERCADOLIVRE', 'MERCADO L', 'MELI', 'MERCADO LIVRE COMPRAS'],
    ...MARKETPLACE_DESTINATION,
    priority: 1000,
    confidence: 98,
    active: true,
    kind: 'marketplace',
  },
  {
    name: 'Amazon',
    aliases: ['AMAZON', 'AMAZON BR', 'AMAZON COM BR', 'AMAZON.COM.BR', 'AMAZONBR'],
    ...MARKETPLACE_DESTINATION,
    priority: 950,
    confidence: 90,
    active: true,
    kind: 'marketplace',
  },
  {
    // §2.9: AMAZON PRIME is a subscription, NOT a marketplace purchase.
    name: 'Amazon Prime',
    aliases: ['AMAZON PRIME', 'PRIME VIDEO', 'AMAZONPRIME'],
    ...SUBSCRIPTION_DESTINATION,
    priority: 1000,
    confidence: 98,
    active: true,
    kind: 'subscription',
  },
  {
    name: 'Shopee',
    aliases: ['SHOPEE', 'SHOPEE BR', 'SHOPEE COM BR'],
    ...MARKETPLACE_DESTINATION,
    priority: 950,
    confidence: 98,
    active: true,
    kind: 'marketplace',
  },
  {
    name: 'AliExpress',
    aliases: ['ALIEXPRESS', 'ALI EXPRESS', 'ALIEXPRESS COM BR'],
    ...MARKETPLACE_DESTINATION,
    priority: 950,
    confidence: 98,
    active: true,
    kind: 'marketplace',
  },
  {
    name: 'Temu',
    aliases: ['TEMU', 'TEMU COM', 'TEMU COM BR'],
    ...MARKETPLACE_DESTINATION,
    priority: 950,
    confidence: 98,
    active: true,
    kind: 'marketplace',
  },
  {
    name: 'SHEIN',
    aliases: ['SHEIN', 'SHEIN BR'],
    ...MARKETPLACE_DESTINATION,
    priority: 950,
    confidence: 98,
    active: true,
    kind: 'marketplace',
  },
  {
    name: 'Magalu',
    aliases: ['MAGALU', 'MAGAZINE LUIZA', 'MAGAZINELUIZA'],
    ...MARKETPLACE_DESTINATION,
    priority: 950,
    confidence: 98,
    active: true,
    kind: 'marketplace',
  },
  {
    name: 'Americanas',
    aliases: ['AMERICANAS', 'AMERICANA', 'LOJAS AMERICANAS'],
    ...MARKETPLACE_DESTINATION,
    priority: 950,
    confidence: 98,
    active: true,
    kind: 'marketplace',
  },
  {
    name: 'Casas Bahia',
    aliases: ['CASAS BAHIA', 'CASASBAHIA', 'CASAS DA BAHIA'],
    ...MARKETPLACE_DESTINATION,
    priority: 950,
    confidence: 98,
    active: true,
    kind: 'marketplace',
  },
  {
    name: 'Ponto',
    aliases: ['PONTO', 'PONTO FRIO', 'PONTOFRIO', 'PONTO Frio'.toUpperCase()],
    ...MARKETPLACE_DESTINATION,
    priority: 950,
    confidence: 98,
    active: true,
    kind: 'marketplace',
  },
  {
    name: 'Extra',
    aliases: ['EXTRA', 'EXTRA COM BR', 'EXTRA SUPERMERCADO'],
    ...MARKETPLACE_DESTINATION,
    priority: 900,
    confidence: 90,
    active: true,
    kind: 'marketplace',
  },
  {
    name: 'Carrefour Marketplace',
    aliases: ['CARREFOUR', 'CARREFOUR MARKETPLACE', 'CARREFOUR COM BR'],
    ...MARKETPLACE_DESTINATION,
    priority: 900,
    confidence: 90,
    active: true,
    kind: 'marketplace',
  },
  {
    name: 'KaBuM!',
    aliases: ['KABUM', 'KABUM COM BR', 'KABUM!'],
    ...MARKETPLACE_DESTINATION,
    priority: 950,
    confidence: 98,
    active: true,
    kind: 'marketplace',
  },
  {
    name: 'Netshoes',
    aliases: ['NETSHOES', 'NETSHOES COM BR'],
    ...MARKETPLACE_DESTINATION,
    priority: 950,
    confidence: 98,
    active: true,
    kind: 'marketplace',
  },
  {
    name: 'Dafiti',
    aliases: ['DAFITI', 'DAFITI COM BR'],
    ...MARKETPLACE_DESTINATION,
    priority: 950,
    confidence: 98,
    active: true,
    kind: 'marketplace',
  },
  {
    name: 'MadeiraMadeira',
    aliases: ['MADEIRAMADEIRA', 'MADEIRA MADEIRA', 'MADEIRAMADEIRA COM BR'],
    ...MARKETPLACE_DESTINATION,
    priority: 950,
    confidence: 98,
    active: true,
    kind: 'marketplace',
  },
  {
    name: 'Mobly',
    aliases: ['MOBLY', 'MOBLY COM BR'],
    ...MARKETPLACE_DESTINATION,
    priority: 950,
    confidence: 98,
    active: true,
    kind: 'marketplace',
  },
  {
    name: 'Enjoei',
    aliases: ['ENJOEI', 'ENJOEI COM BR'],
    ...MARKETPLACE_DESTINATION,
    priority: 950,
    confidence: 98,
    active: true,
    kind: 'marketplace',
  },
  {
    name: 'OLX',
    aliases: ['OLX', 'OLX COM BR', 'OLXBR'],
    ...MARKETPLACE_DESTINATION,
    priority: 950,
    confidence: 98,
    active: true,
    kind: 'marketplace',
  },

  // ----- Other known merchants (high priority) -----
  {
    name: 'iFood',
    aliases: ['IFOOD', 'IFOOD COM BR', 'IFOOD*'],
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-lazer',
    itemId: 'item-restaurantes-bares',
    priority: 900,
    confidence: 98,
    active: true,
    kind: 'merchant',
  },
  {
    name: 'Uber',
    aliases: ['UBER', 'UBER TRIP', 'UBER*TRIP'],
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-outros',
    itemId: 'item-uber',
    priority: 900,
    confidence: 98,
    active: true,
    kind: 'merchant',
  },
  {
    name: 'Netflix',
    aliases: ['NETFLIX', 'NETFLIX COM BR'],
    ...SUBSCRIPTION_DESTINATION,
    itemId: 'item-assinaturas-streamings',
    priority: 900,
    confidence: 98,
    active: true,
    kind: 'subscription',
  },
  {
    name: 'Spotify',
    aliases: ['SPOTIFY', 'SPOTIFY BR', 'SPOTIFY PREMIUM'],
    ...SUBSCRIPTION_DESTINATION,
    itemId: 'item-assinaturas-streamings',
    priority: 900,
    confidence: 98,
    active: true,
    kind: 'subscription',
  },
  {
    name: 'Burger King',
    aliases: ['BURGER KING', 'BURGERKING', 'BK BR'],
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-lazer',
    itemId: 'item-restaurantes-bares',
    priority: 900,
    confidence: 90,
    active: true,
    kind: 'merchant',
  },
  {
    name: 'Posto Ipiranga',
    aliases: ['POSTO IPIRANGA', 'IPIRANGA', 'AUTO POSTO IPIRANGA'],
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-transporte',
    itemId: 'item-combustivel',
    priority: 900,
    confidence: 90,
    active: true,
    kind: 'merchant',
  },

  // ----- Payment intermediators (§2.11) — never classify on their own -----
  {
    name: 'Mercado Pago',
    aliases: ['MERCADO PAGO', 'MERCADOPAGO', 'MP ', 'MP*', 'MP'],
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-outros',
    itemId: 'item-nao-lembro',
    priority: 10,
    confidence: 0,
    active: true,
    kind: 'intermediator',
  },
  {
    name: 'PayPal',
    aliases: ['PAYPAL', 'PAYPAL *', 'PAYPAL*'],
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-outros',
    itemId: 'item-nao-lembro',
    priority: 10,
    confidence: 0,
    active: true,
    kind: 'intermediator',
  },
  {
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
    name: 'iFood Pago',
    aliases: ['IFOOD PAGO', 'IFOODPAGO'],
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-outros',
    itemId: 'item-nao-lembro',
    priority: 10,
    confidence: 0,
    active: true,
    kind: 'intermediator',
  },
  {
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

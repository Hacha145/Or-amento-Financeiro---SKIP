export type TransactionType =
  | 'expense'
  | 'income'
  | 'investment_in'
  | 'investment_out'
  | 'transfer'
  | 'credit_card_payment'
  | 'reimbursement'
  | 'adjustment'
  | 'loan'

export type TransactionSource =
  | 'manual'
  | 'csv'
  | 'ofx'
  | 'xlsx'
  | 'spreadsheet_seed'
  | 'legacy_migration'
  // historical template (.xlsx) import — transactions extracted from the
  // canonical annual workbook, month-precision dates, real signed values.
  | 'legacy_xlsx'
  // legacy values from earlier app versions, kept for backward compatibility
  | 'import_csv'
  | 'import_ofx'
  | 'import_xlsx'

export type DatePrecision = 'exact' | 'month'

export interface Category {
  id: string
  name: string
  color: string // hex color e.g. #10B981
  icon?: string
  isDefault?: boolean
}

/**
 * FinancialClass - top level of the 3-tier hierarchy.
 * Stable ids (e.g. "despesas_fixas"). Labels are in pt-BR.
 */
export interface FinancialClass {
  id: string // e.g. 'despesas_fixas'
  label: string // e.g. 'Despesas Fixas'
  /** Whether this class is a kind of expense (affects consolidation sign) */
  isExpense: boolean
  /** Stable hex color used across dashboard/pie charts */
  color: string
  icon?: string
  /** Display order */
  order: number
}

/**
 * Category (intermediate group) - belongs to a FinancialClass.
 * Receitas and Investimentos have no subcategories (items attach directly to the class).
 */
export interface FinancialCategory {
  id: string
  classId: string
  name: string
  /** Stable hex color */
  color: string
  icon?: string
  order: number
}

/**
 * Item - the leaf node (evolution of the legacy flat Category).
 * Each transaction classifies into exactly one item via `itemId`.
 */
export interface FinancialItem {
  id: string
  classId: string
  /** nullable: items in Receitas/Investimentos attach directly to the class */
  categoryId: string | null
  name: string
  color: string
  icon?: string
  /** Keywords used by the classification engine for auto-suggestion */
  keywords: string[]
  /** Historical alternative names used across spreadsheet years */
  aliases: string[]
  active: boolean
  /** Year range the item is valid (inclusive). null = open ended */
  validFrom?: number | null
  validTo?: number | null
  /** Mapping to the reference spreadsheet (sheetName + row + month columns) */
  sheetMapping?: {
    sheetName: string
    row: number
    /** month 1..12 -> column letter */
    monthColumns: Record<number, string>
  }
  createdAt: string
  updatedAt: string
}

/**
 * Account - checking / savings / cash / brokerage / loan / other
 */
export interface Account {
  id: string
  name: string
  type: 'checking' | 'savings' | 'cash' | 'brokerage' | 'loan' | 'other'
  balance: number
  currency: string
  active: boolean
  createdAt: string
  updatedAt: string
}

/**
 * CreditCard
 */
export interface CreditCard {
  id: string
  name: string
  brand?: string
  limit?: number
  closingDay?: number
  dueDay?: number
  active: boolean
  createdAt: string
  updatedAt: string
}

/**
 * InstallmentGroup - tracks a purchase paid in N installments on a credit card
 */
export interface InstallmentGroup {
  id: string
  description: string
  totalAmount: number
  totalInstallments: number
  creditCardId?: string | null
  startDate: string
  itemId?: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

/**
 * ClassificationRule - named, priority-ordered rule with a condition + action.
 * Evolves the legacy LearnedMapping (kept for backward compatibility).
 */
export interface ClassificationRule {
  id: string
  name: string
  priority: number
  condition: {
    field: 'description' | 'amount' | 'type' | 'source'
    operator:
      | 'contains'
      | 'equals'
      | 'startsWith'
      | 'endsWith'
      | 'regex'
      | 'gt'
      | 'lt'
      | 'gte'
      | 'lte'
    value: string
  }
  action: {
    itemId: string
  }
  status: 'active' | 'inactive'
  applicationCount: number
  lastAppliedAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface Transaction {
  id: string
  date: string // YYYY-MM-DD
  description: string
  amount: number // always positive number
  type: TransactionType
  // Legacy flat classification (kept for backward compat / migration)
  categoryId: string | null
  // New leaf-level classification (preferred). Migration copies categoryId -> itemId.
  // Optional for backward-compat with seed/legacy data that predates the hierarchy.
  itemId?: string | null
  needsReview: boolean // true when unclassified or suggestion needing manual confirmation
  suggestedCategoryId?: string | null
  suggestedItemId?: string | null
  isCreditCardPayment?: boolean // flag for credit card invoice payment / received payment (potential duplication)
  notes?: string
  source?: TransactionSource
  // --- New fields (all optional for backward compatibility) ---
  accountId?: string | null
  creditCardId?: string | null
  transferToAccountId?: string | null
  reimbursementOfTransactionId?: string | null
  installmentGroupId?: string | null
  installmentNumber?: number | null
  totalInstallments?: number | null
  originalDescription?: string | null
  datePrecision?: DatePrecision
  sequenceInMonth?: number | null
  /** Human-readable explanation of why this transaction was auto-classified */
  classificationReason?: string | null
  createdAt: string
  updatedAt: string
}

export interface BudgetLimit {
  categoryId: string
  monthlyLimit: number
  /** Optional leaf-level item target (new hierarchy). Falls back to categoryId. */
  itemId?: string | null
}

export interface ColumnMapping {
  dateCol: string
  descriptionCol: string
  amountCol: string
  categoryCol?: string
  typeCol?: string
  notesCol?: string
  hasHeader: boolean
}

export interface LearnedMapping {
  exactDescription: string // original description trimmed for display
  normalizedDescription?: string // intelligent normalized string for O(1) matching
  categoryId: string
  confirmCount: number
  lastUsedAt: string
}

export interface AppTemplateConfig {
  fileName?: string
  columnMapping: ColumnMapping
  configuredAt: string
}

export interface AppSettings {
  currency: string
  locale: string
  setupCompleted: boolean
  templateConfig?: AppTemplateConfig
  includeCreditCardPaymentsInTotals?: boolean // default false (exclude from expenses to avoid double counting)
  /** Schema version of stored data, used to drive incremental migrations */
  schemaVersion?: number
  /** ISO date of the last time we ran the v2 migration (hierarchy + items) */
  v2MigrationAt?: string | null
}

export const DEFAULT_CATEGORIES: Category[] = [
  {
    id: 'cat-alimentacao',
    name: 'Alimentação',
    color: '#10B981',
    icon: 'Utensils',
    isDefault: true,
  },
  { id: 'cat-transporte', name: 'Transporte', color: '#3B82F6', icon: 'Car', isDefault: true },
  { id: 'cat-moradia', name: 'Moradia', color: '#F59E0B', icon: 'Home', isDefault: true },
  { id: 'cat-saude', name: 'Saúde', color: '#EF4444', icon: 'HeartPulse', isDefault: true },
  { id: 'cat-lazer', name: 'Lazer', color: '#EC4899', icon: 'Gamepad2', isDefault: true },
  {
    id: 'cat-assinaturas',
    name: 'Assinaturas',
    color: '#8B5CF6',
    icon: 'Repeat',
    isDefault: true,
  },
  {
    id: 'cat-educacao',
    name: 'Educação',
    color: '#06B6D4',
    icon: 'GraduationCap',
    isDefault: true,
  },
  {
    id: 'cat-impostos',
    name: 'Impostos',
    color: '#D97706', // Amber / Dark orange
    icon: 'Receipt',
    isDefault: true,
  },
  {
    id: 'cat-cartao',
    name: 'Pagamento de Cartão',
    color: '#6366F1', // Indigo / Purple
    icon: 'CreditCard',
    isDefault: true,
  },
  { id: 'cat-outros', name: 'Outros', color: '#6B7280', icon: 'MoreHorizontal', isDefault: true },
]

export const PALETTE_COLORS = [
  '#10B981', // Emerald
  '#3B82F6', // Blue
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#14B8A6', // Teal
  '#F97316', // Orange
  '#6366F1', // Indigo
  '#84CC16', // Lime
  '#64748B', // Slate
  '#D946EF', // Fuchsia
  '#E11D48', // Rose
]

/**
 * Default credit cards (a couple of common Brazilian issuers as starting points).
 */
export const DEFAULT_CREDIT_CARDS: CreditCard[] = [
  {
    id: 'cc-nubank',
    name: 'Nubank',
    brand: 'Mastercard',
    limit: 0,
    closingDay: 1,
    dueDay: 10,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
]

/**
 * Default accounts (a single "Conta principal" cash/checking hybrid so the user has
 * somewhere to attach transactions out of the box).
 */
export const DEFAULT_ACCOUNTS: Account[] = [
  {
    id: 'acc-main',
    name: 'Conta principal',
    type: 'checking',
    balance: 0,
    currency: 'BRL',
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
]

import {
  Category,
  Transaction,
  BudgetLimit,
  LearnedMapping,
  AppSettings,
  DEFAULT_CATEGORIES,
  PALETTE_COLORS,
  FinancialClass,
  FinancialCategory,
  FinancialItem,
  Account,
  CreditCard,
  InstallmentGroup,
  ClassificationRule,
  DEFAULT_ACCOUNTS,
  DEFAULT_CREDIT_CARDS,
} from '../types/finance'
import {
  DEFAULT_FINANCIAL_CLASSES,
  DEFAULT_FINANCIAL_CATEGORIES,
  buildDefaultFinancialItems,
  mapLegacyCategoryIdToItem,
  mapLegacyCategoryNameToItem,
} from './catalog'
import { sanitizeLearnedRules, normalizeDescription } from './learningEngine'

const STORAGE_KEYS = {
  TRANSACTIONS: 'orcamento_transactions_v1',
  CATEGORIES: 'orcamento_categories_v1',
  BUDGETS: 'orcamento_budgets_v1',
  LEARNED_RULES: 'orcamento_learned_rules_v1',
  SETTINGS: 'orcamento_settings_v1',
  // v2 hierarchy keys
  FINANCIAL_CLASSES: 'orcamento_financial_classes_v2',
  FINANCIAL_CATEGORIES: 'orcamento_financial_categories_v2',
  FINANCIAL_ITEMS: 'orcamento_financial_items_v2',
  ACCOUNTS: 'orcamento_accounts_v2',
  CREDIT_CARDS: 'orcamento_credit_cards_v2',
  INSTALLMENT_GROUPS: 'orcamento_installment_groups_v2',
  CLASSIFICATION_RULES: 'orcamento_classification_rules_v2',
}

/** Current data schema version (bumped when a new migration is required). */
export const CURRENT_SCHEMA_VERSION = 2

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        includeCreditCardPaymentsInTotals: false,
        ...parsed,
      }
    }
  } catch (e) {
    console.error('Error loading settings from localStorage', e)
  }
  return {
    currency: 'BRL',
    locale: 'pt-BR',
    setupCompleted: false,
    includeCreditCardPaymentsInTotals: false,
    userName: '',
    userAliases: [],
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings))
  } catch (e) {
    console.error('Error saving settings to localStorage', e)
  }
}

export function loadCategories(): Category[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CATEGORIES)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Ensure default categories like Impostos and Pagamento de Cartão exist if missing
        const existingIds = new Set(parsed.map((c: Category) => c.id))
        const existingNames = new Set(parsed.map((c: Category) => c.name.toLowerCase().trim()))
        let hasNew = false
        const merged = [...parsed]

        DEFAULT_CATEGORIES.forEach((defCat) => {
          if (!existingIds.has(defCat.id) && !existingNames.has(defCat.name.toLowerCase().trim())) {
            merged.push(defCat)
            hasNew = true
          }
        })

        if (hasNew) {
          saveCategories(merged)
        }
        return merged
      }
    }
  } catch (e) {
    console.error('Error loading categories', e)
  }
  return DEFAULT_CATEGORIES
}

export function saveCategories(categories: Category[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(categories))
  } catch (e) {
    console.error('Error saving categories', e)
  }
}

export function loadTransactions(): Transaction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch (e) {
    console.error('Error loading transactions', e)
  }
  return []
}

export function saveTransactions(transactions: Transaction[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions))
  } catch (e) {
    console.error('Error saving transactions', e)
  }
}

export function loadBudgets(): BudgetLimit[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.BUDGETS)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch (e) {
    console.error('Error loading budgets', e)
  }
  return []
}

export function saveBudgets(budgets: BudgetLimit[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.BUDGETS, JSON.stringify(budgets))
  } catch (e) {
    console.error('Error saving budgets', e)
  }
}

export function loadLearnedRules(): LearnedMapping[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LEARNED_RULES)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        // Ensure backward compatibility: populate normalizedDescription for all legacy rules
        const sanitized = sanitizeLearnedRules(parsed)
        // If some rules lacked normalizedDescription, resave sanitized version
        const needsResave = parsed.some((r: any) => !r.normalizedDescription)
        if (needsResave) {
          saveLearnedRules(sanitized)
        }
        return sanitized
      }
    }
  } catch (e) {
    console.error('Error loading learned rules', e)
  }
  return []
}

export function saveLearnedRules(rules: LearnedMapping[]): void {
  try {
    const sanitized = sanitizeLearnedRules(rules)
    localStorage.setItem(STORAGE_KEYS.LEARNED_RULES, JSON.stringify(sanitized))
  } catch (e) {
    console.error('Error saving learned rules', e)
  }
}

/**
 * Creates sample seed data for first test / playground if needed
 */
export function generateSampleData(): {
  categories: Category[]
  transactions: Transaction[]
  budgets: BudgetLimit[]
  rules: LearnedMapping[]
} {
  const categories = DEFAULT_CATEGORIES
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')

  const pad = (d: number) => String(d).padStart(2, '0')
  const dateOf = (day: number) => `${year}-${month}-${pad(day)}`

  const transactions: Transaction[] = [
    {
      id: 'tx-1',
      date: dateOf(2),
      description: 'Salário Mensal Empresa',
      amount: 6500,
      type: 'income',
      categoryId: null,
      needsReview: false,
      notes: 'Depósito em conta corrente',
      source: 'manual',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'tx-2',
      date: dateOf(5),
      description: 'PÃO DE AÇÚCAR SUPERMERCADO',
      amount: 489.3,
      type: 'expense',
      categoryId: 'cat-alimentacao',
      needsReview: false,
      notes: 'Compras da semana',
      source: 'spreadsheet_seed',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'tx-3',
      date: dateOf(6),
      description: 'POSTO IPIRANGA COMBUSTÍVEL',
      amount: 220.0,
      type: 'expense',
      categoryId: 'cat-transporte',
      needsReview: false,
      notes: 'Abastecimento',
      source: 'spreadsheet_seed',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'tx-4',
      date: dateOf(10),
      description: 'CONDOMÍNIO RESIDENCIAL JARDINS',
      amount: 750.0,
      type: 'expense',
      categoryId: 'cat-moradia',
      needsReview: false,
      notes: 'Boleto mensal',
      source: 'spreadsheet_seed',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'tx-5',
      date: dateOf(12),
      description: 'DROGASIL FARMÁCIA',
      amount: 115.8,
      type: 'expense',
      categoryId: 'cat-saude',
      needsReview: false,
      notes: 'Medicamentos',
      source: 'spreadsheet_seed',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'tx-6',
      date: dateOf(15),
      description: 'NETFLIX BRASIL',
      amount: 55.9,
      type: 'expense',
      categoryId: 'cat-assinaturas',
      needsReview: false,
      notes: 'Assinatura streaming',
      source: 'spreadsheet_seed',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'tx-7',
      date: dateOf(18),
      description: 'UBER *TRIP RIDE',
      amount: 32.4,
      type: 'expense',
      categoryId: 'cat-transporte',
      needsReview: false,
      notes: 'Corrida reunião',
      source: 'spreadsheet_seed',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'tx-8',
      date: dateOf(20),
      description: 'PÃO DE AÇÚCAR SUPERMERCADO',
      amount: 312.45,
      type: 'expense',
      categoryId: 'cat-alimentacao',
      needsReview: false,
      notes: '',
      source: 'import_ofx',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'tx-9',
      date: dateOf(22),
      description: 'JOÃO PEDRO SA',
      amount: 85.0,
      type: 'expense',
      categoryId: null,
      needsReview: true,
      suggestedCategoryId: 'cat-alimentacao',
      notes: 'Aguardando confirmação manual',
      source: 'import_ofx',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'tx-10',
      date: dateOf(24),
      description: 'PAG*PadariaBellaVista',
      amount: 42.5,
      type: 'expense',
      categoryId: null,
      needsReview: true,
      suggestedCategoryId: 'cat-alimentacao',
      notes: 'Aguardando confirmação manual',
      source: 'import_csv',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]

  const budgets: BudgetLimit[] = [
    { categoryId: 'cat-alimentacao', monthlyLimit: 1200 },
    { categoryId: 'cat-transporte', monthlyLimit: 400 },
    { categoryId: 'cat-moradia', monthlyLimit: 1500 },
    { categoryId: 'cat-saude', monthlyLimit: 300 },
    { categoryId: 'cat-assinaturas', monthlyLimit: 150 },
    { categoryId: 'cat-lazer', monthlyLimit: 250 },
  ]

  const rules: LearnedMapping[] = [
    {
      exactDescription: 'PÃO DE AÇÚCAR SUPERMERCADO',
      normalizedDescription: normalizeDescription('PÃO DE AÇÚCAR SUPERMERCADO'),
      categoryId: 'cat-alimentacao',
      confirmCount: 2,
      lastUsedAt: new Date().toISOString(),
    },
    {
      exactDescription: 'POSTO IPIRANGA COMBUSTÍVEL',
      normalizedDescription: normalizeDescription('POSTO IPIRANGA COMBUSTÍVEL'),
      categoryId: 'cat-transporte',
      confirmCount: 1,
      lastUsedAt: new Date().toISOString(),
    },
    {
      exactDescription: 'CONDOMÍNIO RESIDENCIAL JARDINS',
      normalizedDescription: normalizeDescription('CONDOMÍNIO RESIDENCIAL JARDINS'),
      categoryId: 'cat-moradia',
      confirmCount: 1,
      lastUsedAt: new Date().toISOString(),
    },
    {
      exactDescription: 'DROGASIL FARMÁCIA',
      normalizedDescription: normalizeDescription('DROGASIL FARMÁCIA'),
      categoryId: 'cat-saude',
      confirmCount: 1,
      lastUsedAt: new Date().toISOString(),
    },
    {
      exactDescription: 'NETFLIX BRASIL',
      normalizedDescription: normalizeDescription('NETFLIX BRASIL'),
      categoryId: 'cat-assinaturas',
      confirmCount: 1,
      lastUsedAt: new Date().toISOString(),
    },
    {
      exactDescription: 'UBER *TRIP RIDE',
      normalizedDescription: normalizeDescription('UBER *TRIP RIDE'),
      categoryId: 'cat-transporte',
      confirmCount: 1,
      lastUsedAt: new Date().toISOString(),
    },
  ]

  return { categories, transactions, budgets, rules }
}

// ---------------------------------------------------------------------------
// v2 hierarchy loaders / savers
// ---------------------------------------------------------------------------

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const parsed = JSON.parse(raw)
      return parsed as T
    }
  } catch (e) {
    console.error('Error loading', key, e)
  }
  return fallback
}

function saveJSON<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (e) {
    console.error('Error saving', key, e)
  }
}

export function loadFinancialClasses(): FinancialClass[] {
  const stored = loadJSON<FinancialClass[] | null>(STORAGE_KEYS.FINANCIAL_CLASSES, null)
  if (stored && stored.length) return stored
  // first run: seed defaults and persist so edits are saved back
  saveJSON(STORAGE_KEYS.FINANCIAL_CLASSES, DEFAULT_FINANCIAL_CLASSES)
  return DEFAULT_FINANCIAL_CLASSES
}

export function saveFinancialClasses(classes: FinancialClass[]): void {
  saveJSON(STORAGE_KEYS.FINANCIAL_CLASSES, classes)
}

export function loadFinancialCategories(): FinancialCategory[] {
  const stored = loadJSON<FinancialCategory[] | null>(STORAGE_KEYS.FINANCIAL_CATEGORIES, null)
  if (stored && stored.length) return stored
  saveJSON(STORAGE_KEYS.FINANCIAL_CATEGORIES, DEFAULT_FINANCIAL_CATEGORIES)
  return DEFAULT_FINANCIAL_CATEGORIES
}

export function saveFinancialCategories(categories: FinancialCategory[]): void {
  saveJSON(STORAGE_KEYS.FINANCIAL_CATEGORIES, categories)
}

export function loadFinancialItems(): FinancialItem[] {
  const stored = loadJSON<FinancialItem[] | null>(STORAGE_KEYS.FINANCIAL_ITEMS, null)
  if (stored && stored.length) return stored
  const seeded = buildDefaultFinancialItems()
  saveJSON(STORAGE_KEYS.FINANCIAL_ITEMS, seeded)
  return seeded
}

export function saveFinancialItems(items: FinancialItem[]): void {
  saveJSON(STORAGE_KEYS.FINANCIAL_ITEMS, items)
}

export function loadAccounts(): Account[] {
  const stored = loadJSON<Account[] | null>(STORAGE_KEYS.ACCOUNTS, null)
  if (stored && stored.length) return stored
  saveJSON(STORAGE_KEYS.ACCOUNTS, DEFAULT_ACCOUNTS)
  return DEFAULT_ACCOUNTS
}

export function saveAccounts(accounts: Account[]): void {
  saveJSON(STORAGE_KEYS.ACCOUNTS, accounts)
}

export function loadCreditCards(): CreditCard[] {
  const stored = loadJSON<CreditCard[] | null>(STORAGE_KEYS.CREDIT_CARDS, null)
  if (stored && stored.length) return stored
  saveJSON(STORAGE_KEYS.CREDIT_CARDS, DEFAULT_CREDIT_CARDS)
  return DEFAULT_CREDIT_CARDS
}

export function saveCreditCards(cards: CreditCard[]): void {
  saveJSON(STORAGE_KEYS.CREDIT_CARDS, cards)
}

export function loadInstallmentGroups(): InstallmentGroup[] {
  return loadJSON<InstallmentGroup[]>(STORAGE_KEYS.INSTALLMENT_GROUPS, [])
}

export function saveInstallmentGroups(groups: InstallmentGroup[]): void {
  saveJSON(STORAGE_KEYS.INSTALLMENT_GROUPS, groups)
}

export function loadClassificationRules(): ClassificationRule[] {
  return loadJSON<ClassificationRule[]>(STORAGE_KEYS.CLASSIFICATION_RULES, [])
}

export function saveClassificationRules(rules: ClassificationRule[]): void {
  saveJSON(STORAGE_KEYS.CLASSIFICATION_RULES, rules)
}

/**
 * Runs the v2 migration (localStorage -> new hierarchy) if it hasn't run yet.
 *
 * What it does:
 *  - Ensures the v2 hierarchy keys exist (classes, categories, items, accounts, cards)
 *  - For each existing transaction that has a `categoryId` but no `itemId`,
 *    infers the best-matching item from the catalog (by id, by name, by keyword)
 *    and stores it in `itemId`. Keeps `categoryId` intact for backward compat.
 *  - Marks migrated transactions with `source='legacy_migration'` ONLY if they
 *    had no source; preserves their original source otherwise.
 *  - Sets `datePrecision='month'` for transactions that look migrated
 *    (legacy date with day 1) so the dashboard can display them correctly.
 *  - Records `schemaVersion=2` and `v2MigrationAt` in settings.
 *
 * Returns the migrated transactions (or null if nothing changed).
 */
export function migrateToV2Hierarchy(): Transaction[] | null {
  const settings = loadSettings()
  if (settings.schemaVersion && settings.schemaVersion >= CURRENT_SCHEMA_VERSION) {
    // still make sure the v2 keys exist (defensive)
    loadFinancialClasses()
    loadFinancialCategories()
    loadFinancialItems()
    loadAccounts()
    loadCreditCards()
    return null
  }

  // Ensure hierarchy seed exists
  loadFinancialClasses()
  loadFinancialCategories()
  loadFinancialItems()
  loadAccounts()
  loadCreditCards()

  const transactions = loadTransactions()
  let changed = false
  const updated = transactions.map((t) => {
    if (t.itemId) return t // already migrated

    let itemId: string | null = null
    if (t.categoryId) {
      itemId = mapLegacyCategoryIdToItem(t.categoryId)
    }
    if (!itemId) {
      // try to derive from description keywords
      itemId = mapLegacyCategoryNameToItem(t.description)
    }

    // For legacy transactions without an explicit source, treat them as
    // migrated data so the UI can flag them. But NEVER overwrite a real
    // source like 'manual' or 'import_csv'.
    const source = t.source ?? 'legacy_migration'

    // If the date is a legacy "YYYY-MM-01" placeholder, mark precision = month
    const datePrecision: 'exact' | 'month' = t.date.endsWith('-01') ? 'month' : 'exact'

    changed = true
    return {
      ...t,
      itemId,
      source,
      datePrecision,
    } as Transaction
  })

  if (changed) {
    saveTransactions(updated)
  }

  const nextSettings: AppSettings = {
    ...settings,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    v2MigrationAt: new Date().toISOString(),
  }
  saveSettings(nextSettings)
  return changed ? updated : null
}

/**
 * Resets all localStorage data (including the v2 hierarchy keys).
 */
export function clearAllData(): void {
  localStorage.removeItem(STORAGE_KEYS.TRANSACTIONS)
  localStorage.removeItem(STORAGE_KEYS.CATEGORIES)
  localStorage.removeItem(STORAGE_KEYS.BUDGETS)
  localStorage.removeItem(STORAGE_KEYS.LEARNED_RULES)
  localStorage.removeItem(STORAGE_KEYS.SETTINGS)
  localStorage.removeItem(STORAGE_KEYS.FINANCIAL_CLASSES)
  localStorage.removeItem(STORAGE_KEYS.FINANCIAL_CATEGORIES)
  localStorage.removeItem(STORAGE_KEYS.FINANCIAL_ITEMS)
  localStorage.removeItem(STORAGE_KEYS.ACCOUNTS)
  localStorage.removeItem(STORAGE_KEYS.CREDIT_CARDS)
  localStorage.removeItem(STORAGE_KEYS.INSTALLMENT_GROUPS)
  localStorage.removeItem(STORAGE_KEYS.CLASSIFICATION_RULES)
}

/**
 * Exports complete JSON backup
 */
export function exportBackupJSON(): string {
  const data = {
    version: '2.0',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    settings: loadSettings(),
    categories: loadCategories(),
    transactions: loadTransactions(),
    budgets: loadBudgets(),
    learnedRules: loadLearnedRules(),
    financialClasses: loadFinancialClasses(),
    financialCategories: loadFinancialCategories(),
    financialItems: loadFinancialItems(),
    accounts: loadAccounts(),
    creditCards: loadCreditCards(),
    installmentGroups: loadInstallmentGroups(),
    classificationRules: loadClassificationRules(),
  }
  return JSON.stringify(data, null, 2)
}

/**
 * Restores complete JSON backup
 */
export function restoreBackupJSON(jsonStr: string): boolean {
  try {
    const data = JSON.parse(jsonStr)
    if (data.settings) saveSettings(data.settings)
    if (data.categories) saveCategories(data.categories)
    if (data.transactions) saveTransactions(data.transactions)
    if (data.budgets) saveBudgets(data.budgets)
    if (data.learnedRules) saveLearnedRules(data.learnedRules)
    if (data.financialClasses) saveFinancialClasses(data.financialClasses)
    if (data.financialCategories) saveFinancialCategories(data.financialCategories)
    if (data.financialItems) saveFinancialItems(data.financialItems)
    if (data.accounts) saveAccounts(data.accounts)
    if (data.creditCards) saveCreditCards(data.creditCards)
    if (data.installmentGroups) saveInstallmentGroups(data.installmentGroups)
    if (data.classificationRules) saveClassificationRules(data.classificationRules)
    return true
  } catch (e) {
    console.error('Failed to restore backup', e)
    return false
  }
}

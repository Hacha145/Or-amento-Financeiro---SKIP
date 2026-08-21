import {
  Category,
  Transaction,
  BudgetLimit,
  LearnedMapping,
  AppSettings,
  DEFAULT_CATEGORIES,
  PALETTE_COLORS,
} from '../types/finance'
import { sanitizeLearnedRules, normalizeDescription } from './learningEngine'

const STORAGE_KEYS = {
  TRANSACTIONS: 'orcamento_transactions_v1',
  CATEGORIES: 'orcamento_categories_v1',
  BUDGETS: 'orcamento_budgets_v1',
  LEARNED_RULES: 'orcamento_learned_rules_v1',
  SETTINGS: 'orcamento_settings_v1',
}

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

/**
 * Resets all localStorage data
 */
export function clearAllData(): void {
  localStorage.removeItem(STORAGE_KEYS.TRANSACTIONS)
  localStorage.removeItem(STORAGE_KEYS.CATEGORIES)
  localStorage.removeItem(STORAGE_KEYS.BUDGETS)
  localStorage.removeItem(STORAGE_KEYS.LEARNED_RULES)
  localStorage.removeItem(STORAGE_KEYS.SETTINGS)
}

/**
 * Exports complete JSON backup
 */
export function exportBackupJSON(): string {
  const data = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    settings: loadSettings(),
    categories: loadCategories(),
    transactions: loadTransactions(),
    budgets: loadBudgets(),
    learnedRules: loadLearnedRules(),
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
    return true
  } catch (e) {
    console.error('Failed to restore backup', e)
    return false
  }
}

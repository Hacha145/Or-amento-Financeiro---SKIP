import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react'
import {
  Category,
  Transaction,
  BudgetLimit,
  LearnedMapping,
  AppSettings,
  DEFAULT_CATEGORIES,
  PALETTE_COLORS,
  AppTemplateConfig,
  FinancialClass,
  FinancialCategory,
  FinancialItem,
  Account,
  CreditCard,
  InstallmentGroup,
  ClassificationRule,
} from '../types/finance'
import {
  loadSettings,
  saveSettings,
  loadCategories,
  saveCategories,
  loadTransactions,
  saveTransactions,
  loadBudgets,
  saveBudgets,
  loadLearnedRules,
  saveLearnedRules,
  generateSampleData,
  clearAllData,
  exportBackupJSON,
  restoreBackupJSON,
  loadFinancialClasses,
  saveFinancialClasses,
  loadFinancialCategories,
  saveFinancialCategories,
  loadFinancialItems,
  saveFinancialItems,
  loadAccounts,
  saveAccounts,
  loadCreditCards,
  saveCreditCards,
  loadInstallmentGroups,
  saveInstallmentGroups,
  loadClassificationRules,
  saveClassificationRules,
  migrateToV2Hierarchy,
} from '../lib/storage'
import {
  classifyByExactMatch,
  suggestCategoryByKeywords,
  learnExactRule,
  buildLearnedRulesMap,
  isCreditCardPaymentDescription,
} from '../lib/learningEngine'
import {
  classifyTransaction,
  buildRuleFromTransaction,
  markRuleApplied,
} from '../lib/classificationEngine'
import {
  consolidateMonth,
  consolidateYear,
  lastUpdatedDate,
  variationPercent,
  previousMonthKey,
  type MonthConsolidation,
  type YearConsolidation,
} from '../lib/consolidation'

interface FinanceContextType {
  // State
  settings: AppSettings
  categories: Category[]
  transactions: Transaction[]
  budgets: BudgetLimit[]
  learnedRules: LearnedMapping[]
  currentMonth: string // YYYY-MM
  setCurrentMonth: (month: string) => void

  // v2 hierarchy state
  financialClasses: FinancialClass[]
  financialCategories: FinancialCategory[]
  financialItems: FinancialItem[]
  accounts: Account[]
  creditCards: CreditCard[]
  installmentGroups: InstallmentGroup[]
  classificationRules: ClassificationRule[]

  // Consolidation (shared engine)
  monthConsolidation: MonthConsolidation
  yearConsolidation: YearConsolidation
  previousMonthConsolidation: MonthConsolidation
  dataUpdatedAt: string | null // "Dados atualizados até" indicator

  // Stats for current month (legacy, kept for backward compatibility)
  monthlyStats: {
    income: number
    expense: number
    balance: number
    savingsRate: number
    pendingReviewCount: number
    expensesByCategory: {
      categoryId: string
      categoryName: string
      color: string
      total: number
      percentage: number
    }[]
    last6MonthsHistory: { monthKey: string; monthLabel: string; income: number; expense: number }[]
    budgetProgress: {
      categoryId: string
      categoryName: string
      color: string
      limit: number
      spent: number
      percentage: number
      isOver: boolean
    }[]
  }

  // Actions
  updateSettings: (newSettings: Partial<AppSettings>) => void
  setTemplateConfig: (templateConfig: AppTemplateConfig) => void
  addTransaction: (tx: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => Transaction
  updateTransaction: (id: string, updates: Partial<Transaction>) => void
  deleteTransaction: (id: string) => void
  batchDeleteTransactions: (ids: string[]) => void
  classifyAndConfirmTransaction: (id: string, categoryId: string) => void
  classifyAndConfirmTransactionItem: (id: string, itemId: string) => void
  batchConfirmTransactions: (items: { id: string; categoryId: string }[]) => void
  batchConfirmTransactionsItem: (items: { id: string; itemId: string }[]) => void

  // Category Actions
  addCategory: (name: string, color?: string, icon?: string) => Category
  updateCategory: (id: string, updates: Partial<Category>) => void
  deleteCategory: (id: string) => void

  // v2 hierarchy actions
  addFinancialItem: (item: Omit<FinancialItem, 'id' | 'createdAt' | 'updatedAt'>) => FinancialItem
  updateFinancialItem: (id: string, updates: Partial<FinancialItem>) => void
  deleteFinancialItem: (id: string) => void
  addAccount: (account: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>) => Account
  updateAccount: (id: string, updates: Partial<Account>) => void
  deleteAccount: (id: string) => void
  addCreditCard: (card: Omit<CreditCard, 'id' | 'createdAt' | 'updatedAt'>) => CreditCard
  updateCreditCard: (id: string, updates: Partial<CreditCard>) => void
  deleteCreditCard: (id: string) => void
  saveClassificationRule: (rule: ClassificationRule) => void
  deleteClassificationRule: (id: string) => void
  createRuleFromTransaction: (
    txId: string,
    itemId: string,
    name?: string,
  ) => ClassificationRule | null

  // Budget Actions
  setBudgetLimit: (categoryId: string, monthlyLimit: number) => void
  removeBudgetLimit: (categoryId: string) => void

  // Learning Engine & Batch Import
  importTransactionsBatch: (
    newTxData: {
      date: string
      description: string
      amount: number
      type: 'expense' | 'income'
      categoryName?: string
      notes?: string
      source?: Transaction['source']
      isCreditCardPayment?: boolean
    }[],
  ) => { imported: number; autoClassified: number; pendingReview: number }
  findCategoryByName: (name: string) => Category | undefined
  findOrCreateCategory: (name: string) => Category

  // Reset & Seed
  loadDemoData: () => void
  resetData: () => void
  exportBackup: () => string
  restoreBackup: (jsonStr: string) => boolean
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined)

const formatMonthKey = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export const FinanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Run the v2 migration on first load (idempotent — only runs once thanks to
  // the schemaVersion flag in settings).
  const [settings, setSettingsState] = useState<AppSettings>(() => {
    migrateToV2Hierarchy()
    return loadSettings()
  })
  const [categories, setCategoriesState] = useState<Category[]>(() => loadCategories())
  const [transactions, setTransactionsState] = useState<Transaction[]>(() => loadTransactions())
  const [budgets, setBudgetsState] = useState<BudgetLimit[]>(() => loadBudgets())
  const [learnedRules, setLearnedRulesState] = useState<LearnedMapping[]>(() => loadLearnedRules())
  // v2 hierarchy state
  const [financialClasses, setFinancialClassesState] = useState<FinancialClass[]>(() =>
    loadFinancialClasses(),
  )
  const [financialCategories, setFinancialCategoriesState] = useState<FinancialCategory[]>(() =>
    loadFinancialCategories(),
  )
  const [financialItems, setFinancialItemsState] = useState<FinancialItem[]>(() =>
    loadFinancialItems(),
  )
  const [accounts, setAccountsState] = useState<Account[]>(() => loadAccounts())
  const [creditCards, setCreditCardsState] = useState<CreditCard[]>(() => loadCreditCards())
  const [installmentGroups, setInstallmentGroupsState] = useState<InstallmentGroup[]>(() =>
    loadInstallmentGroups(),
  )
  const [classificationRules, setClassificationRulesState] = useState<ClassificationRule[]>(() =>
    loadClassificationRules(),
  )
  const [currentMonth, setCurrentMonth] = useState<string>(() => formatMonthKey(new Date()))

  // Sync to storage
  const updateSettings = useCallback((newSettings: Partial<AppSettings>) => {
    setSettingsState((prev) => {
      const updated = { ...prev, ...newSettings }
      saveSettings(updated)
      return updated
    })
  }, [])

  const setTemplateConfig = useCallback((templateConfig: AppTemplateConfig) => {
    setSettingsState((prev) => {
      const updated = {
        ...prev,
        setupCompleted: true,
        templateConfig,
      }
      saveSettings(updated)
      return updated
    })
  }, [])

  const setCategories = useCallback((cats: Category[]) => {
    setCategoriesState(cats)
    saveCategories(cats)
  }, [])

  const setTransactions = useCallback((txs: Transaction[]) => {
    setTransactionsState(txs)
    saveTransactions(txs)
  }, [])

  const setBudgets = useCallback((b: BudgetLimit[]) => {
    setBudgetsState(b)
    saveBudgets(b)
  }, [])

  const setLearnedRules = useCallback((rules: LearnedMapping[]) => {
    setLearnedRulesState(rules)
    saveLearnedRules(rules)
  }, [])

  // v2 hierarchy setters (persist to storage on every change)
  const setFinancialClasses = useCallback((c: FinancialClass[]) => {
    setFinancialClassesState(c)
    saveFinancialClasses(c)
  }, [])
  const setFinancialCategories = useCallback((c: FinancialCategory[]) => {
    setFinancialCategoriesState(c)
    saveFinancialCategories(c)
  }, [])
  const setFinancialItems = useCallback((items: FinancialItem[]) => {
    setFinancialItemsState(items)
    saveFinancialItems(items)
  }, [])
  const setAccounts = useCallback((a: Account[]) => {
    setAccountsState(a)
    saveAccounts(a)
  }, [])
  const setCreditCards = useCallback((c: CreditCard[]) => {
    setCreditCardsState(c)
    saveCreditCards(c)
  }, [])
  const setInstallmentGroups = useCallback((g: InstallmentGroup[]) => {
    setInstallmentGroupsState(g)
    saveInstallmentGroups(g)
  }, [])
  const setClassificationRules = useCallback((r: ClassificationRule[]) => {
    setClassificationRulesState(r)
    saveClassificationRules(r)
  }, [])

  // Helper to find category by name (case-insensitive)
  const findCategoryByName = useCallback(
    (name: string) => {
      if (!name) return undefined
      const norm = name.trim().toLowerCase()
      return categories.find((c) => c.name.toLowerCase() === norm)
    },
    [categories],
  )

  // Find or create category
  const findOrCreateCategory = useCallback(
    (name: string): Category => {
      const existing = findCategoryByName(name)
      if (existing) return existing

      const usedColors = new Set(categories.map((c) => c.color))
      const availableColor =
        PALETTE_COLORS.find((col) => !usedColors.has(col)) ||
        PALETTE_COLORS[categories.length % PALETTE_COLORS.length]

      const newCat: Category = {
        id: `cat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: name.trim(),
        color: availableColor,
        isDefault: false,
      }

      const updated = [...categories, newCat]
      setCategories(updated)
      return newCat
    },
    [categories, findCategoryByName, setCategories],
  )

  // Add category
  const addCategory = useCallback(
    (name: string, color?: string, icon?: string): Category => {
      const chosenColor = color || PALETTE_COLORS[categories.length % PALETTE_COLORS.length]

      const newCat: Category = {
        id: `cat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: name.trim(),
        color: chosenColor,
        icon,
        isDefault: false,
      }
      const updated = [...categories, newCat]
      setCategories(updated)
      return newCat
    },
    [categories, setCategories],
  )

  // Update category
  const updateCategory = useCallback(
    (id: string, updates: Partial<Category>) => {
      const updated = categories.map((c) => (c.id === id ? { ...c, ...updates } : c))
      setCategories(updated)
    },
    [categories, setCategories],
  )

  // Delete category
  const deleteCategory = useCallback(
    (id: string) => {
      const updatedCats = categories.filter((c) => c.id !== id)
      setCategories(updatedCats)

      // Unassign category from transactions
      const updatedTxs = transactions.map((t) =>
        t.categoryId === id ? { ...t, categoryId: null, needsReview: true } : t,
      )
      setTransactions(updatedTxs)

      // Remove budget
      const updatedBudgets = budgets.filter((b) => b.categoryId !== id)
      setBudgets(updatedBudgets)
    },
    [categories, transactions, budgets, setCategories, setTransactions, setBudgets],
  )

  // Set Budget Limit
  const setBudgetLimit = useCallback(
    (categoryId: string, monthlyLimit: number) => {
      const existingIdx = budgets.findIndex((b) => b.categoryId === categoryId)
      let updated: BudgetLimit[]
      if (existingIdx >= 0) {
        updated = [...budgets]
        updated[existingIdx] = { categoryId, monthlyLimit }
      } else {
        updated = [...budgets, { categoryId, monthlyLimit }]
      }
      setBudgets(updated)
    },
    [budgets, setBudgets],
  )

  const removeBudgetLimit = useCallback(
    (categoryId: string) => {
      setBudgets(budgets.filter((b) => b.categoryId !== categoryId))
    },
    [budgets, setBudgets],
  )

  // Add Transaction
  const addTransaction = useCallback(
    (tx: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>): Transaction => {
      const now = new Date().toISOString()
      const isCC =
        tx.isCreditCardPayment !== undefined
          ? tx.isCreditCardPayment
          : tx.type === 'credit_card_payment'
            ? true
            : isCreditCardPaymentDescription(tx.description)

      // If the transaction is still unclassified but the user did NOT set
      // needsReview, run the v2 classifier to suggest an item + reason.
      let itemId = tx.itemId ?? null
      let categoryId = tx.categoryId ?? null
      let needsReview = tx.needsReview
      let suggestedItemId = tx.suggestedItemId ?? null
      let suggestedCategoryId = tx.suggestedCategoryId ?? null
      let classificationReason = tx.classificationReason ?? null

      if (!itemId && !categoryId && !needsReview) {
        const rulesMap = buildLearnedRulesMap(learnedRules)
        const result = classifyTransaction(
          { ...tx, id: 'pending' } as Transaction,
          financialItems,
          classificationRules,
          rulesMap,
          categories,
        )
        if (result.itemId) {
          itemId = result.itemId
          const item = financialItems.find((i) => i.id === itemId)
          if (item?.categoryId) categoryId = item.categoryId
          classificationReason = result.reason
          if (result.confidence === 'keyword') {
            // keyword matches need confirmation
            needsReview = true
            suggestedItemId = itemId
            suggestedCategoryId = item?.categoryId ?? null
          }
        } else {
          needsReview = true
        }
      }

      const newTx: Transaction = {
        ...tx,
        itemId,
        categoryId,
        needsReview,
        suggestedItemId,
        suggestedCategoryId,
        classificationReason,
        isCreditCardPayment: isCC,
        id: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        createdAt: now,
        updatedAt: now,
      }

      // If categoryId is provided manually, learn rule
      if (newTx.categoryId && !newTx.needsReview) {
        const updatedRules = learnExactRule(learnedRules, newTx.description, newTx.categoryId)
        setLearnedRules(updatedRules)
      }

      const updated = [newTx, ...transactions]
      setTransactions(updated)
      return newTx
    },
    [
      learnedRules,
      financialItems,
      classificationRules,
      categories,
      setLearnedRules,
      transactions,
      setTransactions,
    ],
  )

  // Update Transaction
  const updateTransaction = useCallback(
    (id: string, updates: Partial<Transaction>) => {
      let updatedRules = learnedRules

      const updated = transactions.map((t) => {
        if (t.id === id) {
          const isCC =
            updates.isCreditCardPayment !== undefined
              ? updates.isCreditCardPayment
              : updates.type === 'credit_card_payment'
                ? true
                : updates.description
                  ? isCreditCardPaymentDescription(updates.description)
                  : t.isCreditCardPayment !== undefined
                    ? t.isCreditCardPayment
                    : isCreditCardPaymentDescription(t.description)

          const merged = {
            ...t,
            ...updates,
            isCreditCardPayment: isCC,
            updatedAt: new Date().toISOString(),
          }

          // If itemId changed, also sync categoryId when possible
          if (updates.itemId && updates.itemId !== t.itemId) {
            const targetItem = financialItems.find((i) => i.id === updates.itemId)
            if (targetItem?.categoryId) {
              merged.categoryId = targetItem.categoryId
            }
          }

          // If category changed and confirmed
          if (merged.categoryId && !merged.needsReview && updates.categoryId) {
            updatedRules = learnExactRule(updatedRules, merged.description, merged.categoryId)
          }
          if (merged.itemId && !merged.needsReview && updates.itemId) {
            const targetItem = financialItems.find((i) => i.id === merged.itemId)
            if (targetItem?.categoryId) {
              updatedRules = learnExactRule(updatedRules, merged.description, targetItem.categoryId)
            }
          }
          return merged
        }
        return t
      })

      if (updatedRules !== learnedRules) {
        setLearnedRules(updatedRules)
      }
      setTransactions(updated)
    },
    [learnedRules, financialItems, setLearnedRules, transactions, setTransactions],
  )

  // Delete Transaction
  const deleteTransaction = useCallback(
    (id: string) => {
      setTransactions(transactions.filter((t) => t.id !== id))
    },
    [transactions, setTransactions],
  )

  const batchDeleteTransactions = useCallback(
    (ids: string[]) => {
      const idSet = new Set(ids)
      setTransactions(transactions.filter((t) => !idSet.has(t.id)))
    },
    [transactions, setTransactions],
  )

  // Confirm manual classification (legacy category-based)
  const classifyAndConfirmTransaction = useCallback(
    (id: string, categoryId: string) => {
      let ruleUpdated = learnedRules
      const updated = transactions.map((t) => {
        if (t.id === id) {
          ruleUpdated = learnExactRule(ruleUpdated, t.description, categoryId)
          return {
            ...t,
            categoryId,
            needsReview: false,
            suggestedCategoryId: null,
            updatedAt: new Date().toISOString(),
          }
        }
        return t
      })

      setLearnedRules(ruleUpdated)
      setTransactions(updated)
    },
    [learnedRules, setLearnedRules, transactions, setTransactions],
  )

  // Confirm manual classification (v2 item-based). Also keeps legacy
  // categoryId in sync by deriving it from the item's category when possible.
  const classifyAndConfirmTransactionItem = useCallback(
    (id: string, itemId: string) => {
      let ruleUpdated = learnedRules
      const targetItem = financialItems.find((i) => i.id === itemId)
      const updated = transactions.map((t) => {
        if (t.id === id) {
          ruleUpdated = learnExactRule(ruleUpdated, t.description, targetItem?.categoryId || itemId)
          return {
            ...t,
            itemId,
            categoryId: targetItem?.categoryId || t.categoryId,
            needsReview: false,
            suggestedItemId: null,
            suggestedCategoryId: null,
            updatedAt: new Date().toISOString(),
          }
        }
        return t
      })

      setLearnedRules(ruleUpdated)
      setTransactions(updated)
    },
    [learnedRules, financialItems, setLearnedRules, transactions, setTransactions],
  )

  // Batch confirm with v2 item ids
  const batchConfirmTransactionsItem = useCallback(
    (items: { id: string; itemId: string }[]) => {
      let currentRules = learnedRules
      const itemMap = new Map(items.map((i) => [i.id, i.itemId]))

      const updated = transactions.map((t) => {
        const targetItemId = itemMap.get(t.id)
        if (targetItemId) {
          const targetItem = financialItems.find((i) => i.id === targetItemId)
          currentRules = learnExactRule(
            currentRules,
            t.description,
            targetItem?.categoryId || targetItemId,
          )
          return {
            ...t,
            itemId: targetItemId,
            categoryId: targetItem?.categoryId || t.categoryId,
            needsReview: false,
            suggestedItemId: null,
            suggestedCategoryId: null,
            updatedAt: new Date().toISOString(),
          }
        }
        return t
      })

      setLearnedRules(currentRules)
      setTransactions(updated)
    },
    [learnedRules, financialItems, setLearnedRules, transactions, setTransactions],
  )

  // Batch confirm
  const batchConfirmTransactions = useCallback(
    (items: { id: string; categoryId: string }[]) => {
      let currentRules = learnedRules
      const itemMap = new Map(items.map((i) => [i.id, i.categoryId]))

      const updated = transactions.map((t) => {
        const catId = itemMap.get(t.id)
        if (catId) {
          currentRules = learnExactRule(currentRules, t.description, catId)
          return {
            ...t,
            categoryId: catId,
            needsReview: false,
            suggestedCategoryId: null,
            updatedAt: new Date().toISOString(),
          }
        }
        return t
      })

      setLearnedRules(currentRules)
      setTransactions(updated)
    },
    [learnedRules, setLearnedRules, transactions, setTransactions],
  )

  // Batch Import (from bank files or seed spreadsheet).
  // Runs BOTH the v2 item-based classification engine AND the legacy
  // exact/keyword logic so we keep populating itemId + categoryId in parallel.
  const importTransactionsBatch = useCallback(
    (
      newTxData: {
        date: string
        description: string
        amount: number
        type: 'expense' | 'income'
        categoryName?: string
        notes?: string
        isCreditCardPayment?: boolean
        source?: Transaction['source']
      }[],
    ) => {
      let autoClassified = 0
      let pendingReview = 0
      let currentRules = [...learnedRules]
      let rulesMap = buildLearnedRulesMap(currentRules)
      let currentCats = [...categories]
      // mutable copy of classification rules so applied counters update
      let currentClassRules = [...classificationRules]

      const newTransactions: Transaction[] = []

      for (const item of newTxData) {
        let finalCategoryId: string | null = null
        let finalItemId: string | null = null
        let needsReview = false
        let suggestedCategoryId: string | null = null
        let suggestedItemId: string | null = null
        let classificationReason: string | null = null
        const isCC =
          item.isCreditCardPayment !== undefined
            ? item.isCreditCardPayment
            : isCreditCardPaymentDescription(item.description)

        // 1. If categoryName is explicitly provided (e.g. from seed template spreadsheet)
        if (item.categoryName && item.categoryName.trim()) {
          const normCat = item.categoryName.trim()
          let foundCat = currentCats.find((c) => c.name.toLowerCase() === normCat.toLowerCase())
          if (!foundCat) {
            const usedColors = new Set(currentCats.map((c) => c.color))
            const availableColor =
              PALETTE_COLORS.find((col) => !usedColors.has(col)) ||
              PALETTE_COLORS[currentCats.length % PALETTE_COLORS.length]
            foundCat = {
              id: `cat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              name: normCat,
              color: availableColor,
              isDefault: false,
            }
            currentCats.push(foundCat)
          }

          finalCategoryId = foundCat.id
          needsReview = false
          // Learn exact rule for future bank imports
          currentRules = learnExactRule(currentRules, item.description, finalCategoryId)
          rulesMap = buildLearnedRulesMap(currentRules)
          autoClassified++
        } else {
          // 2. Bank import: Check EXACT match rule with intelligent normalization (O(1) lookup)
          const exactResult = classifyByExactMatch(item.description, rulesMap)

          if (exactResult.matched && exactResult.categoryId) {
            finalCategoryId = exactResult.categoryId
            needsReview = false
            autoClassified++
          } else {
            // 3. No exact match: Suggest possible category via keywords, but mark needsReview: true
            needsReview = true
            suggestedCategoryId = suggestCategoryByKeywords(item.description, currentCats)
            pendingReview++
          }
        }

        // v2: run the item-based classifier for itemId + reason
        const txForClassify: Transaction = {
          id: 'pending',
          date: item.date,
          description: item.description,
          amount: item.amount,
          type: item.type,
          categoryId: finalCategoryId,
          itemId: null,
          needsReview,
          source: item.source,
          createdAt: '',
          updatedAt: '',
        }
        const v2Result = classifyTransaction(
          txForClassify,
          financialItems,
          currentClassRules,
          rulesMap,
          currentCats,
        )
        if (v2Result.itemId) {
          finalItemId = v2Result.itemId
          classificationReason = v2Result.reason
          // If v2 gave a confident answer and the legacy path was unsure, adopt it
          if (needsReview && (v2Result.confidence === 'rule' || v2Result.confidence === 'exact')) {
            needsReview = false
            const targetItem = financialItems.find((i) => i.id === finalItemId)
            if (targetItem?.categoryId) finalCategoryId = targetItem.categoryId
            autoClassified++
            pendingReview = Math.max(0, pendingReview - 1)
          }
          if (v2Result.confidence === 'rule') {
            // bump rule application counters
            const appliedRule = currentClassRules.find((r) => r.action.itemId === finalItemId)
            if (appliedRule) {
              currentClassRules = currentClassRules.map((r) =>
                r.id === appliedRule.id ? markRuleApplied(r) : r,
              )
            }
          }
        }
        if (needsReview && v2Result.itemId) {
          suggestedItemId = v2Result.itemId
        }

        const now = new Date().toISOString()
        newTransactions.push({
          id: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          date: item.date,
          description: item.description,
          amount: item.amount,
          type: item.type,
          categoryId: finalCategoryId,
          itemId: finalItemId,
          needsReview,
          suggestedCategoryId,
          suggestedItemId,
          classificationReason,
          isCreditCardPayment: isCC,
          notes: item.notes || '',
          source: item.source || 'import_csv',
          createdAt: now,
          updatedAt: now,
        })
      }

      setCategories(currentCats)
      setLearnedRules(currentRules)
      if (currentClassRules !== classificationRules) {
        setClassificationRules(currentClassRules)
      }
      const mergedTxs = [...newTransactions, ...transactions]
      setTransactions(mergedTxs)

      return {
        imported: newTransactions.length,
        autoClassified,
        pendingReview,
      }
    },
    [
      categories,
      learnedRules,
      classificationRules,
      financialItems,
      setCategories,
      setLearnedRules,
      setClassificationRules,
      transactions,
      setTransactions,
    ],
  )

  // --- v2 hierarchy actions ---

  const addFinancialItem = useCallback(
    (item: Omit<FinancialItem, 'id' | 'createdAt' | 'updatedAt'>): FinancialItem => {
      const now = new Date().toISOString()
      const newItem: FinancialItem = {
        ...item,
        id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        createdAt: now,
        updatedAt: now,
      }
      setFinancialItems([...financialItems, newItem])
      return newItem
    },
    [financialItems, setFinancialItems],
  )

  const updateFinancialItem = useCallback(
    (id: string, updates: Partial<FinancialItem>) => {
      const updated = financialItems.map((i) =>
        i.id === id ? { ...i, ...updates, updatedAt: new Date().toISOString() } : i,
      )
      setFinancialItems(updated)
    },
    [financialItems, setFinancialItems],
  )

  const deleteFinancialItem = useCallback(
    (id: string) => {
      setFinancialItems(financialItems.filter((i) => i.id !== id))
      // unassign item from transactions
      const updatedTxs = transactions.map((t) =>
        t.itemId === id ? { ...t, itemId: null, needsReview: true } : t,
      )
      setTransactions(updatedTxs)
    },
    [financialItems, transactions, setFinancialItems, setTransactions],
  )

  const addAccount = useCallback(
    (account: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>): Account => {
      const now = new Date().toISOString()
      const newAccount: Account = {
        ...account,
        id: `acc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        createdAt: now,
        updatedAt: now,
      }
      setAccounts([...accounts, newAccount])
      return newAccount
    },
    [accounts, setAccounts],
  )

  const updateAccount = useCallback(
    (id: string, updates: Partial<Account>) => {
      const updated = accounts.map((a) =>
        a.id === id ? { ...a, ...updates, updatedAt: new Date().toISOString() } : a,
      )
      setAccounts(updated)
    },
    [accounts, setAccounts],
  )

  const deleteAccount = useCallback(
    (id: string) => {
      setAccounts(accounts.filter((a) => a.id !== id))
    },
    [accounts, setAccounts],
  )

  const addCreditCard = useCallback(
    (card: Omit<CreditCard, 'id' | 'createdAt' | 'updatedAt'>): CreditCard => {
      const now = new Date().toISOString()
      const newCard: CreditCard = {
        ...card,
        id: `cc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        createdAt: now,
        updatedAt: now,
      }
      setCreditCards([...creditCards, newCard])
      return newCard
    },
    [creditCards, setCreditCards],
  )

  const updateCreditCard = useCallback(
    (id: string, updates: Partial<CreditCard>) => {
      const updated = creditCards.map((c) =>
        c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c,
      )
      setCreditCards(updated)
    },
    [creditCards, setCreditCards],
  )

  const deleteCreditCard = useCallback(
    (id: string) => {
      setCreditCards(creditCards.filter((c) => c.id !== id))
    },
    [creditCards, setCreditCards],
  )

  const saveClassificationRule = useCallback(
    (rule: ClassificationRule) => {
      const exists = classificationRules.some((r) => r.id === rule.id)
      const updated = exists
        ? classificationRules.map((r) =>
            r.id === rule.id ? { ...rule, updatedAt: new Date().toISOString() } : r,
          )
        : [...classificationRules, rule]
      setClassificationRules(updated)
    },
    [classificationRules, setClassificationRules],
  )

  const deleteClassificationRule = useCallback(
    (id: string) => {
      setClassificationRules(classificationRules.filter((r) => r.id !== id))
    },
    [classificationRules, setClassificationRules],
  )

  const createRuleFromTransaction = useCallback(
    (txId: string, itemId: string, name?: string): ClassificationRule | null => {
      const tx = transactions.find((t) => t.id === txId)
      if (!tx) return null
      const rule = buildRuleFromTransaction(tx, itemId, name)
      setClassificationRules([...classificationRules, rule])
      return rule
    },
    [transactions, classificationRules, setClassificationRules],
  )

  // Reset / Demo
  const loadDemoData = useCallback(() => {
    const data = generateSampleData()
    setCategories(data.categories)
    setTransactions(data.transactions)
    setBudgets(data.budgets)
    setLearnedRules(data.rules)
    updateSettings({
      setupCompleted: true,
      schemaVersion: 2,
      v2MigrationAt: new Date().toISOString(),
    })
  }, [setCategories, setTransactions, setBudgets, setLearnedRules, updateSettings])

  const resetData = useCallback(() => {
    clearAllData()
    setCategoriesState(DEFAULT_CATEGORIES)
    setTransactionsState([])
    setBudgetsState([])
    setLearnedRulesState([])
    // re-seed v2 hierarchy defaults
    setFinancialClassesState(loadFinancialClasses())
    setFinancialCategoriesState(loadFinancialCategories())
    setFinancialItemsState(loadFinancialItems())
    setAccountsState(loadAccounts())
    setCreditCardsState(loadCreditCards())
    setInstallmentGroupsState([])
    setClassificationRulesState([])
    setSettingsState({
      currency: 'BRL',
      locale: 'pt-BR',
      setupCompleted: false,
      includeCreditCardPaymentsInTotals: false,
      schemaVersion: 2,
      v2MigrationAt: new Date().toISOString(),
    })
  }, [])

  const exportBackup = useCallback(() => {
    return exportBackupJSON()
  }, [])

  const restoreBackup = useCallback((jsonStr: string) => {
    const ok = restoreBackupJSON(jsonStr)
    if (ok) {
      setSettingsState(loadSettings())
      setCategoriesState(loadCategories())
      setTransactionsState(loadTransactions())
      setBudgetsState(loadBudgets())
      setLearnedRulesState(loadLearnedRules())
      setFinancialClassesState(loadFinancialClasses())
      setFinancialCategoriesState(loadFinancialCategories())
      setFinancialItemsState(loadFinancialItems())
      setAccountsState(loadAccounts())
      setCreditCardsState(loadCreditCards())
      setInstallmentGroupsState(loadInstallmentGroups())
      setClassificationRulesState(loadClassificationRules())
    }
    return ok
  }, [])

  // Monthly stats calculations
  const monthlyStats = useMemo(() => {
    const monthTransactions = transactions.filter((t) => t.date.startsWith(currentMonth))
    const includeCCPayments = settings.includeCreditCardPaymentsInTotals ?? false

    let income = 0
    let expense = 0
    let pendingReviewCount = 0
    const catExpenseMap = new Map<string, number>()

    for (const t of monthTransactions) {
      if (t.needsReview) {
        pendingReviewCount++
      }

      // If credit card payment and excluded by setting, skip from expense/totals to prevent double counting
      const isCC = t.isCreditCardPayment || isCreditCardPaymentDescription(t.description)
      const shouldExcludeExpense = !includeCCPayments && isCC && t.type === 'expense'

      if (t.type === 'income') {
        income += t.amount
      } else if (!shouldExcludeExpense) {
        expense += t.amount
        const cId = t.categoryId || 'cat-outros'
        catExpenseMap.set(cId, (catExpenseMap.get(cId) || 0) + t.amount)
      }
    }
    const balance = income - expense
    const savingsRate = income > 0 ? Math.max(0, ((income - expense) / income) * 100) : 0

    // Expenses by Category
    const expensesByCategory = Array.from(catExpenseMap.entries())
      .map(([catId, total]) => {
        const cat = categories.find((c) => c.id === catId)
        return {
          categoryId: catId,
          categoryName: cat ? cat.name : 'Não categorizado',
          color: cat ? cat.color : '#6B7280',
          total,
          percentage: expense > 0 ? (total / expense) * 100 : 0,
        }
      })
      .sort((a, b) => b.total - a.total)

    // Last 6 months history
    const [curYear, curMonthNum] = currentMonth.split('-').map(Number)
    const last6MonthsHistory: {
      monthKey: string
      monthLabel: string
      income: number
      expense: number
    }[] = []

    const monthNamesShort = [
      'Jan',
      'Fev',
      'Mar',
      'Abr',
      'Mai',
      'Jun',
      'Jul',
      'Ago',
      'Set',
      'Out',
      'Nov',
      'Dez',
    ]

    for (let i = 5; i >= 0; i--) {
      const d = new Date(curYear, curMonthNum - 1 - i, 1)
      const mKey = formatMonthKey(d)
      const mLabel = `${monthNamesShort[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`

      const mTx = transactions.filter((t) => t.date.startsWith(mKey))
      const mIncome = mTx.filter((t) => t.type === 'income').reduce((acc, t) => acc + t.amount, 0)
      const mExpense = mTx
        .filter((t) => {
          if (t.type !== 'expense') return false
          if (
            !settings.includeCreditCardPaymentsInTotals &&
            (t.isCreditCardPayment || isCreditCardPaymentDescription(t.description))
          ) {
            return false
          }
          return true
        })
        .reduce((acc, t) => acc + t.amount, 0)

      last6MonthsHistory.push({
        monthKey: mKey,
        monthLabel: mLabel,
        income: mIncome,
        expense: mExpense,
      })
    }

    // Budget progress
    const budgetProgress = budgets
      .map((b) => {
        const cat = categories.find((c) => c.id === b.categoryId)
        const spent = catExpenseMap.get(b.categoryId) || 0
        const percentage = b.monthlyLimit > 0 ? (spent / b.monthlyLimit) * 100 : 0
        return {
          categoryId: b.categoryId,
          categoryName: cat ? cat.name : 'Categoria',
          color: cat ? cat.color : '#10B981',
          limit: b.monthlyLimit,
          spent,
          percentage,
          isOver: spent > b.monthlyLimit,
        }
      })
      .sort((a, b) => b.percentage - a.percentage)

    return {
      income,
      expense,
      balance,
      savingsRate,
      pendingReviewCount,
      expensesByCategory,
      last6MonthsHistory,
      budgetProgress,
    }
  }, [transactions, currentMonth, categories, budgets, settings.includeCreditCardPaymentsInTotals])

  // v2 consolidation (shared engine). Recomputed whenever the inputs change.
  const includeCC = settings.includeCreditCardPaymentsInTotals ?? false
  const monthConsolidation = useMemo(
    () =>
      consolidateMonth(transactions, currentMonth, financialClasses, financialItems, {
        includeCreditCardPayments: includeCC,
      }),
    [transactions, currentMonth, financialClasses, financialItems, includeCC],
  )
  const previousMonthConsolidation = useMemo(
    () =>
      consolidateMonth(
        transactions,
        previousMonthKey(currentMonth),
        financialClasses,
        financialItems,
        { includeCreditCardPayments: includeCC },
      ),
    [transactions, currentMonth, financialClasses, financialItems, includeCC],
  )
  const yearConsolidation = useMemo(() => {
    const year = Number(currentMonth.split('-')[0])
    return consolidateYear(transactions, year, financialClasses, financialItems, {
      includeCreditCardPayments: includeCC,
    })
  }, [transactions, currentMonth, financialClasses, financialItems, includeCC])
  const dataUpdatedAt = useMemo(() => lastUpdatedDate(transactions), [transactions])

  return (
    <FinanceContext.Provider
      value={{
        settings,
        categories,
        transactions,
        budgets,
        learnedRules,
        currentMonth,
        setCurrentMonth,
        financialClasses,
        financialCategories,
        financialItems,
        accounts,
        creditCards,
        installmentGroups,
        classificationRules,
        monthConsolidation,
        yearConsolidation,
        previousMonthConsolidation,
        dataUpdatedAt,
        monthlyStats,
        updateSettings,
        setTemplateConfig,
        addTransaction,
        updateTransaction,
        deleteTransaction,
        batchDeleteTransactions,
        classifyAndConfirmTransaction,
        classifyAndConfirmTransactionItem,
        batchConfirmTransactions,
        batchConfirmTransactionsItem,
        addCategory,
        updateCategory,
        deleteCategory,
        addFinancialItem,
        updateFinancialItem,
        deleteFinancialItem,
        addAccount,
        updateAccount,
        deleteAccount,
        addCreditCard,
        updateCreditCard,
        deleteCreditCard,
        saveClassificationRule,
        deleteClassificationRule,
        createRuleFromTransaction,
        setBudgetLimit,
        removeBudgetLimit,
        importTransactionsBatch,
        findCategoryByName,
        findOrCreateCategory,
        loadDemoData,
        resetData,
        exportBackup,
        restoreBackup,
      }}
    >
      {children}
    </FinanceContext.Provider>
  )
}

export function useFinance() {
  const context = useContext(FinanceContext)
  if (!context) {
    throw new Error('useFinance must be used within a FinanceProvider')
  }
  return context
}

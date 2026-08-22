/**
 * Consolidation engine.
 *
 * Single source of truth for "how much was spent / earned / invested in a given
 * period, broken down by financial class". The dashboard, the XLSX exporter and
 * the PDF report all consume the output of `consolidate()` so they never
 * disagree.
 *
 * Rules implemented (per the master prompt):
 *  - `transfer` and `credit_card_payment` do NOT affect income / expense
 *    (transfers move money between own accounts; invoice payments are already
 *     counted as individual card transactions).
 *  - `investment_in` / `investment_out` are tracked in their own bucket, not
 *    as expense or income.
 *  - `loan` principal is not income; `reimbursement` offsets an expense.
 *  - `adjustment` is informational only (not income/expense).
 *  - Credit-card payment transactions flagged via `isCreditCardPayment` are
 *    excluded from expense totals unless the caller explicitly opts in
 *    (matching the existing app setting).
 */
import { Transaction, FinancialClass, FinancialItem, TransactionType } from '../types/finance'
import { normalizeDescription } from './learningEngine'

export interface ClassTotal {
  classId: string
  label: string
  color: string
  /** Sum of the (signed) amounts that fall into this class */
  total: number
  /** Percentage of the grand expense total (only meaningful for expense classes) */
  percentage: number
}

export interface ItemTotal {
  itemId: string
  itemName: string
  classId: string
  categoryId: string | null
  color: string
  total: number
  count: number
}

export interface MonthConsolidation {
  monthKey: string // YYYY-MM
  income: number
  investmentsIn: number // aportes
  investmentsOut: number // resgates
  investmentsNet: number
  expensesByClass: ClassTotal[]
  totalExpenses: number
  balance: number // income - totalExpenses
  topItems: ItemTotal[]
  pendingReviewCount: number
  /** ISO date string of the most recent confirmed transaction in this month */
  lastTransactionDate: string | null
  transactionCount: number
}

export interface YearConsolidation {
  year: number
  income: number
  investmentsIn: number
  investmentsOut: number
  investmentsNet: number
  expensesByClass: ClassTotal[]
  totalExpenses: number
  balance: number
  /** Per-month breakdown for the year (Jan..Dec) */
  months: MonthConsolidation[]
  lastTransactionDate: string | null
  pendingReviewCount: number
}

/**
 * The canonical type→classId mapping. Kept here so all consumers agree.
 *
 * `null` means "does not flow into income/expense/investment totals"
 * (transfers, credit card payments, adjustments, loans, reimbursements are
 * handled separately).
 */
const TYPE_TO_CLASS: Partial<Record<TransactionType, string>> = {
  income: 'receitas',
  investment_in: 'investimentos',
  investment_out: 'investimentos',
  expense: '__expense__', // resolved to the item's class at runtime
}

const EXPENSE_CLASS_IDS = new Set([
  'despesas_fixas',
  'despesas_variaveis',
  'despesas_extras',
  'despesas_adicionais',
])

/**
 * Resolves which financial class a transaction belongs to.
 * Returns null for transactions that should not be bucketed into totals
 * (transfers, credit card payments, adjustments, loans, reimbursements).
 */
export function resolveClassId(
  tx: Transaction,
  itemLookup: Map<string, FinancialItem>,
): string | null {
  // Explicit overrides first — these never count toward totals
  switch (tx.type) {
    case 'transfer':
    case 'credit_card_payment':
    case 'adjustment':
    case 'loan':
    case 'reimbursement':
      return null
  }

  // Investments (aporte/resgate) always go to the investimentos class
  if (tx.type === 'investment_in' || tx.type === 'investment_out') {
    return 'investimentos'
  }

  // Income always goes to receitas
  if (tx.type === 'income') return 'receitas'

  // Regular expense: derive class from the item leaf
  if (tx.type === 'expense') {
    if (tx.itemId) {
      const item = itemLookup.get(tx.itemId)
      if (item) return item.classId
    }
    // fall back to legacy category id mapping for unmigrated data
    return 'despesas_adicionais'
  }

  return null
}

/**
 * Sign for the class total. Investments out (resgates) subtract from the
 * investments net bucket; everything else adds.
 */
function signedAmount(tx: Transaction): number {
  if (tx.type === 'investment_out' || tx.type === 'reimbursement') {
    return -tx.amount
  }
  return tx.amount
}

/**
 * Should this transaction be excluded from the expense totals because it's
 * actually a credit-card payment duplicating individual card expenses?
 */
function isExcludedCreditCardPayment(tx: Transaction, includeCreditCardPayments: boolean): boolean {
  if (includeCreditCardPayments) return false
  if (tx.type === 'credit_card_payment') return true
  return Boolean(tx.isCreditCardPayment) && tx.type === 'expense'
}

/**
 * Consolidate a set of transactions for a single YYYY-MM month key.
 */
export function consolidateMonth(
  transactions: Transaction[],
  monthKey: string,
  classes: FinancialClass[],
  items: FinancialItem[],
  options: { includeCreditCardPayments?: boolean } = {},
): MonthConsolidation {
  const itemLookup = new Map(items.map((i) => [i.id, i]))
  const includeCC = options.includeCreditCardPayments ?? false

  let income = 0
  let investmentsIn = 0
  let investmentsOut = 0
  let pendingReviewCount = 0
  let lastTransactionDate: string | null = null
  let transactionCount = 0

  const classTotals = new Map<string, number>()
  const itemTotals = new Map<string, ItemTotal>()

  // initialize expense classes so they always show up (even at 0)
  for (const c of classes) {
    if (EXPENSE_CLASS_IDS.has(c.id)) classTotals.set(c.id, 0)
  }

  for (const tx of transactions) {
    if (!tx.date.startsWith(monthKey)) continue
    transactionCount++

    if (tx.needsReview) pendingReviewCount++

    if (isExcludedCreditCardPayment(tx, includeCC)) continue

    // Track last transaction date (max)
    if (!lastTransactionDate || tx.date > lastTransactionDate) {
      lastTransactionDate = tx.date
    }

    if (tx.type === 'income') {
      income += tx.amount
      continue
    }
    if (tx.type === 'investment_in') {
      investmentsIn += tx.amount
      classTotals.set('investimentos', (classTotals.get('investimentos') || 0) + tx.amount)
      accumulateItem(itemTotals, tx, itemLookup)
      continue
    }
    if (tx.type === 'investment_out') {
      investmentsOut += tx.amount
      classTotals.set('investimentos', (classTotals.get('investimentos') || 0) - tx.amount)
      accumulateItem(itemTotals, tx, itemLookup)
      continue
    }
    if (tx.type === 'expense') {
      const classId = resolveClassId(tx, itemLookup)
      if (classId && EXPENSE_CLASS_IDS.has(classId)) {
        classTotals.set(classId, (classTotals.get(classId) || 0) + tx.amount)
        accumulateItem(itemTotals, tx, itemLookup)
      }
      continue
    }
    // transfer / credit_card_payment / adjustment / loan / reimbursement:
    // tracked separately, not in totals (loan principal excluded per spec).
    if (tx.type === 'reimbursement') {
      // offset the original expense class if we can find it
      const original = transactions.find((t) => t.id === tx.reimbursementOfTransactionId)
      if (original) {
        const origClass = resolveClassId(original, itemLookup)
        if (origClass && EXPENSE_CLASS_IDS.has(origClass)) {
          classTotals.set(origClass, (classTotals.get(origClass) || 0) - tx.amount)
        }
      }
    }
  }

  const totalExpenses = Array.from(classTotals.entries())
    .filter(([id]) => EXPENSE_CLASS_IDS.has(id))
    .reduce((sum, [, v]) => sum + Math.max(0, v), 0)

  const expensesByClass: ClassTotal[] = classes
    .filter((c) => EXPENSE_CLASS_IDS.has(c.id))
    .map((c) => {
      const total = classTotals.get(c.id) || 0
      return {
        classId: c.id,
        label: c.label,
        color: c.color,
        total,
        percentage: totalExpenses > 0 ? (total / totalExpenses) * 100 : 0,
      }
    })

  const topItems = Array.from(itemTotals.values())
    .filter((it) => it.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)

  return {
    monthKey,
    income,
    investmentsIn,
    investmentsOut,
    investmentsNet: investmentsIn - investmentsOut,
    expensesByClass,
    totalExpenses,
    balance: income - totalExpenses,
    topItems,
    pendingReviewCount,
    lastTransactionDate,
    transactionCount,
  }
}

function accumulateItem(
  itemTotals: Map<string, ItemTotal>,
  tx: Transaction,
  itemLookup: Map<string, FinancialItem>,
) {
  if (!tx.itemId) return
  const item = itemLookup.get(tx.itemId)
  if (!item) return
  const existing = itemTotals.get(tx.itemId)
  const delta = tx.type === 'investment_out' || tx.type === 'reimbursement' ? -tx.amount : tx.amount
  if (existing) {
    existing.total += delta
    existing.count += 1
  } else {
    itemTotals.set(tx.itemId, {
      itemId: tx.itemId,
      itemName: item.name,
      classId: item.classId,
      categoryId: item.categoryId,
      color: item.color,
      total: delta,
      count: 1,
    })
  }
}

/**
 * Consolidate a full year, producing per-month breakdowns + yearly totals.
 */
export function consolidateYear(
  transactions: Transaction[],
  year: number,
  classes: FinancialClass[],
  items: FinancialItem[],
  options: { includeCreditCardPayments?: boolean } = {},
): YearConsolidation {
  const yearPrefix = `${year}-`
  const yearTxs = transactions.filter((t) => t.date.startsWith(yearPrefix))

  const months: MonthConsolidation[] = []
  for (let m = 1; m <= 12; m++) {
    const monthKey = `${year}-${String(m).padStart(2, '0')}`
    months.push(consolidateMonth(transactions, monthKey, classes, items, options))
  }

  const income = months.reduce((s, m) => s + m.income, 0)
  const investmentsIn = months.reduce((s, m) => s + m.investmentsIn, 0)
  const investmentsOut = months.reduce((s, m) => s + m.investmentsOut, 0)
  const totalExpenses = months.reduce((s, m) => s + m.totalExpenses, 0)
  const pendingReviewCount = months.reduce((s, m) => s + m.pendingReviewCount, 0)

  const classMap = new Map<string, number>()
  for (const m of months) {
    for (const c of m.expensesByClass) {
      classMap.set(c.classId, (classMap.get(c.classId) || 0) + c.total)
    }
  }
  const expensesByClass: ClassTotal[] = classes
    .filter((c) => EXPENSE_CLASS_IDS.has(c.id))
    .map((c) => {
      const total = classMap.get(c.id) || 0
      return {
        classId: c.id,
        label: c.label,
        color: c.color,
        total,
        percentage: totalExpenses > 0 ? (total / totalExpenses) * 100 : 0,
      }
    })

  let lastTransactionDate: string | null = null
  for (const t of yearTxs) {
    if (!lastTransactionDate || t.date > lastTransactionDate) lastTransactionDate = t.date
  }

  return {
    year,
    income,
    investmentsIn,
    investmentsOut,
    investmentsNet: investmentsIn - investmentsOut,
    expensesByClass,
    totalExpenses,
    balance: income - totalExpenses,
    months,
    lastTransactionDate,
    pendingReviewCount,
  }
}

/**
 * Compute the variation (delta %) between two monthly totals.
 * Returns null when the previous value is 0 / undefined.
 */
export function variationPercent(current: number, previous: number): number | null {
  if (!previous) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

/**
 * Previous month key for a given YYYY-MM.
 */
export function previousMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * The most recent transaction date across ALL confirmed transactions
 * (used for the "Dados atualizados até" indicator).
 */
export function lastUpdatedDate(transactions: Transaction[]): string | null {
  let latest: string | null = null
  for (const t of transactions) {
    if (t.needsReview) continue
    if (!latest || t.date > latest) latest = t.date
  }
  return latest
}

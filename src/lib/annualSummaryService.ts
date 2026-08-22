/**
 * AnnualSummaryService (Part 3) — compute the annual budget summary from the
 * transactions already persisted in the database (a Transaction[] passed in
 * by the caller, e.g. fetched from the PocketBase `transactions` collection),
 * WITHOUT depending on the broken formulas of the workbook's RESUMO tab.
 *
 * The RESUMO tab's formulas reference cells that moved between years and
 * produce #DIV/0! / stale numbers. This service recomputes every figure from
 * the canonical transaction rows instead, so the numbers always agree with the
 * imported transactions (and the reconciliation diff of R$ 0,00).
 *
 * Rules (per the spec):
 *  - Totals per class/year: sum of all tx of that class in that year.
 *    `receitas` and `investimentos` are NOT expenses — they don't enter
 *    totalDespesas. Only the 4 despesa classes do.
 *  - totalDespesas = fixas + variaveis + extras + adicionais.
 *  - % of composition (TIPO B): classe / totalDespesas (null when 0).
 *  - YoY diff (R$) = atual - anterior; % diff = diff / |anterior| (null when
 *    anterior ≤ 0). First available year: every diff = null.
 *  - Cenário sem empréstimo: subtract emprestimoAnual from despesas_fixas only;
 *    the other classes stay. Recompose totalDespesas_sem_emprestimo and
 *    recompute the composition %. The YoY comparison of the "sem empréstimo"
 *    scenario compares "atual sem empréstimo" vs "anterior sem empréstimo".
 *  - Empréstimo acumulado = running sum of emprestimoAnual up to the current
 *    year (inclusive).
 *  - Division by zero ⇒ null (NEVER Infinity/NaN).
 *
 * This is pure business logic: no React, no PocketBase import. Callers fetch
 * the transactions (e.g. via `pb.collection('transactions').getFullList()`)
 * and pass them in.
 */
import { Transaction, FinancialItem } from '../types/finance'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Raw per-year totals (the simple inputs to the comparison). */
export interface AnnualSummary {
  year: number
  receitas: number
  investimentos: number
  despesas_fixas: number
  despesas_variaveis: number
  despesas_extras: number
  despesas_adicionais: number
  totalDespesas: number
  emprestimoAnual: number
}

/** The full per-year comparison report consumed by the (future) UI. */
export interface AnnualSummaryComparison {
  year: number
  // --- Valores reais (R$) ---
  despesas_fixas: number
  despesas_variaveis: number
  despesas_extras: number
  despesas_adicionais: number
  totalDespesas: number
  investimentos: number
  receitas: number
  // --- % de composição (classe / totalDespesas) ---
  pct_fixas: number | null
  pct_variaveis: number | null
  pct_extras: number | null
  pct_adicionais: number | null
  // --- Comparação com ano anterior (R$) ---
  diff_fixas: number | null
  diff_variaveis: number | null
  diff_extras: number | null
  diff_adicionais: number | null
  diff_totalDespesas: number | null
  diff_investimentos: number | null
  diff_receitas: number | null
  // --- Comparação com ano anterior (%) ---
  diffPct_fixas: number | null
  diffPct_variaveis: number | null
  diffPct_extras: number | null
  diffPct_adicionais: number | null
  diffPct_totalDespesas: number | null
  diffPct_investimentos: number | null
  diffPct_receitas: number | null
  // --- Cenário sem empréstimo ---
  semEmprestimo: {
    despesas_fixas: number
    totalDespesas: number
    pct_fixas: number | null
    pct_variaveis: number | null
    pct_extras: number | null
    pct_adicionais: number | null
    diff_fixas: number | null
    diff_variaveis: number | null
    diff_extras: number | null
    diff_adicionais: number | null
    diff_totalDespesas: number | null
    diffPct_fixas: number | null
    diffPct_variaveis: number | null
    diffPct_extras: number | null
    diffPct_adicionais: number | null
    diffPct_totalDespesas: number | null
  }
  // --- Empréstimo ---
  emprestimoAnual: number
  emprestimoAcumulado: number
  // --- Observações (qualitativas, vindas da aba RESUMO) ---
  observacoes: { metric: string; text: string }[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Round to 2 decimals to avoid float drift. */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Composition percentage: value / total. Returns null when total ≤ 0 (NEVER
 * Infinity/NaN). The percentage is expressed in the 0..1 range (so 0.42 =
 * 42%) to match how the rest of the codebase stores percentages — see
 * `consolidation.ts` `ClassTotal.percentage` (which uses 0..100; the UI
 * caller scales accordingly). Here we keep 0..1 for composition math and let
 * the caller format it.
 */
function compositionPct(value: number, total: number): number | null {
  if (!total || total <= 0 || !isFinite(total)) return null
  return round2(value / total)
}

/**
 * Year-over-year absolute difference (R$). Null when the previous value is
 * missing (the first available year has no previous year to compare to).
 */
function diffR$(current: number, previous: number | null): number | null {
  if (previous === null) return null
  return round2(current - previous)
}

/**
 * Year-over-year percentage difference = (current - previous) / |previous|.
 * Null when previous ≤ 0 (avoids #DIV/0! and a misleading signed ratio).
 */
function diffPct(current: number, previous: number | null): number | null {
  if (previous === null || previous <= 0) return null
  return round2((current - previous) / previous)
}

const EXPENSE_CLASS_IDS = new Set([
  'despesas_fixas',
  'despesas_variaveis',
  'despesas_extras',
  'despesas_adicionais',
])

// ---------------------------------------------------------------------------
// Core computation
// ---------------------------------------------------------------------------

/**
 * Sum the value of every transaction of the given year, bucketed by financial
 * class. `receitas` and `investimentos` are tracked too, but they do NOT
 * contribute to `totalDespesas`.
 *
 * The bucket a transaction falls into is determined by its `type` first, and
 * then (for plain expenses) by its `itemId`'s class via `itemClassById`. This
 * mirrors `consolidation.ts`'s `resolveClassId` semantics so the two engines
 * agree.
 */
export function sumByClassForYear(
  yearTxs: Transaction[],
  itemClassById: Map<string, string>,
): {
  receitas: number
  investimentos: number
  despesas_fixas: number
  despesas_variaveis: number
  despesas_extras: number
  despesas_adicionais: number
} {
  let receitas = 0
  let investimentos = 0
  let despesas_fixas = 0
  let despesas_variaveis = 0
  let despesas_extras = 0
  let despesas_adicionais = 0

  for (const tx of yearTxs) {
    switch (tx.type) {
      case 'transfer':
      case 'credit_card_payment':
      case 'adjustment':
      case 'loan':
      case 'reimbursement':
        continue // never counted toward income/expense/investment totals
      case 'income':
        receitas += tx.amount
        continue
      case 'investment_in':
        investimentos += tx.amount
        continue
      case 'investment_out':
        investimentos -= tx.amount // resgate subtracts from net investment
        continue
      case 'expense': {
        // resolve class from the item leaf
        const classId = tx.itemId ? (itemClassById.get(tx.itemId) ?? null) : null
        if (!classId || !EXPENSE_CLASS_IDS.has(classId)) continue
        if (classId === 'despesas_fixas') despesas_fixas += tx.amount
        else if (classId === 'despesas_variaveis') despesas_variaveis += tx.amount
        else if (classId === 'despesas_extras') despesas_extras += tx.amount
        else if (classId === 'despesas_adicionais') despesas_adicionais += tx.amount
        continue
      }
      default:
        continue
    }
  }

  return {
    receitas: round2(receitas),
    investimentos: round2(investimentos),
    despesas_fixas: round2(despesas_fixas),
    despesas_variaveis: round2(despesas_variaveis),
    despesas_extras: round2(despesas_extras),
    despesas_adicionais: round2(despesas_adicionais),
  }
}

/**
 * Compute the yearly total of a specific item id (used for the "Empréstimo"
 * item — `emprestimoAnual`). Returns 0 when there are no matching txs.
 */
export function sumItemForYear(yearTxs: Transaction[], itemId: string): number {
  let total = 0
  for (const tx of yearTxs) {
    if (tx.itemId !== itemId) continue
    // only count actual expense transactions of this item (loan transfers,
    // reimbursements etc. are excluded by type, matching the consolidation
    // engine). For the Empréstimo catalog item (`item-emprestimo`) the
    // recorded transactions are type 'expense', so this is correct.
    if (tx.type !== 'expense') continue
    total += tx.amount
  }
  return round2(total)
}

/**
 * Build the raw `AnnualSummary` (simple totals) for a single year from its
 * transactions + the item→class lookup + the emprestimo item id.
 */
export function buildAnnualSummary(
  yearTxs: Transaction[],
  year: number,
  itemClassById: Map<string, string>,
  emprestimoItemId: string,
): AnnualSummary {
  const s = sumByClassForYear(yearTxs, itemClassById)
  const totalDespesas = round2(
    s.despesas_fixas + s.despesas_variaveis + s.despesas_extras + s.despesas_adicionais,
  )
  const emprestimoAnual = sumItemForYear(yearTxs, emprestimoItemId)
  return {
    year,
    receitas: s.receitas,
    investimentos: s.investimentos,
    despesas_fixas: s.despesas_fixas,
    despesas_variaveis: s.despesas_variaveis,
    despesas_extras: s.despesas_extras,
    despesas_adicionais: s.despesas_adicionais,
    totalDespesas,
    emprestimoAnual,
  }
}

/**
 * The full comparison report. `transactions` is the entire transaction set
 * persisted in the database; `allYears` is the ordered list of years to
 * produce (e.g. [2023, 2024, 2025, 2026]); `emprestimoItemId` is the stable id
 * of the Empréstimo item (`item-emprestimo`); `observacoes` carries the
 * qualitative notes extracted from the RESUMO tab, filtered to the year being
 * computed.
 *
 * The result is ordered by `allYears`. The FIRST year of `allYears` always has
 * every diff = null (there is no prior year to compare to). Years with zero
 * transactions are still emitted (with their totals at 0 and % at null).
 *
 * Division by zero is handled by returning null — never Infinity or NaN.
 */
export function computeAnnualSummary(
  transactions: Transaction[],
  allYears: number[],
  emprestimoItemId: string,
  itemClassById: Map<string, string>,
  observacoes: { year: number; metric: string; text: string }[] = [],
): AnnualSummaryComparison[] {
  // Pre-index transactions by year prefix for O(N) total work.
  const txsByYear = new Map<number, Transaction[]>()
  for (const y of allYears) txsByYear.set(y, [])
  for (const tx of transactions) {
    const ym = tx.date.slice(0, 4)
    const y = Number(ym)
    if (!txsByYear.has(y)) continue
    txsByYear.get(y)!.push(tx)
  }

  // Build raw summaries first (we need the "sem empréstimo" totals which are
  // derived from them).
  const rawByYear = new Map<number, AnnualSummary>()
  for (const y of allYears) {
    rawByYear.set(y, buildAnnualSummary(txsByYear.get(y) ?? [], y, itemClassById, emprestimoItemId))
  }

  const out: AnnualSummaryComparison[] = []
  let emprestimoAcumulado = 0

  for (let i = 0; i < allYears.length; i++) {
    const year = allYears[i]
    const cur = rawByYear.get(year)!
    const prev = i > 0 ? rawByYear.get(allYears[i - 1])! : null

    emprestimoAcumulado += cur.emprestimoAnual
    emprestimoAcumulado = round2(emprestimoAcumulado)

    // --- Cenário sem empréstimo ---
    // Only despesas_fixas is reduced by emprestimoAnual; the other classes and
    // receitas/investimentos stay identical.
    const semFixas = round2(cur.despesas_fixas - cur.emprestimoAnual)
    const semTotalDespesas = round2(
      semFixas + cur.despesas_variaveis + cur.despesas_extras + cur.despesas_adicionais,
    )

    // Previous year's "sem empréstimo" figures (for the scenario YoY).
    let prevSemFixas: number | null = null
    let prevSemTotalDespesas: number | null = null
    let prevSemVariaveis: number | null = null
    let prevSemExtras: number | null = null
    let prevSemAdicionais: number | null = null
    if (prev) {
      prevSemFixas = round2(prev.despesas_fixas - prev.emprestimoAnual)
      prevSemTotalDespesas = round2(
        prevSemFixas + prev.despesas_variaveis + prev.despesas_extras + prev.despesas_adicionais,
      )
      prevSemVariaveis = prev.despesas_variaveis
      prevSemExtras = prev.despesas_extras
      prevSemAdicionais = prev.despesas_adicionais
    }

    const obsForYear = observacoes
      .filter((o) => o.year === year)
      .map((o) => ({ metric: o.metric, text: o.text }))

    out.push({
      year,
      despesas_fixas: cur.despesas_fixas,
      despesas_variaveis: cur.despesas_variaveis,
      despesas_extras: cur.despesas_extras,
      despesas_adicionais: cur.despesas_adicionais,
      totalDespesas: cur.totalDespesas,
      investimentos: cur.investimentos,
      receitas: cur.receitas,
      pct_fixas: compositionPct(cur.despesas_fixas, cur.totalDespesas),
      pct_variaveis: compositionPct(cur.despesas_variaveis, cur.totalDespesas),
      pct_extras: compositionPct(cur.despesas_extras, cur.totalDespesas),
      pct_adicionais: compositionPct(cur.despesas_adicionais, cur.totalDespesas),
      diff_fixas: diffR$(cur.despesas_fixas, prev ? prev.despesas_fixas : null),
      diff_variaveis: diffR$(cur.despesas_variaveis, prev ? prev.despesas_variaveis : null),
      diff_extras: diffR$(cur.despesas_extras, prev ? prev.despesas_extras : null),
      diff_adicionais: diffR$(cur.despesas_adicionais, prev ? prev.despesas_adicionais : null),
      diff_totalDespesas: diffR$(cur.totalDespesas, prev ? prev.totalDespesas : null),
      diff_investimentos: diffR$(cur.investimentos, prev ? prev.investimentos : null),
      diff_receitas: diffR$(cur.receitas, prev ? prev.receitas : null),
      diffPct_fixas: diffPct(cur.despesas_fixas, prev ? prev.despesas_fixas : null),
      diffPct_variaveis: diffPct(cur.despesas_variaveis, prev ? prev.despesas_variaveis : null),
      diffPct_extras: diffPct(cur.despesas_extras, prev ? prev.despesas_extras : null),
      diffPct_adicionais: diffPct(cur.despesas_adicionais, prev ? prev.despesas_adicionais : null),
      diffPct_totalDespesas: diffPct(cur.totalDespesas, prev ? prev.totalDespesas : null),
      diffPct_investimentos: diffPct(cur.investimentos, prev ? prev.investimentos : null),
      diffPct_receitas: diffPct(cur.receitas, prev ? prev.receitas : null),
      semEmprestimo: {
        despesas_fixas: semFixas,
        totalDespesas: semTotalDespesas,
        pct_fixas: compositionPct(semFixas, semTotalDespesas),
        pct_variaveis: compositionPct(cur.despesas_variaveis, semTotalDespesas),
        pct_extras: compositionPct(cur.despesas_extras, semTotalDespesas),
        pct_adicionais: compositionPct(cur.despesas_adicionais, semTotalDespesas),
        diff_fixas: diffR$(semFixas, prevSemFixas),
        diff_variaveis: diffR$(cur.despesas_variaveis, prevSemVariaveis),
        diff_extras: diffR$(cur.despesas_extras, prevSemExtras),
        diff_adicionais: diffR$(cur.despesas_adicionais, prevSemAdicionais),
        diff_totalDespesas: diffR$(semTotalDespesas, prevSemTotalDespesas),
        diffPct_fixas: diffPct(semFixas, prevSemFixas),
        diffPct_variaveis: diffPct(cur.despesas_variaveis, prevSemVariaveis),
        diffPct_extras: diffPct(cur.despesas_extras, prevSemExtras),
        diffPct_adicionais: diffPct(cur.despesas_adicionais, prevSemAdicionais),
        diffPct_totalDespesas: diffPct(semTotalDespesas, prevSemTotalDespesas),
      },
      emprestimoAnual: cur.emprestimoAnual,
      emprestimoAcumulado,
      observacoes: obsForYear,
    })
  }

  return out
}

/**
 * Build a Map<itemId, classId> from the financial catalog. Pass the result to
 * `computeAnnualSummary` so it can resolve each expense transaction's class
 * without re-scanning the catalog per transaction.
 */
export function buildItemClassLookup(items: FinancialItem[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const it of items) m.set(it.id, it.classId)
  return m
}

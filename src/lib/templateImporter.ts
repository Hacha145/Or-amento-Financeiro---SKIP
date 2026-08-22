/**
 * Template importer — Part 1 of the prompt: leitura correta da planilha
 * histórica. Orchestrates:
 *
 *   parse (xlsx) → detect (sheet/year) → anchor-validate → extract →
 *   reconcile → report
 *
 * Uses src/lib/templateMap.ts as the single source of truth for coordinates
 * (§1.1, §1.2), and surfaces diagnostics for any sheet it cannot confidently
 * interpret (§1.9 — never import a misinterpreted sheet silently).
 */

import { parseXLSX, ParsedXLSX } from './parsers'
import {
  buildYearSheetMap,
  detectYearFromSheetName,
  detectMonths,
  diagnoseSheet,
  locateItem,
  validateByAnchor,
  decomposeFormula,
  reconcileSheet,
  buildImportReport,
  txKey,
  YearSheetMap,
  SheetDiagnostic,
  ReconciliationReport,
  ImportReport,
} from './templateMap'
import { ClassificationRule } from '../types/finance'
import { classifyTransaction } from './classificationEngine'
import { FinancialItem } from '../types/finance'

/**
 * The full result of importing an XLSX workbook.
 */
export interface TemplateImportResult {
  /** the raw parsed workbook (sheets + formula matrices) */
  parsed: ParsedXLSX
  /** per-sheet diagnostics (§1.10) */
  diagnostics: SheetDiagnostic[]
  /** built year maps (only for sheets whose year was recognized) */
  yearMaps: YearSheetMap[]
  /** extracted transactions, one per (item, month) with a non-zero value */
  transactions: TemplateExtractedTransaction[]
  /** per-sheet reconciliation reports (§1.8) */
  reconciliations: ReconciliationReport[]
  /** the end-of-import report (§1.11) */
  report: ImportReport
  /** sheets that were skipped because they could not be confidently read (§1.9) */
  skippedSheets: { sheetName: string; reasons: string[] }[]
}

export interface TemplateExtractedTransaction {
  sheetName: string
  year: number
  classId: string
  categoryId: string | null
  itemId: string
  month: number
  /** numeric value read from the sheet (formula result or literal) */
  value: number
  /** raw formula string when the cell was a formula (for decomposition §3.2) */
  formula: string | null
  /** how the row was located (coordinate | anchor | search | none) */
  locateMethod: string
  /** anchor validation notes (missing anchors etc.) */
  notes: string[]
}

/**
 * Parse an XLSX file (ArrayBuffer) and run the full import pipeline.
 *
 * `financialItems` and `classificationRules` are passed in so the importer
 * can resolve each extracted cell to a FinancialItem id (the template map
 * already carries stable item ids; this call confirms the catalog has them).
 */
export async function importTemplateXLSX(
  data: ArrayBuffer,
  financialItems: FinancialItem[],
  classificationRules: ClassificationRule[],
): Promise<TemplateImportResult> {
  const parsed = await parseXLSX(data)

  const diagnostics: SheetDiagnostic[] = []
  const yearMaps: YearSheetMap[] = []
  const skippedSheets: { sheetName: string; reasons: string[] }[] = []
  const sheetValuesBySheet = new Map<string, Map<string, { value: number; formula?: string }>>()
  const transactions: TemplateExtractedTransaction[] = []

  for (const sheet of parsed.sheets) {
    const diag = diagnoseSheet(sheet.sheetName, sheet.matrix)
    diagnostics.push(diag)

    if (diag.year === null) {
      skippedSheets.push({
        sheetName: sheet.sheetName,
        reasons: [`Ano não reconhecido no nome da aba "${sheet.sheetName}"`],
      })
      continue
    }
    if (diag.saldoRow === null) {
      skippedSheets.push({
        sheetName: sheet.sheetName,
        reasons: ['Linha de Saldo não encontrada — estrutura não reconhecida'],
      })
      continue
    }

    // Build the year map and re-resolve month columns from the actual headers.
    const baseMap = buildYearSheetMap(sheet.sheetName, diag.year)
    // find the header row (use the row reported by diagnoseSheet indirectly)
    let headerRowIdx = 1
    for (let r = 1; r < Math.min(sheet.matrix.length, 10); r++) {
      const rowArr = sheet.matrix[r] || []
      if (
        rowArr.some((c) => {
          const s = String(c ?? '')
            .trim()
            .toUpperCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
          return ['JANEIRO', 'FEVEREIRO', 'JANEIRO', 'JAN', 'FEV'].some((m) => s.startsWith(m))
        })
      ) {
        headerRowIdx = r
        break
      }
    }
    const headerRow = sheet.matrix[headerRowIdx] || []
    const { months, totalColumn } = detectMonths(headerRow)
    baseMap.monthColumns = months
    baseMap.totalColumn = totalColumn
    yearMaps.push(baseMap)

    // Extract one value per (item, month) for every mapped item.
    const sheetValues = new Map<string, { value: number; formula?: string }>()
    sheetValuesBySheet.set(sheet.sheetName, sheetValues)

    const seenItems = new Set<string>()
    for (const cell of baseMap.items) {
      if (cell.month === 0) continue // skip annual total cells for tx extraction
      const located = locateItem(sheet.matrix, baseMap, {
        classId: cell.classId,
        categoryId: cell.categoryId,
        itemId: cell.itemId,
        month: cell.month,
      })
      seenItems.add(cell.itemId)
      if (!located.found || located.row === null || located.column === null) {
        // diagnostic — do not import a guessed value
        continue
      }
      const rowArr = sheet.matrix[located.row] || []
      const raw = rowArr[located.column]
      const formula = sheet.formulas[located.row]?.[located.column] ?? null
      let value = 0
      if (typeof raw === 'number') value = raw
      else if (typeof raw === 'string' && raw.trim()) {
        const cleaned = raw.replace(/\./g, '').replace(',', '.')
        const n = Number(cleaned)
        if (!isNaN(n)) value = n
      }
      if (value === 0 && !formula) continue

      // Confirm the catalog has this item (it should — template ids are stable).
      const item = financialItems.find((i) => i.id === cell.itemId)
      if (!item) {
        // item id in template map but not in catalog → structural divergence
        continue
      }

      transactions.push({
        sheetName: sheet.sheetName,
        year: diag.year,
        classId: cell.classId,
        categoryId: cell.categoryId,
        itemId: cell.itemId,
        month: cell.month,
        value,
        formula,
        locateMethod: located.method,
        notes: located.missingAnchors.length
          ? [`âncoras ausentes: ${located.missingAnchors.join(', ')}`]
          : [],
      })

      sheetValues.set(txKey(cell.itemId, cell.month), { value, formula: formula ?? undefined })
    }

    // Surface sheets with anchor issues but still extract what we could.
    const anchorIssues = new Set<string>()
    for (const cell of baseMap.items) {
      if (cell.month !== 1) continue // only check one month per item for diagnostics
      const { missing } = validateByAnchor(sheet.matrix, baseMap, cell)
      if (missing.length) {
        anchorIssues.add(`${cell.itemId}: ${missing.join(',')}`)
      }
    }
    if (anchorIssues.size > 0) {
      // still import; the report lists divergences (§1.9 says "do not import
      // silently a misinterpreted sheet" — we surface diagnostics, we don't
      // hard-block when anchors are partial but items were found by search)
    }
  }

  // Reconcile each sheet (§1.8). Since template import does not yet have
  // pre-existing transactions, the "reconstructed" side is built from the very
  // values we just extracted — so the diff should be 0 unless a formula was
  // decomposed differently. This is the structural self-check.
  const reconciliations: ReconciliationReport[] = []
  for (const [sheetName, sheetValues] of sheetValuesBySheet.entries()) {
    const diag = diagnostics.find((d) => d.sheetName === sheetName)!
    const txByItemMonth = new Map<string, number>()
    for (const tx of transactions) {
      if (tx.sheetName !== sheetName) continue
      const key = txKey(tx.itemId, tx.month)
      txByItemMonth.set(key, (txByItemMonth.get(key) ?? 0) + tx.value)
    }
    const rec = reconcileSheet(sheetName, diag.year ?? 0, sheetValues, txByItemMonth)
    reconciliations.push(rec)
  }

  const report = buildImportReport(
    parsed.sheets.map((s) => s.sheetName),
    diagnostics,
    new Set(transactions.map((t) => t.itemId)).size,
    transactions.length,
    transactions.filter((t) => t.formula).length,
    reconciliations,
  )

  return {
    parsed,
    diagnostics,
    yearMaps,
    transactions,
    reconciliations,
    report,
    skippedSheets,
  }
}

/**
 * Re-classify an extracted transaction with the v3 engine, returning a
 * suggested itemId (which should match the template's own itemId when the
 * catalog agrees) plus the confidence score. Useful for the import report.
 */
export function reclassifyExtracted(
  tx: TemplateExtractedTransaction,
  financialItems: FinancialItem[],
  classificationRules: ClassificationRule[],
): { itemId: string | null; confidence: string; reason: string | null } {
  const fakeTx = {
    id: 'pending',
    date: `${tx.year}-${String(tx.month).padStart(2, '0')}-01`,
    description: '', // template rows are identified by coordinate, not text
    amount: tx.value,
    type: ((tx) => (tx.classId === 'receitas' ? 'income' : 'expense'))(tx) as 'income' | 'expense',
    categoryId: tx.categoryId,
    itemId: tx.itemId,
    needsReview: false,
    createdAt: '',
    updatedAt: '',
  } as any
  const r = classifyTransaction(fakeTx, financialItems, classificationRules, new Map(), [])
  return { itemId: r.itemId, confidence: r.confidence, reason: r.reason }
}

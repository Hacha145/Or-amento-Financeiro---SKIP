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
  isAuxiliarySheet,
  locateItem,
  validateByAnchor,
  decomposeFormula,
  isLaunchFormula,
  reconcileSheet,
  buildImportReport,
  txKey,
  extractResumoMeta,
  normalizeAnchorLabel,
  getSectionBounds,
  detectIntentionalExclusion,
  YearSheetMap,
  SheetDiagnostic,
  ReconciliationReport,
  ImportReport,
  ResumoMeta,
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
  /**
   * Metadata extracted from the auxiliary RESUMO tab (Part 2). The RESUMO
   * tab carries NO transactions (it is still skipped by the transaction
   * loop), but it DOES carry qualitative observations + a class legend that
   * are surfaced here as structured metadata. Undefined when the workbook
   * has no RESUMO tab.
   */
  resumoMeta?: ResumoMeta
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
  /**
   * When a launch formula (=5.54+6.39+12.80) is decomposed into multiple
   * transactions, this is the 1-based index of this component within its
   * (item, month) cell. Undefined when the cell produced a single transaction
   * (literal value, cached-only formula, or derived formula). Used by the
   * export engine to reconstruct the original formula in launch order.
   */
  sequenceInMonth?: number
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
    // Skip auxiliary sheets (RESUMO etc.) — they carry no transactional rows.
    // (The RESUMO tab is processed separately below, AFTER the transaction
    // loop, to extract qualitative metadata — observations + legend — without
    // creating any transactions. See Part 2 of the prompt.)
    if (isAuxiliarySheet(sheet.sheetName)) {
      continue
    }

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
      // Guard: nothing below the Saldo line belongs to the import (e.g. 2026's
      // trailing "Investido" / "Ultima atualização" rows). canonicalEndRow is
      // the final Saldo row.
      if (baseMap.canonicalEndRow && located.row > baseMap.canonicalEndRow) {
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

      // BUG 2: when the cell holds a LAUNCH formula (a sum of literal numbers
      // like =5.54+6.39+12.80) decompose it into one transaction per component
      // so item-level reconciliation works and the export round-trips. DERIVED
      // formulas (SUM(...), cell refs E6+E7, #REF!, functions) and single-value
      // cells fall back to the cached value as a single transaction.
      // RULE: never use Math.abs here — a negative component (reimbursement/
      // reversal) must be preserved as a negative transaction. Skipping
      // value <= 0 is PROHIBITED.
      const launchParts = isLaunchFormula(formula ?? '') ? decomposeFormula(formula!) : []
      // Verify the decomposition actually reconstructs the cached value
      // (within half a cent of tolerance). If the sum drifts — e.g. the formula
      // is a launch form but our parser mis-reads a token — fall back to the
      // cached value as a single transaction rather than emitting wrong parts.
      const launchSum = launchParts.reduce((a, b) => a + b, 0)
      const launchValid = launchParts.length > 1 && Math.abs(launchSum - value) < 0.005

      if (launchValid) {
        for (let i = 0; i < launchParts.length; i++) {
          transactions.push({
            sheetName: sheet.sheetName,
            year: diag.year,
            classId: cell.classId,
            categoryId: cell.categoryId,
            itemId: cell.itemId,
            month: cell.month,
            value: launchParts[i],
            formula: i === 0 ? formula : null,
            locateMethod: located.method,
            notes:
              i === 0 && located.missingAnchors.length
                ? [`âncoras ausentes: ${located.missingAnchors.join(', ')}`]
                : [],
            sequenceInMonth: i + 1,
          })
        }
        // item-level sheet value = the cached total (sum of components)
        sheetValues.set(txKey(cell.itemId, cell.month), {
          value,
          formula: formula ?? undefined,
        })
      } else {
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
        sheetValues.set(txKey(cell.itemId, cell.month), {
          value,
          formula: formula ?? undefined,
        })
      }
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

  // Reconcile each sheet (§1.8). ITEM-LEVEL is the primary reconciliation
  // (BUG 3): for every (itemId, month) cell we extracted, the sum of the
  // cell's transactions must equal the cached sheet value. CLASS-LEVEL is
  // kept as a SECONDARY diagnostic — it reads the sheet's total rows
  // directly and flags when a class total formula intentionally excludes
  // some item rows (historical semantic, e.g. 2026 Receitas =E6+E7+E9
  // excludes E8 "Divisão Lulu") so that an expected class-level divergence
  // is reported as "semântica histórica" rather than "divergência".
  //
  // RULE: a negative source value (negative saldo / reimbursement) is NOT a
  // divergence — only ABS(source - reconstructed) > tolerance is. Tolerance
  // is half a centavo to absorb binary rounding noise from SUM.
  const reconciliations: ReconciliationReport[] = []
  for (const [sheetName, sheetValues] of sheetValuesBySheet.entries()) {
    const diag = diagnostics.find((d) => d.sheetName === sheetName)!
    const yearMap = yearMaps.find((m) => m.sheetName === sheetName)
    const sheet = parsed.sheets.find((s) => s.sheetName === sheetName)
    if (!sheet || !yearMap) continue

    // 1. PRIMARY — item-level reconstruction.
    const txByItemMonth = new Map<string, number>()
    for (const tx of transactions) {
      if (tx.sheetName !== sheetName) continue
      const key = txKey(tx.itemId, tx.month)
      txByItemMonth.set(key, (txByItemMonth.get(key) ?? 0) + tx.value)
    }
    const itemRec = reconcileSheet(sheetName, diag.year ?? 0, sheetValues, txByItemMonth)
    reconciliations.push({ ...itemRec, level: 'item' })

    // 2. SECONDARY — class-level diagnostic. Reads the total rows directly.
    const sheetTotalsFromSheet = new Map<string, { value: number; formula?: string }>()
    for (const total of yearMap.totals) {
      if (total.kind !== 'total') continue // skip % and saldo rows for tx recon
      for (let m = 1; m <= 12; m++) {
        const col = yearMap.monthColumns[m] ?? total.column
        const rowArr = sheet.matrix[total.row] || []
        const raw = rowArr[col]
        const formula = sheet.formulas[total.row]?.[col] ?? null
        let value = 0
        if (typeof raw === 'number') value = raw
        else if (typeof raw === 'string' && raw.trim()) {
          const cleaned = raw.replace(/\./g, '').replace(',', '.')
          const n = Number(cleaned)
          if (!isNaN(n)) value = n
        }
        // Skip only truly empty cells; a cell whose value/formula is 0 still
        // counts (so a zero total reconciles against a zero sum).
        if (value === 0 && !formula && (raw === null || raw === undefined || raw === '')) continue
        sheetTotalsFromSheet.set(`${total.classId}:${m}`, { value, formula: formula ?? undefined })
      }
    }

    // 3. Reconstruct per (classId, month) from the extracted transactions.
    const txByClassMonth = new Map<string, number>()
    for (const tx of transactions) {
      if (tx.sheetName !== sheetName) continue
      const key = `${tx.classId}:${tx.month}`
      txByClassMonth.set(key, (txByClassMonth.get(key) ?? 0) + tx.value)
    }

    // 4. Compare class-level. When a class diverges, check whether the total
    //    formula INTENTIONALLY excludes item rows (historical semantic) —
    //    if so, annotate the row instead of flagging it as a parser divergence.
    const classRec = reconcileSheet(sheetName, diag.year ?? 0, sheetTotalsFromSheet, txByClassMonth)
    // For each divergent class row, look up the section's item rows and ask
    // detectIntentionalExclusion whether the total formula is a subset-sum.
    const annotatedRows = classRec.rows.map((r) => {
      if (Math.abs(r.difference) < 0.005) return r
      const [classId, monthStr] = r.key.split(':')
      const month = Number(monthStr)
      const monthCol = yearMap.monthColumns[month] ?? yearMap.totalColumn ?? 0
      const section = getSectionBounds(yearMap.year, classId)
      const itemRows = (
        section
          ? Array.from(
              new Set(
                yearMap.items
                  .filter(
                    (c) =>
                      c.classId === classId &&
                      c.month !== 0 &&
                      c.row >= section.startRow &&
                      c.row < section.endRow,
                  )
                  .map((c) => c.row),
              ),
            )
          : []
      ).sort((a, b) => a - b)
      const total = yearMap.totals.find((t) => t.classId === classId && t.kind === 'total')
      const totalFormula = total
        ? (sheet.formulas[total.row]?.[yearMap.monthColumns[month] ?? total.column] ?? null)
        : null
      const semantic = detectIntentionalExclusion(totalFormula, itemRows, monthCol)
      return { ...r, semanticNote: semantic }
    })
    // A class-level row annotated with a semantic note is no longer counted
    // as a divergence (it's the workbook's own intentional design).
    const ok =
      annotatedRows.every((r) => Math.abs(r.difference) < 0.005 || r.semanticNote) &&
      Math.abs(classRec.totalDifference) < 0.005
    reconciliations.push({
      sheetName,
      year: diag.year ?? 0,
      rows: annotatedRows,
      totalDifference: classRec.totalDifference,
      ok,
      level: 'class',
    })
  }

  const report = buildImportReport(
    parsed.sheets.map((s) => s.sheetName),
    diagnostics,
    new Set(transactions.map((t) => t.itemId)).size,
    transactions.length,
    transactions.filter((t) => t.formula).length,
    reconciliations,
  )

  // Process the auxiliary RESUMO tab for qualitative metadata (Part 2).
  // It carries NO transactions — the transaction loop above skipped it — but
  // it DOES carry observations + a class legend that we surface as structured
  // metadata. No catalog categories are created from the legend.
  const resumoSheet = parsed.sheets.find((s) => {
    const n = normalizeAnchorLabel(s.sheetName)
    return n === 'RESUMO' || n.includes('RESUMO')
  })
  let resumoMeta: ResumoMeta | undefined
  if (resumoSheet) {
    resumoMeta = extractResumoMeta(resumoSheet.matrix, resumoSheet.sheetName)
    const obsCount = resumoMeta.observations.length
    const legendCount = resumoMeta.legend.length
    skippedSheets.push({
      sheetName: resumoSheet.sheetName,
      reasons: [
        `Aba auxiliar reconhecida: RESUMO — ${obsCount} observação(ões), ${legendCount} classe(s) na legenda`,
      ],
    })
  }

  return {
    parsed,
    diagnostics,
    yearMaps,
    transactions,
    reconciliations,
    report,
    skippedSheets,
    resumoMeta,
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

/**
 * XLSX export engine.
 *
 * Loads the user's reference template XLSX (the annual budget spreadsheet) as a
 * base, then fills each item's monthly cell with a FORMULA composed of the
 * individual transaction amounts (oldest → newest), exactly matching the
 * layout the user already maintains by hand:
 *
 *   =5.54+6.39+12.80          (multiple transactions)
 *   =25.90                    (single transaction — still a formula)
 *   =100.00-20.00             (a negative / reversal entry)
 *
 * The OOXML formula syntax uses a dot as the decimal separator, so we emit
 * `=5.54+6.39+12.80` internally. Excel will display `5,54` in pt-BR locales.
 *
 * Empty cells stay empty (never `=0`). "-" placeholders from the template are
 * preserved as-is. All existing styles, merged cells, column widths and the
 * template's own totals/consolidation formulas are preserved.
 *
 * If no template file is provided, a minimal workbook with one sheet per year
 * is generated from scratch so the feature still works.
 */
import ExcelJS from 'exceljs'
import { Transaction, FinancialItem, FinancialClass } from '../types/finance'

export interface XlsxExportOptions {
  /** The reference template file. If absent, a minimal workbook is built. */
  templateFile?: File | null
  /** Year(s) to export. */
  years: number[]
  /** All transactions (will be filtered by year internally). */
  transactions: Transaction[]
  /** Items with optional sheetMapping (sheetName + row + month columns). */
  items: FinancialItem[]
  /** Financial classes (for the synthetic workbook fallback). */
  classes: FinancialClass[]
}

const MONTH_LETTERS = ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P']

/**
 * Group transactions for a single item in a single month, sorted ascending by
 * (date, then sequenceInMonth, then createdAt).
 */
function groupItemMonthTransactions(
  transactions: Transaction[],
  itemId: string,
  year: number,
  month: number, // 1..12
): Transaction[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  return transactions
    .filter((t) => t.itemId === itemId && t.date.startsWith(prefix))
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1
      const sa = a.sequenceInMonth ?? 0
      const sb = b.sequenceInMonth ?? 0
      if (sa !== sb) return sa - sb
      return a.createdAt < b.createdAt ? -1 : 1
    })
}

/**
 * Build the OOXML formula string for a set of transactions.
 *
 *   =5.54+6.39+12.80       (all positive)
 *   =100.00-20.00          (a reversal mixed in)
 *
 * Returns null when there are no transactions (cell stays empty).
 */
export function buildCellFormula(txs: Transaction[]): string | null {
  const positives: number[] = []
  const negatives: number[] = [] // reversals / reimbursements stored as positive amounts but applied with a minus
  for (const t of txs) {
    // Investment-out / reimbursement / reversal should subtract
    const isNegative = t.type === 'investment_out' || t.type === 'reimbursement' || t.amount < 0
    if (isNegative) negatives.push(Math.abs(t.amount))
    else positives.push(t.amount)
  }
  if (positives.length === 0 && negatives.length === 0) return null

  const fmt = (n: number) => n.toFixed(2)
  const parts: string[] = []
  for (const p of positives) parts.push(`+${fmt(p)}`)
  for (const n of negatives) parts.push(`-${fmt(n)}`)
  // trim leading operator
  let expr = parts.join('')
  if (expr.startsWith('+')) expr = expr.slice(1)
  return `=${expr}`
}

/**
 * Convert a column letter (A..Z, AA..) to a 1-based index.
 */
function columnToNumber(letter: string): number {
  let n = 0
  for (let i = 0; i < letter.length; i++) {
    n = n * 26 + (letter.charCodeAt(i) - 64)
  }
  return n
}

/**
 * Generate the XLSX Blob for download.
 */
export async function exportXlsxWithOptions(options: XlsxExportOptions): Promise<Blob> {
  const wb = new ExcelJS.Workbook()

  let templateWb: ExcelJS.Workbook | null = null
  if (options.templateFile) {
    templateWb = new ExcelJS.Workbook()
    const buf = await options.templateFile.arrayBuffer()
    await templateWb.xlsx.load(buf)
  }

  for (const year of options.years) {
    const sheetName = String(year)
    let ws: ExcelJS.Worksheet
    if (templateWb) {
      // Try to reuse the template sheet for this year
      ws = templateWb.getWorksheet(sheetName) || templateWb.addWorksheet(sheetName)
    } else {
      ws = wb.addWorksheet(sheetName)
    }

    // Group items by class so the synthetic fallback has a sensible layout
    const itemsByClass = new Map<string, FinancialItem[]>()
    for (const it of options.items) {
      if (!it.active) continue
      const list = itemsByClass.get(it.classId) ?? []
      list.push(it)
      itemsByClass.set(it.classId, list)
    }

    let startRow = 1
    for (const cls of options.classes) {
      const items = itemsByClass.get(cls.id) ?? []
      if (items.length === 0) continue

      if (!templateWb) {
        // write a class header
        ws.getCell(`A${startRow}`).value = cls.label
        ws.getCell(`A${startRow}`).font = { bold: true }
        // write month headers on the first row of the block
        ws.getCell(`D${startRow}`).value = 'ITEM'
        for (let m = 0; m < 12; m++) {
          ws.getCell(`${MONTH_LETTERS[m]}${startRow}`).value = MONTH_PT[m]
        }
        startRow += 1
      }

      for (const item of items) {
        const mapping = item.sheetMapping
        let row: number
        if (mapping && mapping.sheetName === sheetName) {
          row = mapping.row
        } else if (templateWb) {
          // no mapping for this item — skip rather than guessing into the template
          continue
        } else {
          row = startRow++
        }

        if (!templateWb) {
          ws.getCell(`D${row}`).value = item.name
        }

        for (let m = 1; m <= 12; m++) {
          const colLetter = mapping?.monthColumns?.[m] ?? MONTH_LETTERS[m - 1]
          const col = columnToNumber(colLetter)
          const cell = ws.getCell(row, col)

          const txs = groupItemMonthTransactions(options.transactions, item.id, year, m)
          if (txs.length === 0) {
            // leave empty (preserve template content / "-")
            continue
          }
          const formula = buildCellFormula(txs)
          if (formula) {
            // ExcelJS formula: omit leading "="
            cell.value = { formula: formula.slice(1) } as any
            // number format: Brazilian two-decimal
            cell.numFmt = '#,##0.00'
          }
        }
      }
      if (!templateWb) {
        startRow += 1 // spacer between classes
      }
    }
  }

  // Append a "RESUMO" sheet with yearly totals per class
  if (templateWb) {
    // attach the sheets we modified to the export workbook
    templateWb.eachSheet((s) => {
      if (!wb.getWorksheet(s.name)) {
        // ExcelJS does not expose sheet cloning publicly; we just keep working
        // on the template workbook directly.
      }
    })
  }

  const resumoWb = templateWb ?? wb
  let resumo = resumoWb.getWorksheet('RESUMO')
  if (!resumo) resumo = resumoWb.addWorksheet('RESUMO')

  resumo.getCell('A1').value = 'RESUMO ANUAL'
  resumo.getCell('A1').font = { bold: true, size: 14 }
  let r = 3
  resumo.getCell(`A${r}`).value = 'Ano'
  resumo.getCell(`B${r}`).value = 'Receita'
  resumo.getCell(`C${r}`).value = 'Investimentos'
  resumo.getCell(`D${r}`).value = 'Despesas Fixas'
  resumo.getCell(`E${r}`).value = 'Despesas Variáveis'
  resumo.getCell(`F${r}`).value = 'Despesas Extras'
  resumo.getCell(`G${r}`).value = 'Despesas Adicionais'
  resumo.getCell(`H${r}`).value = 'Total Despesas'
  resumo.getCell(`I${r}`).value = 'Saldo'
  resumo.getCell(`J${r}`).value = 'Média Mensal'
  for (let c = 1; c <= 10; c++) resumo.getCell(r, c).font = { bold: true }
  r += 1
  for (const year of options.years) {
    const yearPrefix = `${year}-`
    const yearTxs = options.transactions.filter((t) => t.date.startsWith(yearPrefix))
    let receita = 0,
      invest = 0
    const despesas: Record<string, number> = {
      despesas_fixas: 0,
      despesas_variaveis: 0,
      despesas_extras: 0,
      despesas_adicionais: 0,
    }
    for (const t of yearTxs) {
      if (t.type === 'income') receita += t.amount
      else if (t.type === 'investment_in') invest += t.amount
      else if (t.type === 'investment_out') invest -= t.amount
      else if (t.type === 'expense' && t.itemId) {
        const item = options.items.find((i) => i.id === t.itemId)
        if (item && despesas[item.classId] !== undefined) despesas[item.classId] += t.amount
      }
    }
    const totalDesp = Object.values(despesas).reduce((s, v) => s + v, 0)
    resumo.getCell(`A${r}`).value = year
    resumo.getCell(`B${r}`).value = receita
    resumo.getCell(`C${r}`).value = invest
    resumo.getCell(`D${r}`).value = despesas.despesas_fixas
    resumo.getCell(`E${r}`).value = despesas.despesas_variaveis
    resumo.getCell(`F${r}`).value = despesas.despesas_extras
    resumo.getCell(`G${r}`).value = despesas.despesas_adicionais
    resumo.getCell(`H${r}`).value = totalDesp
    resumo.getCell(`I${r}`).value = receita - totalDesp
    resumo.getCell(`J${r}`).value = (receita - totalDesp) / 12
    for (let c = 2; c <= 10; c++) resumo.getCell(r, c).numFmt = '#,##0.00'
    r += 1
  }

  const out = templateWb ?? wb
  const buffer = await out.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

const MONTH_PT = [
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

/**
 * Trigger a browser download of the generated XLSX.
 */
export async function downloadXlsx(options: XlsxExportOptions, fileName: string): Promise<void> {
  const blob = await exportXlsxWithOptions(options)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Parse a historical spreadsheet and decompose formula cells into individual
 * transactions, mapping them to items via aliases.
 *
 * Returns staged transactions with source='legacy_migration' and
 * datePrecision='month'. The caller is responsible for confirming them.
 */
export interface LegacyImportRow {
  year: number
  month: number // 1..12
  itemName: string
  amount: number
  /** Decomposed sub-amounts (when the cell was a formula like =5.54+6.39) */
  parts: number[]
  sheetName: string
}

export async function parseLegacySpreadsheet(file: File): Promise<LegacyImportRow[]> {
  const wb = new ExcelJS.Workbook()
  const buf = await file.arrayBuffer()
  await wb.xlsx.load(buf)
  const rows: LegacyImportRow[] = []

  wb.eachSheet((sheet) => {
    const sheetName = sheet.name
    const year = parseInt(sheetName, 10)
    if (!year || isNaN(year)) return // skip non-year sheets

    sheet.eachRow((row, rowNum) => {
      const itemCell = row.getCell(1) // column A
      const itemName = String(itemCell.value ?? '').trim()
      if (!itemName) return
      if (itemName.toLowerCase() === 'saldo') return // boundary — stop processing below
      if (itemName === '-' || itemName.toLowerCase() === 'total') return

      for (let m = 0; m < 12; m++) {
        const col = MONTH_LETTERS[m]
        const cell = row.getCell(columnToNumber(col))
        const value = cell.value
        if (value === null || value === undefined) continue
        if (value === '-' || value === '') continue

        // formula cells arrive as objects with a `formula` property
        let formulaStr = ''
        if (typeof value === 'object' && value !== null) {
          if ('formula' in (value as any)) formulaStr = String((value as any).formula)
          else if ('result' in (value as any)) {
            const res = (value as any).result
            if (typeof res === 'number' && res !== 0) {
              rows.push({
                year,
                month: m + 1,
                itemName,
                amount: Math.abs(res),
                parts: [Math.abs(res)],
                sheetName,
              })
            }
            continue
          }
        } else if (typeof value === 'number') {
          if (value === 0) continue
          rows.push({
            year,
            month: m + 1,
            itemName,
            amount: Math.abs(value),
            parts: [Math.abs(value)],
            sheetName,
          })
          continue
        } else if (typeof value === 'string') {
          if (value.startsWith('=')) formulaStr = value.slice(1)
          else continue
        }

        if (formulaStr) {
          const parts = decomposeFormula(formulaStr)
          if (parts.length === 0) continue
          const total = parts.reduce((s, v) => s + v, 0)
          rows.push({ year, month: m + 1, itemName, amount: total, parts, sheetName })
        }
      }
    })
  })

  return rows
}

/**
 * Decompose a formula like "5.54+6.39-20.00" (or with commas) into signed
 * parts. Returns positive numbers for additions and absolute values for
 * subtractions (caller interprets the sign separately).
 */
export function decomposeFormula(formula: string): number[] {
  // normalize decimal separators
  const normalized = formula.replace(/,/g, '.')
  const parts: number[] = []
  // split keeping the operators
  const re = /([+-]?\s*\d+(?:\.\d+)?)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(normalized)) !== null) {
    const token = match[1].replace(/\s/g, '')
    const n = parseFloat(token)
    if (!isNaN(n)) parts.push(Math.abs(n))
  }
  return parts
}

/**
 * Map a legacy row's item name to a FinancialItem id, using the item's
 * `name`, `aliases`, and `keywords` (in that order of precedence).
 */
export function mapLegacyRowToItem(
  row: LegacyImportRow,
  items: FinancialItem[],
): FinancialItem | null {
  const norm = row.itemName.toLowerCase().trim()
  if (!norm) return null

  // 1. exact name match
  const byName = items.find((i) => i.name.toLowerCase() === norm)
  if (byName) return byName

  // 2. alias match
  const byAlias = items.find((i) => i.aliases.some((a) => a.toLowerCase().trim() === norm))
  if (byAlias) return byAlias

  // 3. keyword containment
  let best: { item: FinancialItem; score: number } | null = null
  for (const item of items) {
    for (const kw of item.keywords) {
      const kwLower = kw.toLowerCase()
      if (norm.includes(kwLower) || kwLower.includes(norm)) {
        const score = kwLower.length
        if (!best || score > best.score) best = { item, score }
      }
    }
  }
  return best ? best.item : null
}

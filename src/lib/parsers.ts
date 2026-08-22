/**
 * CSV / Sheet / OFX parser and generator utilities
 * Completely browser-compatible without requiring external binary packages
 */

export interface ParsedTable {
  headers: string[]
  rows: Record<string, string | number | null | undefined>[]
  rawMatrix: (string | number | null | undefined)[][]
}

/**
 * Result of parsing an XLSX file into per-sheet 2D cell matrices. Part 1 of
 * the prompt: leitura correta da planilha histórica.
 *
 * The matrices are 1-based by index+1 (index 0 unused) so row/column numbers
 * match the values stored in src/lib/templateMap.ts.
 *
 * Each cell carries either a scalar value or a formula string (prefixed '=').
 * `formulaCells` is the same shape but contains the raw formula for cells that
 * had one, so the importer can decompose them (§3.2).
 */
export interface XLSXSheet {
  sheetName: string
  matrix: (string | number | null)[][] // [row][col], 1-based (index 0 unused)
  formulas: (string | null)[][] // parallel matrix; formula string or null
}

export interface ParsedXLSX {
  sheets: XLSXSheet[]
}

/**
 * Parses simple CSV content supporting quotes, semicolons and commas
 */
export function parseCSV(content: string): ParsedTable {
  const lines = content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0)

  if (lines.length === 0) {
    return { headers: [], rows: [], rawMatrix: [] }
  }

  // Detect delimiter: semicolon or comma or tab
  const firstLine = lines[0]
  const semicolonCount = (firstLine.match(/;/g) || []).length
  const commaCount = (firstLine.match(/,/g) || []).length
  const tabCount = (firstLine.match(/\t/g) || []).length

  let delimiter = ','
  if (semicolonCount > commaCount && semicolonCount > tabCount) delimiter = ';'
  else if (tabCount > commaCount && tabCount > semicolonCount) delimiter = '\t'

  const matrix: string[][] = []

  for (const line of lines) {
    const row: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (char === delimiter && !inQuotes) {
        row.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    row.push(current.trim())
    matrix.push(row)
  }

  if (matrix.length === 0) {
    return { headers: [], rows: [], rawMatrix: [] }
  }

  const rawHeaders = matrix[0]
  const headers = rawHeaders.map((h, i) => (h && h.trim() ? h.trim() : `Coluna ${i + 1}`))

  const rows: Record<string, string>[] = []
  for (let r = 1; r < matrix.length; r++) {
    const rowObj: Record<string, string> = {}
    headers.forEach((h, colIndex) => {
      rowObj[h] = matrix[r][colIndex] ?? ''
    })
    rows.push(rowObj)
  }

  return { headers, rows, rawMatrix: matrix }
}

/**
 * Parses simple XML / OFX bank statement format (common in Brazilian banks: Itaú, Bradesco, Nubank, Inter, BB, Caixa, Santander)
 */
export interface OFXTransaction {
  fitid?: string
  date: string // YYYY-MM-DD
  amount: number
  type: 'expense' | 'income'
  memo: string
}

export function parseOFX(ofxContent: string): OFXTransaction[] {
  const transactions: OFXTransaction[] = []

  // Extract <STMTTRN>...</STMTTRN> blocks
  const stmttrnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi
  let match: RegExpExecArray | null

  while ((match = stmttrnRegex.exec(ofxContent)) !== null) {
    const block = match[1]

    const trntype = extractOFXTag(block, 'TRNTYPE')
    const dtposted = extractOFXTag(block, 'DTPOSTED')
    const trnamt = extractOFXTag(block, 'TRNAMT')
    const fitid = extractOFXTag(block, 'FITID')
    const memo = extractOFXTag(block, 'MEMO') || extractOFXTag(block, 'NAME') || 'Transação OFX'

    // Parse date: e.g. 20250615120000 or 20250615
    let dateStr = new Date().toISOString().split('T')[0]
    if (dtposted && dtposted.length >= 8) {
      const year = dtposted.substring(0, 4)
      const month = dtposted.substring(4, 6)
      const day = dtposted.substring(6, 8)
      dateStr = `${year}-${month}-${day}`
    }

    // Parse amount: can be negative (e.g. -45.50 or -45,50)
    let parsedAmount = 0
    let type: 'expense' | 'income' = 'expense'
    if (trnamt) {
      const cleanAmt = trnamt.replace(/\s/g, '').replace(',', '.')
      const num = parseFloat(cleanAmt)
      if (!isNaN(num)) {
        if (num < 0 || trntype.toUpperCase() === 'DEBIT') {
          type = 'expense'
          parsedAmount = Math.abs(num)
        } else {
          type = 'income'
          parsedAmount = Math.abs(num)
        }
      }
    }

    transactions.push({
      fitid,
      date: dateStr,
      amount: parsedAmount,
      type,
      memo: cleanText(memo),
    })
  }

  return transactions
}

function extractOFXTag(content: string, tag: string): string {
  // Try <TAG>VALUE</TAG>
  const closedRegex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const closedMatch = content.match(closedRegex)
  if (closedMatch) return closedMatch[1].trim()

  // Try <TAG>VALUE\n (SGML style OFX 1.x)
  const openRegex = new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i')
  const openMatch = content.match(openRegex)
  if (openMatch) return openMatch[1].trim()

  return ''
}

function cleanText(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

/**
 * Intelligent Portuguese header auto-detection
 */
export function autoDetectHeaders(headers: string[]): {
  dateCol: string
  descriptionCol: string
  amountCol: string
  categoryCol: string
  typeCol: string
  notesCol: string
} {
  const result = {
    dateCol: '',
    descriptionCol: '',
    amountCol: '',
    categoryCol: '',
    typeCol: '',
    notesCol: '',
  }

  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()

  for (const h of headers) {
    const norm = normalize(h)

    // Date matches
    if (!result.dateCol) {
      if (
        norm === 'data' ||
        norm === 'dt' ||
        norm === 'data da transacao' ||
        norm === 'data transacao' ||
        norm === 'data lancamento' ||
        norm === 'vencimento' ||
        norm === 'date'
      ) {
        result.dateCol = h
      }
    }

    // Description matches
    if (!result.descriptionCol) {
      if (
        norm === 'descricao' ||
        norm === 'historico' ||
        norm === 'detalhe' ||
        norm === 'favorecido' ||
        norm === 'estabelecimento' ||
        norm === 'titulo' ||
        norm === 'memo' ||
        norm === 'transacao' ||
        norm === 'description' ||
        norm.includes('descri') ||
        norm.includes('historico')
      ) {
        result.descriptionCol = h
      }
    }

    // Amount matches
    if (!result.amountCol) {
      if (
        norm === 'valor' ||
        norm === 'montante' ||
        norm === 'quantia' ||
        norm === 'total' ||
        norm === 'valor (r$)' ||
        norm === 'amount' ||
        norm === 'valor r$' ||
        norm.includes('valor')
      ) {
        result.amountCol = h
      }
    }

    // Category matches
    if (!result.categoryCol) {
      if (
        norm === 'categoria' ||
        norm === 'grupo' ||
        norm === 'classificacao' ||
        norm === 'subcategoria' ||
        norm === 'category' ||
        norm.includes('categ') ||
        norm.includes('grupo')
      ) {
        result.categoryCol = h
      }
    }

    // Type matches
    if (!result.typeCol) {
      if (
        norm === 'tipo' ||
        norm === 'natureza' ||
        norm === 'd/c' ||
        norm === 'debito/credito' ||
        norm === 'operacao' ||
        norm === 'type'
      ) {
        result.typeCol = h
      }
    }

    // Notes matches
    if (!result.notesCol) {
      if (
        norm === 'observacao' ||
        norm === 'obs' ||
        norm === 'observacoes' ||
        norm === 'nota' ||
        norm === 'comentario' ||
        norm === 'notes' ||
        norm.includes('observa')
      ) {
        result.notesCol = h
      }
    }
  }

  // Fallbacks if not detected
  if (!result.dateCol && headers.length > 0) result.dateCol = headers[0]
  if (!result.descriptionCol && headers.length > 1) {
    result.descriptionCol = headers.find((h) => h !== result.dateCol) || headers[1]
  }
  if (!result.amountCol && headers.length > 2) {
    result.amountCol =
      headers.find((h) => h !== result.dateCol && h !== result.descriptionCol) || headers[2] || ''
  }

  return result
}

/**
 * Formats a number to Brazilian currency (R$ 1.234,56)
 */
export function formatCurrencyBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

/**
 * Parses Brazilian formatted date (DD/MM/YYYY or YYYY-MM-DD) to ISO YYYY-MM-DD
 */
export function parseDateToISO(raw: string | number | null | undefined): string {
  if (!raw) return new Date().toISOString().split('T')[0]
  const str = String(raw).trim()

  // DD/MM/YYYY or DD-MM-YYYY
  const brMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (brMatch) {
    const day = brMatch[1].padStart(2, '0')
    const month = brMatch[2].padStart(2, '0')
    const year = brMatch[3]
    return `${year}-${month}-${day}`
  }

  // YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/)
  if (isoMatch) {
    const year = isoMatch[1]
    const month = isoMatch[2].padStart(2, '0')
    const day = isoMatch[3].padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // Excel serial date number
  const num = Number(str)
  if (!isNaN(num) && num > 30000 && num < 60000) {
    const date = new Date((num - (25567 + 2)) * 86400 * 1000)
    return date.toISOString().split('T')[0]
  }

  // Fallback try Date.parse
  const d = new Date(str)
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0]
  }

  return new Date().toISOString().split('T')[0]
}

/**
 * Parses currency or number string like "R$ -1.250,50", "(100,00)", "1,250.00", "-50.2"
 */
export function parseAmountAndType(
  raw: string | number | null | undefined,
  explicitType?: string,
): { amount: number; type: 'expense' | 'income' } {
  if (raw === null || raw === undefined) return { amount: 0, type: 'expense' }

  const str = String(raw).trim()
  const isNegativeExplicit =
    str.includes('-') || (str.startsWith('(') && str.endsWith(')')) || /d(ebito)?$/i.test(str)

  // Remove currency signs, spaces, parens
  let clean = str.replace(/[R$\s()]/gi, '').trim()

  // Detect whether comma is decimal or thousand separator
  // Brazilian: "1.234,56" -> comma is decimal
  // US: "1,234.56" -> dot is decimal
  if (clean.includes(',') && clean.includes('.')) {
    if (clean.lastIndexOf(',') > clean.lastIndexOf('.')) {
      // 1.234,56
      clean = clean.replace(/\./g, '').replace(',', '.')
    } else {
      // 1,234.56
      clean = clean.replace(/,/g, '')
    }
  } else if (clean.includes(',')) {
    // Only comma: 1234,56
    clean = clean.replace(',', '.')
  }

  let num = parseFloat(clean)
  if (isNaN(num)) num = 0

  let type: 'expense' | 'income' = 'expense'

  if (explicitType) {
    const normType = explicitType.toLowerCase().trim()
    if (
      normType.includes('receita') ||
      normType.includes('credito') ||
      normType.includes('entrada') ||
      normType === 'c' ||
      normType === 'cr' ||
      normType === 'income'
    ) {
      type = 'income'
    } else {
      type = 'expense'
    }
  } else {
    if (num < 0 || isNegativeExplicit) {
      type = 'expense'
    } else if (num > 0) {
      // If no explicit negative, but usually bank debits are negative and credits positive
      type = num > 0 ? 'expense' : 'income'
    }
  }

  return {
    amount: Math.abs(num),
    type,
  }
}

/**
 * Generates CSV string for exporting transactions according to template mapping
 */
export function exportTransactionsToCSV(
  transactions: {
    date: string
    description: string
    amount: number
    type: string
    categoryName?: string
    notes?: string
  }[],
  headersMap = {
    date: 'Data',
    description: 'Descrição',
    amount: 'Valor',
    category: 'Categoria',
    type: 'Tipo',
    notes: 'Observação',
  },
): string {
  const headers = [
    headersMap.date,
    headersMap.description,
    headersMap.amount,
    headersMap.category,
    headersMap.type,
    headersMap.notes,
  ]

  const rows = transactions.map((t) => {
    // Format date DD/MM/YYYY
    const [y, m, d] = t.date.split('-')
    const formattedDate = y && m && d ? `${d}/${m}/${y}` : t.date
    const formattedAmount = (t.type === 'expense' ? -t.amount : t.amount)
      .toFixed(2)
      .replace('.', ',')
    const typeLabel = t.type === 'income' ? 'Receita' : 'Despesa'
    const escape = (val: string) => `"${(val || '').replace(/"/g, '""')}"`

    return [
      escape(formattedDate),
      escape(t.description),
      escape(formattedAmount),
      escape(t.categoryName || ''),
      escape(typeLabel),
      escape(t.notes || ''),
    ].join(';')
  })

  return [headers.map((h) => `"${h}"`).join(';'), ...rows].join('\r\n')
}

// ---------------------------------------------------------------------------
// XLSX parsing (Part 1 — leitura correta da planilha histórica)
// ---------------------------------------------------------------------------

/**
 * Parse an XLSX ArrayBuffer into per-sheet 2D matrices + parallel formula
 * matrices. Browser-compatible — uses ExcelJS (already a project dependency).
 *
 * Returns matrices 1-based by index+1 (index 0 unused) so row/column numbers
 * line up with src/lib/templateMap.ts.
 */
export async function parseXLSX(data: ArrayBuffer): Promise<ParsedXLSX> {
  // dynamic import keeps the bundle lean if xlsx parsing isn't used
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(data)

  const sheets: XLSXSheet[] = []
  wb.eachSheet((sheet) => {
    const maxR = sheet.rowCount || 0
    const maxC = sheet.columnCount || 0
    // allocate 1-based matrices (index 0 unused)
    const matrix: (string | number | null)[][] = []
    const formulas: (string | null)[][] = []
    for (let r = 0; r <= maxR; r++) {
      matrix.push(new Array(maxC + 1).fill(null))
      formulas.push(new Array(maxC + 1).fill(null))
    }
    // ExcelJS rows are 1-based
    sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      if (rowNumber > maxR) return
      if (!matrix[rowNumber]) {
        matrix[rowNumber] = new Array(maxC + 1).fill(null)
        formulas[rowNumber] = new Array(maxC + 1).fill(null)
      }
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (colNumber > maxC) return
        // A formula cell carries its formula text under `cell.formula` (without
        // leading '=') and the cached result under `cell.result`.
        const formula = (cell as { formula?: string }).formula
        if (formula) {
          formulas[rowNumber][colNumber] = `=${formula}`
          const v = (cell as { result?: unknown }).result
          matrix[rowNumber][colNumber] = v == null ? null : typeof v === 'number' ? v : String(v)
          return
        }
        const v = cell.value
        if (v == null) {
          matrix[rowNumber][colNumber] = null
        } else if (typeof v === 'number') {
          matrix[rowNumber][colNumber] = v
        } else if (typeof v === 'string') {
          matrix[rowNumber][colNumber] = v
        } else if (v && typeof v === 'object') {
          // RichText or hyperlink — extract text
          if ('richText' in v && Array.isArray((v as { richText: { text: string }[] }).richText)) {
            matrix[rowNumber][colNumber] = (v as { richText: { text: string }[] }).richText
              .map((rt) => rt.text)
              .join('')
          } else if ('text' in v) {
            matrix[rowNumber][colNumber] = String((v as { text: string }).text)
          } else {
            matrix[rowNumber][colNumber] = String(v)
          }
        } else {
          matrix[rowNumber][colNumber] = String(v)
        }
      })
    })
    sheets.push({ sheetName: sheet.name, matrix, formulas })
  })
  return { sheets }
}

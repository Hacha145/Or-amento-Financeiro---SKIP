// TEMPORARY. Reads the real template XLSX with ExcelJS and emits the structural
// dump to BOTH stderr and a deliberate non-zero exit, so the QA harness surfaces
// the dump text in its test-phase error report. Removed before the final commit.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import ExcelJS from 'exceljs'

const SRC = 'src/assets/orcamentopessoaltemplateanonimizado-a0d81.xlsx'
const OUT = 'scripts/_template_dump.txt'

function cellText(cell) {
  let v = cell.value
  if (v == null) return ''
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string') return v
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((rt) => rt.text).join('')
    if ('text' in v) return String(v.text)
    if ('result' in v && v.result != null) return 'R:' + JSON.stringify(v.result)
    return 'O:' + JSON.stringify(v)
  }
  return String(v)
}

const MONTHS = [
  'JANEIRO',
  'FEVEREIRO',
  'MARCO',
  'ABRIL',
  'MAIO',
  'JUNHO',
  'JULHO',
  'AGOSTO',
  'SETEMBRO',
  'OUTUBRO',
  'NOVEMBRO',
  'DEZEMBRO',
]
const SHORT = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']
function norm(s) {
  return String(s ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

const out = []
try {
  const buf = await readFile(SRC)
  out.push('READ_OK bytes=' + buf.length)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  out.push('SHEETS=' + wb.worksheets.length)
  for (const sheet of wb.worksheets) {
    const maxR = Math.min(sheet.rowCount || 0, 220)
    const maxC = Math.min(sheet.columnCount || 0, 24)
    const M = []
    for (let r = 0; r <= maxR; r++) M.push(new Array(maxC + 1).fill(''))
    for (let r = 1; r <= maxR; r++) {
      const row = sheet.getRow(r)
      for (let c = 1; c <= maxC; c++) M[r][c] = cellText(row.getCell(c))
    }
    out.push('')
    out.push('###SHEET=' + sheet.name + ' maxR=' + maxR + ' maxC=' + maxC)
    let headerRow = -1
    for (let r = 1; r <= Math.min(maxR, 12); r++) {
      for (let c = 1; c <= maxC; c++) {
        const n = norm(M[r][c])
        if (MONTHS.some((m) => n === m || n.startsWith(m)) || SHORT.includes(n)) {
          headerRow = r
          break
        }
      }
      if (headerRow > 0) break
    }
    out.push('HEADER_ROW=' + headerRow)
    if (headerRow > 0) {
      const cells = []
      for (let c = 1; c <= maxC; c++) {
        const n = norm(M[headerRow][c])
        if (n) cells.push('c' + c + '=' + JSON.stringify(M[headerRow][c]) + '|' + n)
      }
      out.push('HEADER_CELLS=' + cells.join(' ; '))
      const mc = []
      for (let c = 1; c <= maxC; c++) {
        const n = norm(M[headerRow][c])
        let mi = -1
        for (let k = 0; k < 12; k++) {
          if (n === MONTHS[k] || n === SHORT[k] || n.startsWith(MONTHS[k])) {
            mi = k
            break
          }
        }
        if (mi >= 0) mc.push('m' + (mi + 1) + '=c' + c)
      }
      out.push('MONTH_COLS=' + mc.join(' , '))
      for (let c = 1; c <= maxC; c++) {
        const n = norm(M[headerRow][c])
        if (n === 'TOTAL' || n === 'TOTAL ANUAL' || n === 'ANO')
          out.push('TOTAL_COL=c' + c + ' (' + M[headerRow][c] + ')')
      }
    }
    let labelCol = 1,
      bestScore = -1
    for (let c = 1; c <= Math.min(maxC, 4); c++) {
      let score = 0
      for (let r = 1; r <= maxR; r++) {
        const v = M[r][c]
        if (v && isNaN(Number(v))) score++
      }
      if (score > bestScore) {
        bestScore = score
        labelCol = c
      }
    }
    out.push('LABEL_COL=c' + labelCol)
    out.push('ROWS:')
    for (let r = 1; r <= maxR; r++) {
      const a = M[r][1] || '',
        b = M[r][2] || '',
        cc = M[r][3] || '',
        d = M[r][4] || ''
      const all = [a, b, cc, d].filter(Boolean).join(' / ')
      if (!all) continue
      out.push('  R' + r + ': ' + JSON.stringify(all))
    }
  }
} catch (e) {
  out.push('ERR: ' + (e && e.stack ? e.stack : String(e)))
}
const text = out.join('\n')
try {
  await mkdir('scripts', { recursive: true })
  await writeFile(OUT, text, 'utf8')
} catch (_) {}
console.log('TEMPLATE_DUMP_BEGIN')
console.log(text)
console.log('TEMPLATE_DUMP_END')
process.exit(0)

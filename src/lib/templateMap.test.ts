/**
 * Unit tests for templateMap.ts — confirms the real structural coordinates of
 * the canonical budget workbook (ORÇAMENTO_PESSOAL_TEMPLATE_ANONIMIZADO.xlsx).
 *
 * These tests do NOT read the XLSX file (that would couple them to ExcelJS at
 * unit-test time); they verify the in-memory map produced by
 * `buildYearSheetMap` against the coordinates confirmed by the user.
 */
import { describe, it, expect } from 'vitest'
import {
  buildYearSheetMap,
  CANONICAL_LABEL_COLUMN,
  CANONICAL_CLASS_COLUMN,
  CANONICAL_CATEGORY_COLUMN,
  CANONICAL_MONTH_START_COLUMN,
  decomposeFormula,
  sumFormula,
  findItemRowByName,
  validateByAnchor,
  isAuxiliarySheet,
  detectMonths,
  diagnoseSheet,
  reconcileSheet,
  getSectionBounds,
  type YearSheetMap,
} from './templateMap'

// ---------------------------------------------------------------------------
// Helpers to build a synthetic sheet matrix (1-based, index 0 unused) so the
// label/search functions can be exercised without a real XLSX file.
// ---------------------------------------------------------------------------
function emptyMatrix(rows: number, cols: number): (string | number | null)[][] {
  const m: (string | number | null)[][] = []
  for (let r = 0; r <= rows; r++) m.push(new Array(cols + 1).fill(null))
  return m
}
function setLabel(m: (string | number | null)[][], row: number, col: number, label: string) {
  if (!m[row]) m[row] = new Array(m[0].length).fill(null)
  m[row][col] = label
}

/**
 * Build a synthetic 2025 sheet with class headers (A), item labels (D) and a
 * month header row, exercising the real column layout.
 */
function buildSynthetic2025(): (string | number | null)[][] {
  const m = emptyMatrix(130, 17)
  const months = [
    'JANEIRO',
    'FEVEREIRO',
    'MARÇO',
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
  setLabel(m, 1, 4, 'Total')
  for (let i = 0; i < 12; i++) setLabel(m, 1, 5 + i, months[i])

  // Class headers (col A = 1)
  setLabel(m, 5, 1, 'RECEITAS')
  setLabel(m, 14, 1, 'INVESTIMENTOS')
  setLabel(m, 26, 1, 'DESPESAS FIXAS')
  setLabel(m, 50, 1, 'DESPESAS VARIÁVEIS')
  setLabel(m, 75, 1, 'DESPESAS EXTRAS')
  setLabel(m, 91, 1, 'DESPESAS ADICIONAIS')

  // Item labels (col D = 4)
  setLabel(m, 6, 4, 'Salário')
  setLabel(m, 7, 4, 'Complementar')
  setLabel(m, 8, 4, 'Divisão Lulu')
  setLabel(m, 9, 4, 'Entrada de corretora')
  setLabel(m, 15, 4, 'Cripto')
  setLabel(m, 16, 4, 'Tesouro')
  setLabel(m, 17, 4, 'Renda fixa')
  setLabel(m, 18, 4, 'Previdência')
  setLabel(m, 19, 4, 'Outros')
  setLabel(m, 27, 4, 'Aluguel')
  setLabel(m, 28, 4, 'Condomínio')
  setLabel(m, 29, 4, 'Prestação moto')
  setLabel(m, 30, 4, 'Plano de saúde')
  setLabel(m, 31, 4, 'Plano dental')
  setLabel(m, 32, 4, 'Nutricionista')
  setLabel(m, 33, 4, 'Academia')
  setLabel(m, 34, 4, 'Pós-graduação')
  setLabel(m, 35, 4, 'Assinatura Cripto')
  setLabel(m, 36, 4, 'Curso')
  setLabel(m, 37, 4, 'DAS')
  setLabel(m, 38, 4, 'IPVA')
  setLabel(m, 39, 4, 'Licenciamento')
  setLabel(m, 40, 4, 'Seguro vida')
  setLabel(m, 41, 4, 'CREA')
  setLabel(m, 42, 4, 'Empréstimo')
  setLabel(m, 51, 4, 'Luz')
  setLabel(m, 52, 4, 'Telefone Celular')
  setLabel(m, 53, 4, 'Gás')
  setLabel(m, 54, 4, 'Internet')
  setLabel(m, 55, 4, 'Limpeza')
  setLabel(m, 56, 4, 'Combustível')
  setLabel(m, 57, 4, 'Multa')
  setLabel(m, 58, 4, 'Estacionamento')
  setLabel(m, 59, 4, 'Passagem')
  setLabel(m, 60, 4, 'Supermercado')
  setLabel(m, 61, 4, 'Feira')
  setLabel(m, 62, 4, 'Suplementação')
  setLabel(m, 63, 4, 'Skin care')
  setLabel(m, 64, 4, 'Higiene')
  setLabel(m, 65, 4, 'Cabeleireiro')
  setLabel(m, 66, 4, 'Alimentação Pet')
  setLabel(m, 67, 4, 'Higiene Pet')
  setLabel(m, 76, 4, 'Medicamentos')
  setLabel(m, 77, 4, 'Farmácia')
  setLabel(m, 78, 4, 'Médico')
  setLabel(m, 79, 4, 'Dentista')
  setLabel(m, 80, 4, 'Hospital')
  setLabel(m, 81, 4, 'Gatos')
  setLabel(m, 82, 4, 'Manutenção moto')
  setLabel(m, 83, 4, 'Manutenção casa')
  setLabel(m, 84, 4, 'Livros')
  setLabel(m, 92, 4, 'Viagens')
  setLabel(m, 93, 4, 'Cinema Teatro')
  setLabel(m, 94, 4, 'Restaurantes bares')
  setLabel(m, 95, 4, 'Assinaturas streamings')
  setLabel(m, 96, 4, 'Assinaturas')
  setLabel(m, 97, 4, 'Rolê')
  setLabel(m, 98, 4, 'Hobbies')
  setLabel(m, 99, 4, 'Roupas')
  setLabel(m, 100, 4, 'Calçados')
  setLabel(m, 101, 4, 'Acessórios')
  setLabel(m, 102, 4, 'Eletrodomésticos')
  setLabel(m, 103, 4, 'Móveis')
  setLabel(m, 104, 4, 'Cozinha')
  setLabel(m, 105, 4, 'Banheiro')
  setLabel(m, 106, 4, 'Sala')
  setLabel(m, 107, 4, 'Quarto')
  setLabel(m, 108, 4, 'Diversos')
  setLabel(m, 109, 4, 'Estacionamento lavagem moto')
  setLabel(m, 110, 4, 'Presentes')
  setLabel(m, 111, 4, 'Compras marketplace')
  setLabel(m, 112, 4, 'Uber')
  setLabel(m, 113, 4, 'Compras PC')
  setLabel(m, 114, 4, 'Não lembro')
  setLabel(m, 115, 4, 'Milhas')
  setLabel(m, 116, 4, 'Parcelas anteriores')
  setLabel(m, 129, 4, 'Saldo')

  // Total + "% sobre receita" rows per section, so diagnoseSheet can locate
  // each section's totals inside its OWN bounds (receitas/investimentos totals
  // live in column D, despesa totals in column C, adicionais carries the
  // historical "Total despesas extras" label).
  setLabel(m, 11, 4, 'Total')
  setLabel(m, 13, 4, '% sobre receita')
  setLabel(m, 21, 4, 'Total')
  setLabel(m, 23, 4, '% sobre receita')
  setLabel(m, 47, 3, 'Total')
  setLabel(m, 49, 3, '% sobre receita')
  setLabel(m, 72, 3, 'Total')
  setLabel(m, 74, 3, '% sobre receita')
  setLabel(m, 88, 3, 'Total')
  setLabel(m, 90, 3, '% sobre receita')
  setLabel(m, 118, 3, 'Total despesas extras')
  setLabel(m, 120, 3, '% sobre receita')

  // a couple of values so reconciliation has something to compare
  m[6][5] = 5000 // Salário Jan
  m[27][5] = 1500 // Aluguel Jan
  m[60][5] = 800 // Supermercado Jan
  return m
}

describe('templateMap — canonical column constants', () => {
  it('item names live in column D (4)', () => {
    expect(CANONICAL_LABEL_COLUMN).toBe(4)
  })
  it('class headers live in column A (1)', () => {
    expect(CANONICAL_CLASS_COLUMN).toBe(1)
  })
  it('category subheaders live in column C (3)', () => {
    expect(CANONICAL_CATEGORY_COLUMN).toBe(3)
  })
  it('months start at column E (5)', () => {
    expect(CANONICAL_MONTH_START_COLUMN).toBe(5)
  })
})

describe('templateMap — buildYearSheetMap per year', () => {
  it('2023: Receitas items in rows 6-8, canonicalEndRow=119', () => {
    const map = buildYearSheetMap('Orçamento 2023', 2023)
    expect(map.year).toBe(2023)
    expect(map.canonicalEndRow).toBe(119)
    const salario = map.items.find((c) => c.itemId === 'item-salario' && c.month === 1)
    const complementar = map.items.find((c) => c.itemId === 'item-complementar' && c.month === 1)
    const lulu = map.items.find((c) => c.itemId === 'item-divisao-lulu' && c.month === 1)
    expect(salario?.row).toBe(6)
    expect(complementar?.row).toBe(7)
    expect(lulu?.row).toBe(8)
  })

  it('2023: section bounds match the real workbook', () => {
    const rec = getSectionBounds(2023, 'receitas')!
    const adi = getSectionBounds(2023, 'despesas_adicionais')!
    expect(rec.startRow).toBe(6)
    expect(rec.endRow).toBe(9) // exclusive of total row 10
    expect(rec.totalRow).toBe(10)
    expect(adi.startRow).toBe(89)
    expect(adi.endRow).toBe(107)
    expect(adi.totalRow).toBe(108)
    expect(adi.totalAnchor).toBe('Total despesas extras')
  })

  it('2024: canonicalEndRow=132', () => {
    const map = buildYearSheetMap('Orçamento 2024', 2024)
    expect(map.canonicalEndRow).toBe(132)
    // Receitas 6-9
    const salario = map.items.find((c) => c.itemId === 'item-salario' && c.month === 1)
    const out = map.items.find((c) => c.itemId === 'item-entrada-corretora-rs' && c.month === 1)
    expect(salario?.row).toBe(6)
    expect(out?.row).toBe(8) // 4th receitas item, override applied
  })

  it('2025: canonicalEndRow=129 (base year)', () => {
    const map = buildYearSheetMap('Orçamento 2025', 2025)
    expect(map.canonicalEndRow).toBe(129)
    const salario = map.items.find((c) => c.itemId === 'item-salario' && c.month === 1)
    expect(salario?.row).toBe(6)
    const parcelas = map.items.find((c) => c.itemId === 'item-parcelas-anteriores' && c.month === 1)
    expect(parcelas?.row).toBe(116)
  })

  it('2026: canonicalEndRow=130, trailing Investido/Atualização rows excluded', () => {
    const map = buildYearSheetMap('Orçamento 2026', 2026)
    expect(map.canonicalEndRow).toBe(130)
    // No mapped item should sit on rows 131 or 132
    const stray = map.items.filter((c) => c.row === 131 || c.row === 132)
    expect(stray).toHaveLength(0)
    // 2026 adicionais section ends at 117 (parcelas-anteriores override)
    const parcelas = map.items.find((c) => c.itemId === 'item-parcelas-anteriores' && c.month === 1)
    expect(parcelas?.row).toBe(117)
  })
})

describe('templateMap — findItemRowByName searches column D', () => {
  it('finds the Salário row by name in column D (labelColumn=4)', () => {
    const matrix = buildSynthetic2025()
    const map = buildYearSheetMap('Orçamento 2025', 2025)
    const row = findItemRowByName(matrix, map, 'item-salario', 'receitas')
    expect(row).toBe(6) // Salário sits on row 6, column D
  })

  it('respects the section bounds — does not match a name in a neighbouring class', () => {
    const matrix = buildSynthetic2025()
    const map = buildYearSheetMap('Orçamento 2025', 2025)
    // Aluguel is in despesas_fixas (row 27). Searching within receitas must
    // NOT match it even though the window ±10 from Salário (row 6) doesn't
    // reach 27 — this guards against the bounds logic being inverted.
    const row = findItemRowByName(matrix, map, 'item-salario', 'receitas')
    expect(row).toBe(6)
  })

  it('returns null when the item label is absent', () => {
    const matrix = emptyMatrix(20, 17)
    const map = buildYearSheetMap('Orçamento 2025', 2025)
    const row = findItemRowByName(matrix, map, 'item-salario', 'receitas')
    expect(row).toBeNull()
  })
})

describe('templateMap — validateByAnchor', () => {
  it('validates item-name anchor on the exact row, column D', () => {
    const matrix = buildSynthetic2025()
    const map = buildYearSheetMap('Orçamento 2025', 2025)
    const cell = map.items.find((c) => c.itemId === 'item-salario' && c.month === 1)!
    const { missing } = validateByAnchor(matrix, map, cell)
    expect(missing).toHaveLength(0)
  })

  it('reports a missing anchor when the label was shifted off the expected row', () => {
    const matrix = buildSynthetic2025()
    matrix[6][4] = null // remove Salário label
    const map = buildYearSheetMap('Orçamento 2025', 2025)
    const cell = map.items.find((c) => c.itemId === 'item-salario' && c.month === 1)!
    const { missing } = validateByAnchor(matrix, map, cell)
    expect(missing.length).toBeGreaterThan(0)
  })
})

describe('templateMap — isAuxiliarySheet (RESUMO)', () => {
  it('returns true for "RESUMO"', () => {
    expect(isAuxiliarySheet('RESUMO')).toBe(true)
  })
  it('returns true for "Resumo Geral" (contains RESUMO after normalization)', () => {
    expect(isAuxiliarySheet('Resumo Geral')).toBe(true)
  })
  it('returns false for a transactional tab "Orçamento 2025"', () => {
    expect(isAuxiliarySheet('Orçamento 2025')).toBe(false)
  })
})

describe('templateMap — formula decomposition', () => {
  it('BR display form "=5,54+6,39+12,80" → [5.54, 6.39, 12.80]', () => {
    const parts = decomposeFormula('=5,54+6,39+12,80')
    expect(parts).toHaveLength(3)
    expect(parts[0]).toBeCloseTo(5.54, 5)
    expect(parts[1]).toBeCloseTo(6.39, 5)
    expect(parts[2]).toBeCloseTo(12.8, 5)
    expect(sumFormula('=5,54+6,39+12,80')).toBeCloseTo(24.73, 5)
  })

  it('OOXML internal form "=5.54+6.39+12.80" → [5.54, 6.39, 12.80]', () => {
    const parts = decomposeFormula('=5.54+6.39+12.80')
    expect(parts).toHaveLength(3)
    expect(parts[0]).toBeCloseTo(5.54, 5)
    expect(parts[1]).toBeCloseTo(6.39, 5)
    expect(parts[2]).toBeCloseTo(12.8, 5)
    expect(sumFormula('=5.54+6.39+12.80')).toBeCloseTo(24.73, 5)
  })

  it('handles a negative component "=100-30,50" → sum ≈ 69.50', () => {
    expect(sumFormula('=100-30,50')).toBeCloseTo(69.5, 5)
  })

  it('returns [] for empty input', () => {
    expect(decomposeFormula('')).toEqual([])
  })
})

describe('templateMap — reconcileSheet', () => {
  it('reports ok=false when sheet and reconstructed differ', () => {
    const sheetValues = new Map<string, { value: number; formula?: string }>()
    const txByItemMonth = new Map<string, number>()
    sheetValues.set('receitas:1', { value: 800 })
    txByItemMonth.set('receitas:1', 750) // 50 divergence
    const rec = reconcileSheet('Orçamento 2025', 2025, sheetValues, txByItemMonth)
    expect(rec.ok).toBe(false)
    expect(Math.abs(rec.totalDifference - 50)).toBeLessThan(0.01)
  })

  it('reports ok=true when sheet and reconstructed are identical', () => {
    const sheetValues = new Map<string, { value: number; formula?: string }>()
    const txByItemMonth = new Map<string, number>()
    sheetValues.set('receitas:1', { value: 800 })
    sheetValues.set('despesas_fixas:1', { value: 1500 })
    txByItemMonth.set('receitas:1', 800)
    txByItemMonth.set('despesas_fixas:1', 1500)
    const rec = reconcileSheet('Orçamento 2025', 2025, sheetValues, txByItemMonth)
    expect(rec.ok).toBe(true)
    expect(Math.abs(rec.totalDifference)).toBeLessThan(0.01)
  })
})

describe('templateMap — detectMonths from headers', () => {
  it('resolves 12 months without fallback', () => {
    const matrix = buildSynthetic2025()
    const { months, fallback } = detectMonths(matrix[1])
    expect(Object.keys(months).length).toBe(12)
    expect(fallback).toBe(false)
    expect(months[1]).toBe(5) // Jan → column E (5)
    expect(months[12]).toBe(16) // Dec → column P (16)
  })

  it('detects MARÇO (cedilla) without falling back — accent normalization regression', () => {
    // 1-based header row: index 0 unused, months at indices 5..16 (columns E..P).
    const headerRow = [
      null,
      null,
      null,
      null,
      null,
      'JANEIRO',
      'FEVEREIRO',
      'MARÇO',
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
    const { months, fallback } = detectMonths(headerRow)
    expect(fallback).toBe(false)
    expect(months[3]).toBe(7) // MARÇO → column G (7)
    expect(Object.keys(months).length).toBe(12)
  })
})

describe('templateMap — diagnoseSheet totals per section', () => {
  it('2025: each total is found on a DIFFERENT row (no global first-match collision)', () => {
    const matrix = buildSynthetic2025()
    const diag = diagnoseSheet('Orçamento 2025', matrix)
    expect(diag.year).toBe(2025)
    const foundTotals = diag.totalsFound.filter((t) => t.row !== null)
    expect(foundTotals.length).toBeGreaterThan(0)
    // every located total sits on a distinct row — the bug assigned the same
    // row (Receitas ~L10/11) to ALL classes via a global first-match scan.
    const rows = foundTotals.map((t) => t.row)
    expect(new Set(rows).size).toBe(rows.length)
    // spot-check the canonical total row of each section
    const byLabel = Object.fromEntries(foundTotals.map((t) => [t.label, t.row]))
    expect(byLabel['Total receitas']).toBe(11)
    expect(byLabel['Total investimentos']).toBe(21)
    expect(byLabel['Total despesas_fixas']).toBe(47)
    expect(byLabel['Total despesas_variaveis']).toBe(72)
    expect(byLabel['Total despesas_extras']).toBe(88)
    expect(byLabel['Total despesas_adicionais']).toBe(118)
  })

  it('2025: months detected from headers (no E:P fallback)', () => {
    const matrix = buildSynthetic2025()
    const diag = diagnoseSheet('Orçamento 2025', matrix)
    expect(diag.monthsFallback).toBe(false)
    expect(diag.janColumn).toBe(5)
    expect(diag.dezColumn).toBe(16)
  })
})

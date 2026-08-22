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
  isLaunchFormula,
  sumFormula,
  findItemRowByName,
  validateByAnchor,
  isAuxiliarySheet,
  detectMonths,
  diagnoseSheet,
  reconcileSheet,
  getSectionBounds,
  extractResumoMeta,
  detectIntentionalExclusion,
  type YearSheetMap,
} from './templateMap'
import { computeAnnualSummary, buildItemClassLookup } from './annualSummaryService'
import type { Transaction, FinancialItem } from '../types/finance'

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

  // ---- BUG 1 — sign preservation with the ExcelJS OOXML form ----
  it('BUG1: "=100-20" → [100, -20] (subtraction produces a negative term)', () => {
    const parts = decomposeFormula('=100-20')
    expect(parts).toEqual([100, -20])
    expect(sumFormula('=100-20')).toBeCloseTo(80, 5)
  })

  it('BUG1: "=100+-20" → [100, -20] (ExcelJS stores 100-20 as 100+-20)', () => {
    const parts = decomposeFormula('=100+-20')
    expect(parts).toEqual([100, -20])
    expect(sumFormula('=100+-20')).toBeCloseTo(80, 5)
  })

  it('BUG1: "=-20+100" → [-20, 100] (leading negative term preserved)', () => {
    const parts = decomposeFormula('=-20+100')
    expect(parts).toEqual([-20, 100])
    expect(sumFormula('=-20+100')).toBeCloseTo(80, 5)
  })

  it('BUG1: "=100+(-20)" → [100, -20] (parenthesized negative number unwrapped)', () => {
    const parts = decomposeFormula('=100+(-20)')
    expect(parts).toEqual([100, -20])
    expect(sumFormula('=100+(-20)')).toBeCloseTo(80, 5)
  })

  it('BUG1: "=-20" → [-20] (single negative literal)', () => {
    const parts = decomposeFormula('=-20')
    expect(parts).toEqual([-20])
  })

  it('BUG1: "=100-20+30-5" → [100, -20, 30, -5] (sum = 105)', () => {
    const parts = decomposeFormula('=100-20+30-5')
    expect(parts).toEqual([100, -20, 30, -5])
    expect(sumFormula('=100-20+30-5')).toBeCloseTo(105, 5)
  })

  it('BUG1: "=5,54+6,39+12,80" regression — BR decimal form unchanged', () => {
    const parts = decomposeFormula('=5,54+6,39+12,80')
    expect(parts.map((p) => Math.round(p * 100) / 100)).toEqual([5.54, 6.39, 12.8])
  })

  it('BUG1: "=5.54+6.39+12.80" regression — OOXML decimal form unchanged', () => {
    const parts = decomposeFormula('=5.54+6.39+12.80')
    expect(parts.map((p) => Math.round(p * 100) / 100)).toEqual([5.54, 6.39, 12.8])
  })

  it('BUG1: "=500-100" (estorno) → [500, -100]', () => {
    expect(decomposeFormula('=500-100')).toEqual([500, -100])
  })

  it('BUG1: "=50-80" (reembolso > gasto) → [50, -80]', () => {
    expect(decomposeFormula('=50-80')).toEqual([50, -80])
  })
})

// ---------------------------------------------------------------------------
// BUG 2 — launch vs derived formula detection
// ---------------------------------------------------------------------------
describe('templateMap — isLaunchFormula', () => {
  it('returns true for a sum of literals "=5.54+6.39+12.80"', () => {
    expect(isLaunchFormula('=5.54+6.39+12.80')).toBe(true)
  })

  it('returns true for "=100-20+30-5" (literals with signs)', () => {
    expect(isLaunchFormula('=100-20+30-5')).toBe(true)
  })

  it('returns false for a single literal "=25.90" (only one component)', () => {
    expect(isLaunchFormula('=25.90')).toBe(false)
  })

  it('returns false for a cell-reference sum "=E6+E7" (derived)', () => {
    expect(isLaunchFormula('=E6+E7')).toBe(false)
  })

  it('returns false for a SUM(range) formula (derived)', () => {
    expect(isLaunchFormula('=SUM(E6:E9)')).toBe(false)
  })

  it('returns false for #REF! / broken formula (derived)', () => {
    expect(isLaunchFormula('=#REF!')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// BUG 3 — reconciliation: negative saldo is NOT a divergence
// ---------------------------------------------------------------------------
describe('templateMap — reconcileSheet (BUG 3: saldo negativo ≠ divergência)', () => {
  it('saldo negativo que reconcilia → ok=true (NÃO é divergência)', () => {
    const sheetValues = new Map<string, { value: number; formula?: string }>()
    const txByItemMonth = new Map<string, number>()
    sheetValues.set('item-x:1', { value: -500 })
    txByItemMonth.set('item-x:1', -500)
    const rec = reconcileSheet('Orçamento 2025', 2025, sheetValues, txByItemMonth)
    expect(rec.ok).toBe(true)
    expect(Math.abs(rec.totalDifference)).toBeLessThan(0.005)
  })

  it('diferença real entre source e reconstructed → ok=false (É divergência)', () => {
    const sheetValues = new Map<string, { value: number; formula?: string }>()
    const txByItemMonth = new Map<string, number>()
    sheetValues.set('item-y:1', { value: 1000 })
    txByItemMonth.set('item-y:1', 1500) // -500 real divergence
    const rec = reconcileSheet('Orçamento 2025', 2025, sheetValues, txByItemMonth)
    expect(rec.ok).toBe(false)
    expect(Math.abs(rec.totalDifference - -500)).toBeLessThan(0.005)
  })

  it('não confunde saldo negativo com divergência mesmo quando ambos negativos', () => {
    const sheetValues = new Map<string, { value: number; formula?: string }>()
    const txByItemMonth = new Map<string, number>()
    sheetValues.set('item-z:1', { value: -1500 })
    txByItemMonth.set('item-z:1', -1500)
    const rec = reconcileSheet('Orçamento 2026', 2026, sheetValues, txByItemMonth)
    expect(rec.ok).toBe(true)
  })
})

describe('templateMap — detectIntentionalExclusion (BUG 3: semântica histórica)', () => {
  it('marca "=E6+E7+E9" como exclusão intencional (exclui E8)', () => {
    const note = detectIntentionalExclusion('=E6+E7+E9', [6, 7, 8, 9], 5)
    expect(note).not.toBeNull()
    expect(note).toContain('8')
  })

  it('não marca "=SUM(E6:E9)" como exclusão (cobre faixa contígua)', () => {
    expect(detectIntentionalExclusion('=SUM(E6:E9)', [6, 7, 8, 9], 5)).toBeNull()
  })

  it('não marca uma fórmula que referencia todos os itens', () => {
    expect(detectIntentionalExclusion('=E6+E7+E8+E9', [6, 7, 8, 9], 5)).toBeNull()
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

  it('2025: receitas has NO "% sobre receita" total (only the 4 despesa classes + investimentos do)', () => {
    const matrix = buildSynthetic2025()
    const diag = diagnoseSheet('Orçamento 2025', matrix)
    const labels = diag.totalsFound.map((t) => t.label)
    // Part 1: receitas must NOT carry a "% sobre receita" entry — only a "Total receitas".
    expect(labels).toContain('Total receitas')
    // Exactly 5 "% sobre receita" entries (investimentos + 4 despesa classes) — NOT 6.
    // (Previously receitas added a 6th percent entry that never matched → false "não encontrado".)
    const percentLabelCount = labels.filter((l) => l === '% sobre receita').length
    expect(percentLabelCount).toBe(5)
    // The 4 despesa classes + investimentos still carry "% sobre receita".
    // buildTotalsForYear emits one percent entry per class whose percentRow != null.
    const matrix2025 = buildYearSheetMap('Orçamento 2025', 2025)
    const percentTotals = matrix2025.totals.filter((t) => t.kind === 'percent')
    const percentClasses = new Set(percentTotals.map((t) => t.classId))
    expect(percentClasses.has('receitas')).toBe(false)
    expect(percentClasses.has('investimentos')).toBe(true)
    expect(percentClasses.has('despesas_fixas')).toBe(true)
    expect(percentClasses.has('despesas_variaveis')).toBe(true)
    expect(percentClasses.has('despesas_extras')).toBe(true)
    expect(percentClasses.has('despesas_adicionais')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Part 1 — percentRow regressions per year
// ---------------------------------------------------------------------------
describe('templateMap — receitas percentRow is null (Part 1)', () => {
  it('2025: getSectionBounds(receitas).percentRow === null', () => {
    expect(getSectionBounds(2025, 'receitas')!.percentRow).toBeNull()
  })
  it('2023: getSectionBounds(receitas).percentRow === null', () => {
    expect(getSectionBounds(2023, 'receitas')!.percentRow).toBeNull()
  })
  it('2024: getSectionBounds(receitas).percentRow === null', () => {
    expect(getSectionBounds(2024, 'receitas')!.percentRow).toBeNull()
  })
  it('2026: getSectionBounds(receitas).percentRow === null', () => {
    expect(getSectionBounds(2026, 'receitas')!.percentRow).toBeNull()
  })

  it('2025: investimentos STILL has a percentRow (not nulled out)', () => {
    expect(getSectionBounds(2025, 'investimentos')!.percentRow).not.toBeNull()
    expect(getSectionBounds(2025, 'investimentos')!.percentRow).toBe(23)
  })
  it('2025: the 4 despesa classes STILL have a percentRow', () => {
    for (const c of [
      'despesas_fixas',
      'despesas_variaveis',
      'despesas_extras',
      'despesas_adicionais',
    ]) {
      expect(getSectionBounds(2025, c)!.percentRow).not.toBeNull()
    }
  })

  it('buildTotalsForYear does NOT emit a percent entry for receitas (any year)', () => {
    const matrix2025 = buildYearSheetMap('Orçamento 2025', 2025)
    const recPercent = matrix2025.totals.find(
      (t) => t.classId === 'receitas' && t.kind === 'percent',
    )
    expect(recPercent).toBeUndefined()
    // and the percent label is NOT present in the totals list at all (only one
    // "% sobre receita" per despesa/investimentos class)
    const percentClasses = new Set(
      matrix2025.totals.filter((t) => t.kind === 'percent').map((t) => t.classId),
    )
    expect(percentClasses.has('receitas')).toBe(false)
  })

  it('diagnoseSheet no longer reports "Total "% sobre receita" não encontrado" for receitas (2025)', () => {
    const matrix = buildSynthetic2025()
    // buildSynthetic2025 still has a "% sobre receita" label on row 13 (under
    // receitas) from the legacy fixture — that's fine; the point is that the
    // diagnostic no longer EXPECTS one for receitas. The totalsFound list must
    // not contain a receitas percent entry.
    const diag = diagnoseSheet('Orçamento 2025', matrix)
    const recPercent = diag.totalsFound.find(
      (t) => t.label.includes('receitas') && t.label.includes('%'),
    )
    expect(recPercent).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Part 2 — RESUMO metadata extraction
// ---------------------------------------------------------------------------
describe('templateMap — extractResumoMeta (Part 2)', () => {
  function buildResumoMatrix(): (string | number | null)[][] {
    const m: (string | number | null)[][] = []
    for (let i = 0; i <= 30; i++) m.push(new Array(8).fill(null))
    // header row 1: columns include Ano markers
    m[1][1] = 'RESUMO'
    m[1][3] = '2024'
    m[1][5] = '2025'
    // header row 2: "Observação" column header
    m[2][6] = 'Observação'
    // row 4: DESPESAS FIXAS with an observation for 2024
    m[4][1] = 'DESPESAS FIXAS'
    m[4][3] = '2024'
    m[4][6] = 'Aumento do aluguel em setembro.'
    // row 5: DESPESAS VARIÁVEIS with an observation for 2025
    m[5][1] = 'DESPESAS VARIÁVEIS'
    m[5][5] = '2025'
    m[5][6] = 'Supermercado subiu mais que a inflação.'
    // row 6: DESPESAS EXTRAS
    m[6][1] = 'DESPESAS EXTRAS'
    m[6][3] = '2024'
    m[6][6] = 'Gastos com veterinário dos gatos.'
    // row 7: DESPESAS ADICIONAIS
    m[7][1] = 'DESPESAS ADICIONAIS'
    m[7][5] = '2025'
    m[7][6] = 'Viagem internacional no meio do ano.'
    // Legend block starting at row 10
    m[10][1] = 'LEGENDA'
    m[11][1] = 'DESPESAS FIXAS'
    m[11][2] = 'Aluguel, Condomínio, Prestação moto, Plano de saúde, DAS'
    m[12][1] = 'DESPESAS VARIÁVEIS'
    m[12][2] = 'Luz, Telefone, Supermercado, Combustível'
    m[13][1] = 'DESPESAS EXTRAS'
    m[13][2] = 'Medicamentos, Farmácia, Dentista'
    m[14][1] = 'DESPESAS ADICIONAIS'
    m[14][2] = 'Viagens, Restaurantes, Roupas'
    return m
  }

  it('extracts observations tied to year + despesa class metric', () => {
    const meta = extractResumoMeta(buildResumoMatrix(), 'RESUMO')
    expect(meta.observations.length).toBe(4)
    const fixas2024 = meta.observations.find(
      (o) => o.year === 2024 && o.metric === 'despesas_fixas',
    )
    expect(fixas2024?.text).toContain('aluguel')
    const variaveis2025 = meta.observations.find(
      (o) => o.year === 2025 && o.metric === 'despesas_variaveis',
    )
    expect(variaveis2025?.text).toContain('Supermercado')
  })

  it('extracts the legend with classId + categories (no catalog categories created)', () => {
    const meta = extractResumoMeta(buildResumoMatrix(), 'RESUMO')
    expect(meta.legend.length).toBe(4)
    const fixas = meta.legend.find((l) => l.classId === 'despesas_fixas')
    expect(fixas?.categories).toContain('Aluguel')
    expect(fixas?.categories).toContain('Condomínio')
    const adicionais = meta.legend.find((l) => l.classId === 'despesas_adicionais')
    expect(adicionais?.categories).toContain('Viagens')
    // purely descriptive metadata — no id-shaped catalog entries are produced
    expect(meta.legend.some((l) => l.categories.some((c) => c.startsWith('cat-')))).toBe(false)
  })

  it('reports the years found in the header/rows', () => {
    const meta = extractResumoMeta(buildResumoMatrix(), 'RESUMO')
    expect(meta.yearsFound).toContain(2024)
    expect(meta.yearsFound).toContain(2025)
  })

  it('is defensive: returns empty result on a blank matrix (no throws)', () => {
    const blank: (string | number | null)[][] = []
    expect(() => extractResumoMeta(blank, 'RESUMO')).not.toThrow()
    const meta = extractResumoMeta(blank, 'RESUMO')
    expect(meta.observations).toEqual([])
    expect(meta.legend).toEqual([])
    expect(meta.yearsFound).toEqual([])
  })

  it('isAuxiliarySheet still returns true for RESUMO (still skipped in the tx loop)', () => {
    expect(isAuxiliarySheet('RESUMO')).toBe(true)
    expect(isAuxiliarySheet('Resumo Geral')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// BUG 4 — extractResumoMeta: year-block scanning, deep obs header, legend
// filtering. Mirrors the real RESUMO layout: legend at M2:N6, obs header deep
// in the sheet, year-block headers at A1/A11/A24, Investimentos/Receitas near
// the legend (which the old code erroneously counted as a 5th legend class).
// ---------------------------------------------------------------------------
describe('templateMap — extractResumoMeta (BUG 4)', () => {
  function buildResumoMatrixBug4(): (string | number | null)[][] {
    const m: (string | number | null)[][] = []
    for (let i = 0; i <= 30; i++) m.push(new Array(15).fill(null))
    // Year-block headers (A1=2023, A10=2024, A20=2025)
    m[1][1] = '2023'
    m[10][1] = '2024'
    m[20][1] = '2025'
    // Legend block: "LEGENDA" header + 4 despesa rows + stray Investimentos/Receitas
    m[1][13] = 'LEGENDA'
    m[2][13] = 'DESPESAS FIXAS'
    m[2][14] = 'Aluguel, Condomínio, 1500, R$ 200'
    m[3][13] = 'DESPESAS VARIÁVEIS'
    m[3][14] = 'Luz, Supermercado'
    m[4][13] = 'DESPESAS EXTRAS'
    m[4][14] = 'Médico, Farmácia'
    m[5][13] = 'DESPESAS ADICIONAIS'
    m[5][14] = 'Viagens, Roupas'
    // 5th & 6th class near the legend — must be EXCLUDED
    m[6][13] = 'INVESTIMENTOS'
    m[6][14] = 'Cripto, Tesouro'
    m[7][1] = 'RECEITAS'
    m[7][14] = 'Salário'
    // Observation header deep in the sheet (row 20, col M = 13) — old code only
    // searched rows 1..6 and would miss this.
    m[20][13] = 'Observação'
    // Observations in the 2025 block (rows 21-22, class in col A, text in col M)
    m[21][1] = 'DESPESAS FIXAS'
    m[21][13] = 'Aumento do aluguel em setembro.'
    m[22][1] = 'DESPESAS VARIÁVEIS'
    m[22][13] = 'Supermercado subiu mais que a inflação.'
    return m
  }

  it('BUG4a: reconhece 2023, 2024 e 2025 (não apenas 2023)', () => {
    const meta = extractResumoMeta(buildResumoMatrixBug4(), 'RESUMO')
    expect(meta.yearsFound).toContain(2023)
    expect(meta.yearsFound).toContain(2024)
    expect(meta.yearsFound).toContain(2025)
    expect(meta.yearsFound.length).toBeGreaterThanOrEqual(3)
  })

  it('BUG4b: importa observações quando o header está profundo na aba (linha 20)', () => {
    const meta = extractResumoMeta(buildResumoMatrixBug4(), 'RESUMO')
    expect(meta.observations.length).toBeGreaterThanOrEqual(2)
    const fixas = meta.observations.find((o) => o.metric === 'despesas_fixas')
    expect(fixas?.text).toContain('aluguel')
    expect(fixas?.year).toBe(2025) // inherited from the A20 block header
    const variaveis = meta.observations.find((o) => o.metric === 'despesas_variaveis')
    expect(variaveis?.text).toContain('Supermercado')
    expect(variaveis?.year).toBe(2025)
  })

  it('BUG4c: legenda tem exatamente 4 classes (não 5)', () => {
    const meta = extractResumoMeta(buildResumoMatrixBug4(), 'RESUMO')
    expect(meta.legend).toHaveLength(4)
    const ids = meta.legend.map((l) => l.classId)
    expect(ids).toContain('despesas_fixas')
    expect(ids).toContain('despesas_variaveis')
    expect(ids).toContain('despesas_extras')
    expect(ids).toContain('despesas_adicionais')
  })

  it('BUG4c: legenda não contém números nem "R$" como categorias', () => {
    const meta = extractResumoMeta(buildResumoMatrixBug4(), 'RESUMO')
    const allCats = meta.legend.flatMap((l) => l.categories)
    // "1500" and "R$ 200" were in the fixas category list — they must be filtered
    for (const c of allCats) {
      expect(/^\d+(?:[.,]\d+)?$/.test(c)).toBe(false)
      expect(c.toUpperCase().startsWith('R$')).toBe(false)
    }
  })

  it('BUG4c: Investimentos NÃO aparece como classe da legenda', () => {
    const meta = extractResumoMeta(buildResumoMatrixBug4(), 'RESUMO')
    expect(meta.legend.some((l) => l.classId === 'investimentos')).toBe(false)
    expect(meta.legend.some((l) => l.classId === 'receitas')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Part 3 — computeAnnualSummary
// ---------------------------------------------------------------------------
describe('annualSummaryService — computeAnnualSummary (Part 3)', () => {
  // minimal item catalog covering the classes we exercise
  const items: FinancialItem[] = [
    {
      id: 'item-salario',
      classId: 'receitas',
      categoryId: null,
      name: 'Salário',
      color: '#000',
      keywords: [],
      aliases: [],
      active: true,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'item-cripto',
      classId: 'investimentos',
      categoryId: null,
      name: 'Cripto',
      color: '#000',
      keywords: [],
      aliases: [],
      active: true,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'item-aluguel',
      classId: 'despesas_fixas',
      categoryId: 'cat-fixas-habitacao',
      name: 'Aluguel',
      color: '#000',
      keywords: [],
      aliases: [],
      active: true,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'item-emprestimo',
      classId: 'despesas_fixas',
      categoryId: 'cat-fixas-outros',
      name: 'Empréstimo',
      color: '#000',
      keywords: [],
      aliases: [],
      active: true,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'item-supermercado',
      classId: 'despesas_variaveis',
      categoryId: 'cat-variaveis-alimentacao',
      name: 'Supermercado',
      color: '#000',
      keywords: [],
      aliases: [],
      active: true,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'item-medicamentos',
      classId: 'despesas_extras',
      categoryId: 'cat-extras-saude',
      name: 'Medicamentos',
      color: '#000',
      keywords: [],
      aliases: [],
      active: true,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'item-viagens',
      classId: 'despesas_adicionais',
      categoryId: 'cat-adicionais-lazer',
      name: 'Viagens',
      color: '#000',
      keywords: [],
      aliases: [],
      active: true,
      createdAt: '',
      updatedAt: '',
    },
  ]
  const itemClassById = buildItemClassLookup(items)

  function tx(
    id: string,
    date: string,
    amount: number,
    type: Transaction['type'],
    itemId: string,
  ): Transaction {
    return {
      id,
      date,
      description: '',
      amount,
      type,
      categoryId: null,
      itemId,
      needsReview: false,
      createdAt: '',
      updatedAt: '',
    }
  }

  function syntheticTxSet(): Transaction[] {
    return [
      // 2024
      tx('a', '2024-01-15', 5000, 'income', 'item-salario'),
      tx('b', '2024-01-15', 1000, 'investment_in', 'item-cripto'),
      tx('c', '2024-01-15', 800, 'expense', 'item-aluguel'),
      tx('d', '2024-01-15', 200, 'expense', 'item-emprestimo'), // emprestimo 2024
      tx('e', '2024-02-15', 400, 'expense', 'item-supermercado'),
      tx('f', '2024-03-15', 100, 'expense', 'item-medicamentos'),
      tx('g', '2024-04-15', 300, 'expense', 'item-viagens'),
      // 2025
      tx('h', '2025-01-15', 6000, 'income', 'item-salario'),
      tx('i', '2025-01-15', 1500, 'investment_in', 'item-cripto'),
      tx('j', '2025-01-15', 880, 'expense', 'item-aluguel'), // +80 vs 2024
      tx('k', '2025-01-15', 300, 'expense', 'item-emprestimo'), // emprestimo 2025 = 300
      tx('l', '2025-02-15', 480, 'expense', 'item-supermercado'), // +80 vs 2024
      tx('m', '2025-03-15', 100, 'expense', 'item-medicamentos'), // 0 diff
      tx('n', '2025-04-15', 600, 'expense', 'item-viagens'), // +300 vs 2024
    ]
  }

  it('computes correct per-class totals per year', () => {
    const summary = computeAnnualSummary(
      syntheticTxSet(),
      [2024, 2025],
      'item-emprestimo',
      itemClassById,
    )
    const y2024 = summary.find((s) => s.year === 2024)!
    expect(y2024.receitas).toBe(5000)
    expect(y2024.investimentos).toBe(1000)
    expect(y2024.despesas_fixas).toBe(1000) // 800 aluguel + 200 emprestimo
    expect(y2024.despesas_variaveis).toBe(400)
    expect(y2024.despesas_extras).toBe(100)
    expect(y2024.despesas_adicionais).toBe(300)
    const y2025 = summary.find((s) => s.year === 2025)!
    expect(y2025.receitas).toBe(6000)
    expect(y2025.despesas_fixas).toBe(1180) // 880 + 300
    expect(y2025.despesas_variaveis).toBe(480)
  })

  it('totalDespesas = fixas + variaveis + extras + adicionais (receitas/investimentos excluded)', () => {
    const summary = computeAnnualSummary(
      syntheticTxSet(),
      [2024, 2025],
      'item-emprestimo',
      itemClassById,
    )
    for (const s of summary) {
      expect(s.totalDespesas).toBe(
        Math.round(
          (s.despesas_fixas + s.despesas_variaveis + s.despesas_extras + s.despesas_adicionais) *
            100,
        ) / 100,
      )
      // receitas and investimentos are NOT part of totalDespesas: rebuilding
      // totalDespesas with them would change the value.
      const withIncome =
        Math.round(
          (s.despesas_fixas +
            s.despesas_variaveis +
            s.despesas_extras +
            s.despesas_adicionais +
            s.receitas +
            s.investimentos) *
            100,
        ) / 100
      expect(withIncome).not.toBe(s.totalDespesas)
    }
  })

  it('composition percentages sum to ~100% of totalDespesas', () => {
    const summary = computeAnnualSummary(
      syntheticTxSet(),
      [2024, 2025],
      'item-emprestimo',
      itemClassById,
    )
    const y2024 = summary.find((s) => s.year === 2024)!
    expect(y2024.totalDespesas).toBe(1800)
    const sum =
      (y2024.pct_fixas ?? 0) +
      (y2024.pct_variaveis ?? 0) +
      (y2024.pct_extras ?? 0) +
      (y2024.pct_adicionais ?? 0)
    expect(sum).toBeCloseTo(1, 2) // 100% expressed as 1.0
    // fixas = 1000/1800 ≈ 0.5556
    expect(y2024.pct_fixas).toBeCloseTo(1000 / 1800, 2)
  })

  it('first available year has all diffs = null (no prior year to compare)', () => {
    const summary = computeAnnualSummary(
      syntheticTxSet(),
      [2024, 2025],
      'item-emprestimo',
      itemClassById,
    )
    const y2024 = summary[0]
    expect(y2024.year).toBe(2024)
    expect(y2024.diff_fixas).toBeNull()
    expect(y2024.diff_totalDespesas).toBeNull()
    expect(y2024.diff_receitas).toBeNull()
    expect(y2024.diffPct_fixas).toBeNull()
    expect(y2024.diffPct_totalDespesas).toBeNull()
    // sem-emprestimo scenario diffs also null for the first year
    expect(y2024.semEmprestimo.diff_fixas).toBeNull()
    expect(y2024.semEmprestimo.diff_totalDespesas).toBeNull()
  })

  it('YoY diff (R$) = current - previous, % diff = diff / |previous|', () => {
    const summary = computeAnnualSummary(
      syntheticTxSet(),
      [2024, 2025],
      'item-emprestimo',
      itemClassById,
    )
    const y2025 = summary[1]
    // fixas: 1180 - 1000 = 180
    expect(y2025.diff_fixas).toBe(180)
    // pct: 180 / 1000 = 0.18
    expect(y2025.diffPct_fixas).toBeCloseTo(0.18, 2)
    // totalDespesas: (880+300+480+100+600) - (800+200+400+100+300) = 2360 - 1800 = 560
    expect(y2025.diff_totalDespesas).toBe(560)
    expect(y2025.diffPct_totalDespesas).toBeCloseTo(560 / 1800, 2)
    // receitas: 6000 - 5000 = 1000
    expect(y2025.diff_receitas).toBe(1000)
  })

  it('cenário sem empréstimo: subtracts emprestimoAnual from fixas only; other classes unchanged', () => {
    const summary = computeAnnualSummary(
      syntheticTxSet(),
      [2024, 2025],
      'item-emprestimo',
      itemClassById,
    )
    const y2024 = summary[0]
    // emprestimoAnual 2024 = 200
    expect(y2024.emprestimoAnual).toBe(200)
    expect(y2024.semEmprestimo.despesas_fixas).toBe(800) // 1000 - 200
    // other classes unchanged
    expect(y2024.semEmprestimo.pct_variaveis).not.toBeNull()
    // totalDespesas_sem_emprestimo = 800 + 400 + 100 + 300 = 1600
    expect(y2024.semEmprestimo.totalDespesas).toBe(1600)
    // recompose pct using the new denominator
    expect(y2024.semEmprestimo.pct_fixas).toBeCloseTo(800 / 1600, 2)
    expect(y2024.semEmprestimo.pct_variaveis).toBeCloseTo(400 / 1600, 2)
  })

  it('empréstimo acumulado = running sum up to and including the current year', () => {
    const summary = computeAnnualSummary(
      syntheticTxSet(),
      [2024, 2025],
      'item-emprestimo',
      itemClassById,
    )
    expect(summary[0].emprestimoAcumulado).toBe(200) // 2024 only
    expect(summary[1].emprestimoAcumulado).toBe(500) // 200 + 300
  })

  it('cenário sem empréstimo YoY compares "atual sem" vs "anterior sem"', () => {
    const summary = computeAnnualSummary(
      syntheticTxSet(),
      [2024, 2025],
      'item-emprestimo',
      itemClassById,
    )
    const y2025 = summary[1]
    // sem fixas 2025 = 1180 - 300 = 880; sem fixas 2024 = 1000 - 200 = 800 → diff 80
    expect(y2025.semEmprestimo.despesas_fixas).toBe(880)
    expect(y2025.semEmprestimo.diff_fixas).toBe(80)
    // sem total 2025 = 880 + 480 + 100 + 600 = 2060; sem total 2024 = 1600 → 460
    expect(y2025.semEmprestimo.totalDespesas).toBe(2060)
    expect(y2025.semEmprestimo.diff_totalDespesas).toBe(460)
  })

  it('never produces Infinity/NaN — division by zero returns null', () => {
    // year with zero transactions → totalDespesas = 0 → all pct_* null, not Infinity
    const empty: Transaction[] = []
    const summary = computeAnnualSummary(empty, [2024, 2025], 'item-emprestimo', itemClassById)
    for (const s of summary) {
      for (const pct of [s.pct_fixas, s.pct_variaveis, s.pct_extras, s.pct_adicionais]) {
        expect(pct).toBeNull()
      }
      expect(s.totalDespesas).toBe(0)
      expect(Number.isFinite(s.totalDespesas)).toBe(true)
      // sem-emprestimo also null (no Infinity)
      expect(s.semEmprestimo.pct_fixas).toBeNull()
      expect(s.semEmprestimo.pct_variaveis).toBeNull()
      expect(Number.isFinite(s.semEmprestimo.totalDespesas)).toBe(true)
    }
  })

  it('diffPct returns null when the previous value is 0 (no #DIV/0!)', () => {
    // 2024 has 0 in some class (despesas_adicionais=300, but let's force a 0
    // by removing the viagens tx of 2024)
    const txs = syntheticTxSet().filter((t) => t.id !== 'g') // remove 2024 viagens
    const summary = computeAnnualSummary(txs, [2024, 2025], 'item-emprestimo', itemClassById)
    const y2025 = summary[1]
    // 2024 adicionais = 0 → diffPct_adicionais for 2025 must be null
    expect(y2025.diffPct_adicionais).toBeNull()
    // but the R$ diff is still computed (600 - 0 = 600)
    expect(y2025.diff_adicionais).toBe(600)
  })

  it('carries the qualitative observations filtered by year', () => {
    const observacoes = [
      { year: 2024, metric: 'despesas_fixas', text: 'Aluguel subiu.' },
      { year: 2025, metric: 'despesas_variaveis', text: 'Supermercado caro.' },
    ]
    const summary = computeAnnualSummary(
      syntheticTxSet(),
      [2024, 2025],
      'item-emprestimo',
      itemClassById,
      observacoes,
    )
    const y2024 = summary.find((s) => s.year === 2024)!
    expect(y2024.observacoes.length).toBe(1)
    expect(y2024.observacoes[0].text).toContain('Aluguel')
    const y2025 = summary.find((s) => s.year === 2025)!
    expect(y2025.observacoes.length).toBe(1)
    expect(y2025.observacoes[0].metric).toBe('despesas_variaveis')
  })
})

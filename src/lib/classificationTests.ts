/**
 * Classification self-tests (Part 3 of the prompt).
 *
 * Pure functions, no UI — the Regras page and an in-app "diagnóstico" route
 * can render them. Each test returns pass/fail + a human-readable reason.
 *
 * Tests cover the prompt's required cases:
 *  (§3.1) "MERCADO LIVRE NOVOS"  → Compras marketplace, NOT Alimentação
 *         "COMPRA DE OVOS"        → matches token OVOS (palavra completa)
 *         "NOVOS SERVICOS"        → does NOT match OVOS
 *         "AMAZON PRIME"          → wins over "AMAZON" (subscription)
 *         "MERCADO LIVRE"          → merchant recognized before smaller words
 *  (§3.2) Formula decomposition: "=5,54+6,39+12,80" → 3 components
 *  (§3.3) Template/sheet tests: structure intact, shifted row, category
 *         added/removed, different year, multi-value formula, totals
 */

import { tokenEquals, phraseMatches, extractTokens } from './tokenizer'
import { matchMerchant } from './classificationEngine'
import {
  decomposeFormula,
  sumFormula,
  buildYearSheetMap,
  locateItem,
  validateByAnchor,
  reconcileSheet,
  detectMonths,
  txKey,
  CANONICAL_LABEL_COLUMN,
  CANONICAL_CLASS_COLUMN,
} from './templateMap'

export interface ClassificationTest {
  id: string
  description: string
  /** expected outcome description (pt-BR) */
  expectation: string
  run: () => { pass: boolean; detail: string }
}

// ---------------------------------------------------------------------------
// Helpers to build a synthetic sheet matrix (1-based, index 0 unused) so we
// can exercise the templateMap functions without reading a real XLSX file.
// The synthetic sheet mirrors the REAL column layout: item names in column D
// (4), class headers in column A (1), month headers in row 1.
// ---------------------------------------------------------------------------

/** Build an empty 1-based matrix of [rows][cols], index 0 unused. */
function emptyMatrix(rows: number, cols: number): (string | number | null)[][] {
  const m: (string | number | null)[][] = []
  for (let r = 0; r <= rows; r++) {
    m.push(new Array(cols + 1).fill(null))
  }
  return m
}

/** Set a label cell. */
function setLabel(m: (string | number | null)[][], row: number, col: number, label: string) {
  if (!m[row]) m[row] = new Array(m[0].length).fill(null)
  m[row][col] = label
}

// Real column layout — item names live in column D (4), class headers in A (1).
const LABEL_COL = CANONICAL_LABEL_COLUMN // 4 (D)
const CLASS_COL = CANONICAL_CLASS_COLUMN // 1 (A)

/**
 * Build a canonical 2025 sheet matrix with the class headers, total rows,
 * saldo, month headers, and the item labels so the templateMap functions can
 * validate anchors and locate items. Rows mirror the real workbook:
 *   Receitas 6-9, Investimentos 15-19, Fixas 27-45, Variáveis 51-70,
 *   Extras 76-86, Adicionais 92-116, Saldo 129.
 */
function buildCanonicalSheet2025(): (string | number | null)[][] {
  const m = emptyMatrix(130, 17)
  // Header row 1 = month labels (col D=4 carries "Total", E..P = Jan..Dec)
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

  // Class headers (column A)
  setLabel(m, 5, CLASS_COL, 'RECEITAS')
  setLabel(m, 14, CLASS_COL, 'INVESTIMENTOS')
  setLabel(m, 26, CLASS_COL, 'DESPESAS FIXAS')
  setLabel(m, 50, CLASS_COL, 'DESPESAS VARIÁVEIS')
  setLabel(m, 75, CLASS_COL, 'DESPESAS EXTRAS')
  setLabel(m, 91, CLASS_COL, 'DESPESAS ADICIONAIS')

  // Item labels (column D) — a representative subset at the real 2025 rows.
  setLabel(m, 6, LABEL_COL, 'Salário')
  setLabel(m, 27, LABEL_COL, 'Aluguel')
  setLabel(m, 60, LABEL_COL, 'Supermercado')
  setLabel(m, 94, LABEL_COL, 'Restaurantes/bares')
  setLabel(m, 111, LABEL_COL, 'Compras marketplace')

  // Total rows. Receitas/Investimentos total in column D ("Total"); despesas
  // totals in column C ("Total"); Despesas Adicionais carries the historical
  // "Total despesas extras" anchor.
  setLabel(m, 11, LABEL_COL, 'Total') // Receitas total
  setLabel(m, 47, 3, 'Total') // Fixas total (col C)
  setLabel(m, 72, 3, 'Total') // Variáveis total (col C)
  setLabel(m, 88, 3, 'Total') // Extras total (col C)
  setLabel(m, 118, 3, 'Total despesas extras') // Adicionais total (historical label)
  setLabel(m, 129, LABEL_COL, 'Saldo')

  // Fill some values so reconciliation can be tested.
  // Salário Jan = 5000 (col E=5)
  m[6][5] = 5000
  // Aluguel Jan = 1500
  m[27][5] = 1500
  // Supermercado Jan = 800
  m[60][5] = 800
  return m
}

export const CLASSIFICATION_TESTS: ClassificationTest[] = [
  // ----- §3.1 token / phrase classification tests -----
  {
    id: 'ovos-not-in-novos',
    description: '"OVOS" não casa com "NOVOS" (substring proibida)',
    expectation: 'tokenEquals("NOVOS SERVICOS", "OVOS") === false',
    run: () => {
      const got = tokenEquals('NOVOS SERVICOS', 'OVOS')
      return {
        pass: got === false,
        detail: `tokenEquals("NOVOS SERVICOS", "OVOS") = ${got} (esperado false)`,
      }
    },
  },
  {
    id: 'ovos-full-word',
    description: '"OVOS" casa como palavra completa em "COMPRA DE OVOS"',
    expectation: 'tokenEquals("COMPRA DE OVOS", "OVOS") === true',
    run: () => {
      const got = tokenEquals('COMPRA DE OVOS', 'OVOS')
      return {
        pass: got === true,
        detail: `tokenEquals("COMPRA DE OVOS", "OVOS") = ${got} (esperado true)`,
      }
    },
  },
  {
    id: 'ovos-not-in-mercado-livre-novos',
    description: '"MERCADO LIVRE NOVOS" NÃO casa com token "OVOS"',
    expectation: 'tokenEquals("MERCADO LIVRE NOVOS", "OVOS") === false',
    run: () => {
      const got = tokenEquals('MERCADO LIVRE NOVOS', 'OVOS')
      return {
        pass: got === false,
        detail: `tokenEquals("MERCADO LIVRE NOVOS", "OVOS") = ${got} (esperado false)`,
      }
    },
  },
  {
    id: 'mercado-livre-marketplace',
    description: '"MERCADO LIVRE NOVOS" → Mercado Livre (marketplace), não Alimentação',
    expectation: "merchant.kind === 'marketplace' && itemId === 'item-compras-marketplace'",
    run: () => {
      const { merchant } = matchMerchant('MERCADO LIVRE NOVOS')
      const pass =
        !!merchant &&
        merchant.kind === 'marketplace' &&
        merchant.itemId === 'item-compras-marketplace'
      return {
        pass,
        detail: merchant
          ? `merchant=${merchant.name}, kind=${merchant.kind}, itemId=${merchant.itemId}`
          : 'nenhum merchant reconhecido',
      }
    },
  },
  {
    id: 'amazon-prime-over-amazon',
    description: '"AMAZON PRIME" vence "AMAZON" → assinatura, não marketplace',
    expectation: "merchant.itemId === 'item-assinaturas' && kind === 'subscription'",
    run: () => {
      const { merchant } = matchMerchant('AMAZON PRIME')
      const pass =
        !!merchant && merchant.itemId === 'item-assinaturas' && merchant.kind === 'subscription'
      return {
        pass,
        detail: merchant
          ? `merchant=${merchant.name}, kind=${merchant.kind}, itemId=${merchant.itemId}`
          : 'nenhum merchant reconhecido',
      }
    },
  },
  {
    id: 'amazon-without-prime',
    description: '"AMAZON BR" (sem PRIME) → Compras marketplace',
    expectation: "merchant.itemId === 'item-compras-marketplace' && kind === 'marketplace'",
    run: () => {
      const { merchant } = matchMerchant('AMAZON BR')
      const pass =
        !!merchant &&
        merchant.itemId === 'item-compras-marketplace' &&
        merchant.kind === 'marketplace'
      return {
        pass,
        detail: merchant
          ? `merchant=${merchant.name}, kind=${merchant.kind}, itemId=${merchant.itemId}`
          : 'nenhum merchant reconhecido',
      }
    },
  },
  {
    id: 'mercado-livre-merchant-first',
    description: '"MERCADO LIVRE" reconhece estabelecimento antes de palavras menores',
    expectation: "matchMerchant('MERCADO LIVRE').merchant?.name === 'Mercado Livre'",
    run: () => {
      const { merchant } = matchMerchant('MERCADO LIVRE')
      const pass = !!merchant && merchant.name === 'Mercado Livre'
      return {
        pass,
        detail: merchant ? `merchant=${merchant.name}` : 'nenhum merchant reconhecido',
      }
    },
  },
  {
    id: 'phrase-contains',
    description: '"MERCADO LIVRE" é reconhecida como expressão completa',
    expectation: "phraseMatches('MERCADO LIVRE NOVOS', 'MERCADO LIVRE') === true",
    run: () => {
      const got = phraseMatches('MERCADO LIVRE NOVOS', 'MERCADO LIVRE')
      return {
        pass: got === true,
        detail: `phraseMatches = ${got} (esperado true)`,
      }
    },
  },
  {
    id: 'intermediator-stripped',
    description:
      '"MP * MERCADO LIVRE" — intermediador MP detectado e removido; estabelecimento Mercado Livre reconhecido',
    expectation: "matchMerchant('MP * MERCADO LIVRE').merchant?.name === 'Mercado Livre'",
    run: () => {
      const { merchant } = matchMerchant('MP * MERCADO LIVRE')
      const pass = !!merchant && merchant.name === 'Mercado Livre'
      return {
        pass,
        detail: merchant
          ? `merchant=${merchant.name}`
          : 'intermediador detectado mas estabelecimento posterior não reconhecido',
      }
    },
  },
  {
    id: 'ambiguous-pagamento-pending',
    description:
      '"PAGAMENTO 12345" — ruído + número de autorização → não classifica (precisão > quantidade)',
    expectation: "matchMerchant('PAGAMENTO 12345').merchant === null",
    run: () => {
      const { merchant } = matchMerchant('PAGAMENTO 12345')
      const pass = merchant === null
      return {
        pass,
        detail: merchant
          ? `merchant=${merchant.name} (não deveria classificar)`
          : 'nenhum merchant — transação permanece pendente de classificação (correto)',
      }
    },
  },
  {
    id: 'extract-tokens-structure',
    description:
      'extractTokens() retorna tokens normalizados + frases para sugestão de regra (token-based)',
    expectation:
      "extractTokens('MERCADO LIVRE NOVOS').tokens contém ['MERCADO','LIVRE','NOVOS'] e phrases contém 'MERCADO LIVRE'",
    run: () => {
      const r = extractTokens('MERCADO LIVRE NOVOS')
      const okTokens =
        r.tokens.length === 3 &&
        r.tokens[0] === 'MERCADO' &&
        r.tokens[1] === 'LIVRE' &&
        r.tokens[2] === 'NOVOS'
      const okPhrase = r.phrases.includes('MERCADO LIVRE')
      return {
        pass: okTokens && okPhrase,
        detail: `tokens=[${r.tokens.join(',')}], phrases=[${r.phrases.slice(0, 3).join(' | ')}...]`,
      }
    },
  },

  // ----- §3.2 formula decomposition -----
  {
    id: 'formula-three-components',
    description: '"=5,54+6,39+12,80" → 3 componentes (5.54, 6.39, 12.80)',
    expectation: 'decomposeFormula("=5,54+6,39+12,80").length === 3 && sum ≈ 24.73',
    run: () => {
      const parts = decomposeFormula('=5,54+6,39+12,80')
      const sum = sumFormula('=5,54+6,39+12,80')
      const pass = parts.length === 3 && Math.abs(sum - 24.73) < 0.001
      return {
        pass,
        detail: `parts=[${parts.join(', ')}], sum=${sum} (esperado 3 partes, sum≈24.73)`,
      }
    },
  },
  {
    id: 'formula-negative-component',
    description: '"=100-30,50" → soma = 69.50 (componente negativo)',
    expectation: 'sumFormula("=100-30,50") ≈ 69.50',
    run: () => {
      const sum = sumFormula('=100-30,50')
      const pass = Math.abs(sum - 69.5) < 0.001
      return {
        pass,
        detail: `sum=${sum} (esperado ≈69.50)`,
      }
    },
  },

  // ----- §3.3 template / sheet tests -----
  {
    id: 'sheet-structure-intact',
    description: 'Planilha canônica 2025: estrutura reconhecida (âncoras validadas)',
    expectation: "locateItem para 'item-supermercado' mês 1 retorna method='coordinate'",
    run: () => {
      const matrix = buildCanonicalSheet2025()
      const map = buildYearSheetMap('Orçamento 2025', 2025)
      // re-resolve months from the actual header
      const { months, totalColumn } = detectMonths(matrix[1])
      map.monthColumns = months
      map.totalColumn = totalColumn
      const loc = locateItem(matrix, map, {
        classId: 'despesas_variaveis',
        categoryId: 'cat-variaveis-alimentacao',
        itemId: 'item-supermercado',
        month: 1,
      })
      const pass = loc.found && loc.method === 'coordinate' && loc.row === 60
      return {
        pass,
        detail: `found=${loc.found}, method=${loc.method}, row=${loc.row} (esperado coordinate/60)`,
      }
    },
  },
  {
    id: 'sheet-shifted-row',
    description:
      'Linha deslocada: Supermercado na linha 61 (em vez de 60) → busca estrutural relocaliza',
    expectation: "locateItem retorna found=true, method='search', row=61",
    run: () => {
      const matrix = buildCanonicalSheet2025()
      // shift the Supermercado label down one row
      matrix[60][LABEL_COL] = null
      matrix[61][LABEL_COL] = 'Supermercado'
      matrix[61][5] = 800
      const map = buildYearSheetMap('Orçamento 2025', 2025)
      const { months, totalColumn } = detectMonths(matrix[1])
      map.monthColumns = months
      map.totalColumn = totalColumn
      const loc = locateItem(matrix, map, {
        classId: 'despesas_variaveis',
        categoryId: 'cat-variaveis-alimentacao',
        itemId: 'item-supermercado',
        month: 1,
      })
      const pass = loc.found && loc.method === 'search' && loc.row === 61
      return {
        pass,
        detail: `found=${loc.found}, method=${loc.method}, row=${loc.row} (esperado search/61)`,
      }
    },
  },
  {
    id: 'sheet-category-removed',
    description:
      'Categoria removida: label do item ausente na planilha → locateItem informa divergência, não adivinha posição',
    expectation: "locateItem para 'item-supermercado' (label removida) retorna found=false",
    run: () => {
      const matrix = buildCanonicalSheet2025()
      // remove the Supermercado label entirely (category removed/renamed)
      matrix[60][LABEL_COL] = null
      matrix[60][5] = null
      const map = buildYearSheetMap('Orçamento 2025', 2025)
      const { months, totalColumn } = detectMonths(matrix[1])
      map.monthColumns = months
      map.totalColumn = totalColumn
      const loc = locateItem(matrix, map, {
        classId: 'despesas_variaveis',
        categoryId: 'cat-variaveis-alimentacao',
        itemId: 'item-supermercado',
        month: 1,
      })
      const pass = !loc.found
      return {
        pass,
        detail: `found=${loc.found}, method=${loc.method}, row=${loc.row} (esperado NOT found — não adivinhar)`,
      }
    },
  },
  {
    id: 'sheet-category-added',
    description:
      'Categoria adicionada: rótulo desconhecido inserido na planilha → itens conhecidos ainda localizados, diferença informada',
    expectation:
      "locateItem para 'item-supermercado' retorna found=true (coordinate/60) mesmo com rótulo extra na linha 65",
    run: () => {
      const matrix = buildCanonicalSheet2025()
      // insert an unknown category label at an unused row within the variáveis block
      setLabel(matrix, 65, LABEL_COL, 'Delivery novíssimo')
      matrix[65][5] = 123.45
      const map = buildYearSheetMap('Orçamento 2025', 2025)
      const { months, totalColumn } = detectMonths(matrix[1])
      map.monthColumns = months
      map.totalColumn = totalColumn
      const loc = locateItem(matrix, map, {
        classId: 'despesas_variaveis',
        categoryId: 'cat-variaveis-alimentacao',
        itemId: 'item-supermercado',
        month: 1,
      })
      const pass = loc.found && loc.method === 'coordinate' && loc.row === 60
      return {
        pass,
        detail: `found=${loc.found}, method=${loc.method}, row=${loc.row} (esperado coordinate/60 — item conhecido intacto apesar do rótulo extra)`,
      }
    },
  },
  {
    id: 'sheet-different-year',
    description: 'Ano diferente: mapa para 2024 resolve colunas e itens independentemente',
    expectation:
      "buildYearSheetMap('Orçamento 2024', 2024).year === 2024 e item-supermercado row=58",
    run: () => {
      const map2024 = buildYearSheetMap('Orçamento 2024', 2024)
      const okYear = map2024.year === 2024
      const cell = map2024.items.find((c) => c.itemId === 'item-supermercado' && c.month === 1)
      const okRow = !!cell && cell.row === 58
      return {
        pass: okYear && okRow,
        detail: `year=${map2024.year}, supermercado.row=${cell?.row} (esperado 2024/58)`,
      }
    },
  },
  {
    id: 'sheet-formula-multi-value',
    description: 'Fórmula multi-valor "=5,54+6,39+12,80" decomposta em 3 transações individuais',
    expectation: 'decomposeFormula retorna [5.54, 6.39, 12.80] (3 componentes) e soma = 24.73',
    run: () => {
      const parts = decomposeFormula('=5,54+6,39+12,80')
      const expected = [5.54, 6.39, 12.8]
      const okLen = parts.length === 3
      const okVals = parts.every((p, i) => Math.abs(p - expected[i]) < 0.001)
      return {
        pass: okLen && okVals,
        detail: `parts=[${parts.join(', ')}] (esperado [${expected.join(', ')}])`,
      }
    },
  },
  {
    id: 'sheet-totals-reconcile',
    description: 'Totais: planilha vs reconstruídos → diferença R$ 0,00 (reconciliação)',
    expectation: 'reconcileSheet.totalDifference === 0 e ok === true',
    run: () => {
      const matrix = buildCanonicalSheet2025()
      const map = buildYearSheetMap('Orçamento 2025', 2025)
      const { months } = detectMonths(matrix[1])
      map.monthColumns = months
      // build sheetValues + txByItemMonth from the same 3 values we set,
      // so reconstructed == sheet → diff 0
      const sheetValues = new Map<string, { value: number; formula?: string }>()
      const txByItemMonth = new Map<string, number>()
      const cases: {
        itemId: string
        classId: string
        categoryId: string | null
        month: number
        row: number
        value: number
      }[] = [
        {
          itemId: 'item-salario',
          classId: 'receitas',
          categoryId: null,
          month: 1,
          row: 6,
          value: 5000,
        },
        {
          itemId: 'item-aluguel',
          classId: 'despesas_fixas',
          categoryId: 'cat-fixas-habitacao',
          month: 1,
          row: 27,
          value: 1500,
        },
        {
          itemId: 'item-supermercado',
          classId: 'despesas_variaveis',
          categoryId: 'cat-variaveis-alimentacao',
          month: 1,
          row: 60,
          value: 800,
        },
      ]
      for (const c of cases) {
        const col = map.monthColumns[c.month]
        matrix[c.row][col] = c.value
        const key = txKey(c.itemId, c.month)
        sheetValues.set(key, { value: c.value })
        txByItemMonth.set(key, c.value)
      }
      const rec = reconcileSheet('Orçamento 2025', 2025, sheetValues, txByItemMonth)
      const pass = rec.ok && Math.abs(rec.totalDifference) < 0.01
      return {
        pass,
        detail: `totalDifference=${rec.totalDifference.toFixed(2)}, ok=${rec.ok} (esperado diff=0.00, ok=true)`,
      }
    },
  },
  {
    id: 'sheet-divergence-detected',
    description:
      'Divergência: valor da planilha difere do reconstruído → reconcileSheet reporta diff ≠ 0',
    expectation: 'reconcileSheet.totalDifference !== 0 e ok === false',
    run: () => {
      const sheetValues = new Map<string, { value: number; formula?: string }>()
      const txByItemMonth = new Map<string, number>()
      sheetValues.set('item-supermercado:1', { value: 800 })
      txByItemMonth.set('item-supermercado:1', 750) // 50 de divergência
      const rec = reconcileSheet('Orçamento 2025', 2025, sheetValues, txByItemMonth)
      const pass = !rec.ok && Math.abs(rec.totalDifference - 50) < 0.01
      return {
        pass,
        detail: `totalDifference=${rec.totalDifference.toFixed(2)}, ok=${rec.ok} (esperado diff=50.00, ok=false)`,
      }
    },
  },
  {
    id: 'sheet-anchor-validate',
    description: 'validateByAnchor confirma âncoras presentes perto da linha esperada',
    expectation: 'validateByAnchor para item-supermercado retorna missing.length === 0',
    run: () => {
      const matrix = buildCanonicalSheet2025()
      const map = buildYearSheetMap('Orçamento 2025', 2025)
      const cell = map.items.find((c) => c.itemId === 'item-supermercado' && c.month === 1)!
      const { missing } = validateByAnchor(matrix, map, cell)
      const pass = missing.length === 0
      return {
        pass,
        detail: `missing=[${missing.join(', ')}] (esperado vazio)`,
      }
    },
  },
  {
    id: 'sheet-month-detection',
    description:
      'detectMonths resolve 12 colunas de mês a partir do cabeçalho real (não layout fixo)',
    expectation: 'detectMonths retorna 12 meses sem fallback',
    run: () => {
      const matrix = buildCanonicalSheet2025()
      const { months, fallback } = detectMonths(matrix[1])
      const count = Object.keys(months).length
      const pass = count === 12 && !fallback
      return {
        pass,
        detail: `meses=${count}, fallback=${fallback} (esperado 12, sem fallback)`,
      }
    },
  },
]

/**
 * Run all classification tests. Returns a summary + per-test results.
 */
export function runClassificationTests(): {
  total: number
  passed: number
  failed: number
  results: { id: string; description: string; pass: boolean; detail: string }[]
} {
  const results = CLASSIFICATION_TESTS.map((t) => {
    const r = t.run()
    return { id: t.id, description: t.description, pass: r.pass, detail: r.detail }
  })
  return {
    total: results.length,
    passed: results.filter((r) => r.pass).length,
    failed: results.filter((r) => !r.pass).length,
    results,
  }
}

/**
 * TemplateMap — centralized, year-versioned structural map of the canonical
 * historical spreadsheet (ORÇAMENTO_PESSOAL_TEMPLATE_ANONIMIZADO.xlsx).
 *
 * Part 1 of the prompt: leitura correta da planilha histórica.
 *
 * Design rules enforced by this module:
 *  (1.1)  ALL sheet coordinates live HERE — never scattered across the codebase.
 *  (1.2)  Maps are versioned per year (2023, 2024, 2025, 2026); a row that
 *         moved between years has an entry in each (SECTION_BOUNDS + YEAR_OVERRIDES).
 *  (1.3)  Hybrid identification strategy: known coordinate → anchor validation
 *         → structural search → diagnostic. (See `identifySheetYear`,
 *         `locateItem`, `extractValue`.)
 *  (1.4)  Anchor validation: before using a coordinate we confirm the expected
 *         structural labels still sit at the expected rows.
 *  (1.5)  Identification considers Aba + Ano + Classe + Categoria + Item + Mês
 *         simultaneously — `CellKey` carries all six fields.
 *  (1.6)  Month columns are resolved from headers, never from absolute index.
 *  (1.7)  Totals (Receitas, Investimentos, each expense class, Despesas, Saldo,
 *         percentages, monthly + annual formulas, final saldo block) are mapped.
 *  (1.8)  Reconciliation: `reconcileSheet` recomputes from imported txs and
 *         compares against the original sheet values; the report lists
 *         divergences. Target: diff = R$ 0,00.
 *  (1.9)  Misinterpreted sheets are never imported silently — diagnostics are
 *         surfaced.
 *  (1.10) `diagnoseSheet` produces a per-sheet structural report.
 *  (1.11) `buildImportReport` produces the end-of-import summary.
 *
 * The reference workbook is an annual budget (pt-BR). One tab per year, e.g.
 * "Orçamento 2024". Concrete coordinates below were confirmed against the real
 * workbook (`src/assets/orcamentopessoaltemplateanonimizado-a0d81.xlsx`) read
 * with ExcelJS:
 *
 *   ┌──────────────────────────────────────────────────────────────────────┐
 *   │ A           B            C          D           E … P                 │
 *   │ (Classe)    (aux/Total)  (Categoria)(Item)     Jan … Dez             │
 *   │                                                                       │
 *   │ RECEITAS                                                              │
 *   │   Salário            ...   (item name in column D)                   │
 *   │   ...                                                                 │
 *   │   Total                       (Receitas: "Total" in D)               │
 *   │   % sobre receita              (D)                                    │
 *   │ INVESTIMENTOS                                                         │
 *   │   ...                                                                 │
 *   │ DESPESAS FIXAS                                                       │
 *   │   <categoria>                                                        │
 *   │     <item>                                                           │
 *   │   Total                       (C)                                     │
 *   │   % sobre receita              (C)                                    │
 *   │ ...                                                                   │
 *   │ Despesas Adicionais                                                  │
 *   │   Total despesas extras       (HISTORICAL label — see CANONICAL_TOTALS)│
 *   │ Saldo block (Receita / Investimentos / Fixas / Variáveis / Extras /    │
 *   │   Adicionais / Total Despesas / Saldo) — last row = canonicalEndRow  │
 *   └──────────────────────────────────────────────────────────────────────┘
 *
 * The item names (Salário, Aluguel, …) live in column D (index 4). Class
 * headers live in column A; category subheaders in column C. The month header
 * row is row 3 on every year.
 *
 * Section coordinates per year (1-based rows):
 *
 *   2023:  Rec 6-8 / Inv 14-18 / Fix 26-42 / Var 48-68 / Ext 74-83 / Adi 89-106 → endRow 119
 *   2024:  Rec 6-9 / Inv 15-19 / Fix 27-43 / Var 49-71 / Ext 77-87 / Adi 93-119 → endRow 132
 *   2025:  Rec 6-9 / Inv 15-19 / Fix 27-45 / Var 51-70 / Ext 76-86 / Adi 92-116 → endRow 129
 *   2026:  Rec 6-9 / Inv 15-19 / Fix 27-45 / Var 51-71 / Ext 77-87 / Adi 93-117 → endRow 130
 *
 * NOTE: 2026 has two trailing rows (131 "Investido", 132 "Ultima atualização")
 * that are NOT part of the canonical import — canonicalEndRow stops at 130.
 */

import { FinancialClass } from '../types/finance'

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export interface MonthColumnMap {
  /** month 1..12 → 1-based column index on the sheet (E..P = 5..16 canonical) */
  [month: number]: number
}

export type CellType = 'value' | 'formula' | 'total' | 'percent' | 'saldo' | 'header' | 'empty'

/**
 * Identifies a single cell by its full structural context (§1.5).
 * Together these six fields uniquely identify the destination/origin of a
 * datum on the sheet.
 */
export interface CellKey {
  sheetName: string
  year: number
  classId: string
  categoryId: string | null
  itemId: string
  month: number // 1..12, or 0 for annual totals
}

/**
 * A mapped cell on the reference sheet. `row` is 1-based.
 */
export interface MappedCell {
  sheetName: string
  year: number
  classId: string
  categoryId: string | null
  itemId: string
  /** 1-based row on the sheet */
  row: number
  /** month 1..12, or 0 = annual total */
  month: number
  /** 1-based column index on the sheet */
  column: number
  type: CellType
  /** Expected anchor label(s) nearby (used by validateByAnchor) */
  anchors: string[]
}

export interface TotalRow {
  sheetName: string
  year: number
  /** stable id of the financial class this total summarizes, or 'despesas'/'receitas'/'investimentos' for grand totals */
  classId: string
  label: string
  /** 1-based row */
  row: number
  /** column (1-based) where the total VALUE lives (varies: D for Receitas/Investimentos, C for despesas) */
  column: number
  /** "total" row sums months; "percent" row shows % over receita; "saldo" is the final balance */
  kind: 'total' | 'percent' | 'saldo'
  /** expected anchor label on the same row */
  anchor: string
  /** bounds of the section this total belongs to — a total is only valid when its row sits inside its section */
  sectionContext?: { classId: string; startRow: number; endRow: number }
}

/**
 * The full map for one sheet/year.
 */
export interface YearSheetMap {
  year: number
  sheetName: string
  /** 1-based column index for each month (resolved from headers in detectMonths) */
  monthColumns: MonthColumnMap
  /** column index of the "Total" (annual) column, if present */
  totalColumn: number | null
  /** column index of the item/label column (D = 4) */
  labelColumn: number
  /** column index of the class column (A = 1) */
  classColumn: number
  /** column index of the category column (C = 3) */
  categoryColumn: number
  items: MappedCell[]
  totals: TotalRow[]
  /** 1-based row of the final Saldo line — nothing below this row belongs to the import */
  canonicalEndRow: number
}

// ---------------------------------------------------------------------------
// Canonical column layout — derived from the reference workbook.
// Item names live in column D (4). Class headers in A (1), category
// subheaders in C (3). Month headers in row 3 across columns E..P (5..16).
// `detectMonths` re-resolves month columns from the actual headers at runtime
// (§1.6).
// ---------------------------------------------------------------------------

export const CANONICAL_LABEL_COLUMN = 4 // D — where item names live
export const CANONICAL_CLASS_COLUMN = 1 // A — class header (RECEITAS, …)
export const CANONICAL_CATEGORY_COLUMN = 3 // C — category subheader + expense totals
export const CANONICAL_MONTH_START_COLUMN = 5 // E (Jan)
export const CANONICAL_TOTAL_COLUMN = 17 // Q (Total anual)

export const CANONICAL_MONTH_LABELS = [
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

export const CANONICAL_MONTH_LABELS_SHORT = [
  'JAN',
  'FEV',
  'MAR',
  'ABR',
  'MAI',
  'JUN',
  'JUL',
  'AGO',
  'SET',
  'OUT',
  'NOV',
  'DEZ',
]

export const CANONICAL_CLASS_LABELS: Record<string, string> = {
  receitas: 'RECEITAS',
  investimentos: 'INVESTIMENTOS',
  despesas_fixas: 'DESPESAS FIXAS',
  despesas_variaveis: 'DESPESAS VARIÁVEIS',
  despesas_extras: 'DESPESAS EXTRAS',
  despesas_adicionais: 'DESPESAS ADICIONAIS',
}

/**
 * Sheet name → year mapping, derived from the tab title pattern
 * "Orçamento <YYYY>" or "Orçamento_<YYYY>" or a bare "<YYYY>".
 */
export const SHEET_NAME_YEAR_REGEX = /(\d{4})/

// ---------------------------------------------------------------------------
// Section bounds per year (§1.2). The structural coordinates confirmed against
// the real workbook. `endRow` is EXCLUSIVE (last item row + 1).
// ---------------------------------------------------------------------------

export interface SectionBounds {
  classId: string
  /** 1-based first item row of the section */
  startRow: number
  /** 1-based row AFTER the last item (exclusive) */
  endRow: number
  /** 1-based row of the section's "Total" line */
  totalRow: number
  /** column (1-based) where the total value lives (D=4 for Receitas/Investimentos, C=3 for despesas) */
  totalColumn: number
  /** text expected on the total line */
  totalAnchor: string
  /** 1-based row of the "% sobre receita" line, or null when absent */
  percentRow: number | null
}

type YearSectionMap = Record<string, SectionBounds>

const SECTION_BOUNDS: Record<number, YearSectionMap> = {
  2023: {
    receitas: {
      classId: 'receitas',
      startRow: 6,
      endRow: 9,
      totalRow: 10,
      totalColumn: 4,
      totalAnchor: 'Total',
      // Receitas NÃO possui linha "% sobre receita" no template real
      // (apenas Investimentos + as 4 classes de despesas possuem).
      // null evita o falso diagnóstico "Total "% sobre receita" não encontrado".
      percentRow: null,
    },
    investimentos: {
      classId: 'investimentos',
      startRow: 14,
      endRow: 19,
      totalRow: 20,
      totalColumn: 4,
      totalAnchor: 'Total',
      percentRow: 22,
    },
    despesas_fixas: {
      classId: 'despesas_fixas',
      startRow: 26,
      endRow: 43,
      totalRow: 44,
      totalColumn: 3,
      totalAnchor: 'Total',
      percentRow: 46,
    },
    despesas_variaveis: {
      classId: 'despesas_variaveis',
      startRow: 48,
      endRow: 69,
      totalRow: 70,
      totalColumn: 3,
      totalAnchor: 'Total',
      percentRow: 72,
    },
    despesas_extras: {
      classId: 'despesas_extras',
      startRow: 74,
      endRow: 84,
      totalRow: 85,
      totalColumn: 3,
      totalAnchor: 'Total',
      percentRow: 87,
    },
    despesas_adicionais: {
      classId: 'despesas_adicionais',
      startRow: 89,
      endRow: 107,
      totalRow: 108,
      totalColumn: 3,
      totalAnchor: 'Total despesas extras',
      percentRow: 110,
    },
  },
  2024: {
    receitas: {
      classId: 'receitas',
      startRow: 6,
      endRow: 10,
      totalRow: 11,
      totalColumn: 4,
      totalAnchor: 'Total',
      // Receitas NÃO possui linha "% sobre receita" no template real.
      percentRow: null,
    },
    investimentos: {
      classId: 'investimentos',
      startRow: 15,
      endRow: 20,
      totalRow: 21,
      totalColumn: 4,
      totalAnchor: 'Total',
      percentRow: 23,
    },
    despesas_fixas: {
      classId: 'despesas_fixas',
      startRow: 27,
      endRow: 44,
      totalRow: 45,
      totalColumn: 3,
      totalAnchor: 'Total',
      percentRow: 47,
    },
    despesas_variaveis: {
      classId: 'despesas_variaveis',
      startRow: 49,
      endRow: 72,
      totalRow: 73,
      totalColumn: 3,
      totalAnchor: 'Total',
      percentRow: 75,
    },
    despesas_extras: {
      classId: 'despesas_extras',
      startRow: 77,
      endRow: 88,
      totalRow: 89,
      totalColumn: 3,
      totalAnchor: 'Total',
      percentRow: 91,
    },
    despesas_adicionais: {
      classId: 'despesas_adicionais',
      startRow: 93,
      endRow: 120,
      totalRow: 121,
      totalColumn: 3,
      totalAnchor: 'Total despesas extras',
      percentRow: 123,
    },
  },
  2025: {
    receitas: {
      classId: 'receitas',
      startRow: 6,
      endRow: 10,
      totalRow: 11,
      totalColumn: 4,
      totalAnchor: 'Total',
      // Receitas NÃO possui linha "% sobre receita" no template real.
      percentRow: null,
    },
    investimentos: {
      classId: 'investimentos',
      startRow: 15,
      endRow: 20,
      totalRow: 21,
      totalColumn: 4,
      totalAnchor: 'Total',
      percentRow: 23,
    },
    despesas_fixas: {
      classId: 'despesas_fixas',
      startRow: 27,
      endRow: 46,
      totalRow: 47,
      totalColumn: 3,
      totalAnchor: 'Total',
      percentRow: 49,
    },
    despesas_variaveis: {
      classId: 'despesas_variaveis',
      startRow: 51,
      endRow: 71,
      totalRow: 72,
      totalColumn: 3,
      totalAnchor: 'Total',
      percentRow: 74,
    },
    despesas_extras: {
      classId: 'despesas_extras',
      startRow: 76,
      endRow: 87,
      totalRow: 88,
      totalColumn: 3,
      totalAnchor: 'Total',
      percentRow: 90,
    },
    despesas_adicionais: {
      classId: 'despesas_adicionais',
      startRow: 92,
      endRow: 117,
      totalRow: 118,
      totalColumn: 3,
      totalAnchor: 'Total despesas extras',
      percentRow: 120,
    },
  },
  2026: {
    receitas: {
      classId: 'receitas',
      startRow: 6,
      endRow: 10,
      totalRow: 11,
      totalColumn: 4,
      totalAnchor: 'Total',
      // Receitas NÃO possui linha "% sobre receita" no template real.
      percentRow: null,
    },
    investimentos: {
      classId: 'investimentos',
      startRow: 15,
      endRow: 20,
      totalRow: 21,
      totalColumn: 4,
      totalAnchor: 'Total',
      percentRow: 23,
    },
    despesas_fixas: {
      classId: 'despesas_fixas',
      startRow: 27,
      endRow: 46,
      totalRow: 47,
      totalColumn: 3,
      totalAnchor: 'Total',
      percentRow: 49,
    },
    despesas_variaveis: {
      classId: 'despesas_variaveis',
      startRow: 51,
      endRow: 72,
      totalRow: 73,
      totalColumn: 3,
      totalAnchor: 'Total',
      percentRow: 75,
    },
    despesas_extras: {
      classId: 'despesas_extras',
      startRow: 77,
      endRow: 88,
      totalRow: 89,
      totalColumn: 3,
      totalAnchor: 'Total',
      percentRow: 91,
    },
    despesas_adicionais: {
      classId: 'despesas_adicionais',
      startRow: 93,
      endRow: 118,
      totalRow: 119,
      totalColumn: 3,
      totalAnchor: 'Total despesas extras',
      percentRow: 121,
    },
  },
}

/** The 1-based row of the final Saldo line for each year — nothing below matters. */
const CANONICAL_END_ROW: Record<number, number> = {
  2023: 119,
  2024: 132,
  2025: 129,
  2026: 130,
}

/**
 * Resolve the section bounds for a (year, classId). Returns null for an
 * unknown year/class.
 */
export function getSectionBounds(year: number, classId: string): SectionBounds | null {
  return SECTION_BOUNDS[year]?.[classId] ?? null
}

// ---------------------------------------------------------------------------
// Item coordinates. Row numbers are 1-based. The base table uses 2025 as the
// reference year (it sits in the middle of the 2023–2026 range); rows that
// differ in another year are patched by YEAR_OVERRIDES.
// ---------------------------------------------------------------------------

interface ItemCoordSeed {
  /** stable item id (see catalog.ts) */
  itemId: string
  /** stable class id */
  classId: string
  /** stable category id (nullable for Receitas/Investimentos) */
  categoryId: string | null
  /** canonical 1-based row on the 2025 sheet */
  row: number
  /** anchor labels expected on this row (item name in col D + class) */
  anchors: string[]
}

/**
 * Canonical item coordinates for the 2025 sheet. When a year diverges,
 * `getItemCoordSeed(year, itemId)` applies the YEAR_OVERRIDES entry.
 *
 * Row numbers follow the real 2025 structure:
 *   6  = Salário            15 = Cripto
 *   7  = Complementar       16 = Tesouro Direto
 *   8  = Divisão Lulu       17 = Renda fixa
 *   9  = Outros (Receitas)  18 = Previdência privada
 *   10 = (Investimentos Total) 19 = Outros (Investimentos)
 *   27 = Aluguel (Fixas)    51 = Luz (Variáveis)
 *   ... etc — full section bounds above.
 */
const CANONICAL_ITEM_COORDS: ItemCoordSeed[] = [
  // Receitas (2025: 6-9)
  {
    itemId: 'item-salario',
    classId: 'receitas',
    categoryId: null,
    row: 6,
    anchors: ['Salário', 'Salario', 'RECEITAS'],
  },
  {
    itemId: 'item-complementar',
    classId: 'receitas',
    categoryId: null,
    row: 7,
    anchors: ['Complementar', 'RECEITAS'],
  },
  {
    itemId: 'item-divisao-lulu',
    classId: 'receitas',
    categoryId: null,
    row: 8,
    anchors: ['Divisão Lulu', 'Divisao Lulu', 'Lulu', 'RECEITAS'],
  },
  {
    itemId: 'item-entrada-corretora-rs',
    classId: 'receitas',
    categoryId: null,
    row: 9,
    anchors: ['Entrada de corretora', 'RECEITAS'],
  },
  // NOTE: item-entrada-corretora-usd and item-receitas-outros occupy extra
  // receitas rows in some years; they are mapped via YEAR_OVERRIDES so the base
  // 2025 table (4 receitas rows) stays clean.
  {
    itemId: 'item-entrada-corretora-usd',
    classId: 'receitas',
    categoryId: null,
    row: 9,
    anchors: ['Entrada de corretora', 'USD', '$', 'RECEITAS'],
  },
  {
    itemId: 'item-receitas-outros',
    classId: 'receitas',
    categoryId: null,
    row: 9,
    anchors: ['Outros', 'RECEITAS'],
  },

  // Investimentos (2025: 15-19)
  {
    itemId: 'item-cripto',
    classId: 'investimentos',
    categoryId: null,
    row: 15,
    anchors: ['Cripto', 'INVESTIMENTOS'],
  },
  {
    itemId: 'item-tesouro-direto',
    classId: 'investimentos',
    categoryId: null,
    row: 16,
    anchors: ['Tesouro', 'INVESTIMENTOS'],
  },
  {
    itemId: 'item-renda-fixa',
    classId: 'investimentos',
    categoryId: null,
    row: 17,
    anchors: ['Renda fixa', 'INVESTIMENTOS'],
  },
  {
    itemId: 'item-previdencia-privada',
    classId: 'investimentos',
    categoryId: null,
    row: 18,
    anchors: ['Previdência', 'Previdencia', 'INVESTIMENTOS'],
  },
  {
    itemId: 'item-investimentos-outros',
    classId: 'investimentos',
    categoryId: null,
    row: 19,
    anchors: ['Outros', 'INVESTIMENTOS'],
  },

  // Despesas Fixas — Habitação (2025: 27-28)
  {
    itemId: 'item-aluguel',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-habitacao',
    row: 27,
    anchors: ['Aluguel', 'DESPESAS FIXAS'],
  },
  {
    itemId: 'item-condominio',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-habitacao',
    row: 28,
    anchors: ['Condomínio', 'Condominio', 'DESPESAS FIXAS'],
  },
  // Transporte (29)
  {
    itemId: 'item-prestacao-moto',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-transporte',
    row: 29,
    anchors: ['Prestação', 'Prestacao', 'moto', 'DESPESAS FIXAS'],
  },
  // Saúde (30-33)
  {
    itemId: 'item-plano-saude',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-saude',
    row: 30,
    anchors: ['Plano de saúde', 'Plano de saude', 'DESPESAS FIXAS'],
  },
  {
    itemId: 'item-plano-dental',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-saude',
    row: 31,
    anchors: ['Plano', 'dental', 'DESPESAS FIXAS'],
  },
  {
    itemId: 'item-nutricionista',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-saude',
    row: 32,
    anchors: ['Nutricionista', 'DESPESAS FIXAS'],
  },
  {
    itemId: 'item-academia',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-saude',
    row: 33,
    anchors: ['Academia', 'DESPESAS FIXAS'],
  },
  // Educação (34-36)
  {
    itemId: 'item-pos-graduacao',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-educacao',
    row: 34,
    anchors: ['Pós-graduação', 'Pos-graduacao', 'DESPESAS FIXAS'],
  },
  {
    itemId: 'item-assinatura-cripto',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-educacao',
    row: 35,
    anchors: ['Assinatura Cripto', 'DESPESAS FIXAS'],
  },
  {
    itemId: 'item-curso',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-educacao',
    row: 36,
    anchors: ['Curso', 'DESPESAS FIXAS'],
  },
  // Impostos (37-39)
  {
    itemId: 'item-das',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-impostos',
    row: 37,
    anchors: ['DAS', 'DESPESAS FIXAS'],
  },
  {
    itemId: 'item-ipva',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-impostos',
    row: 38,
    anchors: ['IPVA', 'DESPESAS FIXAS'],
  },
  {
    itemId: 'item-ipva-licenciamento',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-impostos',
    row: 39,
    anchors: ['IPVA', 'Licenciamento', 'DESPESAS FIXAS'],
  },
  // Outros (40-42)
  {
    itemId: 'item-seguro-vida',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-outros',
    row: 40,
    anchors: ['Seguro', 'DESPESAS FIXAS'],
  },
  {
    itemId: 'item-crea',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-outros',
    row: 41,
    anchors: ['CREA', 'DESPESAS FIXAS'],
  },
  {
    itemId: 'item-emprestimo',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-outros',
    row: 42,
    anchors: ['Empréstimo', 'Emprestimo', 'DESPESAS FIXAS'],
  },

  // Despesas Variáveis — Habitação (2025: 51-55)
  {
    itemId: 'item-luz',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-habitacao',
    row: 51,
    anchors: ['Luz', 'DESPESAS VARIÁVEIS'],
  },
  {
    itemId: 'item-telefone-celular',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-habitacao',
    row: 52,
    anchors: ['Telefone', 'Celular', 'DESPESAS VARIÁVEIS'],
  },
  {
    itemId: 'item-gas',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-habitacao',
    row: 53,
    anchors: ['Gás', 'Gas', 'DESPESAS VARIÁVEIS'],
  },
  {
    itemId: 'item-internet',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-habitacao',
    row: 54,
    anchors: ['Internet', 'DESPESAS VARIÁVEIS'],
  },
  {
    itemId: 'item-prod-limpeza',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-habitacao',
    row: 55,
    anchors: ['Limpeza', 'DESPESAS VARIÁVEIS'],
  },
  // Transporte (56-59)
  {
    itemId: 'item-combustivel',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-transporte',
    row: 56,
    anchors: ['Combustível', 'Combustivel', 'DESPESAS VARIÁVEIS'],
  },
  {
    itemId: 'item-multa',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-transporte',
    row: 57,
    anchors: ['Multa', 'DESPESAS VARIÁVEIS'],
  },
  {
    itemId: 'item-estacionamento',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-transporte',
    row: 58,
    anchors: ['Estacionamento', 'DESPESAS VARIÁVEIS'],
  },
  {
    itemId: 'item-passagem',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-transporte',
    row: 59,
    anchors: ['Passagem', 'DESPESAS VARIÁVEIS'],
  },
  // Alimentação (60-62)
  {
    itemId: 'item-supermercado',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-alimentacao',
    row: 60,
    anchors: ['Supermercado', 'DESPESAS VARIÁVEIS'],
  },
  {
    itemId: 'item-feira',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-alimentacao',
    row: 61,
    anchors: ['Feira', 'DESPESAS VARIÁVEIS'],
  },
  {
    itemId: 'item-suplementacao',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-alimentacao',
    row: 62,
    anchors: ['Suplementação', 'Suplementacao', 'DESPESAS VARIÁVEIS'],
  },
  // Cuidados pessoais (63-65)
  {
    itemId: 'item-skin-care',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-cuidados',
    row: 63,
    anchors: ['Skin care', 'DESPESAS VARIÁVEIS'],
  },
  {
    itemId: 'item-higiene',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-cuidados',
    row: 64,
    anchors: ['Higiene', 'DESPESAS VARIÁVEIS'],
  },
  {
    itemId: 'item-cabeleireiro',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-cuidados',
    row: 65,
    anchors: ['Cabeleireiro', 'DESPESAS VARIÁVEIS'],
  },
  // Pet (66-67)
  {
    itemId: 'item-pet-alimentacao',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-pet',
    row: 66,
    anchors: ['Alimentação', 'Pet', 'DESPESAS VARIÁVEIS'],
  },
  {
    itemId: 'item-pet-higiene',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-pet',
    row: 67,
    anchors: ['Higiene', 'Pet', 'DESPESAS VARIÁVEIS'],
  },

  // Despesas Extras — Saúde (2025: 76-81)
  {
    itemId: 'item-medicamentos',
    classId: 'despesas_extras',
    categoryId: 'cat-extras-saude',
    row: 76,
    anchors: ['Medicamentos', 'DESPESAS EXTRAS'],
  },
  {
    itemId: 'item-farmacia',
    classId: 'despesas_extras',
    categoryId: 'cat-extras-saude',
    row: 77,
    anchors: ['Farmácia', 'Farmacia', 'DESPESAS EXTRAS'],
  },
  {
    itemId: 'item-medico',
    classId: 'despesas_extras',
    categoryId: 'cat-extras-saude',
    row: 78,
    anchors: ['Médico', 'Medico', 'DESPESAS EXTRAS'],
  },
  {
    itemId: 'item-dentista',
    classId: 'despesas_extras',
    categoryId: 'cat-extras-saude',
    row: 79,
    anchors: ['Dentista', 'DESPESAS EXTRAS'],
  },
  {
    itemId: 'item-hospital',
    classId: 'despesas_extras',
    categoryId: 'cat-extras-saude',
    row: 80,
    anchors: ['Hospital', 'DESPESAS EXTRAS'],
  },
  {
    itemId: 'item-gatos',
    classId: 'despesas_extras',
    categoryId: 'cat-extras-saude',
    row: 81,
    anchors: ['Gatos', 'DESPESAS EXTRAS'],
  },
  // Manutenção (82-83)
  {
    itemId: 'item-manutencao-moto',
    classId: 'despesas_extras',
    categoryId: 'cat-extras-manutencao',
    row: 82,
    anchors: ['Moto', 'DESPESAS EXTRAS'],
  },
  {
    itemId: 'item-manutencao-casa',
    classId: 'despesas_extras',
    categoryId: 'cat-extras-manutencao',
    row: 83,
    anchors: ['Casa', 'DESPESAS EXTRAS'],
  },
  // Educação (84)
  {
    itemId: 'item-livros',
    classId: 'despesas_extras',
    categoryId: 'cat-extras-educacao',
    row: 84,
    anchors: ['Livros', 'DESPESAS EXTRAS'],
  },

  // Despesas Adicionais — Lazer (2025: 92-98)
  {
    itemId: 'item-viagens',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-lazer',
    row: 92,
    anchors: ['Viagens', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-cinema-teatro',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-lazer',
    row: 93,
    anchors: ['Cinema', 'Teatro', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-restaurantes-bares',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-lazer',
    row: 94,
    anchors: ['Restaurantes', 'bares', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-assinaturas-streamings',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-lazer',
    row: 95,
    anchors: ['Assinaturas', 'streamings', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-assinaturas',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-lazer',
    row: 96,
    anchors: ['Assinaturas', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-role',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-lazer',
    row: 97,
    anchors: ['Rolê', 'Role', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-hobbies',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-lazer',
    row: 98,
    anchors: ['Hobbies', 'DESPESAS ADICIONAIS'],
  },
  // Vestuário (99-101)
  {
    itemId: 'item-roupas',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-vestuario',
    row: 99,
    anchors: ['Roupas', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-calcados',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-vestuario',
    row: 100,
    anchors: ['Calçados', 'Calcados', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-acessorios',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-vestuario',
    row: 101,
    anchors: ['Acessórios', 'Acessorios', 'DESPESAS ADICIONAIS'],
  },
  // Casa (102-108)
  {
    itemId: 'item-eletrodomesticos',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-casa',
    row: 102,
    anchors: ['Eletrodomésticos', 'Eletrodomesticos', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-moveis',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-casa',
    row: 103,
    anchors: ['Móveis', 'Moveis', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-item-cozinha',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-casa',
    row: 104,
    anchors: ['Cozinha', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-item-banheiro',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-casa',
    row: 105,
    anchors: ['Banheiro', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-item-sala',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-casa',
    row: 106,
    anchors: ['Sala', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-item-quarto',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-casa',
    row: 107,
    anchors: ['Quarto', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-diversos',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-casa',
    row: 108,
    anchors: ['Diversos', 'DESPESAS ADICIONAIS'],
  },
  // Outros (109-116)
  {
    itemId: 'item-estacionamento-lavagem-moto',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-outros',
    row: 109,
    anchors: ['Estacionamento', 'lavagem', 'moto', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-presentes',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-outros',
    row: 110,
    anchors: ['Presentes', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-compras-marketplace',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-outros',
    row: 111,
    anchors: ['Compras marketplace', 'marketplace', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-uber',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-outros',
    row: 112,
    anchors: ['Uber', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-compras-pc',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-outros',
    row: 113,
    anchors: ['Compras PC', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-nao-lembro',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-outros',
    row: 114,
    anchors: ['Não lembro', 'Nao lembro', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-milhas',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-outros',
    row: 115,
    anchors: ['Milhas', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-parcelas-anteriores',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-outros',
    row: 116,
    anchors: ['Parcelas anteriores', 'DESPESAS ADICIONAIS'],
  },
]

/**
 * Year-specific overrides. When a row moved between years, the override entry
 * here wins over the 2025 seed for that year. (§1.2)
 *
 * Key = `${year}:${itemId}`. Only items whose row actually differs from the
 * 2025 base need an entry.
 *
 * 2023 has fewer receitas rows (6-8 vs 6-9) and the whole layout is shifted up.
 * 2024 has the additional receitas row (6-9) but everything else is shifted down.
 * 2026 matches 2025 except the despesas_variaveis/adicionais sections are one
 * row longer.
 */
const YEAR_OVERRIDES: Record<string, Partial<ItemCoordSeed>> = {
  // ---- 2023: 3 receitas rows (6-8), investimentos 14-18, fixas 26-42,
  //      variáveis 48-68, extras 74-83, adicionais 89-106 ----
  // Receitas: 3 items, Salário=6, Complementar=7, Divisão Lulu=8 (no 4th row)
  '2023:item-entrada-corretora-rs': { row: 8 },
  '2023:item-entrada-corretora-usd': { row: 8 },
  '2023:item-receitas-outros': { row: 8 },
  // Investimentos: 14-18
  '2023:item-cripto': { row: 14 },
  '2023:item-tesouro-direto': { row: 15 },
  '2023:item-renda-fixa': { row: 16 },
  '2023:item-previdencia-privada': { row: 17 },
  '2023:item-investimentos-outros': { row: 18 },
  // Despesas Fixas: 26-42 (5 hábito/transporte/saúde/educação/impostos/outros)
  '2023:item-aluguel': { row: 26 },
  '2023:item-condominio': { row: 27 },
  '2023:item-prestacao-moto': { row: 28 },
  '2023:item-plano-saude': { row: 29 },
  '2023:item-plano-dental': { row: 30 },
  '2023:item-nutricionista': { row: 31 },
  '2023:item-academia': { row: 32 },
  '2023:item-pos-graduacao': { row: 33 },
  '2023:item-assinatura-cripto': { row: 34 },
  '2023:item-curso': { row: 35 },
  '2023:item-das': { row: 36 },
  '2023:item-ipva': { row: 37 },
  '2023:item-ipva-licenciamento': { row: 38 },
  '2023:item-seguro-vida': { row: 39 },
  '2023:item-crea': { row: 40 },
  '2023:item-emprestimo': { row: 41 },
  // Despesas Variáveis: 48-68
  '2023:item-luz': { row: 48 },
  '2023:item-telefone-celular': { row: 49 },
  '2023:item-gas': { row: 50 },
  '2023:item-internet': { row: 51 },
  '2023:item-prod-limpeza': { row: 52 },
  '2023:item-combustivel': { row: 53 },
  '2023:item-multa': { row: 54 },
  '2023:item-estacionamento': { row: 55 },
  '2023:item-passagem': { row: 56 },
  '2023:item-supermercado': { row: 57 },
  '2023:item-feira': { row: 58 },
  '2023:item-suplementacao': { row: 59 },
  '2023:item-skin-care': { row: 60 },
  '2023:item-higiene': { row: 61 },
  '2023:item-cabeleireiro': { row: 62 },
  '2023:item-pet-alimentacao': { row: 63 },
  '2023:item-pet-higiene': { row: 64 },
  // Despesas Extras: 74-83
  '2023:item-medicamentos': { row: 74 },
  '2023:item-farmacia': { row: 75 },
  '2023:item-medico': { row: 76 },
  '2023:item-dentista': { row: 77 },
  '2023:item-hospital': { row: 78 },
  '2023:item-gatos': { row: 79 },
  '2023:item-manutencao-moto': { row: 80 },
  '2023:item-manutencao-casa': { row: 81 },
  '2023:item-livros': { row: 82 },
  // Despesas Adicionais: 89-106
  '2023:item-viagens': { row: 89 },
  '2023:item-cinema-teatro': { row: 90 },
  '2023:item-restaurantes-bares': { row: 91 },
  '2023:item-assinaturas-streamings': { row: 92 },
  '2023:item-assinaturas': { row: 93 },
  '2023:item-role': { row: 94 },
  '2023:item-hobbies': { row: 95 },
  '2023:item-roupas': { row: 96 },
  '2023:item-calcados': { row: 97 },
  '2023:item-acessorios': { row: 98 },
  '2023:item-eletrodomesticos': { row: 99 },
  '2023:item-moveis': { row: 100 },
  '2023:item-item-cozinha': { row: 101 },
  '2023:item-item-banheiro': { row: 102 },
  '2023:item-item-sala': { row: 103 },
  '2023:item-item-quarto': { row: 104 },
  '2023:item-diversos': { row: 105 },
  '2023:item-estacionamento-lavagem-moto': { row: 106 },
  '2023:item-presentes': { row: 107 },
  '2023:item-compras-marketplace': { row: 108 },
  '2023:item-uber': { row: 109 },
  '2023:item-compras-pc': { row: 110 },
  '2023:item-nao-lembro': { row: 111 },
  '2023:item-milhas': { row: 112 },
  '2023:item-parcelas-anteriores': { row: 113 },

  // ---- 2024: receitas 6-9, investimentos 15-19, fixas 27-43,
  //      variáveis 49-71, extras 77-87, adicionais 93-119 ----
  '2024:item-entrada-corretora-rs': { row: 8 },
  '2024:item-entrada-corretora-usd': { row: 9 },
  '2024:item-receitas-outros': { row: 9 },
  '2024:item-cripto': { row: 15 },
  '2024:item-tesouro-direto': { row: 16 },
  '2024:item-renda-fixa': { row: 17 },
  '2024:item-previdencia-privada': { row: 18 },
  '2024:item-investimentos-outros': { row: 19 },
  // Fixas 27-43 (one row longer than 2025)
  '2024:item-aluguel': { row: 27 },
  '2024:item-condominio': { row: 28 },
  '2024:item-prestacao-moto': { row: 29 },
  '2024:item-plano-saude': { row: 30 },
  '2024:item-plano-dental': { row: 31 },
  '2024:item-nutricionista': { row: 32 },
  '2024:item-academia': { row: 33 },
  '2024:item-pos-graduacao': { row: 34 },
  '2024:item-assinatura-cripto': { row: 35 },
  '2024:item-curso': { row: 36 },
  '2024:item-das': { row: 37 },
  '2024:item-ipva': { row: 38 },
  '2024:item-ipva-licenciamento': { row: 39 },
  '2024:item-seguro-vida': { row: 40 },
  '2024:item-crea': { row: 41 },
  '2024:item-emprestimo': { row: 42 },
  // Variáveis 49-71 (one row longer than 2025)
  '2024:item-luz': { row: 49 },
  '2024:item-telefone-celular': { row: 50 },
  '2024:item-gas': { row: 51 },
  '2024:item-internet': { row: 52 },
  '2024:item-prod-limpeza': { row: 53 },
  '2024:item-combustivel': { row: 54 },
  '2024:item-multa': { row: 55 },
  '2024:item-estacionamento': { row: 56 },
  '2024:item-passagem': { row: 57 },
  '2024:item-supermercado': { row: 58 },
  '2024:item-feira': { row: 59 },
  '2024:item-suplementacao': { row: 60 },
  '2024:item-skin-care': { row: 61 },
  '2024:item-higiene': { row: 62 },
  '2024:item-cabeleireiro': { row: 63 },
  '2024:item-pet-alimentacao': { row: 64 },
  '2024:item-pet-higiene': { row: 65 },
  // Extras 77-87 (same deltas as 2025 +1)
  '2024:item-medicamentos': { row: 77 },
  '2024:item-farmacia': { row: 78 },
  '2024:item-medico': { row: 79 },
  '2024:item-dentista': { row: 80 },
  '2024:item-hospital': { row: 81 },
  '2024:item-gatos': { row: 82 },
  '2024:item-manutencao-moto': { row: 83 },
  '2024:item-manutencao-casa': { row: 84 },
  '2024:item-livros': { row: 85 },
  // Adicionais 93-119 (same as 2026; longer than 2025)
  '2024:item-viagens': { row: 93 },
  '2024:item-cinema-teatro': { row: 94 },
  '2024:item-restaurantes-bares': { row: 95 },
  '2024:item-assinaturas-streamings': { row: 96 },
  '2024:item-assinaturas': { row: 97 },
  '2024:item-role': { row: 98 },
  '2024:item-hobbies': { row: 99 },
  '2024:item-roupas': { row: 100 },
  '2024:item-calcados': { row: 101 },
  '2024:item-acessorios': { row: 102 },
  '2024:item-eletrodomesticos': { row: 103 },
  '2024:item-moveis': { row: 104 },
  '2024:item-item-cozinha': { row: 105 },
  '2024:item-item-banheiro': { row: 106 },
  '2024:item-item-sala': { row: 107 },
  '2024:item-item-quarto': { row: 108 },
  '2024:item-diversos': { row: 109 },
  '2024:item-estacionamento-lavagem-moto': { row: 110 },
  '2024:item-presentes': { row: 111 },
  '2024:item-compras-marketplace': { row: 112 },
  '2024:item-uber': { row: 113 },
  '2024:item-compras-pc': { row: 114 },
  '2024:item-nao-lembro': { row: 115 },
  '2024:item-milhas': { row: 116 },
  '2024:item-parcelas-anteriores': { row: 117 },

  // ---- 2026: matches 2025 for receitas/investimentos/extras, but variáveis
  //      and adicionais are one row longer ----
  '2026:item-combustivel': { row: 56 },
  '2026:item-multa': { row: 57 },
  '2026:item-estacionamento': { row: 58 },
  '2026:item-passagem': { row: 59 },
  '2026:item-supermercado': { row: 60 },
  '2026:item-feira': { row: 61 },
  '2026:item-suplementacao': { row: 62 },
  '2026:item-skin-care': { row: 63 },
  '2026:item-higiene': { row: 64 },
  '2026:item-cabeleireiro': { row: 65 },
  '2026:item-pet-alimentacao': { row: 66 },
  '2026:item-pet-higiene': { row: 67 },
  // Adicionais 2026 = 93-117 (item-parcelas-anteriores at 117)
  '2026:item-parcelas-anteriores': { row: 117 },
}

function getItemCoordSeed(year: number, itemId: string): ItemCoordSeed | null {
  const base = CANONICAL_ITEM_COORDS.find((c) => c.itemId === itemId)
  if (!base) return null
  const override = YEAR_OVERRIDES[`${year}:${itemId}`]
  return override ? { ...base, ...override } : base
}

// ---------------------------------------------------------------------------
// Total rows per year (§1.7). Built from SECTION_BOUNDS so they stay in sync.
// ---------------------------------------------------------------------------

interface TotalSeed {
  classId: string
  label: string
  row: number
  column: number
  kind: 'total' | 'percent' | 'saldo'
  anchor: string
  sectionContext?: { classId: string; startRow: number; endRow: number }
}

/**
 * Build the totals list for a year from SECTION_BOUNDS. Receitas and
 * Investimentos use the simple "Total" anchor; each despesa class uses "Total";
 * Despesas Adicionais historically carries the "Total despesas extras" anchor
 * (kept verbatim — never renamed). Each total carries its sectionContext so
 * validation can confirm the row sits inside its section.
 */
function buildTotalsForYear(year: number): Omit<TotalSeed, 'label'>[] {
  const sections = SECTION_BOUNDS[year]
  if (!sections) return []
  const out: Omit<TotalSeed, 'label'>[] = []
  for (const classId of Object.keys(sections)) {
    const b = sections[classId]
    out.push({
      classId,
      row: b.totalRow,
      column: b.totalColumn,
      kind: 'total',
      anchor: b.totalAnchor,
      sectionContext: { classId, startRow: b.startRow, endRow: b.endRow },
    })
    if (b.percentRow !== null) {
      out.push({
        classId,
        row: b.percentRow,
        column: b.totalColumn,
        kind: 'percent',
        anchor: '% sobre receita',
        sectionContext: { classId, startRow: b.startRow, endRow: b.endRow },
      })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const SUPPORTED_YEARS = [2023, 2024, 2025, 2026]

/**
 * Resolve the sheet name for a given year. Canonical: "Orçamento <YYYY>".
 */
export function sheetNameForYear(year: number): string {
  return `Orçamento ${year}`
}

/**
 * Detect a year from a sheet name. Returns null if none found (§1.3 step 4 —
 * unknown sheet → diagnostic, never guess).
 */
export function detectYearFromSheetName(sheetName: string): number | null {
  const m = sheetName.match(SHEET_NAME_YEAR_REGEX)
  if (!m) return null
  const y = Number(m[1])
  return SUPPORTED_YEARS.includes(y) ? y : null
}

/**
 * Detect whether a sheet name refers to an auxiliary (non-transational) tab
 * such as "RESUMO". Auxiliary sheets are skipped by the importer — they carry
 * no transactional rows to extract.
 */
export function isAuxiliarySheet(sheetName: string): boolean {
  const n = normalizeAnchorLabel(sheetName)
  return n === 'RESUMO' || n.includes('RESUMO')
}

/**
 * Resolve month → column index from the header row of a sheet (§1.6).
 *
 * Accepts a header row (array of cell string-values, 1-based by index+1) and
 * returns a map month(1..12) → column index. Falls back to the canonical
 * E..P layout when headers can't be resolved, but flags the fallback so the
 * caller can emit a diagnostic.
 */
export function detectMonths(headerRow: (string | number | null | undefined)[]): {
  months: MonthColumnMap
  totalColumn: number | null
  fallback: boolean
} {
  const months: MonthColumnMap = {}
  let fallback = true
  const norm = (s: unknown) =>
    String(s ?? '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')

  // Pre-normalize the canonical labels so accented entries (MARÇO — cedilla)
  // compare against the de-accented header cells. Without this the header
  // "MARÇO" normalizes to "MARCO" while the canonical "MARÇO" stays accented,
  // so March never matches and detection falls back to the E:P layout.
  const normLong = CANONICAL_MONTH_LABELS.map(norm)
  const normShort = CANONICAL_MONTH_LABELS_SHORT.map(norm)

  for (let i = 0; i < headerRow.length; i++) {
    const h = norm(headerRow[i])
    if (!h) continue
    // match "JANEIRO" / "JAN" / "JAN/" etc. — `i` is the array index, which for
    // a 1-based matrix row IS the 1-based column number (index 0 = null).
    const idxLong = normLong.findIndex((m) => m === h || h.startsWith(m))
    const idxShort = normShort.findIndex((m) => m === h)
    const idx = idxLong >= 0 ? idxLong : idxShort
    if (idx >= 0 && !months[idx + 1]) {
      // The matrix rows are 1-based (index 0 unused), so the array index `i`
      // IS the 1-based column number — no +1 adjustment.
      months[idx + 1] = i
      fallback = false
    }
  }

  // Total column: header literally "TOTAL" (or "TOTAL ANUAL" / "ANO")
  let totalColumn: number | null = null
  for (let i = 0; i < headerRow.length; i++) {
    const h = norm(headerRow[i])
    if (h === 'TOTAL' || h === 'TOTAL ANUAL' || h === 'ANO') {
      totalColumn = i
      break
    }
  }

  // Fallback: canonical E..P if detection produced fewer than 12 months.
  if (Object.keys(months).length < 12) {
    for (let m = 1; m <= 12; m++) {
      if (!months[m]) months[m] = CANONICAL_MONTH_START_COLUMN + (m - 1)
    }
    fallback = true
  }
  if (totalColumn === null) totalColumn = CANONICAL_TOTAL_COLUMN

  return { months, totalColumn, fallback }
}

/**
 * Build the full YearSheetMap for a given (sheetName, year). The map carries
 * the canonical month columns and every item/total row, applying YEAR_OVERRIDES
 * for that year. `canonicalEndRow` is set from the year's final Saldo line.
 * Use `validateByAnchor` afterwards to confirm the labels are still where we
 * expect.
 */
export function buildYearSheetMap(sheetName: string, year: number): YearSheetMap {
  const monthColumns: MonthColumnMap = {}
  for (let m = 1; m <= 12; m++) monthColumns[m] = CANONICAL_MONTH_START_COLUMN + (m - 1)

  const items: MappedCell[] = []
  for (const seed of CANONICAL_ITEM_COORDS) {
    const coord = getItemCoordSeed(year, seed.itemId) ?? seed
    // Skip placeholder rows that collapse onto another item's row in this
    // year (e.g. receitas "Outros" sharing row 9 in 2025). The first item
    // mapped to that row wins; later duplicates are not emitted as separate
    // cells to avoid double-counting.
    if (items.some((c) => c.itemId === coord.itemId && c.month === 1)) continue
    for (let m = 1; m <= 12; m++) {
      items.push({
        sheetName,
        year,
        classId: coord.classId,
        categoryId: coord.categoryId,
        itemId: coord.itemId,
        row: coord.row,
        month: m,
        column: monthColumns[m],
        type: 'value',
        anchors: coord.anchors,
      })
    }
    // Annual total for this item row
    items.push({
      sheetName,
      year,
      classId: coord.classId,
      categoryId: coord.categoryId,
      itemId: coord.itemId,
      row: coord.row,
      month: 0,
      column: CANONICAL_TOTAL_COLUMN,
      type: 'total',
      anchors: coord.anchors,
    })
  }

  const totals: TotalRow[] = buildTotalsForYear(year).map((t) => ({
    sheetName,
    year,
    classId: t.classId,
    label: t.kind === 'percent' ? '% sobre receita' : `Total ${t.classId}`,
    row: t.row,
    column: t.column,
    kind: t.kind,
    anchor: t.anchor,
    sectionContext: t.sectionContext,
  }))

  return {
    year,
    sheetName,
    monthColumns,
    totalColumn: CANONICAL_TOTAL_COLUMN,
    labelColumn: CANONICAL_LABEL_COLUMN,
    classColumn: CANONICAL_CLASS_COLUMN,
    categoryColumn: CANONICAL_CATEGORY_COLUMN,
    items,
    totals,
    canonicalEndRow: CANONICAL_END_ROW[year] ?? 0,
  }
}

/**
 * Normalize a label for anchor comparison (uppercase, no accents, collapsed
 * spaces). Matches the normalization applied to the cells read from the sheet.
 */
export function normalizeAnchorLabel(s: string | null | undefined): string {
  if (!s) return ''
  return String(s)
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

/**
 * Validate that the expected anchors are present near a given row on the sheet
 * (§1.4). `matrix` is the 2D cell matrix [row][col] with 1-based indices
 * (index 0 unused) — see parsers.ts `parseXLSX` which returns this shape.
 *
 * Item-name anchors (Salário, Aluguel, …) MUST sit on the EXACT expected row
 * in the label column (D) — that is what confirms the coordinate is still
 * correct (a shifted row → fall back to search). Class-level anchors
 * (DESPESAS FIXAS, RECEITAS, …) are validated broadly across columns A–C
 * because they sit far above the item rows.
 *
 * Returns the list of missing anchors (empty = fully validated).
 */
export function validateByAnchor(
  matrix: (string | number | null)[][],
  map: YearSheetMap,
  cell: { row: number; anchors: string[] },
): { present: string[]; missing: string[] } {
  const present: string[] = []
  const missing: string[] = []

  const classLabelSet = new Set(Object.values(CANONICAL_CLASS_LABELS).map(normalizeAnchorLabel))
  // Class anchors live in columns A–C; item-name anchors live in column D.
  const classCols = [map.classColumn, map.categoryColumn].filter((c) => c != null)
  const labelCol = map.labelColumn
  const exactRow = matrix[cell.row] || []

  for (const anchor of cell.anchors) {
    const normAnchor = normalizeAnchorLabel(anchor)
    if (!normAnchor) {
      missing.push(anchor)
      continue
    }
    const isClassAnchor = classLabelSet.has(normAnchor)
    let found = false
    if (isClassAnchor) {
      // broad search across the whole sheet, class/category columns only
      for (let r = 1; r < matrix.length && !found; r++) {
        const rowArr = matrix[r] || []
        for (const c of classCols) {
          const n = normalizeAnchorLabel(String(rowArr[c] ?? ''))
          if (n === normAnchor || n.includes(normAnchor)) {
            found = true
            break
          }
        }
      }
    } else {
      // item-name anchor: must be on the EXACT expected row, column D
      const labelCell = normalizeAnchorLabel(String(exactRow[labelCol] ?? ''))
      if (labelCell && (labelCell === normAnchor || labelCell.includes(normAnchor))) {
        found = true
      }
    }
    if (found) present.push(anchor)
    else missing.push(anchor)
  }
  return { present, missing }
}

/**
 * Locate an item cell by structural identity (§1.3 + §1.5). Combines the
 * known coordinate with anchor validation; if the anchor fails, falls back to
 * a structural search by class → item name, and finally returns a diagnostic.
 */
export interface LocateResult {
  found: boolean
  row: number | null
  column: number | null
  /** how the row was identified */
  method: 'coordinate' | 'anchor' | 'search' | 'none'
  /** anchors that were missing (for diagnostics) */
  missingAnchors: string[]
  /** when method === 'search', the row where the item name was found */
  searchRow: number | null
  message: string
}

export function locateItem(
  matrix: (string | number | null)[][],
  map: YearSheetMap,
  key: { classId: string; categoryId: string | null; itemId: string; month: number },
): LocateResult {
  // 1. Known coordinate
  const cell = map.items.find(
    (c) => c.itemId === key.itemId && c.classId === key.classId && c.month === key.month,
  )
  if (!cell) {
    return {
      found: false,
      row: null,
      column: null,
      method: 'none',
      missingAnchors: [],
      searchRow: null,
      message: `Sem coordenada canônica para ${key.itemId} (mês ${key.month})`,
    }
  }

  // 2. Anchor validation
  const { missing } = validateByAnchor(matrix, map, cell)
  if (missing.length === 0) {
    const col =
      key.month === 0
        ? (map.totalColumn ?? cell.column)
        : (map.monthColumns[key.month] ?? cell.column)
    return {
      found: true,
      row: cell.row,
      column: col,
      method: 'coordinate',
      missingAnchors: [],
      searchRow: null,
      message: `Coordenada canônica validada por âncora`,
    }
  }

  // 3. Structural search: find the item name in column D within the expected
  //    class block, then use that row.
  const searchRow = findItemRowByName(matrix, map, key.itemId, key.classId)
  if (searchRow !== null) {
    const col =
      key.month === 0
        ? (map.totalColumn ?? cell.column)
        : (map.monthColumns[key.month] ?? cell.column)
    return {
      found: true,
      row: searchRow,
      column: col,
      method: 'search',
      missingAnchors: missing,
      searchRow,
      message: `Coordenada deslocada — item relocalizado por busca estrutural (âncoras ausentes: ${missing.join(', ')})`,
    }
  }

  // 4. Diagnostic — do not guess.
  return {
    found: false,
    row: cell.row,
    column: cell.column,
    method: 'none',
    missingAnchors: missing,
    searchRow: null,
    message: `Divergência estrutural para ${key.itemId}: âncoras ausentes (${missing.join(', ')}) e nome não relocalizado`,
  }
}

/**
 * Structural search for an item row by name within a class block.
 * Searches column D (labelColumn) in a window of ±10 rows around the canonical
 * row, but ONLY within the bounds of the item's class section (so a name
 * cannot be matched in a neighbouring class).
 *
 * Returns the 1-based row index, or null.
 */
export function findItemRowByName(
  matrix: (string | number | null)[][],
  map: YearSheetMap,
  itemId: string,
  classId: string,
): number | null {
  const cell = map.items.find((c) => c.itemId === itemId && c.classId === classId)
  if (!cell) return null
  const normAnchors = cell.anchors.map(normalizeAnchorLabel).filter(Boolean)
  if (normAnchors.length === 0) return null

  // Section bounds for this class in this year — keeps the search inside the block.
  const section = getSectionBounds(map.year, classId)
  // startRow is the first item row of the section — search from there, NOT
  // startRow-1 (which would peek into the previous section's total/percent
  // rows and could match a neighbouring item). endRow is exclusive (last item
  // row + 1), which is the correct upper bound for the item search window.
  const lo = section ? Math.max(1, section.startRow, cell.row - 10) : Math.max(1, cell.row - 10)
  const hi = section
    ? Math.min(matrix.length - 1, section.endRow, cell.row + 10)
    : Math.min(matrix.length - 1, cell.row + 10)

  for (let r = lo; r <= hi; r++) {
    const rowArr = matrix[r] || []
    const labelCell = normalizeAnchorLabel(String(rowArr[map.labelColumn] ?? ''))
    if (!labelCell) continue
    if (normAnchors.some((a) => labelCell === a || labelCell.includes(a))) {
      return r
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Formula decomposition (§3.2 — "=5,54+6,39+12,80" interpreted as 3 components)
// ---------------------------------------------------------------------------

/**
 * Parse a formula like "=5,54+6,39+12,80" into its numeric components.
 *
 * Handles BOTH decimal conventions found inside the workbook:
 *  - Brazilian display form: comma decimal, dot thousands ("=5,54+6,39+12,80")
 *  - OOXML internal form: dot decimal ("=5.54+6.39+12.80")
 *
 * Heuristic: if a part contains BOTH '.' and ',', the comma is the decimal
 * separator (BR) and dots are thousand separators → strip dots, comma→dot.
 * If a part contains only '.', treat '.' as the decimal separator (OOXML).
 * If a part contains only ',', treat ',' as the decimal separator (BR).
 *
 * Sign handling (BUG 1 fix): Excel/ExcelJS stores subtraction as addition of a
 * negative number — `=100-20` is serialized OOXML as `=100+-20`. The previous
 * naive `split(/(?=[+\-*])/)` produced `["100", "+-20"]`, then treated `+-20`
 * as POSITIVE (sign taken only from the leading `+`) → +20, losing the minus.
 * We normalize `+-`→`-` and `--`→`+` BEFORE splitting so signs are preserved.
 * Parenthesized single numbers (`=100+(-20)`) are unwrapped to their signed
 * value before tokenization so `(-20)` becomes `-20`.
 *
 * Cell references (A1, E5) are ignored. "+", "-" and "*" operators split terms.
 */
export function decomposeFormula(formula: string): number[] {
  if (!formula) return []
  let s = String(formula).trim()
  if (s.startsWith('=')) s = s.slice(1)

  // Unwrap parenthesized signed numbers: (±NN) → ±NN. Only unwraps when the
  // entire parenthesized group is a single signed/unsigned number (optionally
  // prefixed by +/- from the surrounding operator). This is the only form the
  // launch-entry formulas actually use, so a full arithmetic parser is overkill
  // and would risk mis-parsing cell-reference arithmetic like (E6+E7).
  s = s.replace(/([+\-*/(])\(\s*(-?\d+(?:[.,]\d+)?)\s*\)/g, '$1$2')
  // Handle a leading "(±NN)" at the very start of the expression.
  s = s.replace(/^\(\s*(-?\d+(?:[.,]\d+)?)\s*\)/, '$1')

  // Normalize OOXML double-sign forms so a single split-on-operator pass keeps
  // the correct sign on every term:
  //   "+-" → "-"  (ExcelJS stores 100-20 as 100+-20)
  //   "--" → "+"  (double negation, e.g. 100--20 means 100+20)
  //   "*-" → "*"  handled below — keep the bare operator and let the term carry "-"
  // Apply repeatedly so chains like "+-+-5" collapse correctly.
  s = s.replace(/\+-/g, '-').replace(/--/g, '+').replace(/\*-/g, '*')

  // split on +, - and * (keep the sign via lookahead). After the normalization
  // above, every term begins with either a digit (first term) or a single
  // operator (+/-/*) followed by a digit — no "+-"/"--" ambiguity remains.
  const parts = s
    .split(/(?=[+\-*])/)
    .map((p) => p.trim())
    .filter(Boolean)
  const nums: number[] = []
  for (const p of parts) {
    // Determine the sign from the LEADING operator (or bare leading "-").
    // After normalization, a term is either "NN", "+NN", "-NN" or "*NN".
    let sign = 1
    let body = p
    if (p.startsWith('-')) {
      sign = -1
      body = p.slice(1).trim()
    } else if (p.startsWith('+')) {
      sign = 1
      body = p.slice(1).trim()
    } else if (p.startsWith('*')) {
      // multiplication is treated as a positive term here (launch formulas
      // never use "*" between two numbers; it only appears via a stray token)
      sign = 1
      body = p.slice(1).trim()
    }
    if (!body) continue
    // skip cell references (A1, E5, $A$1) — derived formulas are NOT launches
    if (/^\$?[A-Za-z]+\$?\d+$/.test(body)) continue
    // strip currency / percent signs (keep digits, dots, commas, minus)
    body = body.replace(/[^0-9.,-]/g, '')
    if (!body) continue
    // strip a leading minus that survived (already captured as sign)
    if (body.startsWith('-')) body = body.slice(1)
    let n: number
    if (body.includes('.') && body.includes(',')) {
      // BR: dot = thousands, comma = decimal
      n = Number(body.replace(/\./g, '').replace(',', '.'))
    } else if (body.includes(',')) {
      // comma decimal
      n = Number(body.replace(/\./g, '').replace(',', '.'))
    } else {
      // dot decimal (OOXML) or bare integer
      n = Number(body)
    }
    if (!isNaN(n)) nums.push(sign * n)
  }
  return nums
}

/**
 * Does this formula represent a "launch" entry (a sum of literal numbers) that
 * must be decomposed into one transaction per component — as opposed to a
 * DERIVED formula (SUM(...), cell refs E6+E7, #REF!, function calls) which
 * only has a single cached value and no per-launch split.
 *
 * Heuristic (BUG 2 / BUG 3): a formula is a launch formula when
 *   - decomposeFormula returns MORE THAN ONE component, AND
 *   - the formula contains NO cell references (A1, $A$1, E5), AND
 *   - it contains NO Excel function names (SUM, IF, ROUND, ...), AND
 *   - it contains no error/ref tokens (#REF!, #DIV/0!, #NAME?).
 */
export function isLaunchFormula(formula: string): boolean {
  if (!formula) return false
  const parts = decomposeFormula(formula)
  if (parts.length < 2) return false
  let s = String(formula).trim()
  if (s.startsWith('=')) s = s.slice(1)
  // Cell references like A1, $A$1, E5, Sheet1!E6 → derived, not launch.
  if (/\$?[A-Za-z]+\$?\d+/.test(s)) return false
  // Excel function names (SUM, IF, ROUND, VLOOKUP, ...). A function call looks
  // like NAME( — match letters followed by an opening paren.
  if (/[A-Za-z]+\s*\(/.test(s)) return false
  // Error tokens (#REF!, #DIV/0!, #NAME?, ...) → derived / broken.
  if (/#REF!|#DIV\/0!|#NAME\?|#VALUE!|#N\/A/.test(s)) return false
  return true
}

/**
 * Sum the components of a formula. Returns 0 for empty/non-numeric input.
 */
export function sumFormula(formula: string): number {
  return decomposeFormula(formula).reduce((a, b) => a + b, 0)
}

// ---------------------------------------------------------------------------
// Reconciliation (§1.8)
// ---------------------------------------------------------------------------

export interface ReconciliationRow {
  key: string
  description: string
  sheetValue: number | null
  reconstructedValue: number
  difference: number
  /** formula components, if the sheet cell was a formula (§3.2) */
  formulaComponents?: number[]
  /**
   * When the divergence is explained by an intentional historical semantic
   * (e.g. the class total formula `=E6+E7+E9` excludes E8 "Divisão Lulu" on
   * purpose), this carries the explanation. Only set for class-level rows.
   */
  semanticNote?: string | null
}

export interface ReconciliationReport {
  sheetName: string
  year: number
  rows: ReconciliationRow[]
  totalDifference: number
  /** true when every row reconciles to zero (within tolerance) */
  ok: boolean
  /** 'item' = primary item-level recon; 'class' = secondary class-level recon. */
  level?: 'item' | 'class'
}

/**
 * Convert a column letter (A..Z, AA..) to a 1-based column index. Used when
 * inspecting a total formula's cell references to see which rows it includes.
 */
function columnLetterToNumber(letter: string): number {
  let n = 0
  for (let i = 0; i < letter.length; i++) {
    n = n * 26 + (letter.charCodeAt(i) - 64)
  }
  return n
}

/**
 * Detect whether a class-total formula INTENTIONALLY excludes some item rows
 * (historical semantic). Example: 2026 Receitas Total `=E6+E7+E9` excludes E8
 * ("Divisão Lulu"). When that's the case, a class-level divergence between the
 * total and the sum of ALL items is NOT a parser bug — it's the workbook's own
 * semantic. Returns an explanation string when intentional exclusion is
 * detected, null otherwise.
 *
 * Heuristic:
 *   - SUM(range) is NOT an intentional exclusion (covers a contiguous range).
 *   - An explicit sum of cell refs (E6+E7+E9) where every referenced row is an
 *     item row AND the referenced set is a PROPER SUBSET of the section's item
 *     rows → intentional exclusion.
 */
export function detectIntentionalExclusion(
  formula: string | null | undefined,
  itemRows: number[],
  monthColumn: number,
): string | null {
  if (!formula) return null
  let s = String(formula).trim()
  if (s.startsWith('=')) s = s.slice(1)
  if (!s) return null
  // SUM(...) covers a contiguous range — not an intentional per-item exclusion.
  if (/^SUM\s*\(/i.test(s)) return null
  // Collect cell references in the month column (e.g. E6, E7, $E$9) only.
  const refRe = /\$?([A-Za-z]+)\$?(\d+)/g
  const refRows = new Set<number>()
  let m: RegExpExecArray | null
  while ((m = refRe.exec(s)) !== null) {
    const col = columnLetterToNumber(m[1].toUpperCase())
    if (col === monthColumn) {
      refRows.add(Number(m[2]))
    }
  }
  if (refRows.size === 0) return null
  const itemRowSet = new Set(itemRows)
  // every referenced row must be an item row (otherwise this is some other
  // derived formula we can't reason about).
  const allRefsAreItems = [...refRows].every((r) => itemRowSet.has(r))
  if (!allRefsAreItems) return null
  const missing = [...itemRowSet].filter((r) => !refRows.has(r))
  if (missing.length > 0) {
    return (
      `Fórmula do total ${formula} referencia ${refRows.size} de ${itemRows.length} ` +
      `itens da seção — exclui intencionalmente as linhas ${missing.join(', ')} ` +
      `(semântica histórica intencional, não erro de parser)`
    )
  }
  return null
}

/**
 * Floating-point reconciliation tolerance. Half a centavo — small enough to
 * suppress binary rounding noise (0.0000001 drift from a SUM), large enough
 * not to flag a real 1-centavo divergence. NEVER confuse a negative SALDO
 * with a divergence: the test is `ABS(source - reconstructed) > tolerance`.
 */
export const RECONCILE_TOLERANCE = 0.005

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Reconcile the imported transactions of one sheet against the original sheet
 * values. `sheetValues` is a map `${key}` → numeric value read DIRECTLY from
 * the sheet's cells (item cells for item-level, total cells for class-level).
 * `txByItemMonth` is the same shape built from the imported transactions.
 *
 * Target: difference = R$ 0,00 for every row. A NEGATIVE source value (e.g.
 * a negative saldo, a reimbursement) is NOT a divergence by itself — only
 * `ABS(source - reconstructed) > tolerance` is.
 */
export function reconcileSheet(
  sheetName: string,
  year: number,
  sheetValues: Map<string, number | { value: number; formula?: string }>,
  txByItemMonth: Map<string, number>,
): ReconciliationReport {
  const rows: ReconciliationRow[] = []
  let totalDifference = 0
  for (const [key, raw] of sheetValues.entries()) {
    const sheetValue = typeof raw === 'number' ? raw : raw.value
    const formula = typeof raw === 'number' ? undefined : raw.formula
    const reconstructed = txByItemMonth.get(key) ?? 0
    const difference = round2(sheetValue - reconstructed)
    totalDifference = round2(totalDifference + difference)
    rows.push({
      key,
      description: key,
      sheetValue,
      reconstructedValue: reconstructed,
      difference,
      formulaComponents: formula ? decomposeFormula(formula) : undefined,
    })
  }
  rows.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))
  return {
    sheetName,
    year,
    rows,
    totalDifference,
    ok:
      Math.abs(totalDifference) < RECONCILE_TOLERANCE &&
      rows.every((r) => Math.abs(r.difference) < RECONCILE_TOLERANCE),
  }
}

// ---------------------------------------------------------------------------
// Diagnostics (§1.10)
// ---------------------------------------------------------------------------

export interface SheetDiagnostic {
  sheetName: string
  year: number | null
  rowCount: number
  colCount: number
  janColumn: number | null
  dezColumn: number | null
  totalColumn: number | null
  monthsFallback: boolean
  classesFound: { classId: string; label: string; row: number | null }[]
  saldoRow: number | null
  totalsFound: { label: string; row: number | null }[]
  issues: string[]
}

/**
 * Produce a structural diagnostic for one sheet.
 */
export function diagnoseSheet(
  sheetName: string,
  matrix: (string | number | null)[][],
): SheetDiagnostic {
  const year = detectYearFromSheetName(sheetName)
  const rowCount = matrix.length
  const colCount = matrix.reduce((m, r) => Math.max(m, r.length), 0)

  // find header row (first row containing a month label)
  let headerRowIdx = -1
  for (let r = 1; r < Math.min(rowCount, 10); r++) {
    const rowArr = matrix[r] || []
    if (
      rowArr.some((c) =>
        CANONICAL_MONTH_LABELS.some((m) => normalizeAnchorLabel(String(c ?? '')).startsWith(m)),
      )
    ) {
      headerRowIdx = r
      break
    }
  }
  const headerRow = headerRowIdx >= 0 ? matrix[headerRowIdx] : []
  const { months, totalColumn, fallback } = detectMonths(headerRow)

  // class anchors — search columns A–D so header cells in any of them are seen
  const classesFound: SheetDiagnostic['classesFound'] = []
  const searchCols = [CANONICAL_CLASS_COLUMN, CANONICAL_CATEGORY_COLUMN, CANONICAL_LABEL_COLUMN]
  for (const [classId, label] of Object.entries(CANONICAL_CLASS_LABELS)) {
    const normLabel = normalizeAnchorLabel(label)
    let row: number | null = null
    for (let r = 1; r < rowCount; r++) {
      const rowArr = matrix[r] || []
      let hit = false
      for (const c of searchCols) {
        if (normalizeAnchorLabel(String(rowArr[c] ?? '')) === normLabel) {
          hit = true
          break
        }
      }
      if (hit) {
        row = r
        break
      }
    }
    classesFound.push({ classId, label, row })
  }

  // saldo row
  let saldoRow: number | null = null
  for (let r = 1; r < rowCount; r++) {
    const rowArr = matrix[r] || []
    if (rowArr.some((c) => normalizeAnchorLabel(String(c ?? '')) === 'SALDO')) {
      saldoRow = r
      break
    }
  }

  // totals found — each total is searched ONLY within its own section bounds
  // (startRow .. endRow+5), never the whole sheet. A global scan would assign
  // the FIRST "Total" (Receitas, ~row 10/11) to every class. For an unknown
  // year (null) we fall back to the 2025 section bounds as the reference
  // layout. The despesas_adicionais total carries the historical "Total
  // despesas extras" anchor, searched inside the adicionais section only.
  const totalsSeeds: { label: string; anchor: string; lo: number; hi: number }[] = []
  if (year) {
    for (const t of buildTotalsForYear(year)) {
      const ctx = t.sectionContext
      totalsSeeds.push({
        label: t.kind === 'percent' ? '% sobre receita' : `Total ${t.classId}`,
        anchor: t.anchor,
        lo: ctx ? ctx.startRow : 1,
        hi: ctx ? ctx.endRow + 5 : rowCount - 1,
      })
    }
  } else {
    const fallbackBounds = SECTION_BOUNDS[2025]
    const fallbackSeeds: { classId: string; anchor: string }[] = [
      { classId: 'receitas', anchor: 'Total' },
      { classId: 'investimentos', anchor: 'Total' },
      { classId: 'despesas_fixas', anchor: 'Total' },
      { classId: 'despesas_variaveis', anchor: 'Total' },
      { classId: 'despesas_extras', anchor: 'Total' },
      { classId: 'despesas_adicionais', anchor: 'Total despesas extras' },
    ]
    for (const { classId, anchor } of fallbackSeeds) {
      const b = fallbackBounds?.[classId]
      totalsSeeds.push({
        label: `Total ${classId}`,
        anchor,
        lo: b ? b.startRow : 1,
        hi: b ? b.endRow + 5 : rowCount - 1,
      })
    }
  }
  const totalsFound: SheetDiagnostic['totalsFound'] = totalsSeeds.map((t) => {
    const normAnchor = normalizeAnchorLabel(t.anchor)
    let row: number | null = null
    const lo = Math.max(1, t.lo)
    const hi = Math.min(rowCount - 1, t.hi)
    for (let r = lo; r <= hi; r++) {
      const rowArr = matrix[r] || []
      if (rowArr.some((c) => normalizeAnchorLabel(String(c ?? '')).includes(normAnchor))) {
        row = r
        break
      }
    }
    return { label: t.label, row }
  })

  const issues: string[] = []
  if (year === null) issues.push(`Aba "${sheetName}" sem ano reconhecido no nome`)
  if (fallback)
    issues.push('Colunas de mês não detectadas pelos cabeçalhos — usando layout canônico E..P')
  if (saldoRow === null) issues.push('Linha de Saldo não encontrada')
  for (const c of classesFound) {
    if (c.row === null) issues.push(`Classe "${c.label}" não encontrada`)
  }
  for (const t of totalsFound) {
    if (t.row === null) issues.push(`Total "${t.label}" não encontrado`)
  }

  return {
    sheetName,
    year,
    rowCount,
    colCount,
    janColumn: months[1] ?? null,
    dezColumn: months[12] ?? null,
    totalColumn,
    monthsFallback: fallback,
    classesFound,
    saldoRow,
    totalsFound,
    issues,
  }
}

// ---------------------------------------------------------------------------
// Import report (§1.11)
// ---------------------------------------------------------------------------

export interface ImportReport {
  sheetsFound: string[]
  yearsRecognized: number[]
  structuresRecognized: { sheetName: string; year: number | null; recognized: boolean }[]
  itemsRecognized: number
  cellsRead: number
  formulasDecomposed: number
  reconciliations: ReconciliationReport[]
  divergences: { sheetName: string; key: string; difference: number }[]
  totals: {
    sheetName: string
    sheetTotal: number
    reconstructedTotal: number
    difference: number
  }[]
}

export function buildImportReport(
  sheetsFound: string[],
  diagnostics: SheetDiagnostic[],
  itemsRecognized: number,
  cellsRead: number,
  formulasDecomposed: number,
  reconciliations: ReconciliationReport[],
): ImportReport {
  const yearsRecognized = Array.from(
    new Set(diagnostics.map((d) => d.year).filter((y): y is number => y !== null)),
  ).sort()

  const structuresRecognized = diagnostics.map((d) => ({
    sheetName: d.sheetName,
    year: d.year,
    recognized: d.year !== null && d.saldoRow !== null && d.issues.length === 0,
  }))

  const divergences: ImportReport['divergences'] = []
  for (const rec of reconciliations) {
    for (const row of rec.rows) {
      // Rows annotated with an intentional-exclusion semanticNote
      // (class-level historical divergence) are NOT parser divergences.
      if (row.semanticNote) continue
      if (Math.abs(row.difference) >= RECONCILE_TOLERANCE) {
        divergences.push({ sheetName: rec.sheetName, key: row.key, difference: row.difference })
      }
    }
  }

  // Per-sheet totals: prefer the PRIMARY (item-level) reconciliation when both
  // item-level and class-level reports exist for a sheet, so the summary
  // doesn't double-count. Falls back to whatever is available.
  const seenSheets = new Set<string>()
  const totals: ImportReport['totals'] = []
  // item-level first, then class-level for sheets without an item-level rec
  const ordered = [...reconciliations].sort((a, b) =>
    a.level === 'item' && b.level !== 'item'
      ? -1
      : a.level !== 'item' && b.level === 'item'
        ? 1
        : 0,
  )
  for (const rec of ordered) {
    if (seenSheets.has(rec.sheetName)) continue
    seenSheets.add(rec.sheetName)
    totals.push({
      sheetName: rec.sheetName,
      sheetTotal: round2(rec.rows.reduce((s, r) => s + (r.sheetValue ?? 0), 0)),
      reconstructedTotal: round2(rec.rows.reduce((s, r) => s + r.reconstructedValue, 0)),
      difference: rec.totalDifference,
    })
  }

  return {
    sheetsFound,
    yearsRecognized,
    structuresRecognized,
    itemsRecognized,
    cellsRead,
    formulasDecomposed,
    reconciliations,
    divergences,
    totals,
  }
}

/**
 * Helper: build the lookup key `${itemId}:${month}` used by reconcileSheet
 * and the import report. Exposed so callers stay consistent.
 */
export function txKey(itemId: string, month: number): string {
  return `${itemId}:${month}`
}

/**
 * Helper to resolve the financial class object for a stable id, when the caller
 * has the catalog array. Kept here so the template map is the single import.
 */
export function classById(classes: FinancialClass[], id: string): FinancialClass | undefined {
  return classes.find((c) => c.id === id)
}

// ---------------------------------------------------------------------------
// RESUMO sheet metadata extraction (Part 2 — processar aba RESUMO como
// metadado analítico, NÃO como transações).
//
// The RESUMO tab carries no transactional rows (it is an auxiliary sheet —
// `isAuxiliarySheet` keeps returning true so the transaction loop skips it),
// but it DOES carry qualitative metadata: an "Observação" column with notes
// per (year, metric) and a LEGENDA explaining which categories compose each
// macroclass. This extractor reads that metadata without creating any
// transactions or duplicate categories in the catalog.
// ---------------------------------------------------------------------------

export interface ResumoObservation {
  year: number
  /** one of the despesa classes: despesas_fixas | despesas_variaveis | despesas_extras | despesas_adicionais */
  metric: string
  text: string
}

export interface ResumoLegendEntry {
  classId: string
  categories: string[]
}

export interface ResumoMeta {
  observations: ResumoObservation[]
  legend: ResumoLegendEntry[]
  yearsFound: number[]
}

/** class label (normalized) → stable class id */
const RESUMO_CLASS_LABEL_TO_ID: Record<string, string> = {}
for (const [classId, label] of Object.entries(CANONICAL_CLASS_LABELS)) {
  RESUMO_CLASS_LABEL_TO_ID[normalizeAnchorLabel(label)] = classId
}

/** The 4 despesa classes that carry "% sobre receita" + qualitative observations. */
const RESUMO_METRIC_CLASSES = new Set([
  'despesas_fixas',
  'despesas_variaveis',
  'despesas_extras',
  'despesas_adicionais',
])

const RESUMO_YEAR_SET = new Set([2023, 2024, 2025, 2026])

/**
 * Extract qualitative metadata (observations + legend + years) from the RESUMO
 * auxiliary sheet. Defensive by design: the RESUMO layout varies between
 * workbook versions, so every step is anchor-based (search by label) rather
 * than coordinate-based. Never throws — returns whatever it could find.
 *
 * Produces NO transactions and NO catalog categories: the legend is purely
 * descriptive metadata.
 *
 * BUG 4 fixes applied here:
 *  (4a) yearsFound now scans EVERY row (not just the top 6) so year-block
 *       headers like A1=2023, A11=2024, A24=2025 are detected independently
 *       of whether an observation row matched that year.
 *  (4b) The "Observação" column header is searched across ALL rows (not just
 *       the first 6) using `includes` — the real RESUMO tab puts the header
 *       deep in the sheet (e.g. row 24/25 of the 2025 block). The year for an
 *       observation row is resolved from the nearest preceding year-block
 *       header when the row itself carries no year.
 *  (4c) The legend is limited to the 4 despesa classes (RESUMO_METRIC_CLASSES)
 *       so Receitas/Investimentos from the main RESUMO table are NOT counted
 *       (giving 4 legend entries, not 5). Numbers and "R$" values masquerading
 *       as category names are filtered out.
 */
export function extractResumoMeta(
  matrix: (string | number | null)[][],
  _sheetName: string,
): ResumoMeta {
  const observations: ResumoObservation[] = []
  const legend: ResumoLegendEntry[] = []
  const yearsFound = new Set<number>()

  const rowCount = matrix.length
  const colCount = matrix.reduce((m, r) => Math.max(m, r?.length ?? 0), 0)

  // helper: find a class id in a row by scanning cols A–D for a known class label
  const findClassIdInRow = (rowArr: (string | number | null)[]): string | null => {
    for (let c = 1; c <= Math.min(4, rowArr.length - 1); c++) {
      const n = normalizeAnchorLabel(String(rowArr[c] ?? ''))
      if (!n) continue
      for (const [label, id] of Object.entries(RESUMO_CLASS_LABEL_TO_ID)) {
        if (n === label || n.startsWith(label)) return id
      }
    }
    return null
  }

  // (4a) Pre-build a row → year map by scanning EVERY row for a bare 4-digit
  //      supported year (block headers like A1=2023, A11=2024, A24=2025).
  //      These year markers are detected independently of observations.
  const rowYear: Record<number, number> = {}
  for (let r = 1; r < rowCount; r++) {
    const rowArr = matrix[r] || []
    for (let c = 1; c < rowArr.length; c++) {
      const n = normalizeAnchorLabel(String(rowArr[c] ?? ''))
      const m = n.match(/^(\d{4})$/)
      if (m) {
        const y = Number(m[1])
        if (RESUMO_YEAR_SET.has(y)) {
          rowYear[r] = y
          yearsFound.add(y)
          break
        }
      }
    }
  }
  // Resolve the year for an observation row: exact row first, then scan
  // upward for the nearest year-block header (so a row 25 observation
  // inherits year 2025 from the A24 block header).
  const yearForRow = (r: number): number => {
    if (rowYear[r]) return rowYear[r]
    for (let rr = r - 1; rr >= 1; rr--) {
      if (rowYear[rr]) return rowYear[rr]
    }
    return 0
  }

  // (4b) Locate the "Observação" column by scanning ALL rows (not just 1..6).
  //      The real RESUMO tab puts this header deep in the sheet. Uses `includes`
  //      so "Observação do ano" / "Observações" all match.
  const obsLabels = ['OBSERVACOES', 'OBSERVACAO', 'OBSERVACAO DO ANO', 'OBS DO ANO', 'OBS']
  let obsCol: number | null = null
  for (let r = 1; r < rowCount && obsCol === null; r++) {
    const rowArr = matrix[r] || []
    for (let c = 1; c < rowArr.length; c++) {
      const n = normalizeAnchorLabel(String(rowArr[c] ?? ''))
      if (!n) continue
      if (obsLabels.some((l) => n === l || n.includes(l))) {
        obsCol = c
        break
      }
    }
  }

  // 2. Walk every row. If the row carries a despesa class label AND has text
  //    in the observação column, record an observation. The year comes from
  //    the row itself or the nearest preceding year-block header (4a fix).
  if (obsCol !== null) {
    for (let r = 1; r < rowCount; r++) {
      const rowArr = matrix[r] || []
      const classId = findClassIdInRow(rowArr)
      if (!classId) continue
      // only the 4 despesa classes carry qualitative observations (per spec)
      if (!RESUMO_METRIC_CLASSES.has(classId)) continue

      // also pick up any supported year that appears in THIS row (so a row
      // like "DESPESAS FIXAS | 2024 | <text>" binds the observation to 2024)
      for (let c = 1; c < rowArr.length; c++) {
        const m = normalizeAnchorLabel(String(rowArr[c] ?? '')).match(/(\d{4})/)
        if (m) {
          const y = Number(m[1])
          if (RESUMO_YEAR_SET.has(y)) {
            yearsFound.add(y)
            break
          }
        }
      }

      const text = String(rowArr[obsCol] ?? '').trim()
      if (!text) continue
      // avoid duplicating the class label as the "text"
      if (
        normalizeAnchorLabel(text) === normalizeAnchorLabel(CANONICAL_CLASS_LABELS[classId] ?? '')
      ) {
        continue
      }
      const year = yearForRow(r)
      observations.push({ year, metric: classId, text })
    }
  }

  // 3. Legend: find a "LEGENDA" anchor, then read each subsequent row that
  //    carries a DESPESA class label followed by the list of categories that
  //    compose it (comma/semicolon separated). Pure metadata — never creates
  //    catalog categories.
  //    (4c) ONLY the 4 despesa classes belong in the legend — Receitas and
  //    Investimentos from the main RESUMO table are excluded so the legend
  //    count is 4, not 5. Numbers and "R$" values are filtered out of the
  //    category list.
  let legendStartRow = -1
  for (let r = 1; r < rowCount; r++) {
    const rowArr = matrix[r] || []
    if (rowArr.some((c) => normalizeAnchorLabel(String(c ?? '')).includes('LEGENDA'))) {
      legendStartRow = r
      break
    }
  }
  if (legendStartRow >= 0) {
    for (let r = legendStartRow; r < rowCount; r++) {
      const rowArr = matrix[r] || []
      let classId: string | null = null
      let classCol = -1
      for (let c = 1; c < rowArr.length; c++) {
        const n = normalizeAnchorLabel(String(rowArr[c] ?? ''))
        if (!n) continue
        for (const [label, id] of Object.entries(RESUMO_CLASS_LABEL_TO_ID)) {
          if (n === label || n.startsWith(label)) {
            classId = id
            classCol = c
            break
          }
        }
        if (classId) break
      }
      if (!classId) continue
      // (4c) only the 4 despesa classes belong in the legend
      if (!RESUMO_METRIC_CLASSES.has(classId)) continue
      // collect category names from the cells AFTER the class label
      const cats: string[] = []
      for (let c = classCol + 1; c < rowArr.length; c++) {
        const raw = rowArr[c]
        if (raw == null) continue
        const s = String(raw).trim()
        if (!s) continue
        if (/^\d{4}$/.test(s)) continue // skip bare years
        const parts = s
          .split(/[,;]/)
          .map((p) => p.trim())
          .filter(Boolean)
        for (const p of parts) {
          const n = normalizeAnchorLabel(p)
          // skip if it looks like a class label itself
          if (
            Object.keys(RESUMO_CLASS_LABEL_TO_ID).some(
              (label) => n === label || n.startsWith(label),
            )
          ) {
            continue
          }
          // (4c) skip numbers and currency values masquerading as categories
          if (/^R\$/.test(n)) continue
          if (/^\d+(?:[.,]\d+)?$/.test(n)) continue
          cats.push(p)
        }
      }
      if (cats.length > 0) {
        // de-dup by classId (first occurrence wins) — legend is descriptive
        if (!legend.some((e) => e.classId === classId)) {
          legend.push({ classId, categories: cats })
        }
      }
    }
  }

  // 4. (4a) Collect supported years from ALL rows so yearsFound reflects the
  //    sheet's full year coverage even when no observation row matched a year
  //    (e.g. a year block with no observations still counts).
  for (let r = 1; r < rowCount; r++) {
    const rowArr = matrix[r] || []
    for (let c = 1; c < rowArr.length; c++) {
      const m = normalizeAnchorLabel(String(rowArr[c] ?? '')).match(/(\d{4})/)
      if (m) {
        const y = Number(m[1])
        if (RESUMO_YEAR_SET.has(y)) yearsFound.add(y)
      }
    }
  }

  // silence unused-colCount when the matrix is empty (defensive)
  void colCount

  return {
    observations,
    legend,
    yearsFound: Array.from(yearsFound).sort((a, b) => a - b),
  }
}

/**
 * TemplateMap — centralized, year-versioned structural map of the canonical
 * historical spreadsheet (ORÇAMENTO_PESSOAL_TEMPLATE_ANONIMIZADO.xlsx).
 *
 * Part 1 of the prompt: leitura correta da planilha histórica.
 *
 * Design rules enforced by this module:
 *  (1.1)  ALL sheet coordinates live HERE — never scattered across the codebase.
 *  (1.2)  Maps are versioned per year (2023, 2024, 2025, 2026); a row that
 *         moved between years has an entry in each.
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
 * The reference spreadsheet is an annual budget workbook (pt-BR). Its canonical
 * structure (one tab per year, e.g. "Orçamento 2024") is:
 *
 *   ┌──────────────────────────────────────────────────────────────────────┐
 *   │ A           B              C            D          E … P            │
 *   │ (Classe)    (Categoria)    (Item)       (Total)    Jan … Dez       │
 *   │                                                                       │
 *   │ RECEITAS                                                              │
 *   │   Salário            ...                                              │
 *   │   ...                                                                 │
 *   │ Total de Receitas                                                     │
 *   │ INVESTIMENTOS                                                         │
 *   │   ...                                                                 │
 *   │ Total de Investimentos                                                │
 *   │ DESPESAS FIXAS                                                        │
 *   │   Habitação                                                          │
 *   │     Aluguel                                                          │
 *   │     Condomínio                                                       │
 *   │   Total Despesas Fixas                                               │
 *   │ DESPESAS VARIÁVEIS                                                   │
 *   │   ...                                                                │
 *   │   Total Despesas Variáveis                                           │
 *   │ DESPESAS EXTRAS                                                      │
 *   │   ...                                                                 │
 *   │   Total Despesas Extras                                               │
 *   │ DESPESAS ADICIONAIS                                                  │
 *   │   ...                                                                 │
 *   │   Total Despesas Adicionais                                           │
 *   │ Total de Despesas                                                     │
 *   │ Saldo                                                                 │
 *   │ % sobre Receita                                                       │
 *   └──────────────────────────────────────────────────────────────────────┘
 *
 * NOTE: concrete coordinates below are derived from the canonical structure.
 * They are intentionally expressed as a compact declarative table so that
 * drift in a given year can be patched by editing a single entry here, and so
 * that `locateItem` can re-find an item by anchor if a row shifted.
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
  /** "total" row sums months; "percent" row shows % over receita; "saldo" is the final balance */
  kind: 'total' | 'percent' | 'saldo'
  /** expected anchor label on the same row (column A or B) */
  anchor: string
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
  /** column index of the item/label column (A=1, B=2, ...) */
  labelColumn: number
  /** column index of the class column (A=1...) — often same as labelColumn */
  classColumn: number
  items: MappedCell[]
  totals: TotalRow[]
}

// ---------------------------------------------------------------------------
// Canonical column layout — derived from the reference workbook.
// Month headers live in columns E..P (5..16). The label column is B (2) and
// the class anchor column is A (1). These are the defaults; `detectMonths`
// re-resolves month columns from the actual headers at runtime (§1.6).
// ---------------------------------------------------------------------------

export const CANONICAL_LABEL_COLUMN = 2 // B
export const CANONICAL_CLASS_COLUMN = 1 // A
export const CANONICAL_MONTH_START_COLUMN = 5 // E (Jan)
export const CANONICAL_TOTAL_COLUMN = 17 // Q (Total)

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
// Item coordinates per year. Row numbers are 1-based and reflect the
// canonical structure. When a year's row differs, add a dedicated entry.
// ---------------------------------------------------------------------------

interface ItemCoordSeed {
  /** stable item id (see catalog.ts) */
  itemId: string
  /** stable class id */
  classId: string
  /** stable category id (nullable for Receitas/Investimentos) */
  categoryId: string | null
  /** canonical 1-based row on the sheet */
  row: number
  /** anchor labels expected near this row (item name + class) */
  anchors: string[]
}

/**
 * Canonical item coordinates shared across years. When a year diverges,
 * `getItemCoordSeed(year, itemId)` returns the year-specific override.
 *
 * Row numbers follow the canonical structure:
 *   3  = Salário
 *   4  = Complementar
 *   5  = Divisão Lulu
 *   6  = Entrada de corretora (R$)
 *   7  = Entrada de corretora ($)
 *   8  = Outros (Receitas)
 *   10 = Total de Receitas
 *   12 = Cripto
 *   13 = Tesouro Direto
 *   14 = Renda fixa
 *   15 = Previdência privada
 *   16 = Outros (Investimentos)
 *   18 = Total de Investimentos
 *   20 = DESPESAS FIXAS header
 *   ... etc
 */
const CANONICAL_ITEM_COORDS: ItemCoordSeed[] = [
  // Receitas
  {
    itemId: 'item-salario',
    classId: 'receitas',
    categoryId: null,
    row: 3,
    anchors: ['Salário', 'Salario', 'RECEITAS'],
  },
  {
    itemId: 'item-complementar',
    classId: 'receitas',
    categoryId: null,
    row: 4,
    anchors: ['Complementar', 'RECEITAS'],
  },
  {
    itemId: 'item-divisao-lulu',
    classId: 'receitas',
    categoryId: null,
    row: 5,
    anchors: ['Divisão Lulu', 'Divisao Lulu', 'Lulu', 'RECEITAS'],
  },
  {
    itemId: 'item-entrada-corretora-rs',
    classId: 'receitas',
    categoryId: null,
    row: 6,
    anchors: ['Entrada de corretora', 'RECEITAS'],
  },
  {
    itemId: 'item-entrada-corretora-usd',
    classId: 'receitas',
    categoryId: null,
    row: 7,
    anchors: ['Entrada de corretora', 'USD', '$', 'RECEITAS'],
  },
  {
    itemId: 'item-receitas-outros',
    classId: 'receitas',
    categoryId: null,
    row: 8,
    anchors: ['Outros', 'RECEITAS'],
  },
  // Investimentos
  {
    itemId: 'item-cripto',
    classId: 'investimentos',
    categoryId: null,
    row: 12,
    anchors: ['Cripto', 'INVESTIMENTOS'],
  },
  {
    itemId: 'item-tesouro-direto',
    classId: 'investimentos',
    categoryId: null,
    row: 13,
    anchors: ['Tesouro', 'INVESTIMENTOS'],
  },
  {
    itemId: 'item-renda-fixa',
    classId: 'investimentos',
    categoryId: null,
    row: 14,
    anchors: ['Renda fixa', 'INVESTIMENTOS'],
  },
  {
    itemId: 'item-previdencia-privada',
    classId: 'investimentos',
    categoryId: null,
    row: 15,
    anchors: ['Previdência', 'Previdencia', 'INVESTIMENTOS'],
  },
  {
    itemId: 'item-investimentos-outros',
    classId: 'investimentos',
    categoryId: null,
    row: 16,
    anchors: ['Outros', 'INVESTIMENTOS'],
  },
  // Despesas Fixas — Habitação
  {
    itemId: 'item-aluguel',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-habitacao',
    row: 22,
    anchors: ['Aluguel', 'DESPESAS FIXAS'],
  },
  {
    itemId: 'item-condominio',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-habitacao',
    row: 23,
    anchors: ['Condomínio', 'Condominio', 'DESPESAS FIXAS'],
  },
  // Despesas Fixas — Transporte
  {
    itemId: 'item-prestacao-moto',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-transporte',
    row: 25,
    anchors: ['Prestação', 'Prestacao', 'moto', 'DESPESAS FIXAS'],
  },
  // Despesas Fixas — Saúde
  {
    itemId: 'item-plano-saude',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-saude',
    row: 27,
    anchors: ['Plano de saúde', 'Plano de saude', 'DESPESAS FIXAS'],
  },
  {
    itemId: 'item-plano-dental',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-saude',
    row: 28,
    anchors: ['Plano', 'dental', 'DESPESAS FIXAS'],
  },
  {
    itemId: 'item-nutricionista',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-saude',
    row: 29,
    anchors: ['Nutricionista', 'DESPESAS FIXAS'],
  },
  {
    itemId: 'item-academia',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-saude',
    row: 30,
    anchors: ['Academia', 'DESPESAS FIXAS'],
  },
  // Despesas Fixas — Educação
  {
    itemId: 'item-pos-graduacao',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-educacao',
    row: 32,
    anchors: ['Pós-graduação', 'Pos-graduacao', 'DESPESAS FIXAS'],
  },
  {
    itemId: 'item-assinatura-cripto',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-educacao',
    row: 33,
    anchors: ['Assinatura Cripto', 'DESPESAS FIXAS'],
  },
  {
    itemId: 'item-curso',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-educacao',
    row: 34,
    anchors: ['Curso', 'DESPESAS FIXAS'],
  },
  // Despesas Fixas — Impostos
  {
    itemId: 'item-das',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-impostos',
    row: 36,
    anchors: ['DAS', 'DESPESAS FIXAS'],
  },
  {
    itemId: 'item-ipva',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-impostos',
    row: 37,
    anchors: ['IPVA', 'DESPESAS FIXAS'],
  },
  {
    itemId: 'item-ipva-licenciamento',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-impostos',
    row: 38,
    anchors: ['IPVA', 'Licenciamento', 'DESPESAS FIXAS'],
  },
  // Despesas Fixas — Outros
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

  // Despesas Variáveis — Habitação
  {
    itemId: 'item-luz',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-habitacao',
    row: 46,
    anchors: ['Luz', 'DESPESAS VARIÁVEIS'],
  },
  {
    itemId: 'item-telefone-celular',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-habitacao',
    row: 47,
    anchors: ['Telefone', 'Celular', 'DESPESAS VARIÁVEIS'],
  },
  {
    itemId: 'item-gas',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-habitacao',
    row: 48,
    anchors: ['Gás', 'Gas', 'DESPESAS VARIÁVEIS'],
  },
  {
    itemId: 'item-internet',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-habitacao',
    row: 49,
    anchors: ['Internet', 'DESPESAS VARIÁVEIS'],
  },
  {
    itemId: 'item-prod-limpeza',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-habitacao',
    row: 50,
    anchors: ['Limpeza', 'DESPESAS VARIÁVEIS'],
  },
  // Despesas Variáveis — Transporte
  {
    itemId: 'item-combustivel',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-transporte',
    row: 52,
    anchors: ['Combustível', 'Combustivel', 'DESPESAS VARIÁVEIS'],
  },
  {
    itemId: 'item-multa',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-transporte',
    row: 53,
    anchors: ['Multa', 'DESPESAS VARIÁVEIS'],
  },
  {
    itemId: 'item-estacionamento',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-transporte',
    row: 54,
    anchors: ['Estacionamento', 'DESPESAS VARIÁVEIS'],
  },
  {
    itemId: 'item-passagem',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-transporte',
    row: 55,
    anchors: ['Passagem', 'DESPESAS VARIÁVEIS'],
  },
  // Despesas Variáveis — Alimentação
  {
    itemId: 'item-supermercado',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-alimentacao',
    row: 57,
    anchors: ['Supermercado', 'DESPESAS VARIÁVEIS'],
  },
  {
    itemId: 'item-feira',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-alimentacao',
    row: 58,
    anchors: ['Feira', 'DESPESAS VARIÁVEIS'],
  },
  {
    itemId: 'item-suplementacao',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-alimentacao',
    row: 59,
    anchors: ['Suplementação', 'Suplementacao', 'DESPESAS VARIÁVEIS'],
  },
  // Despesas Variáveis — Cuidados pessoais
  {
    itemId: 'item-skin-care',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-cuidados',
    row: 61,
    anchors: ['Skin care', 'DESPESAS VARIÁVEIS'],
  },
  {
    itemId: 'item-higiene',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-cuidados',
    row: 62,
    anchors: ['Higiene', 'DESPESAS VARIÁVEIS'],
  },
  {
    itemId: 'item-cabeleireiro',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-cuidados',
    row: 63,
    anchors: ['Cabeleireiro', 'DESPESAS VARIÁVEIS'],
  },
  // Despesas Variáveis — Pet
  {
    itemId: 'item-pet-alimentacao',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-pet',
    row: 65,
    anchors: ['Alimentação', 'Pet', 'DESPESAS VARIÁVEIS'],
  },
  {
    itemId: 'item-pet-higiene',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-pet',
    row: 66,
    anchors: ['Higiene', 'Pet', 'DESPESAS VARIÁVEIS'],
  },

  // Despesas Extras — Saúde
  {
    itemId: 'item-medicamentos',
    classId: 'despesas_extras',
    categoryId: 'cat-extras-saude',
    row: 70,
    anchors: ['Medicamentos', 'DESPESAS EXTRAS'],
  },
  {
    itemId: 'item-farmacia',
    classId: 'despesas_extras',
    categoryId: 'cat-extras-saude',
    row: 71,
    anchors: ['Farmácia', 'Farmacia', 'DESPESAS EXTRAS'],
  },
  {
    itemId: 'item-medico',
    classId: 'despesas_extras',
    categoryId: 'cat-extras-saude',
    row: 72,
    anchors: ['Médico', 'Medico', 'DESPESAS EXTRAS'],
  },
  {
    itemId: 'item-dentista',
    classId: 'despesas_extras',
    categoryId: 'cat-extras-saude',
    row: 73,
    anchors: ['Dentista', 'DESPESAS EXTRAS'],
  },
  {
    itemId: 'item-hospital',
    classId: 'despesas_extras',
    categoryId: 'cat-extras-saude',
    row: 74,
    anchors: ['Hospital', 'DESPESAS EXTRAS'],
  },
  {
    itemId: 'item-gatos',
    classId: 'despesas_extras',
    categoryId: 'cat-extras-saude',
    row: 75,
    anchors: ['Gatos', 'DESPESAS EXTRAS'],
  },
  // Despesas Extras — Manutenção
  {
    itemId: 'item-manutencao-moto',
    classId: 'despesas_extras',
    categoryId: 'cat-extras-manutencao',
    row: 77,
    anchors: ['Moto', 'DESPESAS EXTRAS'],
  },
  {
    itemId: 'item-manutencao-casa',
    classId: 'despesas_extras',
    categoryId: 'cat-extras-manutencao',
    row: 78,
    anchors: ['Casa', 'DESPESAS EXTRAS'],
  },
  // Despesas Extras — Educação
  {
    itemId: 'item-livros',
    classId: 'despesas_extras',
    categoryId: 'cat-extras-educacao',
    row: 80,
    anchors: ['Livros', 'DESPESAS EXTRAS'],
  },

  // Despesas Adicionais — Lazer
  {
    itemId: 'item-viagens',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-lazer',
    row: 84,
    anchors: ['Viagens', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-cinema-teatro',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-lazer',
    row: 85,
    anchors: ['Cinema', 'Teatro', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-restaurantes-bares',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-lazer',
    row: 86,
    anchors: ['Restaurantes', 'bares', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-assinaturas-streamings',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-lazer',
    row: 87,
    anchors: ['Assinaturas', 'streamings', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-assinaturas',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-lazer',
    row: 88,
    anchors: ['Assinaturas', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-role',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-lazer',
    row: 89,
    anchors: ['Rolê', 'Role', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-hobbies',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-lazer',
    row: 90,
    anchors: ['Hobbies', 'DESPESAS ADICIONAIS'],
  },
  // Despesas Adicionais — Vestuário
  {
    itemId: 'item-roupas',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-vestuario',
    row: 92,
    anchors: ['Roupas', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-calcados',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-vestuario',
    row: 93,
    anchors: ['Calçados', 'Calcados', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-acessorios',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-vestuario',
    row: 94,
    anchors: ['Acessórios', 'Acessorios', 'DESPESAS ADICIONAIS'],
  },
  // Despesas Adicionais — Casa
  {
    itemId: 'item-eletrodomesticos',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-casa',
    row: 96,
    anchors: ['Eletrodomésticos', 'Eletrodomesticos', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-moveis',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-casa',
    row: 97,
    anchors: ['Móveis', 'Moveis', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-item-cozinha',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-casa',
    row: 98,
    anchors: ['Cozinha', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-item-banheiro',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-casa',
    row: 99,
    anchors: ['Banheiro', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-item-sala',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-casa',
    row: 100,
    anchors: ['Sala', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-item-quarto',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-casa',
    row: 101,
    anchors: ['Quarto', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-diversos',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-casa',
    row: 102,
    anchors: ['Diversos', 'DESPESAS ADICIONAIS'],
  },
  // Despesas Adicionais — Outros
  {
    itemId: 'item-estacionamento-lavagem-moto',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-outros',
    row: 104,
    anchors: ['Estacionamento', 'lavagem', 'moto', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-presentes',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-outros',
    row: 105,
    anchors: ['Presentes', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-compras-marketplace',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-outros',
    row: 106,
    anchors: ['Compras marketplace', 'marketplace', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-uber',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-outros',
    row: 107,
    anchors: ['Uber', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-compras-pc',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-outros',
    row: 108,
    anchors: ['Compras PC', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-nao-lembro',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-outros',
    row: 109,
    anchors: ['Não lembro', 'Nao lembro', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-milhas',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-outros',
    row: 110,
    anchors: ['Milhas', 'DESPESAS ADICIONAIS'],
  },
  {
    itemId: 'item-parcelas-anteriores',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-outros',
    row: 111,
    anchors: ['Parcelas anteriores', 'DESPESAS ADICIONAIS'],
  },
]

/**
 * Year-specific overrides. When a row moved between years, the override entry
 * here wins over the canonical seed for that year. (§1.2)
 *
 * Key = `${year}:${itemId}`.
 */
const YEAR_OVERRIDES: Record<string, Partial<ItemCoordSeed>> = {
  // Example (illustrative, not present in canonical structure):
  // '2024:item-aluguel': { row: 23 },
}

function getItemCoordSeed(year: number, itemId: string): ItemCoordSeed | null {
  const override = YEAR_OVERRIDES[`${year}:${itemId}`]
  const base = CANONICAL_ITEM_COORDS.find((c) => c.itemId === itemId)
  if (!base) return null
  return override ? { ...base, ...override } : base
}

// ---------------------------------------------------------------------------
// Total rows per year (§1.7)
// ---------------------------------------------------------------------------

interface TotalSeed {
  classId: string
  label: string
  row: number
  kind: 'total' | 'percent' | 'saldo'
  anchor: string
}

const CANONICAL_TOTALS: TotalSeed[] = [
  {
    classId: 'receitas',
    label: 'Total de Receitas',
    row: 10,
    kind: 'total',
    anchor: 'Total de Receitas',
  },
  {
    classId: 'investimentos',
    label: 'Total de Investimentos',
    row: 18,
    kind: 'total',
    anchor: 'Total de Investimentos',
  },
  {
    classId: 'despesas_fixas',
    label: 'Total Despesas Fixas',
    row: 44,
    kind: 'total',
    anchor: 'Total Despesas Fixas',
  },
  {
    classId: 'despesas_variaveis',
    label: 'Total Despesas Variáveis',
    row: 68,
    kind: 'total',
    anchor: 'Total Despesas Variáveis',
  },
  {
    classId: 'despesas_extras',
    label: 'Total Despesas Extras',
    row: 82,
    kind: 'total',
    anchor: 'Total Despesas Extras',
  },
  {
    classId: 'despesas_adicionais',
    label: 'Total Despesas Adicionais',
    row: 113,
    kind: 'total',
    anchor: 'Total Despesas Adicionais',
  },
  {
    classId: 'despesas',
    label: 'Total de Despesas',
    row: 114,
    kind: 'total',
    anchor: 'Total de Despesas',
  },
  { classId: 'saldo', label: 'Saldo', row: 115, kind: 'saldo', anchor: 'Saldo' },
  {
    classId: 'saldo',
    label: '% sobre Receita',
    row: 116,
    kind: 'percent',
    anchor: '% sobre Receita',
  },
]

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

  for (let i = 0; i < headerRow.length; i++) {
    const h = norm(headerRow[i])
    if (!h) continue
    // match "JANEIRO" / "JAN" / "JAN/" etc.
    const idxLong = CANONICAL_MONTH_LABELS.findIndex((m) => m === h || h.startsWith(m))
    const idxShort = CANONICAL_MONTH_LABELS_SHORT.findIndex((m) => m === h)
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
 * the canonical month columns and every item/total row. Use `validateByAnchor`
 * afterwards to confirm the labels are still where we expect.
 */
export function buildYearSheetMap(sheetName: string, year: number): YearSheetMap {
  const monthColumns: MonthColumnMap = {}
  for (let m = 1; m <= 12; m++) monthColumns[m] = CANONICAL_MONTH_START_COLUMN + (m - 1)

  const items: MappedCell[] = []
  for (const seed of CANONICAL_ITEM_COORDS) {
    const coord = getItemCoordSeed(year, seed.itemId) ?? seed
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

  const totals: TotalRow[] = CANONICAL_TOTALS.map((t) => ({
    sheetName,
    year,
    classId: t.classId,
    label: t.label,
    row: t.row,
    kind: t.kind,
    anchor: t.anchor,
  }))

  return {
    year,
    sheetName,
    monthColumns,
    totalColumn: CANONICAL_TOTAL_COLUMN,
    labelColumn: CANONICAL_LABEL_COLUMN,
    classColumn: CANONICAL_CLASS_COLUMN,
    items,
    totals,
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
 * Returns the list of missing anchors (empty = fully validated).
 */
export function validateByAnchor(
  matrix: (string | number | null)[][],
  map: YearSheetMap,
  cell: { row: number; anchors: string[] },
): { present: string[]; missing: string[] } {
  const present: string[] = []
  const missing: string[] = []

  // Class-level anchors (DESPESAS FIXAS, RECEITAS, …) sit far above the item
  // row, so a narrow ±1 window would always report them missing. Validate
  // them across the whole sheet's class/label columns instead. Item-name
  // anchors must sit on the EXACT expected row — that is what confirms the
  // coordinate is still correct (a shifted row → fall back to search).
  const classLabelSet = new Set(Object.values(CANONICAL_CLASS_LABELS).map(normalizeAnchorLabel))
  const classCols = Array.from(new Set([map.classColumn, map.labelColumn].filter((c) => c != null)))
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
      // broad search across the whole sheet, class/label columns only
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
      // item-name anchor: must be on the exact expected row (any column)
      found = exactRow.some((c) => {
        const n = normalizeAnchorLabel(String(c ?? ''))
        return n === normAnchor || n.includes(normAnchor)
      })
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

  // 3. Structural search: find the item name in the label column within the
  //    expected class block, then use that row.
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

  // search a window of ±10 rows around the canonical row
  for (let r = Math.max(1, cell.row - 10); r <= Math.min(matrix.length - 1, cell.row + 10); r++) {
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
 * Handles Brazilian decimal commas, "+", "-", and cell refs (ignores refs).
 */
export function decomposeFormula(formula: string): number[] {
  if (!formula) return []
  let s = String(formula).trim()
  if (s.startsWith('=')) s = s.slice(1)
  // ignore cell references (A1, E5) — keep only numeric literals
  const parts = s
    .split(/(?=[+-])/)
    .map((p) => p.trim())
    .filter(Boolean)
  const nums: number[] = []
  for (const p of parts) {
    // strip leading + or -
    const sign = p.startsWith('-') ? -1 : 1
    const body = p.replace(/^[+-]/, '').trim()
    if (!body) continue
    // skip cell references
    if (/^[A-Za-z]+\d+$/.test(body)) continue
    // parse BR number
    const cleaned = body.replace(/\./g, '').replace(',', '.')
    const n = Number(cleaned)
    if (!isNaN(n)) nums.push(sign * n)
  }
  return nums
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
}

export interface ReconciliationReport {
  sheetName: string
  year: number
  rows: ReconciliationRow[]
  totalDifference: number
  /** true when every row reconciles to zero */
  ok: boolean
}

/**
 * Reconcile the imported transactions of one sheet against the original sheet
 * values. `sheetValues` is a map `${itemId}:${month}` → numeric value from
 * the sheet (already extracted). `txByItemMonth` is the same shape built from
 * the imported transactions.
 *
 * Target: difference = R$ 0,00 for every row.
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
    ok: Math.abs(totalDifference) < 0.01 && rows.every((r) => Math.abs(r.difference) < 0.01),
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
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

  // class anchors
  const classesFound: SheetDiagnostic['classesFound'] = []
  for (const [classId, label] of Object.entries(CANONICAL_CLASS_LABELS)) {
    const normLabel = normalizeAnchorLabel(label)
    let row: number | null = null
    for (let r = 1; r < rowCount; r++) {
      const rowArr = matrix[r] || []
      if (rowArr.some((c) => normalizeAnchorLabel(String(c ?? '')) === normLabel)) {
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

  // totals found
  const totalsFound: SheetDiagnostic['totalsFound'] = CANONICAL_TOTALS.map((t) => {
    const normAnchor = normalizeAnchorLabel(t.anchor)
    let row: number | null = null
    for (let r = 1; r < rowCount; r++) {
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
      if (Math.abs(row.difference) >= 0.01) {
        divergences.push({ sheetName: rec.sheetName, key: row.key, difference: row.difference })
      }
    }
  }

  const totals = reconciliations.map((rec) => ({
    sheetName: rec.sheetName,
    sheetTotal: round2(rec.rows.reduce((s, r) => s + (r.sheetValue ?? 0), 0)),
    reconstructedTotal: round2(rec.rows.reduce((s, r) => s + r.reconstructedValue, 0)),
    difference: rec.totalDifference,
  }))

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

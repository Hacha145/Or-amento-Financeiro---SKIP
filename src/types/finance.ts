export type TransactionType = 'expense' | 'income'

export interface Category {
  id: string
  name: string
  color: string // hex color e.g. #10B981
  icon?: string
  isDefault?: boolean
}

export interface Transaction {
  id: string
  date: string // YYYY-MM-DD
  description: string
  amount: number // always positive number
  type: TransactionType
  categoryId: string | null
  needsReview: boolean // true when unclassified or suggestion needing manual confirmation
  suggestedCategoryId?: string | null
  notes?: string
  source?: 'manual' | 'spreadsheet_seed' | 'import_ofx' | 'import_csv' | 'import_xlsx'
  createdAt: string
  updatedAt: string
}

export interface BudgetLimit {
  categoryId: string
  monthlyLimit: number
}

export interface ColumnMapping {
  dateCol: string
  descriptionCol: string
  amountCol: string
  categoryCol?: string
  typeCol?: string
  notesCol?: string
  hasHeader: boolean
}

export interface LearnedMapping {
  exactDescription: string // original description trimmed for display
  normalizedDescription?: string // intelligent normalized string for O(1) matching
  categoryId: string
  confirmCount: number
  lastUsedAt: string
}

export interface AppTemplateConfig {
  fileName?: string
  columnMapping: ColumnMapping
  configuredAt: string
}

export interface AppSettings {
  currency: string
  locale: string
  setupCompleted: boolean
  templateConfig?: AppTemplateConfig
}

export const DEFAULT_CATEGORIES: Category[] = [
  {
    id: 'cat-alimentacao',
    name: 'Alimentação',
    color: '#10B981',
    icon: 'Utensils',
    isDefault: true,
  },
  { id: 'cat-transporte', name: 'Transporte', color: '#3B82F6', icon: 'Car', isDefault: true },
  { id: 'cat-moradia', name: 'Moradia', color: '#F59E0B', icon: 'Home', isDefault: true },
  { id: 'cat-saude', name: 'Saúde', color: '#EF4444', icon: 'HeartPulse', isDefault: true },
  { id: 'cat-lazer', name: 'Lazer', color: '#8B5CF6', icon: 'Gamepad2', isDefault: true },
  {
    id: 'cat-educacao',
    name: 'Educação',
    color: '#EC4899',
    icon: 'GraduationCap',
    isDefault: true,
  },
  { id: 'cat-outros', name: 'Outros', color: '#6B7280', icon: 'MoreHorizontal', isDefault: true },
]

export const PALETTE_COLORS = [
  '#10B981', // Emerald
  '#3B82F6', // Blue
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#14B8A6', // Teal
  '#F97316', // Orange
  '#6366F1', // Indigo
  '#84CC16', // Lime
  '#64748B', // Slate
  '#D946EF', // Fuchsia
  '#E11D48', // Rose
]

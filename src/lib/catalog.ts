/**
 * Financial catalog — the seed of the 3-tier hierarchy
 * (FinancialClass → FinancialCategory → FinancialItem).
 *
 * Items are derived from the reference spreadsheet structure described in the
 * master prompt (ORÇAMENTO_PESSOAL_TEMPLATE, annual tabs 2023-2026). Each item
 * carries keywords (for the auto-classification engine) and aliases (for the
 * historical import / legacy-name mapping).
 *
 * NOTE: `sheetMapping` is intentionally omitted here for most items because
 * concrete row coordinates depend on the actual reference template file.
 * They can be added later via the migration / settings UI without touching
 * the catalog seed. The schema supports it whenever present.
 */
import { FinancialClass, FinancialCategory, FinancialItem } from '../types/finance'

const now = () => new Date().toISOString()

/** Month -> column letter on the reference sheet (E..P) */
const MONTH_COLS: Record<number, string> = {
  1: 'E',
  2: 'F',
  3: 'G',
  4: 'H',
  5: 'I',
  6: 'J',
  7: 'K',
  8: 'L',
  9: 'M',
  10: 'N',
  11: 'O',
  12: 'P',
}

export const DEFAULT_FINANCIAL_CLASSES: FinancialClass[] = [
  {
    id: 'receitas',
    label: 'Receitas',
    isExpense: false,
    color: '#10B981',
    icon: 'TrendingUp',
    order: 1,
  },
  {
    id: 'investimentos',
    label: 'Investimentos',
    isExpense: false, // tracked separately, neither income nor expense
    color: '#3B82F6',
    icon: 'PiggyBank',
    order: 2,
  },
  {
    id: 'despesas_fixas',
    label: 'Despesas Fixas',
    isExpense: true,
    color: '#F59E0B',
    icon: 'Anchor',
    order: 3,
  },
  {
    id: 'despesas_variaveis',
    label: 'Despesas Variáveis',
    isExpense: true,
    color: '#8B5CF6',
    icon: 'Shuffle',
    order: 4,
  },
  {
    id: 'despesas_extras',
    label: 'Despesas Extras',
    isExpense: true,
    color: '#EF4444',
    icon: 'HeartPulse',
    order: 5,
  },
  {
    id: 'despesas_adicionais',
    label: 'Despesas Adicionais',
    isExpense: true,
    color: '#EC4899',
    icon: 'Sparkles',
    order: 6,
  },
]

export const DEFAULT_FINANCIAL_CATEGORIES: FinancialCategory[] = [
  // --- Despesas Fixas ---
  {
    id: 'cat-fixas-habitacao',
    classId: 'despesas_fixas',
    name: 'Habitação',
    color: '#F59E0B',
    icon: 'Home',
    order: 1,
  },
  {
    id: 'cat-fixas-transporte',
    classId: 'despesas_fixas',
    name: 'Transporte',
    color: '#3B82F6',
    icon: 'Car',
    order: 2,
  },
  {
    id: 'cat-fixas-saude',
    classId: 'despesas_fixas',
    name: 'Saúde',
    color: '#EF4444',
    icon: 'HeartPulse',
    order: 3,
  },
  {
    id: 'cat-fixas-educacao',
    classId: 'despesas_fixas',
    name: 'Educação',
    color: '#06B6D4',
    icon: 'GraduationCap',
    order: 4,
  },
  {
    id: 'cat-fixas-impostos',
    classId: 'despesas_fixas',
    name: 'Impostos',
    color: '#D97706',
    icon: 'Receipt',
    order: 5,
  },
  {
    id: 'cat-fixas-outros',
    classId: 'despesas_fixas',
    name: 'Outros',
    color: '#6B7280',
    icon: 'MoreHorizontal',
    order: 6,
  },

  // --- Despesas Variáveis ---
  {
    id: 'cat-variaveis-habitacao',
    classId: 'despesas_variaveis',
    name: 'Habitação',
    color: '#F59E0B',
    icon: 'Home',
    order: 1,
  },
  {
    id: 'cat-variaveis-transporte',
    classId: 'despesas_variaveis',
    name: 'Transporte',
    color: '#3B82F6',
    icon: 'Car',
    order: 2,
  },
  {
    id: 'cat-variaveis-alimentacao',
    classId: 'despesas_variaveis',
    name: 'Alimentação',
    color: '#10B981',
    icon: 'Utensils',
    order: 3,
  },
  {
    id: 'cat-variaveis-cuidados',
    classId: 'despesas_variaveis',
    name: 'Cuidados pessoais',
    color: '#8B5CF6',
    icon: 'Sparkles',
    order: 4,
  },
  {
    id: 'cat-variaveis-pet',
    classId: 'despesas_variaveis',
    name: 'Pet',
    color: '#F97316',
    icon: 'PawPrint',
    order: 5,
  },

  // --- Despesas Extras ---
  {
    id: 'cat-extras-saude',
    classId: 'despesas_extras',
    name: 'Saúde',
    color: '#EF4444',
    icon: 'HeartPulse',
    order: 1,
  },
  {
    id: 'cat-extras-manutencao',
    classId: 'despesas_extras',
    name: 'Manutenção/prevenção',
    color: '#14B8A6',
    icon: 'Wrench',
    order: 2,
  },
  {
    id: 'cat-extras-educacao',
    classId: 'despesas_extras',
    name: 'Educação',
    color: '#06B6D4',
    icon: 'GraduationCap',
    order: 3,
  },

  // --- Despesas Adicionais ---
  {
    id: 'cat-adicionais-lazer',
    classId: 'despesas_adicionais',
    name: 'Lazer',
    color: '#EC4899',
    icon: 'Gamepad2',
    order: 1,
  },
  {
    id: 'cat-adicionais-vestuario',
    classId: 'despesas_adicionais',
    name: 'Vestuário',
    color: '#6366F1',
    icon: 'Shirt',
    order: 2,
  },
  {
    id: 'cat-adicionais-casa',
    classId: 'despesas_adicionais',
    name: 'Casa',
    color: '#84CC16',
    icon: 'Home',
    order: 3,
  },
  {
    id: 'cat-adicionais-outros',
    classId: 'despesas_adicionais',
    name: 'Outros',
    color: '#64748B',
    icon: 'MoreHorizontal',
    order: 4,
  },
]

interface ItemSeed {
  id: string
  classId: string
  categoryId: string | null
  name: string
  color: string
  icon?: string
  keywords: string[]
  aliases: string[]
}

const ITEM_SEEDS: ItemSeed[] = [
  // ---------- RECEITAS ----------
  {
    id: 'item-salario',
    classId: 'receitas',
    categoryId: null,
    name: 'Salário',
    color: '#10B981',
    icon: 'Briefcase',
    keywords: ['salario', 'salário', 'pagamento', 'deposito salario', 'holerite', 'remuneracao'],
    aliases: [],
  },
  {
    id: 'item-complementar',
    classId: 'receitas',
    categoryId: null,
    name: 'Complementar',
    color: '#22C55E',
    icon: 'Plus',
    keywords: ['complementar', 'bonus', 'bônus', 'comissao', 'comissão', 'extra'],
    aliases: [],
  },
  {
    id: 'item-divisao-lulu',
    classId: 'receitas',
    categoryId: null,
    name: 'Divisão Lulu',
    color: '#16A34A',
    icon: 'Users',
    keywords: ['divisao lulu', 'divisão lulu', 'lulu'],
    aliases: [],
  },
  {
    id: 'item-entrada-corretora-rs',
    classId: 'receitas',
    categoryId: null,
    name: 'Entrada de corretora (R$)',
    color: '#15803D',
    icon: 'ArrowDownToLine',
    keywords: ['entrada corretora', 'deposito corretora', 'aporte corretora'],
    aliases: [],
  },
  {
    id: 'item-entrada-corretora-usd',
    classId: 'receitas',
    categoryId: null,
    name: 'Entrada de corretora ($)',
    color: '#166534',
    icon: 'ArrowDownToLine',
    keywords: ['entrada corretora usd', 'deposito dolar'],
    aliases: [],
  },
  {
    id: 'item-receitas-outros',
    classId: 'receitas',
    categoryId: null,
    name: 'Outros',
    color: '#6B7280',
    icon: 'MoreHorizontal',
    keywords: [],
    aliases: [],
  },

  // ---------- INVESTIMENTOS ----------
  {
    id: 'item-cripto',
    classId: 'investimentos',
    categoryId: null,
    name: 'Cripto',
    color: '#3B82F6',
    icon: 'Bitcoin',
    keywords: ['cripto', 'crypto', 'bitcoin', 'btc', 'eth', 'usdt', 'coin'],
    aliases: [],
  },
  {
    id: 'item-tesouro-direto',
    classId: 'investimentos',
    categoryId: null,
    name: 'Tesouro Direto',
    color: '#1D4ED8',
    icon: 'Landmark',
    keywords: ['tesouro direto', 'tesouro selic', 'tesouro ipca'],
    aliases: [],
  },
  {
    id: 'item-renda-fixa',
    classId: 'investimentos',
    categoryId: null,
    name: 'Renda fixa',
    color: '#2563EB',
    icon: 'Landmark',
    keywords: ['renda fixa', 'cdb', 'lc', 'lci', 'lca', 'debenture'],
    aliases: [],
  },
  {
    id: 'item-previdencia-privada',
    classId: 'investimentos',
    categoryId: null,
    name: 'Previdência privada',
    color: '#1E40AF',
    icon: 'ShieldCheck',
    keywords: ['previdencia', 'previdência', 'pgb', 'vgb'],
    aliases: [],
  },
  {
    id: 'item-investimentos-outros',
    classId: 'investimentos',
    categoryId: null,
    name: 'Outros',
    color: '#6B7280',
    icon: 'MoreHorizontal',
    keywords: [],
    aliases: [],
  },

  // ---------- DESPESAS FIXAS ----------
  // Habitação
  {
    id: 'item-aluguel',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-habitacao',
    name: 'Aluguel',
    color: '#F59E0B',
    icon: 'Home',
    keywords: ['aluguel'],
    aliases: [],
  },
  {
    id: 'item-condominio',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-habitacao',
    name: 'Condomínio',
    color: '#D97706',
    icon: 'Building2',
    keywords: ['condominio', 'condomínio'],
    aliases: [],
  },
  // Transporte
  {
    id: 'item-prestacao-moto',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-transporte',
    name: 'Prestação da moto',
    color: '#3B82F6',
    icon: 'Bike',
    keywords: ['prestacao moto', 'prestação moto', 'financiamento moto'],
    aliases: [],
  },
  // Saúde
  {
    id: 'item-plano-saude',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-saude',
    name: 'Plano de saúde',
    color: '#EF4444',
    icon: 'HeartPulse',
    keywords: [
      'plano de saude',
      'plano de saúde',
      'unimed',
      'amil',
      'sulamerica',
      'bradesco saude',
      'notredame',
    ],
    aliases: [],
  },
  {
    id: 'item-plano-dental',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-saude',
    name: 'Plano de saúde dental',
    color: '#DC2626',
    icon: 'Smile',
    keywords: ['plano dental', 'odontologico', 'odontológico', 'odonto'],
    aliases: [],
  },
  {
    id: 'item-nutricionista',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-saude',
    name: 'Nutricionista',
    color: '#B91C1C',
    icon: 'Apple',
    keywords: ['nutricionista', 'nutricao', 'nutrição'],
    aliases: [],
  },
  {
    id: 'item-academia',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-saude',
    name: 'Academia',
    color: '#991B1B',
    icon: 'Dumbbell',
    keywords: ['academia', 'gym', 'fitness', 'musculacao'],
    aliases: [],
  },
  // Educação
  {
    id: 'item-pos-graduacao',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-educacao',
    name: 'Pós-graduação',
    color: '#06B6D4',
    icon: 'GraduationCap',
    keywords: ['pos graduacao', 'pós-graduação', 'posgraduacao', 'mba'],
    aliases: [],
  },
  {
    id: 'item-assinatura-cripto',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-educacao',
    name: 'Assinatura Cripto',
    color: '#0891B2',
    icon: 'Bitcoin',
    keywords: ['assinatura cripto', 'cripto assinatura'],
    aliases: [],
  },
  {
    id: 'item-curso',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-educacao',
    name: 'Curso',
    color: '#0E7490',
    icon: 'BookOpen',
    keywords: ['curso', 'cursos', 'udemy', 'alura', 'coursera'],
    aliases: [],
  },
  // Impostos
  {
    id: 'item-das',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-impostos',
    name: 'DAS',
    color: '#D97706',
    icon: 'Receipt',
    keywords: ['das', 'das simples', 'simples nacional', 'mei'],
    aliases: [],
  },
  {
    id: 'item-ipva',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-impostos',
    name: 'IPVA',
    color: '#B45309',
    icon: 'Car',
    keywords: ['ipva', 'licenciamento'],
    aliases: ['IPVA+Licenciamento'],
  },
  {
    id: 'item-ipva-licenciamento',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-impostos',
    name: 'IPVA+Licenciamento',
    color: '#92400E',
    icon: 'Car',
    keywords: ['ipva licenciamento', 'licenciamento'],
    aliases: ['IPVA'],
  },
  // Outros
  {
    id: 'item-seguro-vida',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-outros',
    name: 'Seguro de vida',
    color: '#6B7280',
    icon: 'ShieldCheck',
    keywords: ['seguro de vida', 'seguro vida'],
    aliases: [],
  },
  {
    id: 'item-crea',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-outros',
    name: 'CREA',
    color: '#4B5563',
    icon: 'FileText',
    keywords: ['crea'],
    aliases: [],
  },
  {
    id: 'item-emprestimo',
    classId: 'despesas_fixas',
    categoryId: 'cat-fixas-outros',
    name: 'Emprestimo',
    color: '#374151',
    icon: 'HandCoins',
    keywords: ['emprestimo', 'empréstimo', 'parcela emprestimo'],
    aliases: [],
  },

  // ---------- DESPESAS VARIÁVEIS ----------
  // Habitação
  {
    id: 'item-luz',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-habitacao',
    name: 'Luz',
    color: '#F59E0B',
    icon: 'Zap',
    keywords: ['luz', 'enel', 'cpfl', 'cemig', 'copel', 'neoenergia', 'eletropaulo', 'energia'],
    aliases: [],
  },
  {
    id: 'item-telefone-celular',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-habitacao',
    name: 'Telefone Celular',
    color: '#D97706',
    icon: ' Smartphone',
    keywords: ['telefone', 'celular', 'claro', 'vivo', 'tim', 'oi'],
    aliases: [],
  },
  {
    id: 'item-gas',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-habitacao',
    name: 'Gás',
    color: '#B45309',
    icon: 'Flame',
    keywords: ['gas', 'gás', 'ultragaz', 'liquigas', 'supergasbras'],
    aliases: [],
  },
  {
    id: 'item-internet',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-habitacao',
    name: 'Internet',
    color: '#92400E',
    icon: 'Wifi',
    keywords: ['internet', 'net', 'provedor'],
    aliases: [],
  },
  {
    id: 'item-prod-limpeza',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-habitacao',
    name: 'Prod. Limpeza',
    color: '#78350F',
    icon: 'SprayCan',
    keywords: ['limpeza', 'produto limpeza', 'prod limpeza'],
    aliases: [],
  },
  // Transporte
  {
    id: 'item-combustivel',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-transporte',
    name: 'Combustível',
    color: '#3B82F6',
    icon: 'Fuel',
    keywords: [
      'combustivel',
      'combustível',
      'gasolina',
      'etanol',
      'abastecimento',
      'posto',
      'ipiranga',
      'shell',
      'petrobras',
    ],
    aliases: [],
  },
  {
    id: 'item-multa',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-transporte',
    name: 'Multa',
    color: '#1D4ED8',
    icon: 'AlertTriangle',
    keywords: ['multa', 'detran'],
    aliases: [],
  },
  {
    id: 'item-estacionamento',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-transporte',
    name: 'Estacionamento',
    color: '#1E40AF',
    icon: 'SquareParking',
    keywords: ['estacionamento', 'estac'],
    aliases: [],
  },
  {
    id: 'item-passagem',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-transporte',
    name: 'Passagem',
    color: '#1E3A8A',
    icon: 'Bus',
    keywords: ['passagem', 'onibus', 'ônibus', 'metro', 'bilhete unico'],
    aliases: [],
  },
  // Alimentação
  {
    id: 'item-supermercado',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-alimentacao',
    name: 'Supermercado',
    color: '#10B981',
    icon: 'ShoppingCart',
    keywords: [
      'supermercado',
      'mercado',
      'pao de acucar',
      'carrefour',
      'atacadao',
      'extra',
      'compra',
    ],
    aliases: [],
  },
  {
    id: 'item-feira',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-alimentacao',
    name: 'Feira',
    color: '#22C55E',
    icon: 'Carrot',
    keywords: ['feira', 'hortifruti', 'hortifrute', 'sacolao'],
    aliases: [],
  },
  {
    id: 'item-suplementacao',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-alimentacao',
    name: 'Suplementação',
    color: '#16A34A',
    icon: 'Pill',
    keywords: ['suplemento', 'suplementacao', 'whey', 'proteina'],
    aliases: [],
  },
  // Cuidados pessoais
  {
    id: 'item-skin-care',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-cuidados',
    name: 'Skin care',
    color: '#8B5CF6',
    icon: 'Sparkles',
    keywords: ['skin care', 'skincare', 'cosmetico', 'creme'],
    aliases: [],
  },
  {
    id: 'item-higiene',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-cuidados',
    name: 'Higiene',
    color: '#7C3AED',
    icon: 'Droplets',
    keywords: ['higiene', 'shampoo', 'sabonete', 'pasta dental'],
    aliases: [],
  },
  {
    id: 'item-cabeleireiro',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-cuidados',
    name: 'Cabeleireiro',
    color: '#6D28D9',
    icon: 'Scissors',
    keywords: ['cabeleireiro', 'barbearia', 'corte', 'salao'],
    aliases: [],
  },
  // Pet
  {
    id: 'item-pet-alimentacao',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-pet',
    name: 'Alimentação',
    color: '#F97316',
    icon: 'PawPrint',
    keywords: ['racao', 'ração', 'pet food'],
    aliases: [],
  },
  {
    id: 'item-pet-higiene',
    classId: 'despesas_variaveis',
    categoryId: 'cat-variaveis-pet',
    name: 'Higiene',
    color: '#EA580C',
    icon: 'Droplets',
    keywords: ['pet higiene', 'banho pet', 'petshop'],
    aliases: [],
  },

  // ---------- DESPESAS EXTRAS ----------
  // Saúde
  {
    id: 'item-medicamentos',
    classId: 'despesas_extras',
    categoryId: 'cat-extras-saude',
    name: 'Medicamentos',
    color: '#EF4444',
    icon: 'Pill',
    keywords: [
      'medicamento',
      'medicamentos',
      'remedio',
      'remédio',
      'drogaria',
      'drogasil',
      'droga raia',
      'pague menos',
      'panvel',
    ],
    aliases: [],
  },
  {
    id: 'item-farmacia',
    classId: 'despesas_extras',
    categoryId: 'cat-extras-saude',
    name: 'Farmácia',
    color: '#DC2626',
    icon: 'Pill',
    keywords: ['farmacia', 'farmácia'],
    aliases: [],
  },
  {
    id: 'item-medico',
    classId: 'despesas_extras',
    categoryId: 'cat-extras-saude',
    name: 'Médico',
    color: '#B91C1C',
    icon: 'Stethoscope',
    keywords: ['medico', 'médico', 'consulta'],
    aliases: [],
  },
  {
    id: 'item-dentista',
    classId: 'despesas_extras',
    categoryId: 'cat-extras-saude',
    name: 'Dentista',
    color: '#991B1B',
    icon: 'Smile',
    keywords: ['dentista', 'odontologista'],
    aliases: [],
  },
  {
    id: 'item-hospital',
    classId: 'despesas_extras',
    categoryId: 'cat-extras-saude',
    name: 'Hospital',
    color: '#7F1D1D',
    icon: 'Cross',
    keywords: ['hospital', 'pronto socorro', 'ps'],
    aliases: [],
  },
  {
    id: 'item-gatos',
    classId: 'despesas_extras',
    categoryId: 'cat-extras-saude',
    name: 'Gatos',
    color: '#E11D48',
    icon: 'Cat',
    keywords: ['gatos', 'gato', 'veterinario', 'veterinário'],
    aliases: [],
  },
  // Manutenção/prevenção
  {
    id: 'item-manutencao-moto',
    classId: 'despesas_extras',
    categoryId: 'cat-extras-manutencao',
    name: 'Moto',
    color: '#14B8A6',
    icon: 'Bike',
    keywords: ['manutencao moto', 'manutenção moto', 'oficina', 'mecanica'],
    aliases: [],
  },
  {
    id: 'item-manutencao-casa',
    classId: 'despesas_extras',
    categoryId: 'cat-extras-manutencao',
    name: 'Casa',
    color: '#0D9488',
    icon: 'Wrench',
    keywords: ['manutencao casa', 'manutenção casa', 'reparo'],
    aliases: [],
  },
  // Educação
  {
    id: 'item-livros',
    classId: 'despesas_extras',
    categoryId: 'cat-extras-educacao',
    name: 'Livros',
    color: '#06B6D4',
    icon: 'BookOpen',
    keywords: ['livro', 'livros', 'livraria'],
    aliases: [],
  },

  // ---------- DESPESAS ADICIONAIS ----------
  // Lazer
  {
    id: 'item-viagens',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-lazer',
    name: 'Viagens',
    color: '#EC4899',
    icon: 'Plane',
    keywords: ['viagem', 'viagens', 'hotel', 'airbnb', 'booking', 'passagem aerea'],
    aliases: [],
  },
  {
    id: 'item-cinema-teatro',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-lazer',
    name: 'Cinema/teatro',
    color: '#DB2777',
    icon: 'Film',
    keywords: ['cinema', 'teatro', 'cinemark', 'cinepolis', 'ingresso'],
    aliases: [],
  },
  {
    id: 'item-restaurantes-bares',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-lazer',
    name: 'Restaurantes/bares',
    color: '#BE185D',
    icon: 'Utensils',
    keywords: ['restaurante', 'bar', 'ifood', 'rappi', 'churrascaria', 'pizza'],
    aliases: [],
  },
  {
    id: 'item-assinaturas-streamings',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-lazer',
    name: 'Assinaturas de streamings',
    color: '#A21CAF',
    icon: 'Tv',
    keywords: [
      'netflix',
      'spotify',
      'disney',
      'hbo',
      'max',
      'globoplay',
      'prime video',
      'streaming',
    ],
    aliases: [],
  },
  {
    id: 'item-assinaturas',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-lazer',
    name: 'Assinaturas',
    color: '#9333EA',
    icon: 'Repeat',
    keywords: ['assinatura', 'assinaturas'],
    aliases: [],
  },
  {
    id: 'item-role',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-lazer',
    name: 'Rolê',
    color: '#C026D3',
    icon: 'PartyPopper',
    keywords: ['role', 'rolê', 'balada', 'festa'],
    aliases: [],
  },
  {
    id: 'item-hobbies',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-lazer',
    name: 'Hobbies',
    color: '#7E22CE',
    icon: 'Gamepad2',
    keywords: ['hobby', 'hobbies', 'jogos'],
    aliases: [],
  },
  // Vestuário
  {
    id: 'item-roupas',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-vestuario',
    name: 'Roupas',
    color: '#6366F1',
    icon: 'Shirt',
    keywords: ['roupa', 'roupas', 'vestuario', 'vestuário'],
    aliases: [],
  },
  {
    id: 'item-calcados',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-vestuario',
    name: 'Calçados',
    color: '#4F46E5',
    icon: 'Footprints',
    keywords: ['calcado', 'calçado', 'tenis', 'tênis', 'sapato'],
    aliases: [],
  },
  {
    id: 'item-acessorios',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-vestuario',
    name: 'Acessórios',
    color: '#4338CA',
    icon: 'Glasses',
    keywords: ['acessorio', 'acessório', 'bolsa', 'relogio'],
    aliases: [],
  },
  // Casa
  {
    id: 'item-eletrodomesticos',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-casa',
    name: 'Eletrodomésticos',
    color: '#84CC16',
    icon: 'Refrigerator',
    keywords: ['eletrodomestico', 'geladeira', 'fogao', 'maquina'],
    aliases: [],
  },
  {
    id: 'item-moveis',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-casa',
    name: 'Móveis',
    color: '#65A30D',
    icon: 'Sofa',
    keywords: ['movel', 'móvel', 'moveis', 'sofa', 'mesa'],
    aliases: [],
  },
  {
    id: 'item-item-cozinha',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-casa',
    name: 'Item Cozinha',
    color: '#4D7C0F',
    icon: 'CookingPot',
    keywords: ['item cozinha'],
    aliases: [],
  },
  {
    id: 'item-item-banheiro',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-casa',
    name: 'Item Banheiro',
    color: '#3F6212',
    icon: 'Bath',
    keywords: ['item banheiro'],
    aliases: [],
  },
  {
    id: 'item-item-sala',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-casa',
    name: 'Item Sala',
    color: '#365314',
    icon: 'Sofa',
    keywords: ['item sala'],
    aliases: [],
  },
  {
    id: 'item-item-quarto',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-casa',
    name: 'Item Quarto',
    color: '#3F6212',
    icon: 'BedDouble',
    keywords: ['item quarto'],
    aliases: [],
  },
  {
    id: 'item-diversos',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-casa',
    name: 'Diversos',
    color: '#365314',
    icon: 'Package',
    keywords: ['diversos'],
    aliases: [],
  },
  // Outros
  {
    id: 'item-estacionamento-lavagem-moto',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-outros',
    name: 'Estacionamento/lavagem moto',
    color: '#64748B',
    icon: 'Bike',
    keywords: ['lavagem moto', 'estacionamento moto'],
    aliases: [],
  },
  {
    id: 'item-presentes',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-outros',
    name: 'Presentes',
    color: '#475569',
    icon: 'Gift',
    keywords: ['presente', 'presentes'],
    aliases: [],
  },
  {
    id: 'item-compras-marketplace',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-outros',
    name: 'Compras marketplace',
    color: '#334155',
    icon: 'ShoppingBag',
    keywords: ['marketplace', 'mercado livre', 'shopee', 'amazon', 'aliexpress'],
    aliases: [],
  },
  {
    id: 'item-uber',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-outros',
    name: 'Uber',
    color: '#1E293B',
    icon: 'Car',
    keywords: ['uber', '99 app', '99app', 'taxi', 'corrida'],
    aliases: [],
  },
  {
    id: 'item-compras-pc',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-outros',
    name: 'Compras PC',
    color: '#0F172A',
    icon: 'Laptop',
    keywords: ['compras pc', 'pc compra'],
    aliases: [],
  },
  {
    id: 'item-nao-lembro',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-outros',
    name: 'Não lembro',
    color: '#6B7280',
    icon: 'HelpCircle',
    keywords: ['nao lembro', 'não lembro'],
    aliases: [],
  },
  {
    id: 'item-milhas',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-outros',
    name: 'Milhas',
    color: '#475569',
    icon: 'Plane',
    keywords: ['milhas', 'milha'],
    aliases: [],
  },
  {
    id: 'item-parcelas-anteriores',
    classId: 'despesas_adicionais',
    categoryId: 'cat-adicionais-outros',
    name: 'Parcelas anteriores acumuladas',
    color: '#334155',
    icon: 'Layers',
    keywords: ['parcelas anteriores', 'parcela anterior'],
    aliases: [],
  },
]

export function buildDefaultFinancialItems(): FinancialItem[] {
  return ITEM_SEEDS.map((s) => ({
    id: s.id,
    classId: s.classId,
    categoryId: s.categoryId,
    name: s.name,
    color: s.color,
    icon: s.icon,
    keywords: s.keywords,
    aliases: s.aliases,
    active: true,
    validFrom: null,
    validTo: null,
    createdAt: now(),
    updatedAt: now(),
  }))
}

/**
 * Build a lookup of month -> column letter for the reference sheet.
 */
export function monthColumnLetter(month: number): string | undefined {
  return MONTH_COLS[month]
}

/**
 * Maps a legacy category name (from the old flat model) to a FinancialItem id.
 * Used during the v2 migration of existing localStorage data.
 *
 * Heuristics: keyword + name matching against the seed catalog.
 */
export function mapLegacyCategoryNameToItem(name: string): string | null {
  if (!name) return null
  const lower = name.toLowerCase().trim()
  // direct id match first
  const byId = ITEM_SEEDS.find((s) => s.id === lower)
  if (byId) return byId.id

  // a few explicit mappings from the old default categories
  const explicit: Record<string, string> = {
    alimentacao: 'item-supermercado',
    transporte: 'item-combustivel',
    moradia: 'item-aluguel',
    saude: 'item-plano-saude',
    lazer: 'item-restaurantes-bares',
    assinaturas: 'item-assinaturas',
    educacao: 'item-curso',
    impostos: 'item-das',
    'pagamento de cartao': 'item-nao-lembro',
    'pagamento de cartão': 'item-nao-lembro',
    outros: 'item-nao-lembro',
  }
  if (explicit[lower]) return explicit[lower]

  // try name match
  const byName = ITEM_SEEDS.find((s) => s.name.toLowerCase() === lower)
  if (byName) return byName.id

  // try keyword containment
  let best: { id: string; score: number } | null = null
  for (const s of ITEM_SEEDS) {
    for (const kw of s.keywords) {
      if (lower.includes(kw) || kw.includes(lower)) {
        const score = kw.length
        if (!best || score > best.score) best = { id: s.id, score }
      }
    }
  }
  return best ? best.id : null
}

/** Maps a legacy default category id (e.g. 'cat-alimentacao') to an item id. */
export function mapLegacyCategoryIdToItem(legacyId: string): string | null {
  const map: Record<string, string> = {
    'cat-alimentacao': 'item-supermercado',
    'cat-transporte': 'item-combustivel',
    'cat-moradia': 'item-aluguel',
    'cat-saude': 'item-plano-saude',
    'cat-lazer': 'item-restaurantes-bares',
    'cat-assinaturas': 'item-assinaturas',
    'cat-educacao': 'item-curso',
    'cat-impostos': 'item-das',
    'cat-cartao': 'item-nao-lembro',
    'cat-outros': 'item-nao-lembro',
  }
  return map[legacyId] ?? null
}

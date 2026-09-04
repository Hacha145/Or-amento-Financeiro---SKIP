/**
 * Motor de Identificação Precisa de Entradas (Receitas)
 *
 * Princípios do motor:
 * 1. Função pura: recebe (descrição, valor, tipo) e a identidade (userName + userAliases).
 * 2. NUNCA altera o valor (amount), a data, a categoria nem muta dados persistidos.
 * 3. Identifica entradas vinculadas à identidade do usuário (match forte):
 *    - Se descrição contém o nome completo ou alias configurado E o valor é crédito/income.
 * 4. Identifica entradas por heurísticas bancárias gerais aprimoradas (match médio):
 *    - PIX recebido, TED/DOC recebido, salário, holerite, depósito, transferência recebida,
 *      reembolso recebido, estorno recebido, proventos/dividendos etc.
 * 5. Se a descrição contém o nome do usuário mas a transação é de DÉBITO/despesa, NÃO é entrada.
 * 6. Sem valor ou valor zero: sem match positivo.
 * 7. Sem identidade configurada: não quebra e continua identificando heurísticas gerais se for income.
 */

import { normalizeRaw } from './tokenizer'
import type { UserIdentityConfig } from '../types/finance'

export type IncomeIdentificationConfidence = 'high' | 'medium' | 'none'

export interface IncomeIdentificationResult {
  /** Indica se a transação foi reconhecida com sucesso como uma entrada */
  isIdentifiedIncome: boolean
  /** Grau de confiança da identificação */
  confidence: IncomeIdentificationConfidence
  /** Motivo legível em português explicativo para tooltip ou badge */
  reason: string | null
  /** Se o reconhecimento foi especificamente vinculado ao nome ou alias do usuário */
  isUserLinked: boolean
  /** Alias ou nome que deu o match forte (quando aplicável) */
  matchedIdentifier?: string
}

/**
 * Padrões de descrição fortemente associados a entradas/receitas bancárias em pt-BR.
 * Cada padrão carrega o texto normalizado e um rótulo legível para o usuário.
 */
const INCOME_HEURISTIC_PATTERNS: { regex: RegExp; label: string }[] = [
  {
    // PIX recebido e variações bancárias (ex: "PIX RECEBIDO", "PIX RECEBIDO DE", "REC PIX", "TRANSF PIX REC", "PIX REC")
    regex:
      /\b(PIX\s+RECEBIDO(\s+DE)?|PIX\s+REC|REC\s+PIX|RECEBIMENTO\s+(DE\s+)?PIX|TRANSF\s+PIX\s+REC|PIX\s+CREDITO)\b/i,
    label: 'PIX recebido',
  },
  {
    // Transferência recebida: TED, DOC, TEF e transferências bancárias em geral,
    // cobrindo "transferencia recebida", "tranferencia recebida" (typo comum), "transferencia enviada devolvida",
    // "devolução de transferência", "credito de transf", etc.
    regex:
      /\b((TRANSF(ERENCIA)?|TRANFERENCIA|TEF|TED|DOC)\s+(RECEBIDA|RECEBIDO)(\s+DE)?|(TED|DOC|TRANSF)\s+REC|CREDITO\s+DE\s+TRANSF(ERENCIA)?|TRANSF(ERENCIA)?\s+(ENVIADA\s+)?DEVOLVIDA|DEVOLUCAO\s+DE\s+TRANSF(ERENCIA)?)\b/i,
    label: 'Transferência recebida',
  },
  {
    // Folha de pagamento, salário, vencimentos, pro labore
    regex:
      /\b(SALARIO|REMUNERACAO|VENCIMENTO(S)?|FOLHA\s+DE\s+PAG(AMEN)?TO|HOLERITE|PRO-LABORE|PRO\s+LABORE|CREDITO\s+DE\s+SALARIO|CRED\s+SALARIO)\b/i,
    label: 'Salário / Remuneração',
  },
  {
    // Depósito em conta (dinheiro, cheque, identificado, etc.)
    regex:
      /\b(DEPOSITO(\s+EM\s+CONTA)?|DEPOSITO\s+DINHEIRO|DEPOSITO\s+IDENTIFICADO|DEP\s+DINH|DEP\s+CHEQUE|CREDITO\s+DEPOSITO|DEP\s+EM\s+CONTA|DEP\s+IDENT)\b/i,
    label: 'Depósito em conta',
  },
  {
    // Reembolso, estorno, devolução recebida / devolução pix
    regex:
      /\b(REEMBOLSO(\s+RECEBIDO)?|ESTORNO(\s+RECEBIDO)?|ESTORNO\s+DE|DEVOLUCAO(\s+RECEBIDA)?|CREDITO\s+ESTORNO|DEVOLUCAO\s+PIX)\b/i,
    label: 'Reembolso ou estorno recebido',
  },
  {
    regex:
      /\b(DIVIDENDOS|RENDIMENTO(S)?|JUROS\s+S(\/|\s+)CAPITAL|JCP|PROVENTOS|RESGATE\s+INVESTIMENTO)\b/i,
    label: 'Rendimentos / Investimentos',
  },
  {
    regex: /\b(CASHBACK|BONIFICACAO|PREMIACAO)\b/i,
    label: 'Cashback ou bonificação',
  },
]

/**
 * Normaliza um identificador (nome ou alias):
 * Converte para maiúsculas, remove acentos, pontuações e colapsa espaços em branco.
 */
export function normalizeIdentifier(name: string | undefined | null): string {
  if (!name) return ''
  return normalizeRaw(name).trim()
}

/**
 * Extrai todos os termos de identidade configurados, normalizados e sem duplicatas.
 * Termos menores que 2 caracteres são descartados para evitar falsos positivos triviais.
 */
export function extractNormalizedIdentifiers(identity?: UserIdentityConfig): {
  raw: string
  normalized: string
}[] {
  if (!identity) return []
  const list: { raw: string; normalized: string }[] = []
  const seen = new Set<string>()

  const addTerm = (term: string | undefined | null) => {
    if (!term) return
    const rawTrimmed = term.trim()
    const norm = normalizeIdentifier(rawTrimmed)
    if (norm.length >= 2 && !seen.has(norm)) {
      seen.add(norm)
      list.push({ raw: rawTrimmed, normalized: norm })
    }
  }

  addTerm(identity.userName)
  if (Array.isArray(identity.userAliases)) {
    for (const alias of identity.userAliases) {
      addTerm(alias)
    }
  }

  // Ordena por comprimento decrescente para que expressões mais longas e específicas
  // (ex: nome completo antes de primeiro nome ou apelido) tenham preferência
  return list.sort((a, b) => b.normalized.length - a.normalized.length)
}

/**
 * Verifica se um texto normalizado contém um identificador como frase ou palavra inteira.
 * Evita matches parciais indesejados (ex: "ANA" em "BANANA").
 */
export function containsIdentifier(
  descriptionNormalized: string,
  identifierNormalized: string,
): boolean {
  if (!descriptionNormalized || !identifierNormalized) return false

  // Se o identificador for igual à descrição inteira
  if (descriptionNormalized === identifierNormalized) return true

  // Verifica fronteira de palavras via regex nos tokens alfanuméricos
  // Como normalizeRaw transforma pontuação em espaços, podemos usar \b ou checagem de split
  const escaped = identifierNormalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(^|\\s)${escaped}(\\s|$)`, 'i')
  return regex.test(descriptionNormalized)
}

/**
 * Função principal pura de identificação de entradas vinculadas ao usuário ou heurísticas bancárias.
 *
 * @param transaction Objeto com descrição, valor (amount) e tipo (income | expense | etc.)
 * @param identity Configuração do usuário (nome completo e aliases)
 * @returns IncomeIdentificationResult
 */
export function identifyIncome(
  transaction: {
    description: string
    amount: number
    type?: string
  },
  identity?: UserIdentityConfig,
): IncomeIdentificationResult {
  const { description, amount, type } = transaction

  // Regra base 1: valor não positivo ou ausência de descrição
  if (!amount || amount <= 0 || !description || !description.trim()) {
    return {
      isIdentifiedIncome: false,
      confidence: 'none',
      reason: null,
      isUserLinked: false,
    }
  }

  const normDesc = normalizeIdentifier(description)
  const isIncomeType = type === 'income'

  // Regra base 2: Se for explicitamente DÉBITO/despesa, NÃO é entrada, mesmo que contenha o nome do usuário
  // (ex.: pagamento efetuado pelo próprio usuário onde o nome dele consta como pagador)
  if (type === 'expense' || type === 'credit_card_payment') {
    return {
      isIdentifiedIncome: false,
      confidence: 'none',
      reason: null,
      isUserLinked: false,
    }
  }

  // Extrai identificadores configurados
  const identifiers = extractNormalizedIdentifiers(identity)

  // 1. MATCH FORTE: Transação de crédito/income contendo nome completo ou alias do usuário
  if (isIncomeType && identifiers.length > 0) {
    for (const ident of identifiers) {
      if (containsIdentifier(normDesc, ident.normalized)) {
        return {
          isIdentifiedIncome: true,
          confidence: 'high',
          reason: `Entrada vinculada a você (${ident.raw})`,
          isUserLinked: true,
          matchedIdentifier: ident.raw,
        }
      }
    }
  }

  // 2. MATCH MÉDIO / HEURÍSTICAS DE ENTRADA:
  // Se for income E/OU possuir descrição inequívoca de crédito recebido
  for (const heuristic of INCOME_HEURISTIC_PATTERNS) {
    if (heuristic.regex.test(normDesc)) {
      // Se for income OU se não tiver tipo negativo definido
      if (isIncomeType || type === undefined) {
        return {
          isIdentifiedIncome: true,
          confidence: 'medium',
          reason: heuristic.label,
          isUserLinked: false,
        }
      }
    }
  }

  // 3. Se for transação de tipo 'income' confirmada pelo extrato mas sem nome nem heurística específica
  if (isIncomeType) {
    return {
      isIdentifiedIncome: true,
      confidence: 'medium',
      reason: 'Crédito recebido em conta',
      isUserLinked: false,
    }
  }

  // Nenhuma identificação de entrada
  return {
    isIdentifiedIncome: false,
    confidence: 'none',
    reason: null,
    isUserLinked: false,
  }
}

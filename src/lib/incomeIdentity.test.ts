import { describe, it, expect } from 'vitest'
import {
  identifyIncome,
  normalizeIdentifier,
  containsIdentifier,
  extractNormalizedIdentifiers,
} from './incomeIdentity'

describe('incomeIdentity - Motor de Identificação de Entradas', () => {
  const userIdentity = {
    userName: 'Carlos Eduardo da Silva',
    userAliases: ['Carlos Silva', 'Cadu', 'C. Silva'],
  }

  describe('normalizeIdentifier e containsIdentifier', () => {
    it('normaliza caixa alta, espaços e acentos', () => {
      expect(normalizeIdentifier('  João   d Ávila  ')).toBe('JOAO D AVILA')
      expect(normalizeIdentifier('Carlos Eduardo da Silva')).toBe('CARLOS EDUARDO DA SILVA')
    })

    it('evita falsos positivos de substrings parciais (ex: ANA dentro de BANANA)', () => {
      const descNorm = normalizeIdentifier('COMPRA BANANA PRATA')
      expect(containsIdentifier(descNorm, 'ANA')).toBe(false)
      expect(containsIdentifier(descNorm, 'BANANA')).toBe(true)
    })

    it('extrai identificadores ordenados por especificidade e remove inválidos/curtos', () => {
      const ids = extractNormalizedIdentifiers({
        userName: 'Carlos Silva',
        userAliases: ['C', '', 'Cadu', 'Carlos Silva'],
      })
      expect(ids.map((i) => i.normalized)).toEqual(['CARLOS SILVA', 'CADU'])
    })
  })

  describe('identifyIncome - Match Forte vinculado ao usuário', () => {
    it('identifica entrada com nome completo exato', () => {
      const res = identifyIncome(
        {
          description: 'PIX RECEBIDO - CARLOS EDUARDO DA SILVA',
          amount: 1500,
          type: 'income',
        },
        userIdentity,
      )
      expect(res.isIdentifiedIncome).toBe(true)
      expect(res.confidence).toBe('high')
      expect(res.isUserLinked).toBe(true)
      expect(res.reason).toContain('Carlos Eduardo da Silva')
    })

    it('identifica entrada com alias configurado', () => {
      const res = identifyIncome(
        {
          description: 'TRANSF ENVIADA POR CADU REF ALUGUEL',
          amount: 800,
          type: 'income',
        },
        userIdentity,
      )
      expect(res.isIdentifiedIncome).toBe(true)
      expect(res.confidence).toBe('high')
      expect(res.isUserLinked).toBe(true)
      expect(res.reason).toContain('Cadu')
    })

    it('funciona com variações de acentuação e caixa baixa na descrição', () => {
      const res = identifyIncome(
        {
          description: 'pix recebido de carlos silva',
          amount: 250,
          type: 'income',
        },
        userIdentity,
      )
      expect(res.isIdentifiedIncome).toBe(true)
      expect(res.confidence).toBe('high')
      expect(res.isUserLinked).toBe(true)
    })

    it('identifica nome em descrição longa com códigos e ruídos bancários', () => {
      const res = identifyIncome(
        {
          description: '001 0234 9876543-2 PIX RECEBIDO DE CARLOS EDUARDO DA SILVA DOC 8847291',
          amount: 3200,
          type: 'income',
        },
        userIdentity,
      )
      expect(res.isIdentifiedIncome).toBe(true)
      expect(res.confidence).toBe('high')
      expect(res.isUserLinked).toBe(true)
    })
  })

  describe('identifyIncome - Regras de proteção e Débitos', () => {
    it('NÃO marca como entrada se o tipo for expense (débito), mesmo contendo o nome do usuário', () => {
      const res = identifyIncome(
        {
          description: 'PAGAMENTO BOLETO CARLOS EDUARDO DA SILVA',
          amount: 500,
          type: 'expense',
        },
        userIdentity,
      )
      expect(res.isIdentifiedIncome).toBe(false)
      expect(res.confidence).toBe('none')
      expect(res.isUserLinked).toBe(false)
    })

    it('NÃO marca se o tipo for pagamento de fatura com nome', () => {
      const res = identifyIncome(
        {
          description: 'PGTO FATURA NUBANK CARLOS SILVA',
          amount: 1200,
          type: 'credit_card_payment',
        },
        userIdentity,
      )
      expect(res.isIdentifiedIncome).toBe(false)
      expect(res.confidence).toBe('none')
    })

    it('não quebra nem identifica com valor zero ou negativo', () => {
      const resZero = identifyIncome(
        {
          description: 'PIX RECEBIDO CARLOS SILVA',
          amount: 0,
          type: 'income',
        },
        userIdentity,
      )
      expect(resZero.isIdentifiedIncome).toBe(false)

      const resNeg = identifyIncome(
        {
          description: 'PIX RECEBIDO CARLOS SILVA',
          amount: -100,
          type: 'income',
        },
        userIdentity,
      )
      expect(resNeg.isIdentifiedIncome).toBe(false)
    })

    it('não quebra com descrição vazia ou nula', () => {
      const res = identifyIncome(
        {
          description: '   ',
          amount: 100,
          type: 'income',
        },
        userIdentity,
      )
      expect(res.isIdentifiedIncome).toBe(false)
    })
  })

  describe('identifyIncome - Match Médio (Heurísticas bancárias sem nome)', () => {
    it('reconhece PIX recebido genérico sem nome', () => {
      const res = identifyIncome(
        {
          description: 'PIX RECEBIDO CHAVE TELEFONE LOJA',
          amount: 150,
          type: 'income',
        },
        userIdentity,
      )
      expect(res.isIdentifiedIncome).toBe(true)
      expect(res.confidence).toBe('medium')
      expect(res.isUserLinked).toBe(false)
      expect(res.reason).toBe('PIX recebido')
    })

    it('reconhece salário e folha de pagamento', () => {
      const res = identifyIncome(
        {
          description: 'CREDITO DE SALARIO EMPRESA XYZ SA',
          amount: 5400,
          type: 'income',
        },
        userIdentity,
      )
      expect(res.isIdentifiedIncome).toBe(true)
      expect(res.confidence).toBe('medium')
      expect(res.reason).toBe('Salário / Remuneração')
    })

    it('reconhece transferência bancária recebida (TED/DOC)', () => {
      const res = identifyIncome(
        {
          description: 'TED RECEBIDA BANCO 341 AG 0123 CC 98765',
          amount: 1200,
          type: 'income',
        },
        userIdentity,
      )
      expect(res.isIdentifiedIncome).toBe(true)
      expect(res.reason).toBe('Transferência recebida')
    })

    it('reconhece estorno ou reembolso recebido', () => {
      const res = identifyIncome(
        {
          description: 'ESTORNO RECEBIDO COMPRA CANCELADA',
          amount: 79.9,
          type: 'income',
        },
        userIdentity,
      )
      expect(res.isIdentifiedIncome).toBe(true)
      expect(res.reason).toBe('Reembolso ou estorno recebido')
    })

    it('reconhece crédito genérico em conta se type=income', () => {
      const res = identifyIncome(
        {
          description: 'LANCAMENTO A FAVOR CLIENTE',
          amount: 300,
          type: 'income',
        },
        userIdentity,
      )
      expect(res.isIdentifiedIncome).toBe(true)
      expect(res.confidence).toBe('medium')
      expect(res.reason).toBe('Crédito recebido em conta')
    })
  })

  describe('identifyIncome - Sem identidade configurada', () => {
    it('funciona quando o usuário não cadastrou nome nem aliases', () => {
      const res = identifyIncome(
        {
          description: 'PIX RECEBIDO CLIENTE 123',
          amount: 200,
          type: 'income',
        },
        undefined,
      )
      expect(res.isIdentifiedIncome).toBe(true)
      expect(res.confidence).toBe('medium')
      expect(res.isUserLinked).toBe(false)
    })

    it('retorna não identificado para despesas mesmo sem identidade configurada', () => {
      const res = identifyIncome(
        {
          description: 'UBER TRIP SÃO PAULO',
          amount: 25,
          type: 'expense',
        },
        undefined,
      )
      expect(res.isIdentifiedIncome).toBe(false)
      expect(res.confidence).toBe('none')
    })
  })
})

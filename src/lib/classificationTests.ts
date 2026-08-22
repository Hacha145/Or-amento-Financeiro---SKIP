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
 */

import { tokenize, tokenEquals, phraseMatches, normalizeRaw } from './tokenizer'
import { matchMerchant } from './classificationEngine'
import { decomposeFormula, sumFormula } from './templateMap'
import { MERCHANTS } from './merchants'

export interface ClassificationTest {
  id: string
  description: string
  /** expected outcome description (pt-BR) */
  expectation: string
  run: () => { pass: boolean; detail: string }
}

export const CLASSIFICATION_TESTS: ClassificationTest[] = [
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
      const { merchant } = matchMerchant('AMZZON PRIME') // typo-proof? no; use exact
      const { merchant: m2 } = matchMerchant('AMAZON PRIME')
      const winner = m2
      const pass =
        !!winner && winner.itemId === 'item-assinaturas' && winner.kind === 'subscription'
      return {
        pass,
        detail: winner
          ? `merchant=${winner.name}, kind=${winner.kind}, itemId=${winner.itemId}`
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
    id: 'mp-prefix-not-mercado-livre',
    description: '"MP * LOJA XYZ" NÃO classifica como Mercado Livre',
    expectation: "matchMerchant('MP * LOJA XYZ').merchant?.name !== 'Mercado Livre'",
    run: () => {
      const { merchant } = matchMerchant('MP * LOJA XYZ')
      const pass = !merchant || merchant.name !== 'Mercado Livre'
      return {
        pass,
        detail: merchant
          ? `merchant=${merchant.name}`
          : 'nenhum merchant (intermediador detectado, sem estabelecimento posterior)',
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

/**
 * Template import diagnostic report (Part 1 §1.11 + task step 7).
 *
 * Renders the full post-import report produced by `importTemplateXLSX`:
 *   - sheets found / years recognized / structures recognized
 *   - per-sheet diagnostics (rows, cols, month columns, classes, saldo, totals, issues)
 *   - items recognized, cells read, formulas decomposed
 *   - reconciliation: sheet totals vs reconstructed totals, per-row differences
 *   - skipped sheets (with reasons)
 *   - explicit "IMPORTAÇÃO COM DIVERGÊNCIA" banner when any reconciliation diff ≠ 0
 *
 * Never concludes silently when there is a divergence.
 */
import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  CheckCircle2,
  AlertTriangle,
  Layers,
  Table2,
  Calculator,
  FileSpreadsheet,
  AlertCircle,
  Info,
} from 'lucide-react'
import type { TemplateImportResult } from '@/lib/templateImporter'
import { CANONICAL_CLASS_LABELS } from '@/lib/templateMap'

interface Props {
  result: TemplateImportResult
}

const fmtBRL = (n: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(n)

export const TemplateImportReport: React.FC<Props> = ({ result }) => {
  const { report, diagnostics, skippedSheets, reconciliations } = result
  // A skipped sheet only counts as a divergence when it was NOT a recognized
  // auxiliary tab (RESUMO is now surfaced as metadata, not as a problem).
  const divergenceSkippedSheets = skippedSheets.filter(
    (s) => !s.reasons.some((r) => r.startsWith('Aba auxiliar reconhecida')),
  )
  const hasDivergence =
    report.divergences.length > 0 ||
    reconciliations.some((r) => !r.ok) ||
    divergenceSkippedSheets.length > 0

  return (
    <div className="space-y-4">
      {/* Divergence banner */}
      {hasDivergence ? (
        <Card className="border-amber-300 bg-amber-50/50 shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold flex items-center gap-2 text-amber-900">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              IMPORTAÇÃO COM DIVERGÊNCIA
            </CardTitle>
            <CardDescription className="text-xs text-amber-800">
              A importação não foi concluída silenciosamente. Revise os detalhes abaixo antes de
              considerar os dados confiáveis.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card className="border-emerald-300 bg-emerald-50/50 shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold flex items-center gap-2 text-emerald-900">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              Importação íntegra — diferença R$ 0,00
            </CardTitle>
            <CardDescription className="text-xs text-emerald-800">
              Todas as abas foram reconhecidas e a reconciliação total bate com a planilha.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Summary grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryTile
          icon={<Layers className="w-4 h-4 text-emerald-600" />}
          label="Abas encontradas"
          value={String(report.sheetsFound.length)}
        />
        <SummaryTile
          icon={<FileSpreadsheet className="w-4 h-4 text-emerald-600" />}
          label="Anos reconhecidos"
          value={report.yearsRecognized.length ? report.yearsRecognized.join(', ') : '—'}
        />
        <SummaryTile
          icon={<Table2 className="w-4 h-4 text-emerald-600" />}
          label="Itens reconhecidos"
          value={String(report.itemsRecognized)}
        />
        <SummaryTile
          icon={<Calculator className="w-4 h-4 text-emerald-600" />}
          label="Fórmulas decompostas"
          value={String(report.formulasDecomposed)}
        />
      </div>

      {/* Per-sheet diagnostics */}
      <Card className="border-slate-200/80 shadow-xs">
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Table2 className="w-4 h-4 text-emerald-600" />
            Diagnóstico por aba
          </CardTitle>
          <CardDescription className="text-xs">
            Estrutura detectada por âncoras (não por posições fixas). Linhas e colunas resolvidas a
            partir dos cabeçalhos reais.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-100">
            {diagnostics.map((d) => {
              const recognized = d.year !== null && d.saldoRow !== null && d.issues.length === 0
              return (
                <div key={d.sheetName} className="px-4 py-3 text-xs space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">{d.sheetName}</span>
                      {d.year !== null ? (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px]">
                          {d.year}
                        </Badge>
                      ) : (
                        <Badge className="bg-rose-100 text-rose-800 border-rose-300 text-[10px]">
                          ano?
                        </Badge>
                      )}
                      {recognized ? (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] gap-1">
                          <CheckCircle2 className="w-3 h-3" /> íntegra
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-[10px] gap-1">
                          <AlertCircle className="w-3 h-3" /> divergência
                        </Badge>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {d.rowCount} linhas × {d.colCount} cols · Jan col {d.janColumn ?? '—'} · Dez
                      col {d.dezColumn ?? '—'} · Total col {d.totalColumn ?? '—'}
                      {d.monthsFallback && ' · fallback meses'}
                    </span>
                  </div>

                  {/* Classes found */}
                  <div className="flex flex-wrap gap-1">
                    {d.classesFound.map((c) => (
                      <span
                        key={c.classId}
                        title={c.label}
                        className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                          c.row !== null
                            ? 'bg-slate-50 text-slate-600 border-slate-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {c.label}
                      </span>
                    ))}
                  </div>

                  {/* Totals found */}
                  <div className="flex flex-wrap gap-1">
                    {d.totalsFound.map((t) => (
                      <span
                        key={t.label}
                        className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                          t.row !== null
                            ? 'bg-slate-50 text-slate-600 border-slate-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {t.label} {t.row !== null ? `L${t.row}` : '✕'}
                      </span>
                    ))}
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full border bg-slate-50 text-slate-600 border-slate-200">
                      Saldo {d.saldoRow !== null ? `L${d.saldoRow}` : '✕'}
                    </span>
                  </div>

                  {/* Issues */}
                  {d.issues.length > 0 && (
                    <ul className="list-disc list-inside text-[11px] text-amber-800 space-y-0.5">
                      {d.issues.map((iss, i) => (
                        <li key={i}>{iss}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Reconciliation */}
      <Card className="border-slate-200/80 shadow-xs">
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Calculator className="w-4 h-4 text-emerald-600" />
            Reconciliação: planilha vs reconstruído
          </CardTitle>
          <CardDescription className="text-xs">
            Totais da planilha comparados aos totais reconstruídos a partir das transações
            extraídas. A diferença-alvo é R$ 0,00.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {reconciliations.length === 0 && (
            <div className="p-6 text-center text-xs text-slate-500">
              Nenhuma aba pôde ser reconciliada.
            </div>
          )}
          <div className="divide-y divide-slate-100">
            {reconciliations.map((rec) => (
              <div
                key={`${rec.sheetName}-${rec.level ?? 'item'}`}
                className="px-4 py-3 text-xs space-y-2"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">{rec.sheetName}</span>
                    {rec.level === 'class' && (
                      <Badge className="bg-slate-100 text-slate-600 border-slate-200 text-[9px]">
                        classe (diagnóstico)
                      </Badge>
                    )}
                    {rec.level === 'item' && (
                      <Badge className="bg-sky-100 text-sky-700 border-sky-200 text-[9px]">
                        item (primária)
                      </Badge>
                    )}
                  </div>
                  {rec.ok ? (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] gap-1">
                      <CheckCircle2 className="w-3 h-3" /> diff R$ 0,00
                    </Badge>
                  ) : (
                    <Badge className="bg-rose-100 text-rose-800 border-rose-300 text-[10px] gap-1">
                      <AlertTriangle className="w-3 h-3" /> diff {fmtBRL(rec.totalDifference)}
                    </Badge>
                  )}
                </div>{' '}
                {rec.rows.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead className="text-slate-400 uppercase text-[9px]">
                        <tr>
                          <th className="text-left py-1 pr-2">Item:Mês</th>
                          <th className="text-right py-1 px-2">Planilha</th>
                          <th className="text-right py-1 px-2">Reconstruído</th>
                          <th className="text-right py-1 pl-2">Diferença</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {rec.rows
                          .filter((r) => Math.abs(r.difference) >= 0.005 && !r.semanticNote)
                          .slice(0, 50)
                          .map((r) => (
                            <tr
                              key={r.key}
                              className={Math.abs(r.difference) >= 0.005 ? 'bg-rose-50/40' : ''}
                            >
                              <td className="py-1 pr-2 font-mono text-slate-600">{r.key}</td>
                              <td className="py-1 px-2 text-right text-slate-700">
                                {fmtBRL(r.sheetValue ?? 0)}
                              </td>
                              <td className="py-1 px-2 text-right text-slate-700">
                                {fmtBRL(r.reconstructedValue)}
                              </td>
                              <td
                                className={`py-1 pl-2 text-right font-semibold ${
                                  Math.abs(r.difference) >= 0.005
                                    ? 'text-rose-700'
                                    : 'text-emerald-700'
                                }`}
                              >
                                {fmtBRL(r.difference)}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                      {rec.rows.some((r) => r.semanticNote) && (
                        <tfoot>
                          <tr>
                            <td colSpan={4} className="pt-2">
                              <ul className="list-disc list-inside text-[10px] text-sky-700 space-y-0.5">
                                {rec.rows
                                  .filter((r) => r.semanticNote)
                                  .map((r, i) => (
                                    <li key={i}>
                                      <span className="font-mono">{r.key}</span> — {r.semanticNote}
                                    </li>
                                  ))}
                              </ul>
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                    {rec.rows.every((r) => Math.abs(r.difference) < 0.005 || r.semanticNote) && (
                      <div className="text-[11px] text-emerald-700 py-1">
                        Todas as {rec.rows.length} células reconciliam a R$ 0,00
                        {rec.rows.some((r) => r.semanticNote)
                          ? ' (divergências de classe explicadas por semântica histórica).'
                          : '.'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Totals summary */}
          {report.totals.length > 0 && (
            <div className="border-t px-4 py-3">
              <div className="text-[10px] uppercase text-slate-400 font-semibold mb-1">
                Totais por aba
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {report.totals.map((t) => (
                  <div
                    key={t.sheetName}
                    className="text-[11px] bg-slate-50 rounded p-2 border border-slate-100"
                  >
                    <div className="font-semibold text-slate-700 truncate">{t.sheetName}</div>
                    <div className="text-slate-500">Planilha: {fmtBRL(t.sheetTotal)}</div>
                    <div className="text-slate-500">
                      Reconstruído: {fmtBRL(t.reconstructedTotal)}
                    </div>
                    <div
                      className={`font-semibold ${
                        Math.abs(t.difference) < 0.005 ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      Diferença: {fmtBRL(t.difference)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Skipped / auxiliary sheets.
          Sheets whose reason begins with "Aba auxiliar reconhecida" (the RESUMO
          tab) are shown as recognized metadata, NOT as "ignored" — per Part 2. */}
      {skippedSheets.length > 0 && (
        <>
          {skippedSheets.some((s) =>
            s.reasons.some((r) => r.startsWith('Aba auxiliar reconhecida')),
          ) && (
            <Card className="border-sky-300 shadow-xs">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-sky-900 flex items-center gap-2">
                  <Info className="w-4 h-4 text-sky-600" />
                  Aba auxiliar reconhecida
                </CardTitle>
                <CardDescription className="text-xs text-sky-800">
                  Aba não-transacional processada como metadado analítico (observações + legenda),
                  sem gerar transações.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {skippedSheets
                  .filter((s) => s.reasons.some((r) => r.startsWith('Aba auxiliar reconhecida')))
                  .map((s) => (
                    <div key={s.sheetName} className="bg-sky-50 rounded p-2 border border-sky-200">
                      <div className="font-semibold text-sky-900">{s.sheetName}</div>
                      <ul className="list-disc list-inside text-sky-800">
                        {s.reasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                      {result.resumoMeta && (
                        <div className="mt-2 space-y-1">
                          {result.resumoMeta.yearsFound.length > 0 && (
                            <div className="text-[10px] text-sky-700">
                              Anos na aba:{' '}
                              <span className="font-mono">
                                {result.resumoMeta.yearsFound.join(', ') || '—'}
                              </span>
                            </div>
                          )}
                          {result.resumoMeta.observations.length > 0 && (
                            <div className="mt-2">
                              <div className="text-[10px] uppercase text-sky-600 font-semibold mb-0.5">
                                Observações
                              </div>
                              <ul className="list-disc list-inside text-sky-800 space-y-0.5">
                                {result.resumoMeta.observations.map((o, i) => (
                                  <li key={i} className="text-[11px]">
                                    <Badge className="bg-sky-100 text-sky-800 border-sky-300 text-[10px] mr-1">
                                      {o.year || '—'}
                                    </Badge>
                                    <span className="font-semibold">
                                      {CANONICAL_CLASS_LABELS[o.metric] ?? o.metric}:
                                    </span>{' '}
                                    {o.text}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {result.resumoMeta.legend.length > 0 && (
                            <div className="mt-2">
                              <div className="text-[10px] uppercase text-sky-600 font-semibold mb-0.5">
                                Legenda (composição das classes)
                              </div>
                              <ul className="list-disc list-inside text-sky-800 space-y-0.5">
                                {result.resumoMeta.legend.map((l, i) => (
                                  <li key={i} className="text-[11px]">
                                    <span className="font-semibold">
                                      {CANONICAL_CLASS_LABELS[l.classId] ?? l.classId}:
                                    </span>{' '}
                                    {l.categories.join(', ')}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
              </CardContent>
            </Card>
          )}

          {skippedSheets.some(
            (s) => !s.reasons.some((r) => r.startsWith('Aba auxiliar reconhecida')),
          ) && (
            <Card className="border-amber-300 shadow-xs">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-amber-900 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  Abas ignoradas
                </CardTitle>
                <CardDescription className="text-xs text-amber-800">
                  Estas abas não puderam ser lidas com confiança e não foram importadas.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {skippedSheets
                  .filter((s) => !s.reasons.some((r) => r.startsWith('Aba auxiliar reconhecida')))
                  .map((s) => (
                    <div
                      key={s.sheetName}
                      className="bg-amber-50 rounded p-2 border border-amber-200"
                    >
                      <div className="font-semibold text-amber-900">{s.sheetName}</div>
                      <ul className="list-disc list-inside text-amber-800">
                        {s.reasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

const SummaryTile: React.FC<{
  icon: React.ReactNode
  label: string
  value: string
}> = ({ icon, label, value }) => (
  <div className="bg-white border border-slate-200 rounded-lg p-3 flex items-center gap-2">
    <div className="shrink-0">{icon}</div>
    <div className="min-w-0">
      <div className="text-[10px] uppercase text-slate-400 font-semibold">{label}</div>
      <div className="text-sm font-bold text-slate-900 truncate">{value}</div>
    </div>
  </div>
)

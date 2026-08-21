import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  UploadCloud,
  FileCode,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Eye,
  Info,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useFinance } from '@/context/FinanceContext'
import {
  parseCSV,
  parseOFX,
  autoDetectHeaders,
  parseDateToISO,
  parseAmountAndType,
  formatCurrencyBRL,
} from '@/lib/parsers'
import { classifyByExactMatch, suggestCategoryByKeywords } from '@/lib/learningEngine'
import { useToast } from '@/hooks/use-toast'

type ImportStage = 'upload' | 'mapping' | 'preview' | 'success'

interface PreviewItem {
  id: string
  date: string
  description: string
  amount: number
  type: 'expense' | 'income'
  matchedCatId: string | null
  suggestedCatId: string | null
  confidence: 'exact' | 'suggested' | 'none'
  selectedCatId: string
  notes?: string
}

export default function ImportBank() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { categories, learnedRules, importTransactionsBatch, settings } = useFinance()

  const [stage, setStage] = useState<ImportStage>('upload')
  const [fileType, setFileType] = useState<'ofx' | 'csv'>('csv')
  const [fileName, setFileName] = useState('')
  const [rawHeaders, setRawHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<Record<string, any>[]>([])
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([])

  // Column Mapping state for CSV
  const [dateCol, setDateCol] = useState('')
  const [descCol, setDescCol] = useState('')
  const [amountCol, setAmountCol] = useState('')
  const [catCol, setCatCol] = useState('')
  const [typeCol, setTypeCol] = useState('')

  // Result summary
  const [importResult, setImportResult] = useState<{
    total: number
    autoExact: number
    suggested: number
  }>({ total: 0, autoExact: 0, suggested: 0 })

  // Handle file drop/change
  const handleFile = (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent<HTMLDivElement>) => {
    let file: File | null = null

    if ('dataTransfer' in e) {
      e.preventDefault()
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        file = e.dataTransfer.files[0]
      }
    } else if (e.target.files && e.target.files[0]) {
      file = e.target.files[0]
    }

    if (!file) return

    const fname = file.name
    setFileName(fname)

    const isOfx = fname.toLowerCase().endsWith('.ofx')

    const reader = new FileReader()

    if (isOfx) {
      setFileType('ofx')
      reader.onload = (evt) => {
        const text = evt.target?.result as string
        if (!text) return

        const ofxTxList = parseOFX(text)
        if (ofxTxList.length === 0) {
          toast({
            title: 'Nenhuma transação encontrada',
            description: 'O arquivo OFX parece vazio ou inválido.',
            variant: 'destructive',
          })
          return
        }

        // Build preview items with EXACT MATCH rule engine
        buildPreviewFromOFX(ofxTxList)
        setStage('preview')
      }
      reader.readAsText(file)
    } else {
      setFileType('csv')
      reader.onload = (evt) => {
        const text = evt.target?.result as string
        if (!text) return

        const parsed = parseCSV(text)
        if (parsed.headers.length === 0) {
          toast({
            title: 'Erro ao ler arquivo',
            description: 'Não foi possível ler as colunas da planilha.',
            variant: 'destructive',
          })
          return
        }

        setRawHeaders(parsed.headers)
        setRawRows(parsed.rows)

        // Check if user has a template config
        const tmpl = settings.templateConfig?.columnMapping
        const detected = autoDetectHeaders(parsed.headers)

        const finalDate =
          tmpl && parsed.headers.includes(tmpl.dateCol) ? tmpl.dateCol : detected.dateCol
        const finalDesc =
          tmpl && parsed.headers.includes(tmpl.descriptionCol)
            ? tmpl.descriptionCol
            : detected.descriptionCol
        const finalAmount =
          tmpl && parsed.headers.includes(tmpl.amountCol) ? tmpl.amountCol : detected.amountCol
        const finalCat =
          tmpl && tmpl.categoryCol && parsed.headers.includes(tmpl.categoryCol)
            ? tmpl.categoryCol
            : detected.categoryCol
        const finalType =
          tmpl && tmpl.typeCol && parsed.headers.includes(tmpl.typeCol)
            ? tmpl.typeCol
            : detected.typeCol

        setDateCol(finalDate)
        setDescCol(finalDesc)
        setAmountCol(finalAmount)
        setCatCol(finalCat)
        setTypeCol(finalType)

        // If all 3 critical columns are matched, go straight to preview, else show mapping
        if (finalDate && finalDesc && finalAmount) {
          buildPreviewFromCSV(parsed.rows, finalDate, finalDesc, finalAmount, finalCat, finalType)
          setStage('preview')
        } else {
          setStage('mapping')
        }
      }
      reader.readAsText(file)
    }
  }

  // Build Preview from OFX items
  const buildPreviewFromOFX = (
    txs: { date: string; amount: number; type: 'expense' | 'income'; memo: string }[],
  ) => {
    let exactCount = 0
    let suggestCount = 0

    const items: PreviewItem[] = txs.map((tx, idx) => {
      // EXACT MATCH FIRST
      const match = classifyByExactMatch(tx.memo, learnedRules)

      let matchedCatId: string | null = null
      let suggestedCatId: string | null = null
      let confidence: 'exact' | 'suggested' | 'none' = 'none'
      let selectedCatId = 'none'

      if (match.matched && match.categoryId) {
        matchedCatId = match.categoryId
        selectedCatId = match.categoryId
        confidence = 'exact'
        exactCount++
      } else {
        // KEYWORD SUGGESTION
        const sug = suggestCategoryByKeywords(tx.memo, categories)
        if (sug) {
          suggestedCatId = sug
          selectedCatId = sug
          confidence = 'suggested'
          suggestCount++
        }
      }

      return {
        id: `prev-${idx}`,
        date: tx.date,
        description: tx.memo,
        amount: tx.amount,
        type: tx.type,
        matchedCatId,
        suggestedCatId,
        confidence,
        selectedCatId,
      }
    })

    setPreviewItems(items)
    setImportResult({
      total: items.length,
      autoExact: exactCount,
      suggested: suggestCount,
    })
  }

  // Build Preview from CSV rows
  const buildPreviewFromCSV = (
    rows: Record<string, any>[],
    dCol: string,
    descC: string,
    amtC: string,
    cCol?: string,
    tCol?: string,
  ) => {
    let exactCount = 0
    let suggestCount = 0

    const items: PreviewItem[] = rows.map((r, idx) => {
      const rawDate = r[dCol]
      const rawDesc = r[descC] || 'Sem descrição'
      const rawAmt = r[amtC]
      const rawCatName = cCol ? r[cCol] : ''
      const rawType = tCol ? r[tCol] : undefined

      const date = parseDateToISO(rawDate)
      const { amount, type } = parseAmountAndType(rawAmt, rawType)

      let matchedCatId: string | null = null
      let suggestedCatId: string | null = null
      let confidence: 'exact' | 'suggested' | 'none' = 'none'
      let selectedCatId = 'none'

      // If spreadsheet has explicit category column
      if (rawCatName && String(rawCatName).trim()) {
        const found = categories.find(
          (c) => c.name.toLowerCase() === String(rawCatName).trim().toLowerCase(),
        )
        if (found) {
          matchedCatId = found.id
          selectedCatId = found.id
          confidence = 'exact'
          exactCount++
        }
      } else {
        // EXACT MATCH from history
        const match = classifyByExactMatch(String(rawDesc), learnedRules)
        if (match.matched && match.categoryId) {
          matchedCatId = match.categoryId
          selectedCatId = match.categoryId
          confidence = 'exact'
          exactCount++
        } else {
          // KEYWORD SUGGESTION
          const sug = suggestCategoryByKeywords(String(rawDesc), categories)
          if (sug) {
            suggestedCatId = sug
            selectedCatId = sug
            confidence = 'suggested'
            suggestCount++
          }
        }
      }

      return {
        id: `prev-${idx}`,
        date,
        description: String(rawDesc).trim(),
        amount,
        type,
        matchedCatId,
        suggestedCatId,
        confidence,
        selectedCatId,
      }
    })

    setPreviewItems(items)
    setImportResult({
      total: items.length,
      autoExact: exactCount,
      suggested: suggestCount,
    })
  }

  // Apply mapping and proceed to preview
  const handleApplyMapping = () => {
    if (!dateCol || !descCol || !amountCol) {
      toast({
        title: 'Mapeamento incompleto',
        description: 'Mapeie ao menos Data, Descrição e Valor.',
        variant: 'destructive',
      })
      return
    }

    buildPreviewFromCSV(rawRows, dateCol, descCol, amountCol, catCol, typeCol)
    setStage('preview')
  }

  // Change category of an item in the preview
  const handleItemCategoryChange = (itemId: string, newCatId: string) => {
    setPreviewItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              selectedCatId: newCatId,
              confidence: newCatId === 'none' ? 'none' : item.confidence,
            }
          : item,
      ),
    )
  }

  // Final Commit to Finance Context
  const handleCommitImport = () => {
    const payload = previewItems.map((item) => {
      const cat = categories.find((c) => c.id === item.selectedCatId)
      return {
        date: item.date,
        description: item.description,
        amount: item.amount,
        type: item.type,
        categoryName: cat ? cat.name : undefined,
        source: (fileType === 'ofx' ? 'import_ofx' : 'import_csv') as any,
      }
    })

    const res = importTransactionsBatch(payload)
    setImportResult({
      total: res.imported,
      autoExact: res.autoClassified,
      suggested: res.pendingReview,
    })
    setStage('success')
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Importar Extrato Bancário
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Envie extratos em OFX, CSV ou planilhas XLSX. O motor aprende regras exatas a cada
          importação.
        </p>
      </div>

      {/* STAGE 1: UPLOAD */}
      {stage === 'upload' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2">
            <Card className="border-slate-200/80 shadow-xs">
              <CardHeader>
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <UploadCloud className="w-5 h-5 text-emerald-600" />
                  Selecione o arquivo de extrato
                </CardTitle>
                <CardDescription className="text-xs">
                  Formatos aceitos: <strong>.OFX</strong> (padrão de bancos brasileiros),{' '}
                  <strong>.CSV</strong> ou <strong>.XLSX</strong>
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleFile}
                  className="border-2 border-dashed border-slate-300 hover:border-emerald-500 hover:bg-emerald-50/20 transition-all rounded-2xl p-10 text-center flex flex-col items-center justify-center cursor-pointer relative"
                >
                  <input
                    type="file"
                    accept=".ofx,.csv,.xlsx,.xls,.txt"
                    onChange={handleFile}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-3">
                    <UploadCloud className="w-8 h-8" />
                  </div>
                  <p className="font-semibold text-slate-800 text-base">
                    Arraste o arquivo do seu banco aqui
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    ou clique para procurar no seu computador
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tips sidebar */}
          <div>
            <Card className="border-slate-200/80 shadow-xs bg-slate-50/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  Como funciona o aprendizado:
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs text-slate-600 leading-relaxed">
                <p>
                  <strong>1. Correspondência Exata:</strong> Se você já classificou "POSTO IPIRANGA"
                  antes, o app categoriza automaticamente apenas lançamentos com o mesmo texto
                  exato.
                </p>
                <p>
                  <strong>2. Sem suposições cegas:</strong> Descrições parciais (ex: apenas
                  "IPIRANGA") não serão classificadas sozinhas — o sistema sugere mas solicita sua
                  confirmação.
                </p>
                <p>
                  <strong>3. 100% Offline:</strong> Seus dados financeiros e extratos nunca saem do
                  seu dispositivo.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* STAGE 2: COLUMN MAPPING (for CSV with unmapped headers) */}
      {stage === 'mapping' && (
        <Card className="border-slate-200/80 shadow-xs">
          <CardHeader>
            <CardTitle className="text-lg font-bold">
              Mapear Colunas do Arquivo ({fileName})
            </CardTitle>
            <CardDescription className="text-xs">
              Indique quais colunas correspondem à Data, Descrição e Valor
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5 bg-slate-50 p-3 rounded-lg border">
                <Label className="text-xs font-semibold">Coluna de Data *</Label>
                <Select value={dateCol} onValueChange={setDateCol}>
                  <SelectTrigger className="bg-white text-xs">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {rawHeaders.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 bg-slate-50 p-3 rounded-lg border">
                <Label className="text-xs font-semibold">Coluna de Descrição *</Label>
                <Select value={descCol} onValueChange={setDescCol}>
                  <SelectTrigger className="bg-white text-xs">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {rawHeaders.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 bg-slate-50 p-3 rounded-lg border">
                <Label className="text-xs font-semibold">Coluna de Valor *</Label>
                <Select value={amountCol} onValueChange={setAmountCol}>
                  <SelectTrigger className="bg-white text-xs">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {rawHeaders.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex justify-between border-t pt-4">
            <Button variant="outline" size="sm" onClick={() => setStage('upload')}>
              Voltar
            </Button>
            <Button
              size="sm"
              onClick={handleApplyMapping}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Continuar para Prévia &rarr;
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* STAGE 3: PREVIEW & CLASSIFICATION */}
      {stage === 'preview' && (
        <Card className="border-slate-200/80 shadow-xs">
          <CardHeader className="pb-3 border-b">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <Eye className="w-5 h-5 text-emerald-600" />
                  Prévia de Classificação ({previewItems.length} lançamentos)
                </CardTitle>
                <CardDescription className="text-xs">
                  Revise como o sistema classificou automaticamente cada item antes de salvar.
                </CardDescription>
              </div>

              {/* Status summary badges */}
              <div className="flex items-center gap-2">
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-xs font-semibold">
                  {importResult.autoExact} correspondências exatas
                </Badge>
                {importResult.suggested > 0 && (
                  <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-xs font-semibold">
                    {importResult.suggested} sugestões
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b text-slate-600 font-semibold uppercase tracking-wider text-[11px] sticky top-0">
                  <tr>
                    <th className="p-3 w-24">Data</th>
                    <th className="p-3">Descrição no Extrato</th>
                    <th className="p-3 w-28 text-right">Valor</th>
                    <th className="p-3 w-64">Classificação / Categoria</th>
                    <th className="p-3 w-36 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewItems.map((item) => {
                    const isExpense = item.type === 'expense'

                    return (
                      <tr
                        key={item.id}
                        className={`hover:bg-slate-50/70 transition-colors ${
                          item.confidence === 'exact' ? 'bg-emerald-50/20' : ''
                        }`}
                      >
                        <td className="p-3 text-slate-500 whitespace-nowrap font-medium">
                          {item.date.split('-').reverse().join('/')}
                        </td>

                        <td className="p-3 font-medium text-slate-900">{item.description}</td>

                        <td className="p-3 text-right whitespace-nowrap">
                          <span
                            className={`font-bold ${
                              isExpense ? 'text-rose-600' : 'text-emerald-600'
                            }`}
                          >
                            {isExpense ? '- ' : '+ '}
                            {formatCurrencyBRL(item.amount)}
                          </span>
                        </td>

                        <td className="p-3">
                          <Select
                            value={item.selectedCatId}
                            onValueChange={(val) => handleItemCategoryChange(item.id, val)}
                          >
                            <SelectTrigger className="text-xs h-8 bg-white">
                              <SelectValue placeholder="Selecione categoria..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Sem categoria (revisar depois)</SelectItem>
                              {categories.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="w-2 h-2 rounded-full inline-block"
                                      style={{ backgroundColor: c.color }}
                                    />
                                    <span>{c.name}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>

                        <td className="p-3 text-center whitespace-nowrap">
                          {item.confidence === 'exact' ? (
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Exato
                            </Badge>
                          ) : item.confidence === 'suggested' ? (
                            <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-[10px] gap-1">
                              <Sparkles className="w-3 h-3 text-amber-600" /> Sugerido
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-slate-500">
                              Pendente
                            </Badge>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col sm:flex-row gap-2 justify-between border-t p-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStage('upload')}
              className="text-xs"
            >
              Cancelar e escolher outro arquivo
            </Button>
            <Button
              size="sm"
              onClick={handleCommitImport}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-6 shadow-xs"
            >
              Importar {previewItems.length} Lançamentos &rarr;
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* STAGE 4: SUCCESS */}
      {stage === 'success' && (
        <Card className="border-slate-200/80 shadow-xs text-center max-w-xl mx-auto py-8">
          <CardHeader>
            <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-2">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <CardTitle className="text-2xl font-bold text-slate-900">
              Importação Concluída!
            </CardTitle>
            <CardDescription className="text-sm text-slate-600">
              {importResult.total} lançamentos foram adicionados com sucesso ao seu orçamento.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 text-xs text-slate-600">
            <div className="bg-slate-50 border rounded-xl p-4 text-left space-y-1.5">
              <p className="font-semibold text-slate-900 text-sm">Resumo do aprendizado:</p>
              <p>
                • <strong>{importResult.autoExact}</strong> transações reconhecidas automaticamente
                por histórico exato.
              </p>
              {importResult.suggested > 0 && (
                <p className="text-amber-700">
                  • <strong>{importResult.suggested}</strong> lançamentos novos aguardam sua revisão
                  rápida em Transações.
                </p>
              )}
            </div>
          </CardContent>

          <CardFooter className="flex justify-center gap-3">
            <Button variant="outline" onClick={() => setStage('upload')} className="text-xs">
              Importar outro arquivo
            </Button>
            <Button
              onClick={() => navigate('/transacoes')}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-6"
            >
              Ver Transações
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  )
}

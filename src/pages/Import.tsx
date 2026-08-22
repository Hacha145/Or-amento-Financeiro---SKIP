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
  CreditCard,
  Files,
  Plus,
  Trash2,
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
import {
  classifyByExactMatch,
  suggestCategoryByKeywords,
  buildLearnedRulesMap,
  normalizeDescription,
  isCreditCardPaymentDescription,
} from '@/lib/learningEngine'
import { useToast } from '@/hooks/use-toast'
import { importTemplateXLSX, TemplateImportResult } from '@/lib/templateImporter'
import { Layers, AlertTriangle } from 'lucide-react'

type ImportStage = 'upload' | 'mapping' | 'preview' | 'success' | 'template'

interface PreviewItem {
  id: string
  fileName: string
  date: string
  description: string
  amount: number
  type: 'expense' | 'income'
  matchedCatId: string | null
  suggestedCatId: string | null
  confidence: 'exact' | 'suggested' | 'none'
  selectedCatId: string
  isCreditCardPayment: boolean
  source: 'import_ofx' | 'import_csv'
  notes?: string
}

interface PendingMappingFile {
  file: File
  headers: string[]
  rows: Record<string, any>[]
}

export default function ImportBank() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const {
    categories,
    learnedRules,
    importTransactionsBatch,
    settings,
    financialItems,
    classificationRules,
  } = useFinance()

  // Template import state (Part 1 — leitura da planilha histórica)
  const [templateResult, setTemplateResult] = useState<TemplateImportResult | null>(null)
  const [templateBusy, setTemplateBusy] = useState(false)

  const [stage, setStage] = useState<ImportStage>('upload')
  const [processedFileNames, setProcessedFileNames] = useState<string[]>([])
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([])

  // State for files that require manual column mapping
  const [pendingMappingQueue, setPendingMappingQueue] = useState<PendingMappingFile[]>([])
  const [currentMappingFile, setCurrentMappingFile] = useState<PendingMappingFile | null>(null)

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
    ccCount: number
  }>({ total: 0, autoExact: 0, suggested: 0, ccCount: 0 })

  // Process a single file and return preview items or return pending mapping
  const readFileAsync = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve((e.target?.result as string) || '')
      reader.onerror = (e) => reject(e)
      reader.readAsText(file)
    })
  }

  // Handle file drop/change with multiple file support
  const handleFiles = async (
    e: React.ChangeEvent<HTMLInputElement> | React.DragEvent<HTMLDivElement>,
  ) => {
    let files: File[] = []

    if ('dataTransfer' in e) {
      e.preventDefault()
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        files = Array.from(e.dataTransfer.files)
      }
    } else if (e.target.files && e.target.files.length > 0) {
      files = Array.from(e.target.files)
    }

    if (files.length === 0) return

    const rulesMap = buildLearnedRulesMap(learnedRules)
    const accumulatedItems: PreviewItem[] = [...previewItems]
    const fileNames: string[] = [...processedFileNames]
    const needsMappingFiles: PendingMappingFile[] = []

    for (const file of files) {
      const fname = file.name
      fileNames.push(fname)
      const isOfx = fname.toLowerCase().endsWith('.ofx')

      try {
        const text = await readFileAsync(file)
        if (!text) continue

        if (isOfx) {
          const ofxTxs = parseOFX(text)
          if (ofxTxs.length === 0) {
            toast({
              title: `Arquivo OFX vazio ou inválido`,
              description: `Nenhuma transação encontrada em "${fname}".`,
              variant: 'destructive',
            })
            continue
          }

          const parsedItems = buildItemsFromOFX(ofxTxs, fname, rulesMap, accumulatedItems.length)
          accumulatedItems.push(...parsedItems)
        } else {
          // CSV / XLSX text representation
          const parsed = parseCSV(text)
          if (parsed.headers.length === 0 || parsed.rows.length === 0) {
            toast({
              title: `Arquivo vazio ou inválido`,
              description: `Não foi possível ler as colunas em "${fname}".`,
              variant: 'destructive',
            })
            continue
          }

          // Check if user has template or auto-detection finds 3 core cols
          const tmpl = settings.templateConfig?.columnMapping
          const detected = autoDetectHeaders(parsed.headers)

          const fDate =
            tmpl && parsed.headers.includes(tmpl.dateCol) ? tmpl.dateCol : detected.dateCol
          const fDesc =
            tmpl && parsed.headers.includes(tmpl.descriptionCol)
              ? tmpl.descriptionCol
              : detected.descriptionCol
          const fAmt =
            tmpl && parsed.headers.includes(tmpl.amountCol) ? tmpl.amountCol : detected.amountCol
          const fCat =
            tmpl && tmpl.categoryCol && parsed.headers.includes(tmpl.categoryCol)
              ? tmpl.categoryCol
              : detected.categoryCol
          const fType =
            tmpl && tmpl.typeCol && parsed.headers.includes(tmpl.typeCol)
              ? tmpl.typeCol
              : detected.typeCol

          if (fDate && fDesc && fAmt) {
            const parsedItems = buildItemsFromCSV(
              parsed.rows,
              fname,
              fDate,
              fDesc,
              fAmt,
              fCat,
              fType,
              rulesMap,
              accumulatedItems.length,
            )
            accumulatedItems.push(...parsedItems)
          } else {
            // Put into mapping queue
            needsMappingFiles.push({
              file,
              headers: parsed.headers,
              rows: parsed.rows,
            })
          }
        }
      } catch (err) {
        console.error('Error processing file', fname, err)
        toast({
          title: `Erro ao processar ${fname}`,
          description: 'Ocorreu um erro ao ler o conteúdo do arquivo.',
          variant: 'destructive',
        })
      }
    }

    setProcessedFileNames(fileNames)

    if (needsMappingFiles.length > 0) {
      const first = needsMappingFiles[0]
      const remaining = needsMappingFiles.slice(1)
      setPendingMappingQueue(remaining)
      setCurrentMappingFile(first)

      const detected = autoDetectHeaders(first.headers)
      setDateCol(detected.dateCol)
      setDescCol(detected.descriptionCol)
      setAmountCol(detected.amountCol)
      setCatCol(detected.categoryCol)
      setTypeCol(detected.typeCol)

      setPreviewItems(accumulatedItems)
      setStage('mapping')
    } else {
      setPreviewItems(accumulatedItems)
      updateSummaryStats(accumulatedItems)
      if (accumulatedItems.length > 0) {
        setStage('preview')
      } else {
        toast({
          title: 'Nenhum lançamento extraído',
          description: 'Verifique os arquivos enviados e tente novamente.',
          variant: 'destructive',
        })
      }
    }
  }

  // Update summary stats
  const updateSummaryStats = (items: PreviewItem[]) => {
    let exactCount = 0
    let suggestCount = 0
    let ccCount = 0

    items.forEach((item) => {
      if (item.confidence === 'exact') exactCount++
      else if (item.confidence === 'suggested') suggestCount++
      if (item.isCreditCardPayment) ccCount++
    })

    setImportResult({
      total: items.length,
      autoExact: exactCount,
      suggested: suggestCount,
      ccCount,
    })
  }

  // Helper: Build preview items from OFX
  const buildItemsFromOFX = (
    txs: { date: string; amount: number; type: 'expense' | 'income'; memo: string }[],
    fileName: string,
    rulesMap: Map<string, any>,
    offset: number,
  ): PreviewItem[] => {
    return txs.map((tx, idx) => {
      const isCC = isCreditCardPaymentDescription(tx.memo)
      const match = classifyByExactMatch(tx.memo, rulesMap)

      let matchedCatId: string | null = null
      let suggestedCatId: string | null = null
      let confidence: 'exact' | 'suggested' | 'none' = 'none'
      let selectedCatId = 'none'

      if (match.matched && match.categoryId) {
        matchedCatId = match.categoryId
        selectedCatId = match.categoryId
        confidence = 'exact'
      } else {
        const sug = suggestCategoryByKeywords(tx.memo, categories)
        if (sug) {
          suggestedCatId = sug
          selectedCatId = sug
          confidence = 'suggested'
        }
      }

      return {
        id: `prev-${offset + idx}-${Date.now()}`,
        fileName,
        date: tx.date,
        description: tx.memo,
        amount: tx.amount,
        type: tx.type,
        matchedCatId,
        suggestedCatId,
        confidence,
        selectedCatId,
        isCreditCardPayment: isCC,
        source: 'import_ofx',
      }
    })
  }

  // Helper: Build preview items from CSV
  const buildItemsFromCSV = (
    rows: Record<string, any>[],
    fileName: string,
    dCol: string,
    descC: string,
    amtC: string,
    cCol?: string,
    tCol?: string,
    rulesMap?: Map<string, any>,
    offset = 0,
  ): PreviewItem[] => {
    const map = rulesMap || buildLearnedRulesMap(learnedRules)

    return rows.map((r, idx) => {
      const rawDate = r[dCol]
      const rawDesc = r[descC] || 'Sem descrição'
      const rawAmt = r[amtC]
      const rawCatName = cCol ? r[cCol] : ''
      const rawType = tCol ? r[tCol] : undefined

      const date = parseDateToISO(rawDate)
      const { amount, type } = parseAmountAndType(rawAmt, rawType)
      const cleanDesc = String(rawDesc).trim()
      const isCC = isCreditCardPaymentDescription(cleanDesc)

      let matchedCatId: string | null = null
      let suggestedCatId: string | null = null
      let confidence: 'exact' | 'suggested' | 'none' = 'none'
      let selectedCatId = 'none'

      // If explicit category
      if (rawCatName && String(rawCatName).trim()) {
        const found = categories.find(
          (c) => c.name.toLowerCase() === String(rawCatName).trim().toLowerCase(),
        )
        if (found) {
          matchedCatId = found.id
          selectedCatId = found.id
          confidence = 'exact'
        }
      } else {
        // Check exact match
        const match = classifyByExactMatch(cleanDesc, map)
        if (match.matched && match.categoryId) {
          matchedCatId = match.categoryId
          selectedCatId = match.categoryId
          confidence = 'exact'
        } else {
          // Keyword suggestion
          const sug = suggestCategoryByKeywords(cleanDesc, categories)
          if (sug) {
            suggestedCatId = sug
            selectedCatId = sug
            confidence = 'suggested'
          }
        }
      }

      return {
        id: `prev-${offset + idx}-${Date.now()}`,
        fileName,
        date,
        description: cleanDesc,
        amount,
        type,
        matchedCatId,
        suggestedCatId,
        confidence,
        selectedCatId,
        isCreditCardPayment: isCC,
        source: 'import_csv',
      }
    })
  }

  // Apply mapping and proceed
  const handleApplyMapping = () => {
    if (!currentMappingFile || !dateCol || !descCol || !amountCol) {
      toast({
        title: 'Mapeamento incompleto',
        description: 'Mapeie ao menos Data, Descrição e Valor.',
        variant: 'destructive',
      })
      return
    }

    const rulesMap = buildLearnedRulesMap(learnedRules)
    const newItems = buildItemsFromCSV(
      currentMappingFile.rows,
      currentMappingFile.file.name,
      dateCol,
      descCol,
      amountCol,
      catCol,
      typeCol,
      rulesMap,
      previewItems.length,
    )

    const updated = [...previewItems, ...newItems]
    setPreviewItems(updated)

    // Check if there are more files in the mapping queue
    if (pendingMappingQueue.length > 0) {
      const next = pendingMappingQueue[0]
      const remaining = pendingMappingQueue.slice(1)
      setPendingMappingQueue(remaining)
      setCurrentMappingFile(next)

      const detected = autoDetectHeaders(next.headers)
      setDateCol(detected.dateCol)
      setDescCol(detected.descriptionCol)
      setAmountCol(detected.amountCol)
      setCatCol(detected.categoryCol)
      setTypeCol(detected.typeCol)
    } else {
      setCurrentMappingFile(null)
      updateSummaryStats(updated)
      setStage('preview')
    }
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

  // Remove single item from preview
  const handleRemovePreviewItem = (itemId: string) => {
    setPreviewItems((prev) => {
      const filtered = prev.filter((i) => i.id !== itemId)
      updateSummaryStats(filtered)
      return filtered
    })
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
        isCreditCardPayment: item.isCreditCardPayment,
        source: item.source,
      }
    })

    const res = importTransactionsBatch(payload)
    setImportResult({
      total: res.imported,
      autoExact: res.autoClassified,
      suggested: res.pendingReview,
      ccCount: previewItems.filter((i) => i.isCreditCardPayment).length,
    })
    setStage('success')
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Importar Extratos Bancários
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Selecione um ou múltiplos arquivos (OFX, CSV, XLSX) de uma só vez. O motor aprende regras
          exatas e detecta automaticamente pagamentos de fatura de cartão.
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
                  Selecione um ou múltiplos arquivos de extrato
                </CardTitle>
                <CardDescription className="text-xs">
                  Formatos aceitos: <strong>.OFX</strong> (Itaú, Nubank, Bradesco, Inter, BB, etc.),{' '}
                  <strong>.CSV</strong> ou <strong>.XLSX</strong>. Você pode selecionar vários
                  arquivos de uma só vez.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleFiles}
                  className="border-2 border-dashed border-slate-300 hover:border-emerald-500 hover:bg-emerald-50/20 transition-all rounded-2xl p-10 text-center flex flex-col items-center justify-center cursor-pointer relative"
                >
                  <input
                    type="file"
                    multiple
                    accept=".ofx,.csv,.xlsx,.xls,.txt"
                    onChange={handleFiles}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-3">
                    <Files className="w-8 h-8" />
                  </div>
                  <p className="font-semibold text-slate-800 text-base">
                    Arraste seus extratos bancários aqui
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    ou clique para procurar múltiplos arquivos no seu computador (segure Ctrl/Cmd)
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <Badge
                      variant="secondary"
                      className="text-[10px] text-emerald-800 bg-emerald-100"
                    >
                      Seleção múltipla ativada
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tips sidebar */}
          <div>
            <Card className="border-slate-200/80 shadow-xs bg-slate-50/50 space-y-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  Recursos inteligentes:
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs text-slate-600 leading-relaxed pt-0">
                <div className="space-y-1">
                  <strong className="text-slate-900 flex items-center gap-1">
                    <Files className="w-3.5 h-3.5 text-emerald-600" />
                    Múltiplos Extratos Acumulados:
                  </strong>
                  <p>
                    Selecione todos os extratos bancários do mês de uma só vez (ex: conta corrente e
                    cartões). Todas as transações serão consolidadas na prévia.
                  </p>
                </div>

                <div className="space-y-1 pt-1 border-t border-slate-200/70">
                  <strong className="text-slate-900 flex items-center gap-1">
                    <CreditCard className="w-3.5 h-3.5 text-amber-600" />
                    Detecção de Pagamento de Fatura:
                  </strong>
                  <p>
                    Lançamentos de "Pagamento recebido" ou "Pagamento de fatura" são detectados
                    automaticamente e marcados para evitar que dupliquem suas despesas individuais
                    já registradas.
                  </p>
                </div>

                <div className="space-y-1 pt-1 border-t border-slate-200/70">
                  <strong className="text-slate-900 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Motor de Regras O(1):
                  </strong>
                  <p>
                    Normalização inteligente de nomes de estabelecimentos para classificação
                    instantânea e segura no seu dispositivo.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* STAGE 2: COLUMN MAPPING (for CSV with unmapped headers) */}
      {stage === 'mapping' && currentMappingFile && (
        <Card className="border-slate-200/80 shadow-xs">
          <CardHeader>
            <CardTitle className="text-lg font-bold">
              Mapear Colunas ({currentMappingFile.file.name})
            </CardTitle>
            <CardDescription className="text-xs">
              Indique quais colunas correspondem à Data, Descrição e Valor para este arquivo.
              {pendingMappingQueue.length > 0 && (
                <span className="text-emerald-700 font-semibold ml-1">
                  ({pendingMappingQueue.length} outro(s) arquivo(s) aguardando mapeamento)
                </span>
              )}
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
                    {currentMappingFile.headers.map((h) => (
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
                    {currentMappingFile.headers.map((h) => (
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
                    {currentMappingFile.headers.map((h) => (
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStage('upload')
                setPreviewItems([])
                setProcessedFileNames([])
                setPendingMappingQueue([])
              }}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleApplyMapping}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Continuar &rarr;
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
                  Prévia Consolidada ({previewItems.length} lançamentos de{' '}
                  {processedFileNames.length}{' '}
                  {processedFileNames.length === 1 ? 'arquivo' : 'arquivos'})
                </CardTitle>
                <CardDescription className="text-xs">
                  Revise as transações extraídas. Arquivos processados:{' '}
                  <strong>{processedFileNames.join(', ')}</strong>
                </CardDescription>
              </div>

              {/* Status summary badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-xs font-semibold">
                  {importResult.autoExact} correspondências exatas
                </Badge>
                {importResult.suggested > 0 && (
                  <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-xs font-semibold">
                    {importResult.suggested} sugestões
                  </Badge>
                )}
                {importResult.ccCount > 0 && (
                  <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-xs font-semibold gap-1">
                    <CreditCard className="w-3.5 h-3.5 text-amber-700" />
                    {importResult.ccCount} pagamentos de fatura detectados
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
                    <th className="p-3 w-12 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewItems.map((item) => {
                    const isExpense = item.type === 'expense'

                    return (
                      <tr
                        key={item.id}
                        className={`hover:bg-slate-50/70 transition-colors ${
                          item.isCreditCardPayment
                            ? 'bg-amber-50/30'
                            : item.confidence === 'exact'
                              ? 'bg-emerald-50/20'
                              : ''
                        }`}
                      >
                        <td className="p-3 text-slate-500 whitespace-nowrap font-medium">
                          {item.date.split('-').reverse().join('/')}
                        </td>

                        <td className="p-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-slate-900">{item.description}</span>
                            {item.isCreditCardPayment && (
                              <Badge
                                className="bg-amber-100 text-amber-900 border-amber-300 text-[10px] gap-1 font-semibold hover:bg-amber-100"
                                title="Pagamento de fatura: potencial duplicação de gastos individuais já lançados"
                              >
                                <CreditCard className="w-3 h-3 text-amber-700" />
                                Fatura / Duplicação potencial
                              </Badge>
                            )}
                            {processedFileNames.length > 1 && (
                              <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                {item.fileName}
                              </span>
                            )}
                          </div>
                        </td>

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
                            <Badge
                              className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] gap-1 font-semibold"
                              title="Reconhecido por correspondência exata inteligente"
                            >
                              <CheckCircle2 className="w-3 h-3 text-emerald-700" /> Correspondência
                              exata
                            </Badge>
                          ) : item.confidence === 'suggested' ? (
                            <Badge
                              className="bg-amber-100 text-amber-900 border-amber-300 text-[10px] gap-1 font-semibold"
                              title="Sugestão automática por palavra-chave"
                            >
                              <Sparkles className="w-3 h-3 text-amber-600" /> Sugestão
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-slate-500">
                              Não identificado
                            </Badge>
                          )}
                        </td>

                        <td className="p-3 text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                            onClick={() => handleRemovePreviewItem(item.id)}
                            title="Remover da prévia"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
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
              onClick={() => {
                setStage('upload')
                setPreviewItems([])
                setProcessedFileNames([])
              }}
              className="text-xs"
            >
              Cancelar e escolher outros arquivos
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
            <div className="bg-slate-50 border rounded-xl p-4 text-left space-y-2">
              <p className="font-semibold text-slate-900 text-sm">Resumo do processamento:</p>
              <p>
                • <strong>{importResult.autoExact}</strong> transações reconhecidas automaticamente
                por histórico exato.
              </p>
              {importResult.ccCount > 0 && (
                <p className="text-amber-800">
                  • <strong>{importResult.ccCount}</strong> pagamentos de fatura foram marcados e
                  excluídos dos totais de despesas por padrão para evitar duplicação.
                </p>
              )}
              {importResult.suggested > 0 && (
                <p className="text-amber-700">
                  • <strong>{importResult.suggested}</strong> lançamentos novos aguardam sua revisão
                  rápida em Transações.
                </p>
              )}
            </div>
          </CardContent>

          <CardFooter className="flex justify-center gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setStage('upload')
                setPreviewItems([])
                setProcessedFileNames([])
              }}
              className="text-xs"
            >
              Importar outros arquivos
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

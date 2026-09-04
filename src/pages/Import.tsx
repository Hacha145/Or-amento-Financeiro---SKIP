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
  parseXLSX,
  autoDetectHeaders,
  parseDateToISO,
  parseAmountAndType,
  formatCurrencyBRL,
  ParsedTable,
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
import { TemplateImportReport } from '@/components/TemplateImportReport'
import { Layers, AlertTriangle, UserCheck, TrendingUp } from 'lucide-react'
import { identifyIncome, IncomeIdentificationResult } from '@/lib/incomeIdentity'

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
  incomeIdentity?: IncomeIdentificationResult
}

interface PendingMappingFile {
  file: File
  headers: string[]
  rows: Record<string, any>[]
}

/**
 * Converte a primeira aba de uma planilha XLSX bancária simples em formato ParsedTable
 * para reutilizar o fluxo de mapeamento e prévia sem distorção binária.
 */
function xlsxSheetToFlatTable(matrix: (string | number | null)[][]): ParsedTable | null {
  if (!matrix || matrix.length < 2) return null

  let headerRowIdx = -1
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r] || []
    const nonEmpty = row.filter((c) => c !== null && c !== undefined && String(c).trim() !== '')
    if (nonEmpty.length > 0) {
      headerRowIdx = r
      break
    }
  }
  if (headerRowIdx < 0) return null

  const headerRow = matrix[headerRowIdx] || []
  let lastHeaderCol = headerRow.length - 1
  while (
    lastHeaderCol > 0 &&
    (headerRow[lastHeaderCol] === null ||
      headerRow[lastHeaderCol] === undefined ||
      String(headerRow[lastHeaderCol]).trim() === '')
  ) {
    lastHeaderCol--
  }
  const headers = headerRow.slice(1, lastHeaderCol + 1).map((h, i) => {
    const s = h == null ? '' : String(h).trim()
    return s || `Coluna ${i + 1}`
  })
  if (headers.length === 0) return null

  const rows: Record<string, any>[] = []
  for (let r = headerRowIdx + 1; r < matrix.length; r++) {
    const rowArr = matrix[r] || []
    const nonEmpty = rowArr.filter((c) => c !== null && c !== undefined && String(c).trim() !== '')
    if (nonEmpty.length === 0) continue

    const rowObj: Record<string, any> = {}
    headers.forEach((h, colIdx) => {
      const v = rowArr[colIdx + 1]
      rowObj[h] = v === undefined ? '' : v
    })
    rows.push(rowObj)
  }

  if (rows.length === 0) return null
  return { headers, rows, rawMatrix: [] }
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
      const lowerName = fname.toLowerCase()
      const isOfx = lowerName.endsWith('.ofx')
      const isXlsx =
        lowerName.endsWith('.xlsx') ||
        lowerName.endsWith('.xls') ||
        file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.type === 'application/vnd.ms-excel'

      try {
        if (isOfx) {
          const text = await readFileAsync(file)
          if (!text) continue
          const ofxTxs = parseOFX(text)
          if (ofxTxs.length === 0) {
            toast({
              title: `Arquivo OFX sem transações`,
              description: `Nenhuma transação foi detectada em "${fname}".`,
              variant: 'destructive',
            })
            continue
          }

          const parsedItems = buildItemsFromOFX(ofxTxs, fname, rulesMap, accumulatedItems.length)
          accumulatedItems.push(...parsedItems)
        } else if (isXlsx) {
          // Arquivo binário XLSX: ler via parseXLSX
          const buf = await file.arrayBuffer()
          const parsedWorkbook = await parseXLSX(buf)
          const firstSheet = parsedWorkbook.sheets[0]
          if (!firstSheet) {
            toast({
              title: `Planilha sem abas`,
              description: `Nenhuma aba encontrada em "${fname}".`,
              variant: 'destructive',
            })
            continue
          }

          const table = xlsxSheetToFlatTable(firstSheet.matrix)
          if (!table || table.headers.length === 0 || table.rows.length === 0) {
            toast({
              title: `Planilha vazia ou ilegível`,
              description: `Não foi possível detectar colunas e linhas válidas em "${fname}".`,
              variant: 'destructive',
            })
            continue
          }

          const tmpl = settings.templateConfig?.columnMapping
          const detected = autoDetectHeaders(table.headers)

          const fDate =
            tmpl && table.headers.includes(tmpl.dateCol) ? tmpl.dateCol : detected.dateCol
          const fDesc =
            tmpl && table.headers.includes(tmpl.descriptionCol)
              ? tmpl.descriptionCol
              : detected.descriptionCol
          const fAmt =
            tmpl && table.headers.includes(tmpl.amountCol) ? tmpl.amountCol : detected.amountCol
          const fCat =
            tmpl && tmpl.categoryCol && table.headers.includes(tmpl.categoryCol)
              ? tmpl.categoryCol
              : detected.categoryCol
          const fType =
            tmpl && tmpl.typeCol && table.headers.includes(tmpl.typeCol)
              ? tmpl.typeCol
              : detected.typeCol

          if (fDate && fDesc && fAmt) {
            const parsedItems = buildItemsFromCSV(
              table.rows,
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
            needsMappingFiles.push({
              file,
              headers: table.headers,
              rows: table.rows,
            })
          }
        } else {
          // Arquivos texto: CSV delimitado ou TXT
          const text = await readFileAsync(file)
          if (!text) continue
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
          description:
            err instanceof Error ? err.message : 'Ocorreu um erro ao ler o conteúdo do arquivo.',
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

      const incomeIdResult = identifyIncome(
        {
          description: tx.memo,
          amount: tx.amount,
          type: tx.type,
        },
        {
          userName: settings.userName,
          userAliases: settings.userAliases,
        },
      )

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
        incomeIdentity: incomeIdResult,
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

      const incomeIdResult = identifyIncome(
        {
          description: cleanDesc,
          amount,
          type,
        },
        {
          userName: settings.userName,
          userAliases: settings.userAliases,
        },
      )

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
        incomeIdentity: incomeIdResult,
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

  // Import a historical XLSX template workbook (Part 1 — leitura da planilha
  // histórica). Runs the full pipeline (parse → detect → anchor-validate →
  // extract → reconcile → report) and surfaces the diagnostic report.
  const handleTemplateFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      toast({
        title: 'Arquivo inválido',
        description: 'O template histórico deve ser um arquivo .xlsx',
        variant: 'destructive',
      })
      return
    }
    setTemplateBusy(true)
    try {
      const buf = await file.arrayBuffer()
      const result = await importTemplateXLSX(buf, financialItems, classificationRules)
      setTemplateResult(result)
      setStage('template')
      const divergent =
        result.report.divergences.length > 0 || result.reconciliations.some((r) => !r.ok)
      toast({
        title: divergent ? 'Importação com divergência' : 'Template importado',
        description: divergent
          ? 'Revise o relatório de diagnóstico antes de concluir.'
          : `${result.transactions.length} transações extraídas de ${result.report.sheetsFound.length} aba(s).`,
        variant: divergent ? 'destructive' : 'default',
      })
    } catch (err) {
      console.error('Template import error', err)
      toast({
        title: 'Erro ao importar template',
        description: err instanceof Error ? err.message : 'Falha desconhecida na leitura.',
        variant: 'destructive',
      })
    } finally {
      setTemplateBusy(false)
    }
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
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto text-[#F8FAFC]">
      {/* Title */}
      <div className="pb-2 border-b border-white/5 space-y-1">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-['Lexend']">
          Importar Extratos Bancários
        </h1>
        <p className="text-xs sm:text-sm text-slate-400">
          Selecione um ou múltiplos arquivos (OFX, CSV, XLSX) de uma só vez. O motor aprende regras
          exatas e detecta automaticamente pagamentos de fatura de cartão.
        </p>
      </div>

      {/* STAGE 1: UPLOAD */}
      {stage === 'upload' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-4">
            <Card className="border-white/10 bg-[#192134] rounded-2xl shadow-sm">
              <CardHeader className="border-b border-white/5 pb-4">
                <CardTitle className="text-lg font-bold flex items-center gap-2.5 text-[#F8FAFC]">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                    <UploadCloud className="w-4 h-4" />
                  </div>
                  Selecione um ou múltiplos arquivos de extrato
                </CardTitle>
                <CardDescription className="text-xs text-[#B6C2D4]">
                  Formatos aceitos: <strong className="text-[#F8FAFC]">.OFX</strong> (Itaú, Nubank,
                  Bradesco, Inter, BB, etc.), <strong className="text-[#F8FAFC]">.CSV</strong> ou{' '}
                  <strong className="text-[#F8FAFC]">.XLSX</strong>. Você pode selecionar vários
                  arquivos de uma só vez.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4 pt-4">
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleFiles}
                  className="border-2 border-dashed border-white/15 hover:border-blue-400 hover:bg-[#202A40]/40 transition-all rounded-2xl p-10 text-center flex flex-col items-center justify-center cursor-pointer relative group"
                >
                  <input
                    type="file"
                    multiple
                    accept=".ofx,.csv,.xlsx,.xls,.txt"
                    onChange={handleFiles}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="w-16 h-16 rounded-2xl bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                    <Files className="w-8 h-8" />
                  </div>
                  <p className="font-semibold text-[#F8FAFC] text-base">
                    Arraste seus extratos bancários aqui
                  </p>
                  <p className="text-xs text-[#B6C2D4] mt-1">
                    ou clique para procurar múltiplos arquivos no seu computador (segure Ctrl/Cmd)
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <Badge
                      variant="secondary"
                      className="text-[10px] text-blue-300 bg-blue-500/20 border border-blue-500/30 font-semibold px-2.5 py-0.5 rounded-full"
                    >
                      Seleção múltipla ativada
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Historical template import (Part 1) */}
            <Card className="border-emerald-500/30 bg-[#192134] rounded-2xl shadow-sm">
              <CardHeader className="border-b border-white/5 pb-4">
                <CardTitle className="text-base font-bold flex items-center gap-2.5 text-emerald-300">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <Layers className="w-4 h-4" />
                  </div>
                  Importar planilha histórica (template .xlsx)
                </CardTitle>
                <CardDescription className="text-xs text-[#B6C2D4]">
                  Leitura correta da planilha anual: detecta aba + ano + classe + categoria + item +
                  mês, valida por âncoras (sem adivinhar posições), decompõe fórmulas multi-valor e
                  reconcilia totais. Em caso de divergência, mostra um relatório de diagnóstico.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    const f = Array.from(e.dataTransfer.files)[0]
                    if (f) handleTemplateFile(f)
                  }}
                  className="border-2 border-dashed border-emerald-500/30 hover:border-emerald-400 hover:bg-emerald-500/10 transition-all rounded-xl p-6 text-center flex flex-col items-center justify-center cursor-pointer relative group"
                >
                  <input
                    type="file"
                    accept=".xlsx"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) handleTemplateFile(f)
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                    <Layers className="w-6 h-6" />
                  </div>
                  <p className="font-semibold text-[#F8FAFC] text-sm">
                    {templateBusy ? 'Lendo planilha…' : 'Arraste o template .xlsx aqui'}
                  </p>
                  <p className="text-[11px] text-[#B6C2D4] mt-0.5">
                    Ou clique para selecionar. Aba(s) "Orçamento &lt;ANO&gt;".
                  </p>
                </div>
                {templateBusy && (
                  <div className="text-xs text-emerald-400 flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Processando: parse → detectar → validar âncoras → extrair → reconciliar →
                    relatório.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Tips sidebar */}
          <div>
            <Card className="border-white/10 bg-[#101A34] rounded-2xl shadow-sm space-y-4">
              <CardHeader className="pb-2 border-b border-white/5">
                <CardTitle className="text-sm font-bold text-[#F8FAFC] flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-400" />
                  Recursos inteligentes:
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3.5 text-xs text-[#B6C2D4] leading-relaxed pt-3">
                <div className="space-y-1">
                  <strong className="text-[#F8FAFC] flex items-center gap-1.5 font-semibold">
                    <Files className="w-3.5 h-3.5 text-blue-400" />
                    Múltiplos Extratos Acumulados:
                  </strong>
                  <p>
                    Selecione todos os extratos bancários do mês de uma só vez (ex: conta corrente e
                    cartões). Todas as transações serão consolidadas na prévia.
                  </p>
                </div>

                <div className="space-y-1 pt-2 border-t border-white/5">
                  <strong className="text-[#F8FAFC] flex items-center gap-1.5 font-semibold">
                    <CreditCard className="w-3.5 h-3.5 text-amber-400" />
                    Detecção de Pagamento de Fatura:
                  </strong>
                  <p>
                    Lançamentos de "Pagamento recebido" ou "Pagamento de fatura" são detectados
                    automaticamente e marcados para evitar que dupliquem suas despesas individuais
                    já registradas.
                  </p>
                </div>

                <div className="space-y-1 pt-2 border-t border-white/5">
                  <strong className="text-[#F8FAFC] flex items-center gap-1.5 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
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
        <Card className="border-white/10 bg-[#192134] rounded-2xl shadow-sm">
          <CardHeader className="border-b border-white/5 pb-4">
            <CardTitle className="text-lg font-bold text-[#F8FAFC]">
              Mapear Colunas ({currentMappingFile.file.name})
            </CardTitle>
            <CardDescription className="text-xs text-[#B6C2D4]">
              Indique quais colunas correspondem à Data, Descrição e Valor para este arquivo.
              {pendingMappingQueue.length > 0 && (
                <span className="text-blue-300 font-semibold ml-1">
                  ({pendingMappingQueue.length} outro(s) arquivo(s) aguardando mapeamento)
                </span>
              )}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5 bg-[#101A34] p-3.5 rounded-xl border border-white/5">
                <Label className="text-xs font-semibold text-[#F8FAFC]">Coluna de Data *</Label>
                <Select value={dateCol} onValueChange={setDateCol}>
                  <SelectTrigger className="bg-[#192134] text-xs h-10 border-white/10 text-[#F8FAFC] rounded-xl">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#192134] text-[#F8FAFC] border-white/10">
                    {currentMappingFile.headers.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 bg-[#101A34] p-3.5 rounded-xl border border-white/5">
                <Label className="text-xs font-semibold text-[#F8FAFC]">
                  Coluna de Descrição *
                </Label>
                <Select value={descCol} onValueChange={setDescCol}>
                  <SelectTrigger className="bg-[#192134] text-xs h-10 border-white/10 text-[#F8FAFC] rounded-xl">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#192134] text-[#F8FAFC] border-white/10">
                    {currentMappingFile.headers.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 bg-[#101A34] p-3.5 rounded-xl border border-white/5">
                <Label className="text-xs font-semibold text-[#F8FAFC]">Coluna de Valor *</Label>
                <Select value={amountCol} onValueChange={setAmountCol}>
                  <SelectTrigger className="bg-[#192134] text-xs h-10 border-white/10 text-[#F8FAFC] rounded-xl">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#192134] text-[#F8FAFC] border-white/10">
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

          <CardFooter className="flex justify-between border-t border-white/5 pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStage('upload')
                setPreviewItems([])
                setProcessedFileNames([])
                setPendingMappingQueue([])
              }}
              className="border-white/10 bg-transparent text-[#B6C2D4] hover:bg-[#202A40] hover:text-[#F8FAFC] rounded-xl h-10"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleApplyMapping}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-10 px-5"
            >
              Continuar &rarr;
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* STAGE 3: PREVIEW & CLASSIFICATION */}
      {stage === 'preview' && (
        <Card className="border-white/10 bg-[#192134] rounded-2xl shadow-sm">
          <CardHeader className="pb-3 border-b border-white/5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg font-bold flex items-center gap-2 text-[#F8FAFC]">
                  <Eye className="w-5 h-5 text-blue-400" />
                  Prévia Consolidada ({previewItems.length} lançamentos de{' '}
                  {processedFileNames.length}{' '}
                  {processedFileNames.length === 1 ? 'arquivo' : 'arquivos'})
                </CardTitle>
                <CardDescription className="text-xs text-[#B6C2D4]">
                  Revise as transações extraídas. Arquivos processados:{' '}
                  <strong className="text-[#F8FAFC]">{processedFileNames.join(', ')}</strong>
                </CardDescription>
              </div>

              {/* Status summary badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-xs font-semibold">
                  {importResult.autoExact} correspondências exatas
                </Badge>
                {importResult.suggested > 0 && (
                  <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-xs font-semibold">
                    {importResult.suggested} sugestões
                  </Badge>
                )}
                {importResult.ccCount > 0 && (
                  <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-xs font-semibold gap-1">
                    <CreditCard className="w-3.5 h-3.5 text-amber-300" />
                    {importResult.ccCount} pagamentos de fatura detectados
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#101A34] border-b border-white/5 text-[#94A3B8] font-semibold uppercase tracking-wider text-[11px] sticky top-0 z-10">
                  <tr>
                    <th className="p-3 w-24">Data</th>
                    <th className="p-3">Descrição no Extrato</th>
                    <th className="p-3 w-28 text-right">Valor</th>
                    <th className="p-3 w-64">Classificação / Categoria</th>
                    <th className="p-3 w-36 text-center">Status</th>
                    <th className="p-3 w-12 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {previewItems.map((item) => {
                    const isExpense = item.type === 'expense'

                    return (
                      <tr
                        key={item.id}
                        className={`hover:bg-[#202A40]/70 transition-colors ${
                          item.isCreditCardPayment
                            ? 'bg-amber-500/5'
                            : item.confidence === 'exact'
                              ? 'bg-emerald-500/5'
                              : ''
                        }`}
                      >
                        <td className="p-3 text-[#B6C2D4] whitespace-nowrap font-medium tabular-nums">
                          {item.date.split('-').reverse().join('/')}
                        </td>

                        <td className="p-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-[#F8FAFC]">{item.description}</span>
                            {item.incomeIdentity?.isIdentifiedIncome && (
                              <Badge
                                className={`text-[10px] gap-1 font-semibold border ${
                                  item.incomeIdentity.isUserLinked
                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                    : 'bg-teal-500/15 text-teal-300 border-teal-500/30'
                                }`}
                                title={item.incomeIdentity.reason || 'Entrada identificada'}
                              >
                                {item.incomeIdentity.isUserLinked ? (
                                  <UserCheck className="w-3 h-3 text-emerald-400" />
                                ) : (
                                  <TrendingUp className="w-3 h-3 text-teal-400" />
                                )}
                                {item.incomeIdentity.isUserLinked
                                  ? 'Entrada vinculada a você'
                                  : 'Entrada identificada'}
                              </Badge>
                            )}
                            {item.isCreditCardPayment && (
                              <Badge
                                className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px] gap-1 font-semibold"
                                title="Pagamento de fatura: potencial duplicação de gastos individuais já lançados"
                              >
                                <CreditCard className="w-3 h-3 text-amber-300" />
                                Fatura / Duplicação potencial
                              </Badge>
                            )}
                            {processedFileNames.length > 1 && (
                              <span className="text-[10px] text-[#94A3B8] bg-[#101A34] border border-white/5 px-1.5 py-0.5 rounded">
                                {item.fileName}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="p-3 text-right whitespace-nowrap">
                          <span
                            className={`font-bold tabular-nums ${
                              isExpense ? 'text-[#FB7185]' : 'text-[#34D399]'
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
                            <SelectTrigger className="text-xs h-9 bg-[#101A34] text-[#F8FAFC] border-white/10 rounded-xl">
                              <SelectValue placeholder="Selecione categoria..." />
                            </SelectTrigger>
                            <SelectContent className="bg-[#192134] text-[#F8FAFC] border-white/10">
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
                              className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px] gap-1 font-semibold"
                              title="Reconhecido por correspondência exata inteligente"
                            >
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Correspondência
                              exata
                            </Badge>
                          ) : item.confidence === 'suggested' ? (
                            <Badge
                              className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px] gap-1 font-semibold"
                              title="Sugestão automática por palavra-chave"
                            >
                              <Sparkles className="w-3 h-3 text-amber-400" /> Sugestão
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-[#94A3B8] border-white/10 bg-[#101A34]"
                            >
                              Não identificado
                            </Badge>
                          )}
                        </td>

                        <td className="p-3 text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="min-h-[44px] min-w-[44px] h-11 w-11 text-[#94A3B8] hover:text-rose-400 hover:bg-rose-500/10 rounded-lg"
                            onClick={() => handleRemovePreviewItem(item.id)}
                            aria-label={`Remover item ${item.description} da prévia`}
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

          <CardFooter className="flex flex-col sm:flex-row gap-2 justify-between border-t border-white/5 p-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStage('upload')
                setPreviewItems([])
                setProcessedFileNames([])
              }}
              className="border-white/10 bg-transparent text-[#B6C2D4] hover:bg-[#202A40] hover:text-[#F8FAFC] rounded-xl h-10 text-xs"
            >
              Cancelar e escolher outros arquivos
            </Button>
            <Button
              size="sm"
              onClick={handleCommitImport}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-6 rounded-xl h-10 shadow-sm"
            >
              Importar {previewItems.length} Lançamentos &rarr;
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* STAGE: TEMPLATE DIAGNOSTIC REPORT */}
      {stage === 'template' && templateResult && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-[#F8FAFC] flex items-center gap-2">
                <Layers className="w-5 h-5 text-emerald-400" />
                Relatório de importação do template
              </h2>
              <p className="text-xs text-[#B6C2D4]">
                Diagnóstico completo pós-importação. Abas, anos, estruturas, categorias, itens,
                células, fórmulas, divergências e totais planilha vs reconstruídos.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setTemplateResult(null)
                setStage('upload')
              }}
              className="border-white/10 bg-transparent text-[#B6C2D4] hover:bg-[#202A40] hover:text-[#F8FAFC] rounded-xl h-9 text-xs"
            >
              Voltar
            </Button>
          </div>
          <TemplateImportReport result={templateResult} />
        </div>
      )}

      {/* STAGE 4: SUCCESS */}
      {stage === 'success' && (
        <Card className="border-white/10 bg-[#192134] rounded-2xl shadow-xl text-center max-w-xl mx-auto py-8">
          <CardHeader>
            <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-2">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <CardTitle className="text-2xl font-bold text-[#F8FAFC]">
              Importação Concluída!
            </CardTitle>
            <CardDescription className="text-sm text-[#B6C2D4]">
              {importResult.total} lançamentos foram adicionados com sucesso ao seu orçamento.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 text-xs text-[#B6C2D4]">
            <div className="bg-[#101A34] border border-white/5 rounded-xl p-4 text-left space-y-2">
              <p className="font-semibold text-[#F8FAFC] text-sm">Resumo do processamento:</p>
              <p>
                • <strong className="text-[#F8FAFC]">{importResult.autoExact}</strong> transações
                reconhecidas automaticamente por histórico exato.
              </p>
              {importResult.ccCount > 0 && (
                <p className="text-amber-300">
                  • <strong>{importResult.ccCount}</strong> pagamentos de fatura foram marcados e
                  excluídos dos totais de despesas por padrão para evitar duplicação.
                </p>
              )}
              {importResult.suggested > 0 && (
                <p className="text-blue-300">
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
              className="border-white/10 bg-transparent text-[#B6C2D4] hover:bg-[#202A40] hover:text-[#F8FAFC] rounded-xl h-10 text-xs"
            >
              Importar outros arquivos
            </Button>
            <Button
              onClick={() => navigate('/transacoes')}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-6 rounded-xl h-10 shadow-sm"
            >
              Ver Transações
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  )
}

import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileSpreadsheet,
  Upload,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Layers,
  FileCheck,
  HelpCircle,
  FolderPlus,
  PlayCircle,
  Table,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
  parseXLSX,
  autoDetectHeaders,
  parseDateToISO,
  parseAmountAndType,
  ParsedTable,
} from '@/lib/parsers'
import { importTemplateXLSX, TemplateImportResult } from '@/lib/templateImporter'
import { diagnoseSheet } from '@/lib/templateMap'
import { TemplateImportReport } from '@/components/TemplateImportReport'
import { ColumnMapping } from '@/types/finance'
import { useToast } from '@/hooks/use-toast'

type Step = 'welcome' | 'upload' | 'mapping' | 'seed' | 'done' | 'template'

/**
 * Convert the first sheet of a parsed XLSX workbook into the flat
 * `ParsedTable` shape (headers + rows) consumed by the existing CSV mapping
 * UI. This is the path taken for a standard bank-statement-style XLSX whose
 * first sheet is a single flat table. The matrix returned by `parseXLSX` is
 * 1-based (index 0 unused), so we read from row/column 1 onward.
 *
 * NOTE: this never reads the file as text — binary XLSX is decoded via the
 * binary parser, so headers/rows come out clean (no garbled characters).
 */
function xlsxSheetToTable(matrix: (string | number | null)[][]): ParsedTable | null {
  if (!matrix || matrix.length < 2) return null

  // Find the first non-empty row to use as the header row. The 1-based matrix
  // leaves index 0 unused, so start scanning at row 1.
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
  // Trim trailing empties from the header so we don't create phantom columns.
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

  const rows: Record<string, string | number | null | undefined>[] = []
  for (let r = headerRowIdx + 1; r < matrix.length; r++) {
    const rowArr = matrix[r] || []
    // skip fully-empty rows
    const nonEmpty = rowArr.filter((c) => c !== null && c !== undefined && String(c).trim() !== '')
    if (nonEmpty.length === 0) continue

    const rowObj: Record<string, string | number | null | undefined> = {}
    headers.forEach((h, colIdx) => {
      // matrix columns are 1-based; headers were sliced from index 1, so the
      // 0-based colIdx maps to matrix column colIdx + 1.
      const v = rowArr[colIdx + 1]
      rowObj[h] = v === undefined ? '' : v
    })
    rows.push(rowObj)
  }

  if (rows.length === 0) return null
  return { headers, rows, rawMatrix: [] }
}

export default function Welcome() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const {
    updateSettings,
    setTemplateConfig,
    importTransactionsBatch,
    loadDemoData,
    financialItems,
    classificationRules,
  } = useFinance()

  const [step, setStep] = useState<Step>('welcome')
  const [fileName, setFileName] = useState('')
  const [rawHeaders, setRawHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<Record<string, any>[]>([])
  const [hasHeader, setHasHeader] = useState(true)
  const [parsing, setParsing] = useState(false)
  const [templateResult, setTemplateResult] = useState<TemplateImportResult | null>(null)

  const [mapping, setMapping] = useState<ColumnMapping>({
    dateCol: '',
    descriptionCol: '',
    amountCol: '',
    categoryCol: '',
    typeCol: '',
    notesCol: '',
    hasHeader: true,
  })

  const [seedResult, setSeedResult] = useState<{
    imported: number
    autoClassified: number
    pendingReview: number
  } | null>(null)

  // File extension / type detection (§3 — never treat binary XLSX as text).
  const isXlsxFile = (file: File): boolean => {
    const name = file.name.toLowerCase()
    const isType =
      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.type === 'application/vnd.ms-excel'
    return name.endsWith('.xlsx') || name.endsWith('.xls') || isType
  }

  // Handle file drop/input. Reads CSV as text and XLSX as binary (arrayBuffer),
  // so binary spreadsheets are never fed to the CSV/text parser.
  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement> | React.DragEvent<HTMLDivElement>,
  ) => {
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

    setFileName(file.name)
    setParsing(true)

    try {
      if (isXlsxFile(file)) {
        // ---- Binary XLSX path (§2): read as ArrayBuffer + parseXLSX ----
        const buf = await file.arrayBuffer()
        const parsed = await parseXLSX(buf)
        const firstSheet = parsed.sheets[0]
        if (!firstSheet) {
          toast({
            title: 'Erro ao ler arquivo',
            description: 'Nenhuma aba encontrada no arquivo XLSX enviado.',
            variant: 'destructive',
          })
          setParsing(false)
          return
        }

        // Does this look like the canonical annual template workbook? If any
        // sheet's year is recognized AND it has a Saldo row, treat it as a
        // template import and surface the full diagnostic report instead of
        // forcing it through the flat-table mapping UI.
        const looksLikeTemplate = parsed.sheets.some((s) => {
          const diag = diagnoseSheet(s.sheetName, s.matrix)
          return diag.year !== null && diag.saldoRow !== null
        })

        if (looksLikeTemplate) {
          try {
            const result = await importTemplateXLSX(buf, financialItems, classificationRules)
            setTemplateResult(result)
            setStep('template')
            const divergent =
              result.reconciliations.filter((r) => r.level === 'item').some((r) => !r.ok) ||
              result.report.divergences.length > 0
            toast({
              title: divergent ? 'Importação com divergência' : 'Template lido',
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
          }
          setParsing(false)
          return
        }

        // Otherwise: standard bank-style XLSX (single flat table). Convert the
        // first sheet's matrix to a flat ParsedTable and continue through the
        // existing mapping UI, using the binary parser result.
        const table = xlsxSheetToTable(firstSheet.matrix)
        if (!table || table.headers.length === 0) {
          toast({
            title: 'Erro ao ler arquivo',
            description: 'Não foi possível detectar colunas no arquivo XLSX enviado.',
            variant: 'destructive',
          })
          setParsing(false)
          return
        }

        setRawHeaders(table.headers)
        setRawRows(table.rows as Record<string, any>[])
        const detected = autoDetectHeaders(table.headers)
        setMapping({
          dateCol: detected.dateCol,
          descriptionCol: detected.descriptionCol,
          amountCol: detected.amountCol,
          categoryCol: detected.categoryCol,
          typeCol: detected.typeCol,
          notesCol: detected.notesCol,
          hasHeader: true,
        })
        setStep('mapping')
      } else {
        // ---- CSV / text path: read as text + parseCSV (unchanged) ----
        const text = await file.text()
        if (!text) {
          toast({
            title: 'Erro ao ler arquivo',
            description: 'O arquivo enviado está vazio.',
            variant: 'destructive',
          })
          setParsing(false)
          return
        }
        const parsed = parseCSV(text)
        if (parsed.headers.length === 0) {
          toast({
            title: 'Erro ao ler arquivo',
            description: 'Não foi possível detectar colunas no arquivo enviado.',
            variant: 'destructive',
          })
          setParsing(false)
          return
        }

        setRawHeaders(parsed.headers)
        setRawRows(parsed.rows as Record<string, any>[])
        const detected = autoDetectHeaders(parsed.headers)
        setMapping({
          dateCol: detected.dateCol,
          descriptionCol: detected.descriptionCol,
          amountCol: detected.amountCol,
          categoryCol: detected.categoryCol,
          typeCol: detected.typeCol,
          notesCol: detected.notesCol,
          hasHeader: true,
        })
        setStep('mapping')
      }
    } catch (err) {
      console.error('Error parsing file', file.name, err)
      toast({
        title: 'Erro ao ler arquivo',
        description: 'Não foi possível ler o conteúdo do arquivo enviado.',
        variant: 'destructive',
      })
    } finally {
      setParsing(false)
    }
  }

  // Handle mapping confirmation
  const handleConfirmMapping = () => {
    if (!mapping.dateCol || !mapping.descriptionCol || !mapping.amountCol) {
      toast({
        title: 'Mapeamento incompleto',
        description: 'Por favor, mapeie ao menos Data, Descrição e Valor.',
        variant: 'destructive',
      })
      return
    }

    setStep('seed')
  }

  // Handle seed import execution
  const handleExecuteSeed = (doImportData: boolean) => {
    // Save template config
    setTemplateConfig({
      fileName,
      columnMapping: mapping,
      configuredAt: new Date().toISOString(),
    })

    if (doImportData && rawRows.length > 0) {
      const parsedTxData = rawRows.map((r) => {
        const rawDate = r[mapping.dateCol]
        const rawDesc = r[mapping.descriptionCol] || 'Lançamento sem descrição'
        const rawAmt = r[mapping.amountCol]
        const rawCat = mapping.categoryCol ? r[mapping.categoryCol] : ''
        const rawType = mapping.typeCol ? r[mapping.typeCol] : undefined
        const rawNotes = mapping.notesCol ? r[mapping.notesCol] : ''

        const isoDate = parseDateToISO(rawDate)
        const { amount, type } = parseAmountAndType(rawAmt, rawType)

        return {
          date: isoDate,
          description: String(rawDesc).trim(),
          amount,
          type,
          categoryName: rawCat ? String(rawCat).trim() : undefined,
          notes: rawNotes ? String(rawNotes).trim() : undefined,
          source: 'spreadsheet_seed' as const,
        }
      })

      const res = importTransactionsBatch(parsedTxData)
      setSeedResult(res)
    } else {
      setSeedResult({
        imported: 0,
        autoClassified: 0,
        pendingReview: 0,
      })
    }

    updateSettings({ setupCompleted: true })
    setStep('done')
  }

  // Finish after a template import: persist the extracted historical
  // transactions into FinanceContext (BUG A) BEFORE marking setup complete
  // and navigating away — otherwise the extracted transactions in
  // templateResult.transactions were silently lost.
  // Conversion rules (see task):
  //   date        -> `${year}-${month(2-digit)}-01` (historical, month-precision)
  //   description -> the item's name from financialItems (fallback: itemId)
  //   amount      -> the real SIGNED value (NO Math.abs — reimbursements/
  //                  reversals must keep their negative sign)
  //   type        -> 'income' when classId === 'receitas', else 'expense'
  //   source      -> 'legacy_xlsx'
  //   notes       -> concatenated anchor notes (or empty string)
  // The v2 hierarchy (financialItems/Classes/Categories) is already persisted
  // by migrateToV2Hierarchy() in the FinanceProvider, so nothing extra is
  // needed here for the catalog.
  const handleTemplateFinish = () => {
    if (templateResult && templateResult.transactions.length > 0) {
      const txData = templateResult.transactions.map((tx) => {
        const item = financialItems.find((i) => i.id === tx.itemId)
        return {
          date: `${tx.year}-${String(tx.month).padStart(2, '0')}-01`,
          description: item?.name ?? tx.itemId,
          amount: tx.value,
          type: (tx.classId === 'receitas' ? 'income' : 'expense') as 'expense' | 'income',
          notes: tx.notes.length ? tx.notes.join('; ') : '',
          source: 'legacy_xlsx' as const,
        }
      })
      const res = importTransactionsBatch(txData)
      updateSettings({ setupCompleted: true })
      toast({
        title: 'Template importado',
        description: `${res.imported} transações da planilha histórica foram salvas.`,
      })
    } else {
      updateSettings({ setupCompleted: true })
      toast({
        title: 'Template importado',
        description: 'Sua planilha modelo foi processada com sucesso.',
      })
    }
    navigate('/')
  }

  // Quick start options
  const handleStartFresh = () => {
    updateSettings({ setupCompleted: true })
    toast({
      title: 'Pronto para começar!',
      description: 'Categorias padrão foram configuradas com sucesso.',
    })
    navigate('/')
  }

  const handleStartWithDemo = () => {
    loadDemoData()
    toast({
      title: 'Dados de demonstração carregados!',
      description: 'Você pode explorar todas as telas e depois resetar em Configurações.',
    })
    navigate('/')
  }

  return (
    <div className="min-h-[85vh] flex items-center justify-center py-6 px-4 text-[#F8FAFC]">
      {/* STEP 1: WELCOME */}
      {step === 'welcome' && (
        <Card className="w-full max-w-[640px] shadow-2xl border-white/10 bg-[#192134] rounded-2xl">
          <CardHeader className="text-center pb-6 border-b border-white/5">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mb-4 shadow-sm">
              <Sparkles className="w-7 h-7" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight text-[#F8FAFC]">
              Bem-vindo ao Orçamento Pessoal
            </CardTitle>
            <CardDescription className="text-base text-[#B6C2D4] mt-2 max-w-md mx-auto">
              Controle financeiro inteligente, offline e adaptado ao formato da sua planilha.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 pt-6">
            {/* Main Option: Upload Template */}
            <button
              onClick={() => setStep('upload')}
              className="w-full p-4 rounded-xl border border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/15 text-left transition-all flex items-start gap-4 group cursor-pointer"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-md shadow-blue-600/30 group-hover:scale-105 transition-transform">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-blue-200 text-base">
                    Enviar minha planilha modelo
                  </h3>
                  <span className="text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold px-2 py-0.5 rounded-full">
                    Recomendado
                  </span>
                </div>
                <p className="text-xs text-[#B6C2D4] mt-1 leading-relaxed">
                  Importa suas colunas, categorias existentes e ensina o sistema a reconhecer seus
                  lançamentos habituais.
                </p>
              </div>
            </button>

            {/* Option 2: Demo Data */}
            <button
              onClick={handleStartWithDemo}
              className="w-full p-4 rounded-xl border border-white/10 bg-[#101A34] hover:bg-[#202A40] text-left transition-all flex items-start gap-4 group cursor-pointer"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                <PlayCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-[#F8FAFC] text-sm">
                  Experimentar com dados de exemplo
                </h3>
                <p className="text-xs text-[#B6C2D4] mt-0.5">
                  Preenche o app com transações fictícias para testar gráficos, aprendizado e
                  relatórios.
                </p>
              </div>
            </button>

            {/* Option 3: Start from scratch */}
            <button
              onClick={handleStartFresh}
              className="w-full p-4 rounded-xl border border-white/10 bg-[#101A34] hover:bg-[#202A40] text-left transition-all flex items-start gap-4 group cursor-pointer"
            >
              <div className="w-10 h-10 rounded-xl bg-[#202A40] text-[#B6C2D4] flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                <FolderPlus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-[#F8FAFC] text-sm">Começar do zero</h3>
                <p className="text-xs text-[#B6C2D4] mt-0.5">
                  Inicia com categorias padrão (Alimentação, Moradia, Transporte, etc.) prontas para
                  uso.
                </p>
              </div>
            </button>
          </CardContent>

          <CardFooter className="justify-center border-t border-white/5 py-4 text-xs text-[#94A3B8]">
            Seus dados nunca saem do seu computador. 100% privado e offline.
          </CardFooter>
        </Card>
      )}

      {/* STEP 2: UPLOAD TEMPLATE */}
      {step === 'upload' && (
        <Card className="w-full max-w-[640px] shadow-2xl border-white/10 bg-[#192134] rounded-2xl">
          <CardHeader className="border-b border-white/5 pb-4">
            <CardTitle className="text-xl font-bold flex items-center gap-2.5 text-[#F8FAFC]">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                <Upload className="w-4 h-4" />
              </div>
              Enviar Planilha Modelo
            </CardTitle>
            <CardDescription className="text-xs text-[#B6C2D4]">
              Selecione sua planilha habitual (.xlsx, .csv) com cabeçalhos como Data, Descrição,
              Valor e Categoria.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 pt-6">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileUpload}
              className="border-2 border-dashed border-white/15 hover:border-blue-400 hover:bg-[#202A40]/40 transition-all rounded-2xl p-8 text-center flex flex-col items-center justify-center cursor-pointer relative group"
            >
              <input
                type="file"
                accept=".csv,.xlsx,.xls,.txt"
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="w-14 h-14 rounded-2xl bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <Upload className="w-6 h-6" />
              </div>
              <p className="font-semibold text-[#F8FAFC] text-base">
                {parsing ? 'Lendo planilha…' : 'Arraste seu arquivo ou clique para procurar'}
              </p>
              <p className="text-xs text-[#B6C2D4] mt-1">
                Suporta planilhas CSV, XLSX, TXT exportadas do Excel, Google Sheets ou bancos.
              </p>
            </div>

            <div className="bg-[#101A34] p-4 rounded-xl border border-white/5 text-xs text-[#B6C2D4] space-y-1.5">
              <p className="font-semibold text-[#F8FAFC]">Dica de formato:</p>
              <p>
                O arquivo precisa conter colunas para{' '}
                <strong className="text-[#F8FAFC]">Data</strong>,{' '}
                <strong className="text-[#F8FAFC]">Descrição</strong> e{' '}
                <strong className="text-[#F8FAFC]">Valor</strong>. A coluna de{' '}
                <strong className="text-[#F8FAFC]">Categoria</strong> é opcional mas recomendada
                para alimentar o histórico de aprendizado.
              </p>
              <p className="pt-2 border-t border-white/5 mt-2 text-[#94A3B8]">
                Arquivos <strong className="text-[#F8FAFC]">.xlsx</strong> binários são lidos com o
                parser correto (não como texto), evitando caracteres estranhos na prévia.
              </p>
            </div>
          </CardContent>

          <CardFooter className="flex justify-between border-t border-white/5 pt-4">
            <Button
              variant="outline"
              onClick={() => setStep('welcome')}
              className="border-white/10 bg-transparent text-[#B6C2D4] hover:bg-[#202A40] hover:text-[#F8FAFC] rounded-xl h-10 text-xs"
            >
              Voltar
            </Button>
            <Button
              variant="ghost"
              onClick={handleStartFresh}
              className="text-xs text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#202A40] rounded-xl h-10"
            >
              Pular e começar do zero
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* STEP 3: COLUMN MAPPING */}
      {step === 'mapping' && (
        <Card className="w-full max-w-[720px] shadow-2xl border-white/10 bg-[#192134] rounded-2xl">
          <CardHeader className="border-b border-white/5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-bold flex items-center gap-2.5 text-[#F8FAFC]">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                    <Table className="w-4 h-4" />
                  </div>
                  Mapeamento de Colunas
                </CardTitle>
                <CardDescription className="text-xs text-[#B6C2D4] mt-1">
                  Arquivo: <span className="font-medium text-[#F8FAFC]">{fileName}</span> (
                  {rawRows.length} linhas detectadas)
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6 pt-6">
            <div className="bg-blue-500/10 border border-blue-500/30 p-3.5 rounded-xl flex items-center gap-2.5 text-xs text-blue-200">
              <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
              <span>
                Detectamos automaticamente as correspondências mais prováveis em português. Ajuste
                se necessário:
              </span>
            </div>

            {/* Mapping Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Date */}
              <div className="space-y-1.5 bg-[#101A34] p-3.5 rounded-xl border border-white/5">
                <Label className="text-xs font-semibold flex items-center gap-1.5 text-[#F8FAFC]">
                  <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                  Coluna de Data *
                </Label>
                <Select
                  value={mapping.dateCol}
                  onValueChange={(val) => setMapping((prev) => ({ ...prev, dateCol: val }))}
                >
                  <SelectTrigger className="bg-[#192134] text-xs h-10 border-white/10 text-[#F8FAFC] rounded-xl">
                    <SelectValue placeholder="Selecione a coluna..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#192134] text-[#F8FAFC] border-white/10">
                    {rawHeaders.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Description */}
              <div className="space-y-1.5 bg-[#101A34] p-3.5 rounded-xl border border-white/5">
                <Label className="text-xs font-semibold flex items-center gap-1.5 text-[#F8FAFC]">
                  <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                  Coluna de Descrição / Histórico *
                </Label>
                <Select
                  value={mapping.descriptionCol}
                  onValueChange={(val) => setMapping((prev) => ({ ...prev, descriptionCol: val }))}
                >
                  <SelectTrigger className="bg-[#192134] text-xs h-10 border-white/10 text-[#F8FAFC] rounded-xl">
                    <SelectValue placeholder="Selecione a coluna..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#192134] text-[#F8FAFC] border-white/10">
                    {rawHeaders.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Amount */}
              <div className="space-y-1.5 bg-[#101A34] p-3.5 rounded-xl border border-white/5">
                <Label className="text-xs font-semibold flex items-center gap-1.5 text-[#F8FAFC]">
                  <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                  Coluna de Valor (R$) *
                </Label>
                <Select
                  value={mapping.amountCol}
                  onValueChange={(val) => setMapping((prev) => ({ ...prev, amountCol: val }))}
                >
                  <SelectTrigger className="bg-[#192134] text-xs h-10 border-white/10 text-[#F8FAFC] rounded-xl">
                    <SelectValue placeholder="Selecione a coluna..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#192134] text-[#F8FAFC] border-white/10">
                    {rawHeaders.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Category */}
              <div className="space-y-1.5 bg-[#101A34] p-3.5 rounded-xl border border-white/5">
                <Label className="text-xs font-semibold text-[#B6C2D4]">
                  Coluna de Categoria / Grupo (opcional)
                </Label>
                <Select
                  value={mapping.categoryCol || 'none'}
                  onValueChange={(val) =>
                    setMapping((prev) => ({
                      ...prev,
                      categoryCol: val === 'none' ? '' : val,
                    }))
                  }
                >
                  <SelectTrigger className="bg-[#192134] text-xs h-10 border-white/10 text-[#F8FAFC] rounded-xl">
                    <SelectValue placeholder="Selecione se houver..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#192134] text-[#F8FAFC] border-white/10">
                    <SelectItem value="none">Nenhuma (criar depois)</SelectItem>
                    {rawHeaders.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Type */}
              <div className="space-y-1.5 bg-[#101A34] p-3.5 rounded-xl border border-white/5">
                <Label className="text-xs font-semibold text-[#B6C2D4]">
                  Coluna de Tipo / D/C (opcional)
                </Label>
                <Select
                  value={mapping.typeCol || 'none'}
                  onValueChange={(val) =>
                    setMapping((prev) => ({
                      ...prev,
                      typeCol: val === 'none' ? '' : val,
                    }))
                  }
                >
                  <SelectTrigger className="bg-[#192134] text-xs h-10 border-white/10 text-[#F8FAFC] rounded-xl">
                    <SelectValue placeholder="Selecione se houver..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#192134] text-[#F8FAFC] border-white/10">
                    <SelectItem value="none">Auto (deduzir por sinal +/-)</SelectItem>
                    {rawHeaders.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Notes */}
              <div className="space-y-1.5 bg-[#101A34] p-3.5 rounded-xl border border-white/5">
                <Label className="text-xs font-semibold text-[#B6C2D4]">
                  Coluna de Observação (opcional)
                </Label>
                <Select
                  value={mapping.notesCol || 'none'}
                  onValueChange={(val) =>
                    setMapping((prev) => ({
                      ...prev,
                      notesCol: val === 'none' ? '' : val,
                    }))
                  }
                >
                  <SelectTrigger className="bg-[#192134] text-xs h-10 border-white/10 text-[#F8FAFC] rounded-xl">
                    <SelectValue placeholder="Selecione se houver..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#192134] text-[#F8FAFC] border-white/10">
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {rawHeaders.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Preview table */}
            <div>
              <Label className="text-xs font-semibold text-[#B6C2D4] mb-2 block">
                Prévia dos primeiros registros:
              </Label>
              <div className="overflow-x-auto border border-white/10 rounded-xl max-h-40 bg-[#101A34]">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[#192134] border-b border-white/5 text-[#94A3B8] font-semibold sticky top-0">
                    <tr>
                      {rawHeaders.slice(0, 6).map((h) => (
                        <th
                          key={h}
                          className="p-2.5 border-r border-white/5 last:border-r-0 whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {rawRows.slice(0, 4).map((row, idx) => (
                      <tr key={idx} className="hover:bg-[#202A40]/50">
                        {rawHeaders.slice(0, 6).map((h) => (
                          <td
                            key={h}
                            className="p-2.5 border-r border-white/5 last:border-r-0 whitespace-nowrap text-[#B6C2D4]"
                          >
                            {String(row[h] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex justify-between border-t border-white/5 pt-4">
            <Button
              variant="outline"
              onClick={() => setStep('upload')}
              className="border-white/10 bg-transparent text-[#B6C2D4] hover:bg-[#202A40] hover:text-[#F8FAFC] rounded-xl h-10 text-xs"
            >
              Voltar
            </Button>
            <Button
              onClick={handleConfirmMapping}
              className="bg-blue-600 hover:bg-blue-700 text-white gap-2 rounded-xl h-10 px-5 text-xs font-semibold"
              disabled={!mapping.dateCol || !mapping.descriptionCol || !mapping.amountCol}
            >
              Continuar
              <ArrowRight className="w-4 h-4" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* STEP 4: SEED CONFIRMATION */}
      {step === 'seed' && (
        <Card className="w-full max-w-[600px] shadow-2xl border-white/10 bg-[#192134] rounded-2xl">
          <CardHeader className="text-center border-b border-white/5 pb-4">
            <div className="mx-auto w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mb-3">
              <FileCheck className="w-6 h-6" />
            </div>
            <CardTitle className="text-xl font-bold text-[#F8FAFC]">
              Importar dados da planilha?
            </CardTitle>
            <CardDescription className="text-sm text-[#B6C2D4] mt-1">
              Encontramos <strong className="text-[#F8FAFC]">{rawRows.length} lançamentos</strong>{' '}
              no seu arquivo modelo.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 pt-6">
            <div className="bg-[#101A34] p-4 rounded-xl border border-white/5 space-y-2 text-sm text-[#B6C2D4]">
              <p className="font-semibold text-[#F8FAFC]">O que vai acontecer:</p>
              <ul className="list-disc list-inside text-xs space-y-1.5 text-[#B6C2D4]">
                <li>
                  O formato das suas colunas será salvo como{' '}
                  <strong className="text-[#F8FAFC]">Template padrão</strong>.
                </li>
                <li>Categorias encontradas serão cadastradas automaticamente.</li>
                <li>
                  Cada lançamento com categoria alimentará o{' '}
                  <strong className="text-[#F8FAFC]">motor de correspondência exata</strong> para
                  classificar seus futuros extratos bancários instantaneamente.
                </li>
              </ul>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col sm:flex-row gap-2 justify-between border-t border-white/5 pt-4">
            <Button
              variant="outline"
              onClick={() => handleExecuteSeed(false)}
              className="w-full sm:w-auto border-white/10 bg-transparent text-[#B6C2D4] hover:bg-[#202A40] hover:text-[#F8FAFC] rounded-xl h-10 text-xs"
            >
              Apenas salvar modelo (sem dados)
            </Button>
            <Button
              onClick={() => handleExecuteSeed(true)}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl h-10 px-5 text-xs"
            >
              Importar {rawRows.length} lançamentos
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* STEP 5: DONE */}
      {step === 'done' && (
        <Card className="w-full max-w-[560px] shadow-2xl border-white/10 bg-[#192134] rounded-2xl text-center">
          <CardHeader className="pb-4 border-b border-white/5">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <CardTitle className="text-2xl font-bold text-[#F8FAFC]">Tudo pronto!</CardTitle>
            <CardDescription className="text-base text-[#B6C2D4] mt-1">
              Seu orçamento pessoal foi configurado com sucesso.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3 pt-6 pb-6">
            {seedResult && seedResult.imported > 0 && (
              <div className="bg-[#101A34] border border-white/5 rounded-xl p-4 text-xs text-[#B6C2D4] text-left space-y-1">
                <p className="font-semibold text-sm text-[#F8FAFC]">
                  Resumo da importação inicial:
                </p>
                <p>• {seedResult.imported} lançamentos importados com sucesso.</p>
                <p>• {seedResult.autoClassified} regras exatas aprendidas pelo sistema.</p>
              </div>
            )}
            <p className="text-xs text-[#94A3B8]">
              Você pode importar extratos bancários (OFX/CSV) a qualquer momento na aba{' '}
              <strong className="text-[#F8FAFC]">Importar</strong>.
            </p>
          </CardContent>

          <CardFooter className="justify-center border-t border-white/5 pt-6">
            <Button
              onClick={() => navigate('/')}
              className="w-full sm:w-auto px-8 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl h-12 shadow-sm"
            >
              Ver meu painel &rarr;
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* STEP TEMPLATE: full diagnostic report for a canonical template .xlsx */}
      {step === 'template' && templateResult && (
        <Card className="w-full max-w-[900px] shadow-2xl border-white/10 bg-[#192134] rounded-2xl">
          <CardHeader className="border-b border-white/5 pb-4">
            <CardTitle className="text-xl font-bold flex items-center gap-2.5 text-[#F8FAFC]">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Layers className="w-4 h-4" />
              </div>
              Relatório de Importação da Planilha Modelo
            </CardTitle>
            <CardDescription className="text-xs text-[#B6C2D4] mt-1">
              Arquivo: <span className="font-medium text-[#F8FAFC]">{fileName}</span> — leitura
              binária da planilha histórica com validação por âncoras e reconciliação de totais.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <TemplateImportReport result={templateResult} />
          </CardContent>
          <CardFooter className="flex justify-between border-t border-white/5 pt-4">
            <Button
              variant="outline"
              onClick={() => setStep('upload')}
              className="border-white/10 bg-transparent text-[#B6C2D4] hover:bg-[#202A40] hover:text-[#F8FAFC] rounded-xl h-10 text-xs"
            >
              Enviar outro arquivo
            </Button>
            <Button
              onClick={handleTemplateFinish}
              className="bg-blue-600 hover:bg-blue-700 text-white gap-2 rounded-xl h-10 px-5 text-xs font-semibold shadow-sm"
            >
              Concluir e ver painel
              <ArrowRight className="w-4 h-4" />
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  )
}

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
import { parseCSV, autoDetectHeaders, parseDateToISO, parseAmountAndType } from '@/lib/parsers'
import { ColumnMapping } from '@/types/finance'
import { useToast } from '@/hooks/use-toast'

type Step = 'welcome' | 'upload' | 'mapping' | 'seed' | 'done'

export default function Welcome() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { updateSettings, setTemplateConfig, importTransactionsBatch, loadDemoData } = useFinance()

  const [step, setStep] = useState<Step>('welcome')
  const [fileName, setFileName] = useState('')
  const [rawHeaders, setRawHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<Record<string, any>[]>([])
  const [hasHeader, setHasHeader] = useState(true)

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

  // Handle file drop/input
  const handleFileUpload = (
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
    const reader = new FileReader()

    reader.onload = (evt) => {
      const text = evt.target?.result as string
      if (!text) return

      const parsed = parseCSV(text)
      if (parsed.headers.length === 0) {
        toast({
          title: 'Erro ao ler arquivo',
          description: 'Não foi possível detectar colunas no arquivo enviado.',
          variant: 'destructive',
        })
        return
      }

      setRawHeaders(parsed.headers)
      setRawRows(parsed.rows)

      // Auto-detect headers
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

    reader.readAsText(file)
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
    <div className="min-h-[85vh] flex items-center justify-center py-6 px-4">
      {/* STEP 1: WELCOME */}
      {step === 'welcome' && (
        <Card className="w-full max-w-[640px] shadow-lg border-slate-200">
          <CardHeader className="text-center pb-6">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-4 shadow-xs">
              <Sparkles className="w-7 h-7" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight text-slate-900">
              Bem-vindo ao Orçamento Pessoal
            </CardTitle>
            <CardDescription className="text-base text-slate-600 mt-2 max-w-md mx-auto">
              Controle financeiro inteligente, offline e adaptado ao formato da sua planilha.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Main Option: Upload Template */}
            <button
              onClick={() => setStep('upload')}
              className="w-full p-4 rounded-xl border-2 border-emerald-500/80 bg-emerald-50/50 hover:bg-emerald-50 text-left transition-all flex items-start gap-4 group cursor-pointer"
            >
              <div className="w-10 h-10 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm group-hover:scale-105 transition-transform">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-emerald-950 text-base">
                    Enviar minha planilha modelo
                  </h3>
                  <span className="text-xs bg-emerald-200 text-emerald-900 font-bold px-2 py-0.5 rounded-full">
                    Recomendado
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Importa suas colunas, categorias existentes e ensina o sistema a reconhecer seus
                  lançamentos habituais.
                </p>
              </div>
            </button>

            {/* Option 2: Demo Data */}
            <button
              onClick={handleStartWithDemo}
              className="w-full p-4 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-left transition-all flex items-start gap-4 group cursor-pointer"
            >
              <div className="w-10 h-10 rounded-lg bg-blue-500 text-white flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                <PlayCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">
                  Experimentar com dados de exemplo
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Preenche o app com transações fictícias para testar gráficos, aprendizado e
                  relatórios.
                </p>
              </div>
            </button>

            {/* Option 3: Start from scratch */}
            <button
              onClick={handleStartFresh}
              className="w-full p-4 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-left transition-all flex items-start gap-4 group cursor-pointer"
            >
              <div className="w-10 h-10 rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                <FolderPlus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">Começar do zero</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Inicia com categorias padrão (Alimentação, Moradia, Transporte, etc.) prontas para
                  uso.
                </p>
              </div>
            </button>
          </CardContent>

          <CardFooter className="justify-center border-t py-4 text-xs text-muted-foreground">
            Seus dados nunca saem do seu computador. 100% privado e offline.
          </CardFooter>
        </Card>
      )}

      {/* STEP 2: UPLOAD TEMPLATE */}
      {step === 'upload' && (
        <Card className="w-full max-w-[640px] shadow-lg border-slate-200">
          <CardHeader>
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <Upload className="w-5 h-5 text-emerald-600" />
              Enviar Planilha Modelo
            </CardTitle>
            <CardDescription>
              Selecione sua planilha habitual (.xlsx, .csv) com cabeçalhos como Data, Descrição,
              Valor e Categoria.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileUpload}
              className="border-2 border-dashed border-slate-300 hover:border-emerald-500 hover:bg-emerald-50/20 transition-all rounded-2xl p-8 text-center flex flex-col items-center justify-center cursor-pointer relative"
            >
              <input
                type="file"
                accept=".csv,.xlsx,.xls,.txt"
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-3">
                <Upload className="w-6 h-6" />
              </div>
              <p className="font-semibold text-slate-800 text-base">
                Arraste seu arquivo ou clique para procurar
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Suporta planilhas CSV, XLSX, XLS exportadas do Excel, Google Sheets ou bancos.
              </p>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border text-xs text-slate-600 space-y-1">
              <p className="font-semibold text-slate-900">Dica de formato:</p>
              <p>
                O arquivo precisa conter colunas para <strong>Data</strong>,{' '}
                <strong>Descrição</strong> e <strong>Valor</strong>. A coluna de{' '}
                <strong>Categoria</strong> é opcional mas recomendada para alimentar o histórico de
                aprendizado.
              </p>
            </div>
          </CardContent>

          <CardFooter className="flex justify-between border-t pt-4">
            <Button variant="outline" onClick={() => setStep('welcome')}>
              Voltar
            </Button>
            <Button variant="ghost" onClick={handleStartFresh} className="text-xs text-slate-500">
              Pular e começar do zero
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* STEP 3: COLUMN MAPPING */}
      {step === 'mapping' && (
        <Card className="w-full max-w-[720px] shadow-lg border-slate-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-bold flex items-center gap-2">
                  <Table className="w-5 h-5 text-emerald-600" />
                  Mapeamento de Colunas
                </CardTitle>
                <CardDescription>
                  Arquivo: <span className="font-medium text-slate-800">{fileName}</span> (
                  {rawRows.length} linhas detectadas)
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-lg flex items-center gap-2 text-xs text-emerald-900">
              <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Detectamos automaticamente as correspondências mais prováveis em português. Ajuste
                se necessário:
              </span>
            </div>

            {/* Mapping Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Date */}
              <div className="space-y-1.5 bg-slate-50 p-3 rounded-lg border">
                <Label className="text-xs font-semibold flex items-center gap-1.5 text-slate-900">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                  Coluna de Data *
                </Label>
                <Select
                  value={mapping.dateCol}
                  onValueChange={(val) => setMapping((prev) => ({ ...prev, dateCol: val }))}
                >
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Selecione a coluna..." />
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

              {/* Description */}
              <div className="space-y-1.5 bg-slate-50 p-3 rounded-lg border">
                <Label className="text-xs font-semibold flex items-center gap-1.5 text-slate-900">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                  Coluna de Descrição / Histórico *
                </Label>
                <Select
                  value={mapping.descriptionCol}
                  onValueChange={(val) => setMapping((prev) => ({ ...prev, descriptionCol: val }))}
                >
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Selecione a coluna..." />
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

              {/* Amount */}
              <div className="space-y-1.5 bg-slate-50 p-3 rounded-lg border">
                <Label className="text-xs font-semibold flex items-center gap-1.5 text-slate-900">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                  Coluna de Valor (R$) *
                </Label>
                <Select
                  value={mapping.amountCol}
                  onValueChange={(val) => setMapping((prev) => ({ ...prev, amountCol: val }))}
                >
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Selecione a coluna..." />
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

              {/* Category */}
              <div className="space-y-1.5 bg-slate-50 p-3 rounded-lg border">
                <Label className="text-xs font-semibold text-slate-700">
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
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Selecione se houver..." />
                  </SelectTrigger>
                  <SelectContent>
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
              <div className="space-y-1.5 bg-slate-50 p-3 rounded-lg border">
                <Label className="text-xs font-semibold text-slate-700">
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
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Selecione se houver..." />
                  </SelectTrigger>
                  <SelectContent>
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
              <div className="space-y-1.5 bg-slate-50 p-3 rounded-lg border">
                <Label className="text-xs font-semibold text-slate-700">
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
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Selecione se houver..." />
                  </SelectTrigger>
                  <SelectContent>
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
              <Label className="text-xs font-semibold text-slate-700 mb-2 block">
                Prévia dos primeiros registros:
              </Label>
              <div className="overflow-x-auto border rounded-lg max-h-40 bg-white">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 border-b text-slate-700 font-semibold sticky top-0">
                    <tr>
                      {rawHeaders.slice(0, 6).map((h) => (
                        <th key={h} className="p-2 border-r last:border-r-0 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rawRows.slice(0, 4).map((row, idx) => (
                      <tr key={idx} className="border-b last:border-b-0 hover:bg-slate-50">
                        {rawHeaders.slice(0, 6).map((h) => (
                          <td
                            key={h}
                            className="p-2 border-r last:border-r-0 whitespace-nowrap text-slate-600"
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

          <CardFooter className="flex justify-between border-t pt-4">
            <Button variant="outline" onClick={() => setStep('upload')}>
              Voltar
            </Button>
            <Button
              onClick={handleConfirmMapping}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
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
        <Card className="w-full max-w-[600px] shadow-lg border-slate-200">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-3">
              <FileCheck className="w-6 h-6" />
            </div>
            <CardTitle className="text-xl font-bold">Importar dados da planilha?</CardTitle>
            <CardDescription className="text-sm">
              Encontramos <strong>{rawRows.length} lançamentos</strong> no seu arquivo modelo.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="bg-slate-50 p-4 rounded-xl border space-y-2 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">O que vai acontecer:</p>
              <ul className="list-disc list-inside text-xs space-y-1.5 text-slate-600">
                <li>
                  O formato das suas colunas será salvo como <strong>Template padrão</strong>.
                </li>
                <li>Categorias encontradas serão cadastradas automaticamente.</li>
                <li>
                  Cada lançamento com categoria alimentará o{' '}
                  <strong>motor de correspondência exata</strong> para classificar seus futuros
                  extratos bancários instantaneamente.
                </li>
              </ul>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col sm:flex-row gap-2 justify-between border-t pt-4">
            <Button
              variant="outline"
              onClick={() => handleExecuteSeed(false)}
              className="w-full sm:w-auto"
            >
              Apenas salvar modelo (sem dados)
            </Button>
            <Button
              onClick={() => handleExecuteSeed(true)}
              className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
            >
              Importar {rawRows.length} lançamentos
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* STEP 5: DONE */}
      {step === 'done' && (
        <Card className="w-full max-w-[560px] shadow-lg border-slate-200 text-center">
          <CardHeader className="pb-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <CardTitle className="text-2xl font-bold text-slate-900">Tudo pronto!</CardTitle>
            <CardDescription className="text-base text-slate-600 mt-1">
              Seu orçamento pessoal foi configurado com sucesso.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3 pb-6">
            {seedResult && seedResult.imported > 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-xs text-emerald-950 text-left space-y-1">
                <p className="font-semibold text-sm">Resumo da importação inicial:</p>
                <p>• {seedResult.imported} lançamentos importados com sucesso.</p>
                <p>• {seedResult.autoClassified} regras exatas aprendidas pelo sistema.</p>
              </div>
            )}
            <p className="text-xs text-slate-500">
              Você pode importar extratos bancários (OFX/CSV) a qualquer momento na aba{' '}
              <strong>Importar</strong>.
            </p>
          </CardContent>

          <CardFooter className="justify-center border-t pt-6">
            <Button
              onClick={() => navigate('/')}
              className="w-full sm:w-auto px-8 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-base py-5"
            >
              Ver meu painel &rarr;
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  )
}

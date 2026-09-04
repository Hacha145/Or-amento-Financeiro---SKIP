import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Settings as SettingsIcon,
  Download,
  Upload,
  RefreshCw,
  FileSpreadsheet,
  Database,
  Trash2,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  Table,
  CreditCard,
  Lock,
  FileDown,
  UserCheck,
  Plus,
  X,
  Info,
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { useFinance } from '@/context/FinanceContext'
import { exportTransactionsToCSV } from '@/lib/parsers'
import { useToast } from '@/hooks/use-toast'
import { downloadXlsx } from '@/lib/xlsxExport'
import { exportEncryptedBackup, restoreEncryptedBackup } from '@/lib/cryptoBackup'
import { exportMonthPdfReport } from '@/lib/pdfReport'

export default function Settings() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const {
    settings,
    categories,
    transactions,
    budgets,
    learnedRules,
    financialClasses,
    financialItems,
    monthConsolidation,
    currentMonth,
    exportBackup,
    restoreBackup,
    loadDemoData,
    resetData,
    updateSettings,
  } = useFinance()

  const [confirmResetOpen, setConfirmResetOpen] = useState(false)
  const [xlsxTemplateFile, setXlsxTemplateFile] = useState<File | null>(null)
  const [xlsxYears, setXlsxYears] = useState<string>('')
  const [encryptPassword, setEncryptPassword] = useState('')
  const [restoreEncryptedFile, setRestoreEncryptedFile] = useState<File | null>(null)
  const [restoreEncryptedPwd, setRestoreEncryptedPwd] = useState('')
  const [exporting, setExporting] = useState(false)

  // User identity state for income matching
  const [userNameInput, setUserNameInput] = useState<string>(() => settings.userName || '')
  const [userAliasesList, setUserAliasesList] = useState<string[]>(() =>
    Array.isArray(settings.userAliases) ? settings.userAliases : [],
  )
  const [newAliasInput, setNewAliasInput] = useState<string>('')

  // Sync state if settings change outside
  React.useEffect(() => {
    setUserNameInput(settings.userName || '')
    setUserAliasesList(Array.isArray(settings.userAliases) ? settings.userAliases : [])
  }, [settings.userName, settings.userAliases])

  const handleSaveIdentity = (name: string, aliases: string[]) => {
    updateSettings({
      userName: name.trim(),
      userAliases: aliases.map((a) => a.trim()).filter((a) => a.length > 0),
    })
    toast({
      title: 'Identidade atualizada!',
      description: 'O reconhecimento de entradas usará este nome e apelidos automaticamente.',
    })
  }

  const handleAddAlias = () => {
    const trimmed = newAliasInput.trim()
    if (!trimmed) return
    if (userAliasesList.some((a) => a.toLowerCase() === trimmed.toLowerCase())) {
      toast({ title: 'Apelido já cadastrado', variant: 'destructive' })
      return
    }
    const updated = [...userAliasesList, trimmed]
    setUserAliasesList(updated)
    setNewAliasInput('')
    handleSaveIdentity(userNameInput, updated)
  }

  const handleRemoveAlias = (index: number) => {
    const updated = userAliasesList.filter((_, i) => i !== index)
    setUserAliasesList(updated)
    handleSaveIdentity(userNameInput, updated)
  }

  const yearsWithTx = useMemo(() => {
    const set = new Set<number>()
    for (const t of transactions) {
      const y = Number(t.date.split('-')[0])
      if (!isNaN(y)) set.add(y)
    }
    return Array.from(set).sort((a, b) => a - b)
  }, [transactions])

  // Export JSON Backup
  const handleExportBackup = () => {
    const jsonStr = exportBackup()
    const blob = new Blob([jsonStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `orcamento_backup_${new Date().toISOString().split('T')[0]}.json`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast({
      title: 'Backup gerado!',
      description: 'Arquivo JSON salvo com segurança no seu computador.',
    })
  }

  // Restore JSON Backup
  const handleRestoreBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (evt) => {
      const content = evt.target?.result as string
      if (!content) return

      const ok = restoreBackup(content)
      if (ok) {
        toast({
          title: 'Backup restaurado com sucesso!',
          description: 'Todos os seus dados foram recarregados.',
        })
      } else {
        toast({
          title: 'Erro ao restaurar',
          description: 'O arquivo JSON enviado é inválido ou incompatível.',
          variant: 'destructive',
        })
      }
    }
    reader.readAsText(file)
  }

  // Export all transactions to CSV in User's Template format
  const handleExportTemplateCSV = () => {
    const catMap = new Map(categories.map((c) => [c.id, c.name]))
    const mapping = settings.templateConfig?.columnMapping

    const headersMap = {
      date: mapping?.dateCol || 'Data',
      description: mapping?.descriptionCol || 'Descrição',
      amount: mapping?.amountCol || 'Valor',
      category: mapping?.categoryCol || 'Categoria',
      type: mapping?.typeCol || 'Tipo',
      notes: mapping?.notesCol || 'Observação',
    }

    const payload = transactions.map((t) => ({
      date: t.date,
      description: t.description,
      amount: t.amount,
      type: t.type,
      categoryName: t.categoryId ? catMap.get(t.categoryId) : '',
      notes: t.notes,
    }))

    const csvStr = exportTransactionsToCSV(payload, headersMap)
    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `orcamento_export_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast({
      title: 'Planilha exportada!',
      description: 'Arquivo CSV compatível com seu modelo foi baixado.',
    })
  }

  // Handle Full Reset
  const handleExecuteReset = () => {
    resetData()
    setConfirmResetOpen(false)
    toast({
      title: 'Dados apagados',
      description: 'O aplicativo foi reiniciado para o estado original.',
    })
    navigate('/boas-vindas')
  }

  // XLSX export with template + per-cell formulas
  const handleExportXlsx = async () => {
    setExporting(true)
    try {
      const years = xlsxYears
        ? xlsxYears
            .split(',')
            .map((s) => Number(s.trim()))
            .filter((n) => !isNaN(n))
        : yearsWithTx
      if (years.length === 0) {
        toast({ title: 'Selecione ao menos um ano', variant: 'destructive' })
        return
      }
      await downloadXlsx(
        {
          templateFile: xlsxTemplateFile,
          years,
          transactions,
          items: financialItems,
          classes: financialClasses,
        },
        `orcamento_${years.join('-')}.xlsx`,
      )
      toast({
        title: 'Planilha XLSX exportada!',
        description: `${years.length} ano(s) exportado(s).`,
      })
    } catch (e) {
      console.error(e)
      toast({ title: 'Falha ao exportar XLSX', description: String(e), variant: 'destructive' })
    } finally {
      setExporting(false)
    }
  }

  // Encrypted backup
  const handleExportEncrypted = async () => {
    if (!encryptPassword || encryptPassword.length < 4) {
      toast({
        title: 'Senha muito curta',
        description: 'Use ao menos 4 caracteres.',
        variant: 'destructive',
      })
      return
    }
    try {
      const jsonStr = await exportEncryptedBackup(encryptPassword)
      const blob = new Blob([jsonStr], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `orcamento_backup_encrypted_${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      toast({
        title: 'Backup criptografado gerado!',
        description: 'Guarde a senha: sem ela não é possível restaurar.',
      })
    } catch (e) {
      toast({ title: 'Falha ao gerar backup', description: String(e), variant: 'destructive' })
    }
  }

  const handleRestoreEncrypted = async () => {
    if (!restoreEncryptedFile || !restoreEncryptedPwd) {
      toast({ title: 'Selecione o arquivo e a senha', variant: 'destructive' })
      return
    }
    try {
      const text = await restoreEncryptedFile.text()
      const ok = await restoreEncryptedBackup(text, restoreEncryptedPwd)
      if (ok) {
        toast({ title: 'Backup restaurado com sucesso!' })
        // force reload to refresh context state
        window.location.reload()
      } else {
        toast({
          title: 'Falha ao descriptografar',
          description: 'Senha incorreta ou arquivo inválido.',
          variant: 'destructive',
        })
      }
    } catch (e) {
      toast({ title: 'Erro', description: String(e), variant: 'destructive' })
    }
  }

  // PDF report
  const handleExportPdf = () => {
    const monthIdx = Number(currentMonth.split('-')[1]) - 1
    const monthLabel = `${['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][monthIdx]}/${currentMonth.split('-')[0]}`
    exportMonthPdfReport(monthConsolidation, monthLabel)
    toast({ title: 'Relatório PDF gerado!' })
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto text-[#F8FAFC]">
      {/* Title */}
      <div className="pb-2 border-b border-white/5 space-y-1">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-['Lexend']">
          Configurações &amp; Backup
        </h1>
        <p className="text-xs sm:text-sm text-slate-400">
          Gerencie o formato da sua planilha modelo, regras de contabilidade e cópias de segurança
        </p>
      </div>

      {/* User Identity for Income Identification */}
      <Card
        id="identificacao-entradas"
        className="border-white/10 bg-[#192134] rounded-2xl shadow-sm"
      >
        <CardHeader className="pb-3 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-[#F8FAFC]">
                Identificação de Entradas
              </CardTitle>
              <CardDescription className="text-xs text-[#B6C2D4]">
                Vincule seu nome e apelidos para que o sistema reconheça receitas recebidas na conta
                com alta precisão
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-5 space-y-4">
          {!settings.userName?.trim() && (
            <div className="flex items-start gap-2.5 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-200">
              <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-blue-100">Dica de precisão:</p>
                <p className="text-[11px] text-blue-200/90 mt-0.5">
                  Preencher seu nome melhora a identificação automática de entradas (PIX recebido,
                  TED, transferências e reembolsos com seu nome no extrato).
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="user-fullname" className="text-xs font-semibold text-[#F8FAFC]">
              Seu nome completo
            </Label>
            <div className="flex gap-2">
              <Input
                id="user-fullname"
                placeholder="Ex: Carlos Eduardo da Silva"
                value={userNameInput}
                onChange={(e) => setUserNameInput(e.target.value)}
                onBlur={() => handleSaveIdentity(userNameInput, userAliasesList)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleSaveIdentity(userNameInput, userAliasesList)
                  }
                }}
                className="bg-[#101A34] text-[#F8FAFC] border-white/10 rounded-xl text-xs h-10 placeholder:text-[#94A3B8]"
              />
              <Button
                type="button"
                onClick={() => handleSaveIdentity(userNameInput, userAliasesList)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs h-10 px-4 font-semibold shrink-0"
              >
                Salvar Nome
              </Button>
            </div>
            <p className="text-[11px] text-[#94A3B8]">
              Como seu nome costuma constar nos créditos e transferências recebidas.
            </p>
          </div>

          <div className="space-y-2 pt-2 border-t border-white/5">
            <Label className="text-xs font-semibold text-[#F8FAFC]">
              Nomes/apelidos que aparecem na conta
            </Label>
            <div className="flex gap-2">
              <Input
                placeholder="Ex: Carlos Silva, Cadu, C. Silva"
                value={newAliasInput}
                onChange={(e) => setNewAliasInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddAlias()
                  }
                }}
                className="bg-[#101A34] text-[#F8FAFC] border-white/10 rounded-xl text-xs h-10 placeholder:text-[#94A3B8]"
              />
              <Button
                type="button"
                onClick={handleAddAlias}
                variant="outline"
                className="border-white/10 bg-[#202A40] text-[#F8FAFC] hover:bg-[#202A40]/80 rounded-xl text-xs h-10 px-4 shrink-0 font-medium"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Adicionar
              </Button>
            </div>

            {userAliasesList.length > 0 ? (
              <div className="flex flex-wrap gap-2 pt-2">
                {userAliasesList.map((alias, idx) => (
                  <Badge
                    key={idx}
                    className="bg-[#101A34] text-[#F8FAFC] border border-white/10 text-xs px-2.5 py-1 rounded-xl flex items-center gap-1.5"
                  >
                    <span>{alias}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveAlias(idx)}
                      className="text-[#94A3B8] hover:text-rose-400 p-0.5 rounded cursor-pointer transition-colors"
                      aria-label={`Remover apelido ${alias}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-[#94A3B8]">
                Nenhum apelido cadastrado. Adicione abreviações ou outros formatos como os bancos
                registram seu nome.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Duplication & Credit Card Settings */}
      <Card className="border-white/10 bg-[#192134] rounded-2xl shadow-sm">
        <CardHeader className="pb-3 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-300">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-[#F8FAFC]">
                Fatura de Cartão &amp; Dupla Contagem
              </CardTitle>
              <CardDescription className="text-xs text-[#B6C2D4]">
                Controle como os pagamentos de fatura são contabilizados nos totais de despesas
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-4 p-3.5 bg-[#101A34] rounded-xl border border-white/5">
            <div className="space-y-1 pr-4">
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="cc-toggle"
                  className="text-xs font-semibold text-[#F8FAFC] cursor-pointer"
                >
                  Incluir pagamento de fatura nas despesas do Dashboard
                </Label>
                <Badge
                  variant="outline"
                  className="text-[10px] text-[#94A3B8] border-white/10 bg-[#192134]"
                >
                  Padrão: Desativado
                </Badge>
              </div>
              <p className="text-[11px] text-[#B6C2D4] leading-relaxed">
                Quando <strong className="text-[#F8FAFC]">desativado</strong> (recomendado),
                pagamentos de fatura ("Pagamento recebido", "Pgto fatura", etc.) são marcados e
                excluídos da soma de despesas para evitar duplicar os gastos que já foram lançados
                individualmente.
              </p>
            </div>

            <Switch
              id="cc-toggle"
              checked={settings.includeCreditCardPaymentsInTotals ?? false}
              onCheckedChange={(val) => {
                updateSettings({ includeCreditCardPaymentsInTotals: val })
                toast({
                  title: val ? 'Inclusão ativada' : 'Exclusão de fatura ativada',
                  description: val
                    ? 'Pagamentos de fatura agora serão somados aos totais de despesa.'
                    : 'Pagamentos de fatura agora são ignorados nos totais para evitar dupla contagem.',
                })
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Template Configuration Section */}
      <Card className="border-white/10 bg-[#192134] rounded-2xl shadow-sm">
        <CardHeader className="pb-3 border-b border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-[#F8FAFC]">
                  Planilha Modelo &amp; Mapeamento de Colunas
                </CardTitle>
                <CardDescription className="text-xs text-[#B6C2D4]">
                  Define como seus arquivos são lidos e exportados de volta para sua planilha
                </CardDescription>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/boas-vindas')}
              className="text-xs h-9 border-white/10 bg-[#202A40] text-blue-300 hover:bg-[#202A40]/80 rounded-xl"
            >
              Reconfigurar Modelo
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-5 space-y-4">
          {settings.templateConfig ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-[#94A3B8]">Arquivo de referência:</span>
                <span className="font-semibold text-[#F8FAFC]">
                  {settings.templateConfig.fileName || 'Template padrão'}
                </span>
                <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px]">
                  Ativo
                </Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs pt-1">
                <div className="bg-[#101A34] p-3 rounded-xl border border-white/5">
                  <span className="text-[#94A3B8] block text-[10px] uppercase">Data</span>
                  <span className="font-semibold text-[#F8FAFC]">
                    {settings.templateConfig.columnMapping.dateCol}
                  </span>
                </div>
                <div className="bg-[#101A34] p-3 rounded-xl border border-white/5">
                  <span className="text-[#94A3B8] block text-[10px] uppercase">Descrição</span>
                  <span className="font-semibold text-[#F8FAFC]">
                    {settings.templateConfig.columnMapping.descriptionCol}
                  </span>
                </div>
                <div className="bg-[#101A34] p-3 rounded-xl border border-white/5">
                  <span className="text-[#94A3B8] block text-[10px] uppercase">Valor</span>
                  <span className="font-semibold text-[#F8FAFC]">
                    {settings.templateConfig.columnMapping.amountCol}
                  </span>
                </div>
                <div className="bg-[#101A34] p-3 rounded-xl border border-white/5">
                  <span className="text-[#94A3B8] block text-[10px] uppercase">Categoria</span>
                  <span className="font-semibold text-[#F8FAFC]">
                    {settings.templateConfig.columnMapping.categoryCol || '—'}
                  </span>
                </div>
                <div className="bg-[#101A34] p-3 rounded-xl border border-white/5">
                  <span className="text-[#94A3B8] block text-[10px] uppercase">Tipo (D/C)</span>
                  <span className="font-semibold text-[#F8FAFC]">
                    {settings.templateConfig.columnMapping.typeCol || '—'}
                  </span>
                </div>
                <div className="bg-[#101A34] p-3 rounded-xl border border-white/5">
                  <span className="text-[#94A3B8] block text-[10px] uppercase">Observação</span>
                  <span className="font-semibold text-[#F8FAFC]">
                    {settings.templateConfig.columnMapping.notesCol || '—'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-[#B6C2D4]">
              Nenhuma planilha modelo customizada foi enviada ainda. O sistema usa as colunas padrão
              brasileiras (Data, Descrição, Valor, Categoria, Tipo, Observação).
            </div>
          )}

          {/* Export to CSV button */}
          <div className="pt-2">
            <Button
              onClick={handleExportTemplateCSV}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs gap-1.5 shadow-sm rounded-xl h-10 px-4 font-medium"
            >
              <Download className="w-4 h-4" />
              Exportar todas as transações para CSV ({transactions.length} itens)
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* XLSX Export Section */}
      <Card className="border-white/10 bg-[#192134] rounded-2xl shadow-sm">
        <CardHeader className="pb-3 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-[#F8FAFC]">
                Exportar para XLSX (com fórmulas)
              </CardTitle>
              <CardDescription className="text-xs text-[#B6C2D4]">
                Gera uma planilha com fórmulas por célula (=5.54+6.39) preservando o template
                original.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5 space-y-4 text-xs">
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-[#F8FAFC]">Template XLSX (opcional)</Label>
            <p className="text-[11px] text-[#94A3B8]">
              Envie sua planilha de referência (abas anuais 2023/2024/2025/2026). Sem template, o
              sistema gera uma planilha nova a partir dos itens cadastrados.
            </p>
            <Input
              type="file"
              accept=".xlsx"
              onChange={(e) => setXlsxTemplateFile(e.target.files?.[0] ?? null)}
              className="bg-[#101A34] text-[#F8FAFC] border-white/10 rounded-xl text-xs h-10"
            />
            {xlsxTemplateFile && (
              <p className="text-[11px] text-emerald-400">Template: {xlsxTemplateFile.name}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-[#F8FAFC]">Anos para exportar</Label>
            <Input
              placeholder={`Ex: ${yearsWithTx.length ? yearsWithTx.join(', ') : '2024, 2025'}`}
              value={xlsxYears}
              onChange={(e) => setXlsxYears(e.target.value)}
              className="bg-[#101A34] text-[#F8FAFC] border-white/10 rounded-xl text-xs h-10"
            />
            <p className="text-[11px] text-[#94A3B8]">
              Deixe em branco para exportar todos os anos com transações (
              {yearsWithTx.join(', ') || 'nenhum'}).
            </p>
          </div>
          <Button
            onClick={handleExportXlsx}
            disabled={exporting}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 rounded-xl h-10 px-4 font-medium"
          >
            <FileDown className="w-4 h-4" />
            {exporting ? 'Gerando…' : 'Baixar XLSX'}
          </Button>
        </CardContent>
      </Card>

      {/* PDF Report Section */}
      <Card className="border-white/10 bg-[#192134] rounded-2xl shadow-sm">
        <CardHeader className="pb-3 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
              <FileDown className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-[#F8FAFC]">
                Relatório Mensal (PDF)
              </CardTitle>
              <CardDescription className="text-xs text-[#B6C2D4]">
                Receita, despesas por classe e saldo do mês selecionado ({currentMonth}).
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5">
          <Button
            onClick={handleExportPdf}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs gap-1.5 rounded-xl h-10 px-4 font-medium"
          >
            <FileDown className="w-4 h-4" /> Gerar PDF de {currentMonth}
          </Button>
        </CardContent>
      </Card>

      {/* Encrypted Backup Section */}
      <Card className="border-white/10 bg-[#192134] rounded-2xl shadow-sm">
        <CardHeader className="pb-3 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-[#F8FAFC]">
                Backup Criptografado (AES-GCM)
              </CardTitle>
              <CardDescription className="text-xs text-[#B6C2D4]">
                Backup protegido por senha (WebCrypto). Sem a senha, ninguém pode ler os dados.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5 space-y-4 text-xs">
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-[#F8FAFC]">Senha para gerar backup</Label>
            <Input
              type="password"
              value={encryptPassword}
              onChange={(e) => setEncryptPassword(e.target.value)}
              placeholder="Defina uma senha"
              className="bg-[#101A34] text-[#F8FAFC] border-white/10 rounded-xl text-xs h-10"
            />
            <Button
              onClick={handleExportEncrypted}
              variant="outline"
              className="text-xs gap-1.5 border-white/10 bg-[#202A40] text-[#F8FAFC] hover:bg-[#202A40]/80 rounded-xl h-10"
            >
              <Lock className="w-4 h-4" /> Gerar backup criptografado
            </Button>
          </div>
          <div className="space-y-2 pt-3 border-t border-white/5">
            <Label className="text-xs font-semibold text-[#F8FAFC]">
              Restaurar backup criptografado
            </Label>
            <Input
              type="file"
              accept=".json"
              onChange={(e) => setRestoreEncryptedFile(e.target.files?.[0] ?? null)}
              className="bg-[#101A34] text-[#F8FAFC] border-white/10 rounded-xl text-xs h-10"
            />
            <Input
              type="password"
              value={restoreEncryptedPwd}
              onChange={(e) => setRestoreEncryptedPwd(e.target.value)}
              placeholder="Senha usada na geração"
              className="bg-[#101A34] text-[#F8FAFC] border-white/10 rounded-xl text-xs h-10"
            />
            <Button
              onClick={handleRestoreEncrypted}
              variant="outline"
              className="text-xs gap-1.5 border-white/10 bg-[#202A40] text-[#F8FAFC] hover:bg-[#202A40]/80 rounded-xl h-10"
            >
              <Upload className="w-4 h-4" /> Restaurar criptografado
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Backup & Restore Section */}
      <Card className="border-white/10 bg-[#192134] rounded-2xl shadow-sm">
        <CardHeader className="pb-3 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-[#F8FAFC]">
                Backup Completo do Sistema (JSON)
              </CardTitle>
              <CardDescription className="text-xs text-[#B6C2D4]">
                Salve ou restaure todas as categorias, transações, tetos de gastos e regras
                aprendidas
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-5 space-y-4 text-xs">
          <div className="bg-[#101A34] p-3.5 rounded-xl border border-white/5 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-[#B6C2D4] leading-relaxed">
              <p className="font-semibold text-[#F8FAFC]">
                Armazenamento 100% no navegador (localStorage)
              </p>
              <p className="mt-0.5">
                Para não perder seus dados ao limpar o histórico do navegador ou ao trocar de
                computador, recomendamos baixar uma cópia de backup periodicamente.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button
              onClick={handleExportBackup}
              variant="outline"
              className="text-xs gap-1.5 border-white/10 bg-[#202A40] text-[#F8FAFC] hover:bg-[#202A40]/80 rounded-xl h-10"
            >
              <Download className="w-4 h-4 text-[#B6C2D4]" />
              Baixar Arquivo de Backup (JSON)
            </Button>

            <div className="relative">
              <Button
                variant="outline"
                className="text-xs gap-1.5 border-white/10 bg-[#202A40] text-[#F8FAFC] hover:bg-[#202A40]/80 rounded-xl h-10"
              >
                <Upload className="w-4 h-4 text-[#B6C2D4]" />
                Restaurar de um Backup (JSON)
              </Button>
              <input
                type="file"
                accept=".json"
                onChange={handleRestoreBackup}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Demo Data & Danger Zone */}
      <Card className="border-white/10 bg-[#192134] rounded-2xl shadow-sm">
        <CardHeader className="pb-3 border-b border-white/5">
          <CardTitle className="text-base font-bold text-[#F8FAFC]">
            Ações Rápidas &amp; Manutenção
          </CardTitle>
        </CardHeader>

        <CardContent className="p-5 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 bg-[#101A34] rounded-xl border border-white/5">
            <div>
              <h4 className="text-xs font-semibold text-[#F8FAFC]">Carregar dados de exemplo</h4>
              <p className="text-[11px] text-[#B6C2D4]">
                Preenche o sistema com 10 transações de teste, categorias e regras de aprendizado.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                loadDemoData()
                toast({
                  title: 'Dados de exemplo carregados!',
                  description: 'Você pode conferir o Dashboard e as Transações.',
                })
              }}
              className="text-xs shrink-0 rounded-xl h-9 bg-[#202A40] text-[#F8FAFC] hover:bg-[#202A40]/80 border border-white/5"
            >
              <Sparkles className="w-3.5 h-3.5 mr-1 text-blue-400" />
              Carregar Demo
            </Button>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 bg-red-950/20 rounded-xl border border-red-500/30">
            <div>
              <h4 className="text-xs font-semibold text-rose-300">Zerar todos os dados</h4>
              <p className="text-[11px] text-rose-200/70">
                Apaga permanentemente todas as transações, categorias customizadas e regras
                aprendidas neste navegador.
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmResetOpen(true)}
              className="text-xs shrink-0 bg-red-600 hover:bg-red-700 text-white rounded-xl h-9 px-4 font-semibold"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Zerar Aplicativo
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* RESET CONFIRMATION MODAL */}
      <Dialog open={confirmResetOpen} onOpenChange={setConfirmResetOpen}>
        <DialogContent className="sm:max-w-[420px] bg-[#192134] text-[#F8FAFC] border border-white/10 rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-rose-400 flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-rose-400" />
              Tem certeza que deseja apagar tudo?
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 text-xs text-[#B6C2D4] space-y-2">
            <p>
              Esta ação removerá todas as suas transações, orçamentos e histórico de aprendizado do
              armazenamento local do seu navegador.
            </p>
            <p className="font-semibold text-[#F8FAFC]">
              Certifique-se de que fez o download do seu backup JSON caso queira restaurar estes
              dados no futuro.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmResetOpen(false)}
              className="border-white/10 bg-transparent text-[#B6C2D4] hover:bg-[#202A40] hover:text-[#F8FAFC] rounded-xl h-10 text-xs"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleExecuteReset}
              className="bg-red-600 hover:bg-red-700 text-white rounded-xl h-10 px-4 text-xs font-semibold"
            >
              Sim, apagar tudo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

import React, { useState } from 'react'
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

export default function Settings() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const {
    settings,
    categories,
    transactions,
    budgets,
    learnedRules,
    exportBackup,
    restoreBackup,
    loadDemoData,
    resetData,
    updateSettings,
  } = useFinance()

  const [confirmResetOpen, setConfirmResetOpen] = useState(false)

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

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Configurações & Backup</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Gerencie o formato da sua planilha modelo, regras de contabilidade e cópias de segurança
        </p>
      </div>

      {/* Duplication & Credit Card Settings */}
      <Card className="border-slate-200/80 shadow-xs">
        <CardHeader className="pb-3 border-b">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-100 text-amber-800">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-slate-900">
                Fatura de Cartão & Dupla Contagem
              </CardTitle>
              <CardDescription className="text-xs">
                Controle como os pagamentos de fatura são contabilizados nos totais de despesas
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-4 p-3.5 bg-slate-50 rounded-xl border">
            <div className="space-y-1 pr-4">
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="cc-toggle"
                  className="text-xs font-semibold text-slate-900 cursor-pointer"
                >
                  Incluir pagamento de fatura nas despesas do Dashboard
                </Label>
                <Badge variant="outline" className="text-[10px] text-slate-500">
                  Padrão: Desativado
                </Badge>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Quando <strong>desativado</strong> (recomendado), pagamentos de fatura ("Pagamento
                recebido", "Pgto fatura", etc.) são marcados e excluídos da soma de despesas para
                evitar duplicar os gastos que já foram lançados individualmente.
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
      <Card className="border-slate-200/80 shadow-xs">
        <CardHeader className="pb-3 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-slate-900">
                  Planilha Modelo & Mapeamento de Colunas
                </CardTitle>
                <CardDescription className="text-xs">
                  Define como seus arquivos são lidos e exportados de volta para sua planilha
                </CardDescription>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/boas-vindas')}
              className="text-xs text-emerald-800 border-emerald-300 hover:bg-emerald-50"
            >
              Reconfigurar Modelo
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-5 space-y-4">
          {settings.templateConfig ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">Arquivo de referência:</span>
                <span className="font-semibold text-slate-900">
                  {settings.templateConfig.fileName || 'Template padrão'}
                </span>
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px]">
                  Ativo
                </Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs pt-1">
                <div className="bg-slate-50 p-2.5 rounded-lg border">
                  <span className="text-slate-400 block text-[10px]">Data</span>
                  <span className="font-semibold text-slate-800">
                    {settings.templateConfig.columnMapping.dateCol}
                  </span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border">
                  <span className="text-slate-400 block text-[10px]">Descrição</span>
                  <span className="font-semibold text-slate-800">
                    {settings.templateConfig.columnMapping.descriptionCol}
                  </span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border">
                  <span className="text-slate-400 block text-[10px]">Valor</span>
                  <span className="font-semibold text-slate-800">
                    {settings.templateConfig.columnMapping.amountCol}
                  </span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border">
                  <span className="text-slate-400 block text-[10px]">Categoria</span>
                  <span className="font-semibold text-slate-800">
                    {settings.templateConfig.columnMapping.categoryCol || '—'}
                  </span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border">
                  <span className="text-slate-400 block text-[10px]">Tipo (D/C)</span>
                  <span className="font-semibold text-slate-800">
                    {settings.templateConfig.columnMapping.typeCol || '—'}
                  </span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border">
                  <span className="text-slate-400 block text-[10px]">Observação</span>
                  <span className="font-semibold text-slate-800">
                    {settings.templateConfig.columnMapping.notesCol || '—'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500">
              Nenhuma planilha modelo customizada foi enviada ainda. O sistema usa as colunas padrão
              brasileiras (Data, Descrição, Valor, Categoria, Tipo, Observação).
            </div>
          )}

          {/* Export to CSV button */}
          <div className="pt-2">
            <Button
              onClick={handleExportTemplateCSV}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 shadow-xs"
            >
              <Download className="w-4 h-4" />
              Exportar todas as transações para CSV ({transactions.length} itens)
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Backup & Restore Section */}
      <Card className="border-slate-200/80 shadow-xs">
        <CardHeader className="pb-3 border-b">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-100 text-blue-700">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-slate-900">
                Backup Completo do Sistema (JSON)
              </CardTitle>
              <CardDescription className="text-xs">
                Salve ou restaure todas as categorias, transações, tetos de gastos e regras
                aprendidas
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-5 space-y-4 text-xs">
          <div className="bg-slate-50 p-3.5 rounded-xl border flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-slate-600 leading-relaxed">
              <p className="font-semibold text-slate-900">
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
              className="text-xs gap-1.5 border-slate-300 hover:bg-slate-50"
            >
              <Download className="w-4 h-4 text-slate-600" />
              Baixar Arquivo de Backup (JSON)
            </Button>

            <div className="relative">
              <Button
                variant="outline"
                className="text-xs gap-1.5 border-slate-300 hover:bg-slate-50"
              >
                <Upload className="w-4 h-4 text-slate-600" />
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
      <Card className="border-slate-200/80 shadow-xs">
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-base font-bold text-slate-900">
            Ações Rápidas & Manutenção
          </CardTitle>
        </CardHeader>

        <CardContent className="p-5 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 bg-slate-50 rounded-lg border">
            <div>
              <h4 className="text-xs font-semibold text-slate-900">Carregar dados de exemplo</h4>
              <p className="text-[11px] text-slate-500">
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
              className="text-xs shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5 mr-1 text-blue-600" />
              Carregar Demo
            </Button>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 bg-rose-50/50 rounded-lg border border-rose-200">
            <div>
              <h4 className="text-xs font-semibold text-rose-950">Zerar todos os dados</h4>
              <p className="text-[11px] text-rose-700">
                Apaga permanentemente todas as transações, categorias customizadas e regras
                aprendidas neste navegador.
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmResetOpen(true)}
              className="text-xs shrink-0 bg-rose-600 hover:bg-rose-700"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Zerar Aplicativo
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* RESET CONFIRMATION MODAL */}
      <Dialog open={confirmResetOpen} onOpenChange={setConfirmResetOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-rose-700 flex items-center gap-2">
              <Trash2 className="w-5 h-5" />
              Tem certeza que deseja apagar tudo?
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 text-xs text-slate-600 space-y-2">
            <p>
              Esta ação removerá todas as suas transações, orçamentos e histórico de aprendizado do
              armazenamento local do seu navegador.
            </p>
            <p className="font-semibold text-slate-800">
              Certifique-se de que fez o download do seu backup JSON caso queira restaurar estes
              dados no futuro.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setConfirmResetOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" size="sm" onClick={handleExecuteReset}>
              Sim, apagar tudo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

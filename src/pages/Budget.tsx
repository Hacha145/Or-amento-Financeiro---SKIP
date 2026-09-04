import React, { useState, useMemo } from 'react'
import {
  Target,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  DollarSign,
  PieChart as PieIcon,
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MonthSelector } from '@/components/MonthSelector'
import { useFinance } from '@/context/FinanceContext'
import { formatCurrencyBRL } from '@/lib/parsers'
import { useToast } from '@/hooks/use-toast'

export default function Budget() {
  const { toast } = useToast()
  const {
    budgets,
    categories,
    transactions,
    currentMonth,
    setBudgetLimit,
    removeBudgetLimit,
    settings,
  } = useFinance()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedCatId, setSelectedCatId] = useState<string>('')
  const [limitInput, setLimitInput] = useState('')

  // Compute expenses per category for the current selected month
  const categoryExpenses = useMemo(() => {
    const monthTxs = transactions.filter(
      (t) => t.date.startsWith(currentMonth) && t.type === 'expense',
    )
    const includeCC = settings.includeCreditCardPaymentsInTotals ?? false
    const map = new Map<string, number>()
    for (const tx of monthTxs) {
      if (!includeCC && tx.isCreditCardPayment) continue
      const cId = tx.categoryId || 'cat-outros'
      map.set(cId, (map.get(cId) || 0) + tx.amount)
    }
    return map
  }, [transactions, currentMonth, settings.includeCreditCardPaymentsInTotals])

  // Total budget vs Total actual expenses
  const { totalBudget, totalSpent } = useMemo(() => {
    const totalB = budgets.reduce((acc, b) => acc + b.monthlyLimit, 0)
    let totalS = 0
    budgets.forEach((b) => {
      totalS += categoryExpenses.get(b.categoryId) || 0
    })
    return { totalBudget: totalB, totalSpent: totalS }
  }, [budgets, categoryExpenses])

  // Categories that do not yet have a budget
  const availableCategoriesForBudget = useMemo(() => {
    const existingCatIds = new Set(budgets.map((b) => b.categoryId))
    return categories.filter((c) => !existingCatIds.has(c.id))
  }, [categories, budgets])

  // Open add/edit budget modal
  const handleOpenModal = (catId?: string, currentLimit?: number) => {
    if (catId) {
      setSelectedCatId(catId)
      setLimitInput(currentLimit ? String(currentLimit) : '')
    } else {
      setSelectedCatId(availableCategoriesForBudget[0]?.id || '')
      setLimitInput('')
    }
    setDialogOpen(true)
  }

  // Save budget limit
  const handleSaveBudget = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCatId || !limitInput) return

    const cleanNum = limitInput.replace(/[R$\s]/g, '').replace(',', '.')
    const parsedLimit = parseFloat(cleanNum)
    if (isNaN(parsedLimit) || parsedLimit <= 0) return

    setBudgetLimit(selectedCatId, parsedLimit)
    setDialogOpen(false)
    toast({
      title: 'Teto definido com sucesso',
      description: 'Seu limite mensal foi atualizado.',
    })
  }

  const handleRemove = (catId: string) => {
    removeBudgetLimit(catId)
    toast({
      title: 'Teto removido',
      description: 'O orçamento desta categoria foi desativado.',
    })
  }

  return (
    <div className="space-y-6 animate-fade-in text-[#F8FAFC]">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#F8FAFC]">
            Orçamento Mensal
          </h1>
          <p className="text-xs sm:text-sm text-[#B6C2D4] mt-1">
            Defina metas de gastos por categoria para manter o controle financeiro
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
          <MonthSelector />
          <Button
            size="sm"
            onClick={() => handleOpenModal()}
            disabled={availableCategoriesForBudget.length === 0}
            className="bg-[#047857] hover:bg-[#059669] text-white text-xs gap-1.5 shadow-sm rounded-xl h-10 px-4 shrink-0 font-medium"
          >
            <Plus className="w-4 h-4" />
            Novo Limite
          </Button>
        </div>
      </div>

      {/* Global Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-white/10 bg-[#192134] rounded-2xl shadow-sm">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-medium text-[#94A3B8] uppercase tracking-wider">
              Orçamento Planejado
            </CardTitle>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
              <Target className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <div className="text-2xl font-bold text-[#F8FAFC] tabular-nums">
              {formatCurrencyBRL(totalBudget)}
            </div>
            <p className="text-[11px] text-[#B6C2D4] mt-1">Soma de todas as metas ativas</p>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-[#192134] rounded-2xl shadow-sm">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-medium text-[#94A3B8] uppercase tracking-wider">
              Total Realizado no Mês
            </CardTitle>
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <div className="text-2xl font-bold text-[#FB7185] tabular-nums">
              {formatCurrencyBRL(totalSpent)}
            </div>
            <p className="text-[11px] text-[#B6C2D4] mt-1">Gastos nas categorias orçadas</p>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-[#192134] rounded-2xl shadow-sm">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-medium text-[#94A3B8] uppercase tracking-wider">
              Saldo Restante
            </CardTitle>
            <div
              className={`p-2 rounded-xl ${
                totalBudget - totalSpent >= 0
                  ? 'bg-blue-500/10 text-blue-400'
                  : 'bg-rose-500/10 text-rose-400'
              }`}
            >
              <PieIcon className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <div
              className={`text-2xl font-bold tabular-nums ${
                totalBudget - totalSpent >= 0 ? 'text-[#34D399]' : 'text-[#FB7185]'
              }`}
            >
              {formatCurrencyBRL(totalBudget - totalSpent)}
            </div>
            <p className="text-[11px] text-[#B6C2D4] mt-1">
              {totalBudget > 0
                ? `${((totalSpent / totalBudget) * 100).toFixed(0)}% do orçamento utilizado`
                : 'Sem metas ativas'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Budget Limit Cards Grid */}
      {budgets.length === 0 ? (
        <Card className="border-white/10 bg-[#192134] rounded-2xl shadow-sm py-16 text-center">
          <CardContent className="space-y-3">
            <Target className="w-12 h-12 mx-auto text-slate-600 stroke-1" />
            <h3 className="text-base font-semibold text-[#F8FAFC]">
              Nenhuma meta de orçamento definida
            </h3>
            <p className="text-xs text-[#B6C2D4] max-w-md mx-auto">
              Defina limites mensais para categorias como Alimentação, Transporte e Lazer para
              receber alertas visuais quando os gastos se aproximarem do teto.
            </p>
            <Button
              size="sm"
              onClick={() => handleOpenModal()}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs mt-3 rounded-xl h-10 px-4"
            >
              Definir primeiro limite
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {budgets.map((b) => {
            const cat = categories.find((c) => c.id === b.categoryId)
            const spent = categoryExpenses.get(b.categoryId) || 0
            const percentage = b.monthlyLimit > 0 ? (spent / b.monthlyLimit) * 100 : 0
            const isOver = spent > b.monthlyLimit
            const remaining = b.monthlyLimit - spent

            let barColor = 'bg-emerald-500'
            let statusBadge = (
              <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px]">
                Dentro do teto
              </Badge>
            )

            if (percentage >= 100) {
              barColor = 'bg-rose-500'
              statusBadge = (
                <Badge
                  variant="destructive"
                  className="text-[10px] gap-1 bg-rose-500/20 text-rose-300 border-rose-500/30"
                >
                  <AlertTriangle className="w-3 h-3" /> Excedeu teto
                </Badge>
              )
            } else if (percentage >= 75) {
              barColor = 'bg-amber-500'
              statusBadge = (
                <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px]">
                  Alerta (&gt;75%)
                </Badge>
              )
            }

            return (
              <Card
                key={b.categoryId}
                className={`border-white/10 bg-[#192134] rounded-2xl shadow-sm relative overflow-hidden ${
                  isOver ? 'border-rose-500/40 bg-rose-500/5' : ''
                }`}
              >
                <CardHeader className="p-4 pb-2 border-b border-white/5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: cat ? cat.color : '#6B7280' }}
                      />
                      <CardTitle className="text-sm font-bold text-[#F8FAFC]">
                        {cat ? cat.name : 'Categoria'}
                      </CardTitle>
                    </div>
                    {statusBadge}
                  </div>
                </CardHeader>

                <CardContent className="p-4 pt-3 space-y-3">
                  {/* Values */}
                  <div className="flex items-baseline justify-between text-xs">
                    <div>
                      <span className="text-[#94A3B8] block text-[11px]">Gasto atual</span>
                      <span className="text-base font-bold text-[#F8FAFC] tabular-nums">
                        {formatCurrencyBRL(spent)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[#94A3B8] block text-[11px]">Limite mensal</span>
                      <span className="text-sm font-semibold text-[#B6C2D4] tabular-nums">
                        {formatCurrencyBRL(b.monthlyLimit)}
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1">
                    <div className="w-full bg-[#101A34] rounded-full h-2.5 overflow-hidden border border-white/5">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-[#B6C2D4] tabular-nums">
                      <span>{percentage.toFixed(0)}% utilizado</span>
                      <span>
                        {remaining >= 0
                          ? `Resta ${formatCurrencyBRL(remaining)}`
                          : `Excedeu ${formatCurrencyBRL(Math.abs(remaining))}`}
                      </span>
                    </div>
                  </div>
                </CardContent>

                <CardFooter className="p-3 bg-[#101A34]/50 border-t border-white/5 flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-8 text-[#B6C2D4] hover:text-[#F8FAFC] hover:bg-[#202A40] rounded-lg"
                    onClick={() => handleOpenModal(b.categoryId, b.monthlyLimit)}
                  >
                    Editar meta
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-8 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg"
                    onClick={() => handleRemove(b.categoryId)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}

      {/* MODAL: ADD / EDIT BUDGET */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[400px] bg-[#192134] text-[#F8FAFC] border border-white/10 rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-[#F8FAFC]">
              <Target className="w-5 h-5 text-blue-400" />
              Definir Teto de Gastos
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveBudget} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-[#B6C2D4]">Categoria</Label>
              <Select
                value={selectedCatId}
                onValueChange={setSelectedCatId}
                disabled={budgets.some((b) => b.categoryId === selectedCatId && limitInput !== '')}
              >
                <SelectTrigger className="text-xs h-10 bg-[#101A34] text-[#F8FAFC] border-white/10 rounded-xl">
                  <SelectValue placeholder="Selecione a categoria..." />
                </SelectTrigger>
                <SelectContent className="bg-[#192134] text-[#F8FAFC] border-white/10">
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full inline-block"
                          style={{ backgroundColor: c.color }}
                        />
                        <span>{c.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-[#B6C2D4]">Limite Mensal Desejado (R$)</Label>
              <Input
                placeholder="Ex: 1500,00"
                value={limitInput}
                onChange={(e) => setLimitInput(e.target.value)}
                required
                className="text-xs h-10 bg-[#101A34] text-[#F8FAFC] border-white/10 rounded-xl tabular-nums"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDialogOpen(false)}
                className="border-white/10 bg-transparent text-[#B6C2D4] hover:bg-[#202A40] hover:text-[#F8FAFC] rounded-xl h-10 text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-10 px-4 text-xs font-semibold"
              >
                Salvar Limite
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

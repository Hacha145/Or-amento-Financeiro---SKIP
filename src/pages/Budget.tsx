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
  const { budgets, categories, transactions, currentMonth, setBudgetLimit, removeBudgetLimit } =
    useFinance()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedCatId, setSelectedCatId] = useState<string>('')
  const [limitInput, setLimitInput] = useState('')

  // Compute expenses per category for the current selected month
  const categoryExpenses = useMemo(() => {
    const monthTxs = transactions.filter(
      (t) => t.date.startsWith(currentMonth) && t.type === 'expense',
    )
    const map = new Map<string, number>()
    for (const tx of monthTxs) {
      const cId = tx.categoryId || 'cat-outros'
      map.set(cId, (map.get(cId) || 0) + tx.amount)
    }
    return map
  }, [transactions, currentMonth])

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
    <div className="space-y-6 animate-fade-in">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Orçamento Mensal</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Defina metas de gastos por categoria para manter o controle financeiro
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
          <MonthSelector />
          <Button
            size="sm"
            onClick={() => handleOpenModal()}
            disabled={availableCategoriesForBudget.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 shadow-xs shrink-0"
          >
            <Plus className="w-4 h-4" />
            Novo Limite
          </Button>
        </div>
      </div>

      {/* Global Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-slate-200/80 shadow-xs">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Orçamento Planejado
            </CardTitle>
            <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
              <Target className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <div className="text-2xl font-bold text-slate-900">
              {formatCurrencyBRL(totalBudget)}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Soma de todas as metas ativas</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-xs">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Total Realizado no Mês
            </CardTitle>
            <div className="p-2 rounded-lg bg-rose-100 text-rose-700">
              <DollarSign className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <div className="text-2xl font-bold text-rose-600">{formatCurrencyBRL(totalSpent)}</div>
            <p className="text-[11px] text-slate-500 mt-1">Gastos nas categorias orçadas</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-xs">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Saldo Restante
            </CardTitle>
            <div
              className={`p-2 rounded-lg ${
                totalBudget - totalSpent >= 0
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-rose-100 text-rose-700'
              }`}
            >
              <PieIcon className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <div
              className={`text-2xl font-bold ${
                totalBudget - totalSpent >= 0 ? 'text-emerald-700' : 'text-rose-600'
              }`}
            >
              {formatCurrencyBRL(totalBudget - totalSpent)}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {totalBudget > 0
                ? `${((totalSpent / totalBudget) * 100).toFixed(0)}% do orçamento utilizado`
                : 'Sem metas ativas'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Budget Limit Cards Grid */}
      {budgets.length === 0 ? (
        <Card className="border-slate-200/80 shadow-xs py-16 text-center">
          <CardContent className="space-y-3">
            <Target className="w-12 h-12 mx-auto text-slate-300 stroke-1" />
            <h3 className="text-base font-semibold text-slate-800">
              Nenhuma meta de orçamento definida
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Defina limites mensais para categorias como Alimentação, Transporte e Lazer para
              receber alertas visuais quando os gastos se aproximarem do teto.
            </p>
            <Button
              size="sm"
              onClick={() => handleOpenModal()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs mt-2"
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
              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px]">
                Dentro do teto
              </Badge>
            )

            if (percentage >= 100) {
              barColor = 'bg-rose-500'
              statusBadge = (
                <Badge variant="destructive" className="text-[10px] gap-1">
                  <AlertTriangle className="w-3 h-3" /> Excedeu teto
                </Badge>
              )
            } else if (percentage >= 75) {
              barColor = 'bg-amber-500'
              statusBadge = (
                <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-[10px]">
                  Alerta (&gt;75%)
                </Badge>
              )
            }

            return (
              <Card
                key={b.categoryId}
                className={`border-slate-200/80 shadow-xs relative overflow-hidden ${
                  isOver ? 'border-rose-300 bg-rose-50/10' : ''
                }`}
              >
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: cat ? cat.color : '#6B7280' }}
                      />
                      <CardTitle className="text-sm font-bold text-slate-900">
                        {cat ? cat.name : 'Categoria'}
                      </CardTitle>
                    </div>
                    {statusBadge}
                  </div>
                </CardHeader>

                <CardContent className="p-4 pt-2 space-y-3">
                  {/* Values */}
                  <div className="flex items-baseline justify-between text-xs">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Gasto atual</span>
                      <span className="text-base font-bold text-slate-900">
                        {formatCurrencyBRL(spent)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400 block text-[11px]">Limite mensal</span>
                      <span className="text-sm font-semibold text-slate-700">
                        {formatCurrencyBRL(b.monthlyLimit)}
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1">
                    <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-500">
                      <span>{percentage.toFixed(0)}% utilizado</span>
                      <span>
                        {remaining >= 0
                          ? `Resta ${formatCurrencyBRL(remaining)}`
                          : `Excedeu ${formatCurrencyBRL(Math.abs(remaining))}`}
                      </span>
                    </div>
                  </div>
                </CardContent>

                <CardFooter className="p-3 bg-slate-50/60 border-t flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7 text-slate-600 hover:text-slate-900"
                    onClick={() => handleOpenModal(b.categoryId, b.monthlyLimit)}
                  >
                    Editar meta
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7 text-rose-600 hover:bg-rose-50"
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
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Target className="w-5 h-5 text-emerald-600" />
              Definir Teto de Gastos
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveBudget} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Categoria</Label>
              <Select
                value={selectedCatId}
                onValueChange={setSelectedCatId}
                disabled={budgets.some((b) => b.categoryId === selectedCatId && limitInput !== '')}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="Selecione a categoria..." />
                </SelectTrigger>
                <SelectContent>
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
              <Label className="text-xs">Limite Mensal Desejado (R$)</Label>
              <Input
                placeholder="Ex: 1500,00"
                value={limitInput}
                onChange={(e) => setLimitInput(e.target.value)}
                required
                className="text-xs"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
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

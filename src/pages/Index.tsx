import React, { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  PiggyBank,
  AlertCircle,
  ArrowRight,
  ChevronRight,
  Layers,
  Calendar,
  BarChart3,
  CalendarRange,
  ArrowUpRight,
  ArrowDownRight,
  FolderOpen,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MonthSelector } from '@/components/MonthSelector'
import { YearSelector } from '@/components/YearSelector'
import { useFinance } from '@/context/FinanceContext'
import { formatCurrencyBRL } from '@/lib/parsers'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from 'recharts'

const MONTH_NAMES_SHORT = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
]

const MONTH_NAMES_FULL = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

export default function Index() {
  const navigate = useNavigate()
  const {
    monthlyStats,
    transactions,
    currentMonth,
    setCurrentMonth,
    categories,
    budgets,
    settings,
  } = useFinance()

  // View Mode: 'monthly' | 'annual'
  const [viewMode, setViewMode] = useState<'monthly' | 'annual'>('monthly')

  // Selected Year for Annual View (defaults to year from currentMonth)
  const [selectedYear, setSelectedYear] = useState<number>(() => {
    const [y] = currentMonth.split('-')
    return parseInt(y, 10) || new Date().getFullYear()
  })

  // Category map helper
  const categoryMap = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>()
    categories.forEach((c) => map.set(c.id, { name: c.name, color: c.color }))
    return map
  }, [categories])

  // Formatting helper for date
  const formatShortDate = (dateStr: string) => {
    const [, m, d] = dateStr.split('-')
    return `${d}/${m}`
  }

  // --- Monthly View Data ---
  const monthTransactions = useMemo(() => {
    return transactions
      .filter((t) => t.date.startsWith(currentMonth))
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [transactions, currentMonth])

  const recentTransactions = useMemo(() => {
    return monthTransactions.slice(0, 8)
  }, [monthTransactions])

  const {
    income: monthlyIncome,
    expense: monthlyExpense,
    balance: monthlyBalance,
    savingsRate: monthlySavingsRate,
    pendingReviewCount,
    expensesByCategory: monthlyExpensesByCategory,
    last6MonthsHistory,
    budgetProgress: monthlyBudgetProgress,
  } = monthlyStats

  // --- Annual View Data ---
  const selectedYearStr = String(selectedYear)

  // 1. Transactions for the selected year
  const yearTransactions = useMemo(() => {
    return transactions
      .filter((t) => t.date.startsWith(selectedYearStr))
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [transactions, selectedYearStr])

  // 2. Annual Totals
  const annualStats = useMemo(() => {
    let income = 0
    let expense = 0
    const catExpenseMap = new Map<string, number>()

    const includeCCPayments = settings.includeCreditCardPaymentsInTotals ?? false

    for (const t of yearTransactions) {
      const isCC =
        t.isCreditCardPayment || (t.description && t.description.toLowerCase().includes('fatura'))
      const shouldExclude = !includeCCPayments && isCC && t.type === 'expense'

      if (t.type === 'income') {
        income += t.amount
      } else if (!shouldExclude) {
        expense += t.amount
        const cId = t.categoryId || 'cat-outros'
        catExpenseMap.set(cId, (catExpenseMap.get(cId) || 0) + t.amount)
      }
    }

    const balance = income - expense
    const savingsRate = income > 0 ? Math.max(0, ((income - expense) / income) * 100) : 0
    const monthlyAverageExpense = expense / 12
    const monthlyAverageIncome = income / 12

    const expensesByCategory = Array.from(catExpenseMap.entries())
      .map(([catId, total]) => {
        const cat = categories.find((c) => c.id === catId)
        return {
          categoryId: catId,
          categoryName: cat ? cat.name : 'Não categorizado',
          color: cat ? cat.color : '#6B7280',
          total,
          percentage: expense > 0 ? (total / expense) * 100 : 0,
        }
      })
      .sort((a, b) => b.total - a.total)

    return {
      income,
      expense,
      balance,
      savingsRate,
      monthlyAverageExpense,
      monthlyAverageIncome,
      expensesByCategory,
      transactionCount: yearTransactions.length,
    }
  }, [yearTransactions, categories])

  // 3. Multi-year Comparison (Comparing years side-by-side)
  const yearsComparison = useMemo(() => {
    // Collect all available years from transactions or fallback to range around selected year
    const yearSet = new Set<number>()
    transactions.forEach((t) => {
      const y = parseInt(t.date.split('-')[0], 10)
      if (!isNaN(y)) yearSet.add(y)
    })
    // Ensure selectedYear and adjacent years exist for comparison context
    yearSet.add(selectedYear)
    yearSet.add(selectedYear - 1)
    yearSet.add(selectedYear - 2)

    const sortedYears = Array.from(yearSet).sort((a, b) => a - b)
    // Keep up to last 5 relevant years ending at max(years)
    const recentYears = sortedYears.slice(-5)

    return recentYears.map((yr) => {
      const yrStr = String(yr)
      const yrTxs = transactions.filter((t) => t.date.startsWith(yrStr))
      const includeCC = settings.includeCreditCardPaymentsInTotals ?? false
      const income = yrTxs.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0)
      const expense = yrTxs
        .filter((t) => {
          if (t.type !== 'expense') return false
          if (!includeCC && t.isCreditCardPayment) return false
          return true
        })
        .reduce((sum, t) => sum + t.amount, 0)
      const balance = income - expense

      return {
        year: yr,
        yearLabel: String(yr),
        income,
        expense,
        balance,
        isSelected: yr === selectedYear,
      }
    })
  }, [transactions, selectedYear])

  // 4. Monthly Breakdown of Selected Year (12 months drill-down table & trend)
  const monthsOfYearBreakdown = useMemo(() => {
    return Array.from({ length: 12 }, (_, idx) => {
      const mNum = idx + 1
      const mKey = `${selectedYear}-${String(mNum).padStart(2, '0')}`
      const mTxs = transactions.filter((t) => t.date.startsWith(mKey))
      const includeCC = settings.includeCreditCardPaymentsInTotals ?? false
      const income = mTxs.filter((t) => t.type === 'income').reduce((acc, t) => acc + t.amount, 0)
      const expense = mTxs
        .filter((t) => {
          if (t.type !== 'expense') return false
          if (!includeCC && t.isCreditCardPayment) return false
          return true
        })
        .reduce((acc, t) => acc + t.amount, 0)
      const balance = income - expense
      const count = mTxs.length

      return {
        monthIndex: idx,
        monthKey: mKey,
        shortLabel: MONTH_NAMES_SHORT[idx],
        fullLabel: MONTH_NAMES_FULL[idx],
        income,
        expense,
        balance,
        count,
      }
    })
  }, [transactions, selectedYear])

  // Drill-down handler: select month and switch to monthly view
  const handleMonthDrillDown = (monthKey: string) => {
    setCurrentMonth(monthKey)
    setViewMode('monthly')
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Header: Title, Toggle Mode & Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Painel Financeiro</h1>
            <Badge
              variant="outline"
              className={
                viewMode === 'annual'
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }
            >
              {viewMode === 'annual' ? `Visão Anual (${selectedYear})` : 'Visão Mensal'}
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {viewMode === 'annual'
              ? `Demonstrativo consolidado e evolução de receitas e despesas em ${selectedYear}`
              : 'Visão consolidada do seu orçamento e fluxo de caixa mensal'}
          </p>
        </div>

        {/* View Mode Switcher + Date Selector */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Toggle Mensal / Anual */}
          <Tabs
            value={viewMode}
            onValueChange={(val) => setViewMode(val as 'monthly' | 'annual')}
            className="w-auto"
          >
            <TabsList className="bg-slate-200/70 p-0.5 h-9">
              <TabsTrigger
                value="monthly"
                className="text-xs font-semibold px-3 py-1.5 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs"
              >
                <Calendar className="w-3.5 h-3.5 mr-1.5 inline text-emerald-600" />
                Mensal
              </TabsTrigger>
              <TabsTrigger
                value="annual"
                className="text-xs font-semibold px-3 py-1.5 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs"
              >
                <BarChart3 className="w-3.5 h-3.5 mr-1.5 inline text-blue-600" />
                Anual
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Conditional Selector: MonthSelector vs YearSelector */}
          {viewMode === 'monthly' ? (
            <MonthSelector />
          ) : (
            <YearSelector currentYear={selectedYear} onChangeYear={(y) => setSelectedYear(y)} />
          )}
        </div>
      </div>

      {/* Pending Reviews Alert Banner (Shown in both views if pending) */}
      {pendingReviewCount > 0 && (
        <div className="bg-amber-50 border border-amber-300/80 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs animate-slide-down">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-amber-950 text-sm">
                {pendingReviewCount === 1
                  ? '1 transação aguardando sua classificação'
                  : `${pendingReviewCount} transações aguardando classificação`}
              </p>
              <p className="text-xs text-amber-800/90 mt-0.5">
                O sistema precisa da sua confirmação para aprender a regra exata e aplicar
                automaticamente no futuro.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => navigate('/transacoes?status=pendente')}
            className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shrink-0 shadow-xs"
          >
            Revisar agora ({pendingReviewCount})
          </Button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. VISÃO MENSAL (Monthly View)                                           */}
      {/* ========================================================================= */}
      {viewMode === 'monthly' && (
        <>
          {/* KPI Cards (4 Cards: Balance, Income, Expense, Savings Rate) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Balance Card */}
            <Card className="border-slate-200/80 shadow-xs relative overflow-hidden">
              <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Saldo do Mês
                </CardTitle>
                <div
                  className={`p-2 rounded-lg ${
                    monthlyBalance >= 0
                      ? 'bg-slate-100 text-slate-800'
                      : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  <Wallet className="w-4 h-4" />
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-1">
                <div
                  className={`text-2xl font-bold tracking-tight ${
                    monthlyBalance >= 0 ? 'text-slate-900' : 'text-rose-600'
                  }`}
                >
                  {formatCurrencyBRL(monthlyBalance)}
                </div>
                <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                  {monthlyBalance >= 0 ? (
                    <span className="text-emerald-600 font-medium flex items-center">
                      <TrendingUp className="w-3 h-3 mr-0.5" /> Saldo positivo
                    </span>
                  ) : (
                    <span className="text-rose-600 font-medium flex items-center">
                      <TrendingDown className="w-3 h-3 mr-0.5" /> Atenção: gastos maiores
                    </span>
                  )}
                </p>
              </CardContent>
            </Card>

            {/* Income Card */}
            <Card className="border-slate-200/80 shadow-xs">
              <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Receitas
                </CardTitle>
                <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-1">
                <div className="text-2xl font-bold tracking-tight text-emerald-700">
                  {formatCurrencyBRL(monthlyIncome)}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Entradas confirmadas no período</p>
              </CardContent>
            </Card>

            {/* Expense Card */}
            <Card className="border-slate-200/80 shadow-xs">
              <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Despesas
                </CardTitle>
                <div className="p-2 rounded-lg bg-rose-100 text-rose-700">
                  <TrendingDown className="w-4 h-4" />
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-1">
                <div className="text-2xl font-bold tracking-tight text-rose-600">
                  {formatCurrencyBRL(monthlyExpense)}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Gastos totais do período</p>
              </CardContent>
            </Card>

            {/* Savings Rate Card */}
            <Card className="border-slate-200/80 shadow-xs">
              <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Taxa de Economia
                </CardTitle>
                <div className="p-2 rounded-lg bg-blue-100 text-blue-700">
                  <PiggyBank className="w-4 h-4" />
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-1">
                <div className="text-2xl font-bold tracking-tight text-slate-900">
                  {monthlySavingsRate.toFixed(1)}%
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  {monthlyIncome > 0
                    ? `${formatCurrencyBRL(Math.max(0, monthlyBalance))} poupados`
                    : 'Sem receitas no mês'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Charts Row: Donut expenses by category + Last 6 months bar chart */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Expenses by Category Donut (5 cols) */}
            <Card className="lg:col-span-5 border-slate-200/80 shadow-xs flex flex-col justify-between">
              <CardHeader className="p-5 pb-2">
                <CardTitle className="text-base font-bold text-slate-900 flex items-center justify-between">
                  <span>Despesas por Categoria</span>
                  <span className="text-xs font-normal text-slate-500">
                    {formatCurrencyBRL(monthlyExpense)}
                  </span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Distribuição dos gastos no mês selecionado
                </CardDescription>
              </CardHeader>

              <CardContent className="p-5 pt-2 flex-1 flex flex-col justify-between">
                {monthlyExpensesByCategory.length === 0 ? (
                  <div className="h-64 flex flex-col items-center justify-center text-center text-slate-400">
                    <Layers className="w-10 h-10 mb-2 stroke-1 text-slate-300" />
                    <p className="text-sm font-medium">Nenhuma despesa neste mês</p>
                    <p className="text-xs mt-1">Importe seu extrato ou adicione lançamentos.</p>
                  </div>
                ) : (
                  <div>
                    <div className="h-56 relative">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={monthlyExpensesByCategory}
                            dataKey="total"
                            nameKey="categoryName"
                            innerRadius={55}
                            outerRadius={80}
                            paddingAngle={3}
                          >
                            {monthlyExpensesByCategory.map((entry) => (
                              <Cell key={entry.categoryId} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(val: any) => formatCurrencyBRL(Number(val))}
                            contentStyle={{
                              backgroundColor: '#1e293b',
                              color: '#fff',
                              borderRadius: '8px',
                              fontSize: '12px',
                              border: 'none',
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-[11px] text-slate-400 font-medium">Total</span>
                        <span className="text-sm font-bold text-slate-800">
                          {formatCurrencyBRL(monthlyExpense)}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2 mt-3 pt-3 border-t">
                      {monthlyExpensesByCategory.slice(0, 5).map((item) => (
                        <div
                          key={item.categoryId}
                          className="flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center gap-2 truncate max-w-[60%]">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: item.color }}
                            />
                            <span className="font-medium text-slate-700 truncate">
                              {item.categoryName}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900">
                              {formatCurrencyBRL(item.total)}
                            </span>
                            <span className="text-[11px] text-slate-400 w-10 text-right">
                              {item.percentage.toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 6 Months Bar Chart (7 cols) */}
            <Card className="lg:col-span-7 border-slate-200/80 shadow-xs flex flex-col justify-between">
              <CardHeader className="p-5 pb-2">
                <CardTitle className="text-base font-bold text-slate-900">
                  Receitas × Despesas (Últimos 6 meses)
                </CardTitle>
                <CardDescription className="text-xs">
                  Evolução comparativa do fluxo financeiro
                </CardDescription>
              </CardHeader>

              <CardContent className="p-5 pt-2 flex-1">
                <div className="h-72 w-full pt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={last6MonthsHistory}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis
                        dataKey="monthLabel"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 12, fill: '#64748b' }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        tickFormatter={(val) =>
                          `R$ ${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`
                        }
                      />
                      <Tooltip
                        formatter={(val: any, name: any) => [
                          formatCurrencyBRL(Number(val)),
                          name === 'income' ? 'Receitas' : 'Despesas',
                        ]}
                        contentStyle={{
                          backgroundColor: '#1e293b',
                          color: '#fff',
                          borderRadius: '8px',
                          fontSize: '12px',
                          border: 'none',
                        }}
                      />
                      <Legend
                        verticalAlign="top"
                        align="right"
                        formatter={(val) => (val === 'income' ? 'Receitas' : 'Despesas')}
                        wrapperStyle={{ fontSize: '12px', paddingBottom: '12px' }}
                      />
                      <Bar
                        dataKey="income"
                        name="income"
                        fill="#10B981"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={32}
                      />
                      <Bar
                        dataKey="expense"
                        name="expense"
                        fill="#EF4444"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={32}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Bottom Row: Budget Progress + Recent Transactions */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Budget Progress Card */}
            <Card className="lg:col-span-5 border-slate-200/80 shadow-xs">
              <CardHeader className="p-5 pb-3 flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">
                    Orçamento do Mês
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Acompanhamento dos tetos definidos
                  </CardDescription>
                </div>
                <Link
                  to="/orcamento"
                  className="text-xs text-emerald-700 hover:text-emerald-800 font-semibold flex items-center gap-1 hover:underline"
                >
                  Ver completo
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </CardHeader>

              <CardContent className="p-5 pt-0 space-y-4">
                {monthlyBudgetProgress.length === 0 ? (
                  <div className="py-8 text-center text-slate-400">
                    <p className="text-sm">Nenhum teto de gastos configurado.</p>
                    <Link to="/orcamento">
                      <Button variant="outline" size="sm" className="mt-2 text-xs">
                        Definir metas de orçamento
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {monthlyBudgetProgress.slice(0, 5).map((item) => {
                      let progressColor = 'bg-emerald-500'
                      if (item.percentage >= 100) progressColor = 'bg-rose-500'
                      else if (item.percentage >= 70) progressColor = 'bg-amber-500'

                      return (
                        <div key={item.categoryId} className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: item.color }}
                              />
                              <span className="font-semibold text-slate-800">
                                {item.categoryName}
                              </span>
                              {item.isOver && (
                                <Badge variant="destructive" className="h-4 px-1 text-[9px]">
                                  Excedeu!
                                </Badge>
                              )}
                            </div>
                            <div className="text-right">
                              <span className="font-medium text-slate-900">
                                {formatCurrencyBRL(item.spent)}
                              </span>
                              <span className="text-slate-400 text-[11px]">
                                {' '}
                                / {formatCurrencyBRL(item.limit)}
                              </span>
                            </div>
                          </div>

                          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${progressColor}`}
                              style={{ width: `${Math.min(item.percentage, 100)}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Transactions Card */}
            <Card className="lg:col-span-7 border-slate-200/80 shadow-xs">
              <CardHeader className="p-5 pb-3 flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">
                    Lançamentos Recentes
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Últimas movimentações em {currentMonth}
                  </CardDescription>
                </div>
                <Link
                  to="/transacoes"
                  className="text-xs text-emerald-700 hover:text-emerald-800 font-semibold flex items-center gap-1 hover:underline"
                >
                  Ver todas ({monthTransactions.length})
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </CardHeader>

              <CardContent className="p-5 pt-0">
                {recentTransactions.length === 0 ? (
                  <div className="py-12 text-center text-slate-400">
                    <p className="text-sm">Nenhuma transação registrada neste mês.</p>
                    <div className="flex justify-center gap-3 mt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate('/importar')}
                        className="text-xs"
                      >
                        Importar extrato
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {recentTransactions.map((tx) => {
                      const cat = tx.categoryId ? categoryMap.get(tx.categoryId) : null
                      const isExpense = tx.type === 'expense'

                      return (
                        <div
                          key={tx.id}
                          className="py-2.5 flex items-center justify-between hover:bg-slate-50/70 px-2 rounded-lg transition-colors cursor-pointer"
                          onClick={() => navigate('/transacoes')}
                        >
                          <div className="flex items-center gap-3 min-w-0 pr-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: cat ? cat.color : '#cbd5e1' }}
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-slate-900 truncate">
                                {tx.description}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[11px] text-slate-400">
                                  {formatShortDate(tx.date)}
                                </span>
                                {cat ? (
                                  <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-medium truncate max-w-[120px]">
                                    {cat.name}
                                  </span>
                                ) : (
                                  <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-medium">
                                    Pendente
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span
                              className={`text-xs font-bold ${
                                isExpense ? 'text-rose-600' : 'text-emerald-600'
                              }`}
                            >
                              {isExpense ? '- ' : '+ '}
                              {formatCurrencyBRL(tx.amount)}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* 2. VISÃO ANUAL (Annual View)                                             */}
      {/* ========================================================================= */}
      {viewMode === 'annual' && (
        <div className="space-y-6">
          {/* KPI Cards (4 Cards: Balance, Income, Expense, Savings Rate) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Annual Balance Card */}
            <Card className="border-slate-200/80 shadow-xs relative overflow-hidden">
              <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Saldo Anual ({selectedYear})
                </CardTitle>
                <div
                  className={`p-2 rounded-lg ${
                    annualStats.balance >= 0
                      ? 'bg-slate-100 text-slate-800'
                      : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  <Wallet className="w-4 h-4" />
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-1">
                <div
                  className={`text-2xl font-bold tracking-tight ${
                    annualStats.balance >= 0 ? 'text-slate-900' : 'text-rose-600'
                  }`}
                >
                  {formatCurrencyBRL(annualStats.balance)}
                </div>
                <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                  {annualStats.balance >= 0 ? (
                    <span className="text-emerald-600 font-medium flex items-center">
                      <TrendingUp className="w-3 h-3 mr-0.5" /> Superávit anual acumulado
                    </span>
                  ) : (
                    <span className="text-rose-600 font-medium flex items-center">
                      <TrendingDown className="w-3 h-3 mr-0.5" /> Déficit acumulado no ano
                    </span>
                  )}
                </p>
              </CardContent>
            </Card>

            {/* Annual Income Card */}
            <Card className="border-slate-200/80 shadow-xs">
              <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Receitas do Ano
                </CardTitle>
                <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-1">
                <div className="text-2xl font-bold tracking-tight text-emerald-700">
                  {formatCurrencyBRL(annualStats.income)}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Média mensal: {formatCurrencyBRL(annualStats.monthlyAverageIncome)}
                </p>
              </CardContent>
            </Card>

            {/* Annual Expense Card */}
            <Card className="border-slate-200/80 shadow-xs">
              <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Despesas do Ano
                </CardTitle>
                <div className="p-2 rounded-lg bg-rose-100 text-rose-700">
                  <TrendingDown className="w-4 h-4" />
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-1">
                <div className="text-2xl font-bold tracking-tight text-rose-600">
                  {formatCurrencyBRL(annualStats.expense)}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Média mensal: {formatCurrencyBRL(annualStats.monthlyAverageExpense)}
                </p>
              </CardContent>
            </Card>

            {/* Annual Savings Rate Card */}
            <Card className="border-slate-200/80 shadow-xs">
              <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Taxa de Economia Anual
                </CardTitle>
                <div className="p-2 rounded-lg bg-blue-100 text-blue-700">
                  <PiggyBank className="w-4 h-4" />
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-1">
                <div className="text-2xl font-bold tracking-tight text-slate-900">
                  {annualStats.savingsRate.toFixed(1)}%
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  {annualStats.income > 0
                    ? `${formatCurrencyBRL(Math.max(0, annualStats.balance))} poupados no ano`
                    : 'Sem receitas registradas no ano'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Charts Row: Multi-Year Comparison (Left) + Monthly Trend of Selected Year (Right) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Multi-Year Comparison Bar Chart (Receitas vs Despesas lado a lado por ano) */}
            <Card className="lg:col-span-7 border-slate-200/80 shadow-xs flex flex-col justify-between">
              <CardHeader className="p-5 pb-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base font-bold text-slate-900">
                      Comparativo de Anos (Receitas × Despesas)
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Comparação anual lado a lado dos fluxos financeiros
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                    <span>Receitas</span>
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block ml-2" />
                    <span>Despesas</span>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-5 pt-2 flex-1">
                <div className="h-72 w-full pt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={yearsComparison}
                      margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis
                        dataKey="yearLabel"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 13, fontWeight: 600, fill: '#475569' }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        tickFormatter={(val) =>
                          `R$ ${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`
                        }
                      />
                      <Tooltip
                        formatter={(val: any, name: any) => [
                          formatCurrencyBRL(Number(val)),
                          name === 'income' ? 'Receitas' : 'Despesas',
                        ]}
                        labelFormatter={(label) => `Ano ${label}`}
                        contentStyle={{
                          backgroundColor: '#1e293b',
                          color: '#fff',
                          borderRadius: '8px',
                          fontSize: '12px',
                          border: 'none',
                        }}
                      />
                      <Legend
                        verticalAlign="top"
                        align="right"
                        formatter={(val) => (val === 'income' ? 'Receitas' : 'Despesas')}
                        wrapperStyle={{ fontSize: '12px', paddingBottom: '12px' }}
                      />
                      <Bar
                        dataKey="income"
                        name="income"
                        fill="#10B981"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={40}
                      />
                      <Bar
                        dataKey="expense"
                        name="expense"
                        fill="#EF4444"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={40}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Expenses by Category Donut for Selected Year (5 cols) */}
            <Card className="lg:col-span-5 border-slate-200/80 shadow-xs flex flex-col justify-between">
              <CardHeader className="p-5 pb-2">
                <CardTitle className="text-base font-bold text-slate-900 flex items-center justify-between">
                  <span>Despesas por Categoria ({selectedYear})</span>
                  <span className="text-xs font-normal text-slate-500">
                    {formatCurrencyBRL(annualStats.expense)}
                  </span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Distribuição acumulada de despesas no ano
                </CardDescription>
              </CardHeader>

              <CardContent className="p-5 pt-2 flex-1 flex flex-col justify-between">
                {annualStats.expensesByCategory.length === 0 ? (
                  <div className="h-64 flex flex-col items-center justify-center text-center text-slate-400">
                    <Layers className="w-10 h-10 mb-2 stroke-1 text-slate-300" />
                    <p className="text-sm font-medium">Nenhuma despesa em {selectedYear}</p>
                    <p className="text-xs mt-1">
                      Importe seu extrato ou adicione lançamentos para este ano.
                    </p>
                  </div>
                ) : (
                  <div>
                    <div className="h-56 relative">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={annualStats.expensesByCategory}
                            dataKey="total"
                            nameKey="categoryName"
                            innerRadius={55}
                            outerRadius={80}
                            paddingAngle={3}
                          >
                            {annualStats.expensesByCategory.map((entry) => (
                              <Cell key={entry.categoryId} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(val: any) => formatCurrencyBRL(Number(val))}
                            contentStyle={{
                              backgroundColor: '#1e293b',
                              color: '#fff',
                              borderRadius: '8px',
                              fontSize: '12px',
                              border: 'none',
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-[11px] text-slate-400 font-medium">Total Ano</span>
                        <span className="text-sm font-bold text-slate-800">
                          {formatCurrencyBRL(annualStats.expense)}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2 mt-3 pt-3 border-t">
                      {annualStats.expensesByCategory.slice(0, 5).map((item) => (
                        <div
                          key={item.categoryId}
                          className="flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center gap-2 truncate max-w-[60%]">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: item.color }}
                            />
                            <span className="font-medium text-slate-700 truncate">
                              {item.categoryName}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900">
                              {formatCurrencyBRL(item.total)}
                            </span>
                            <span className="text-[11px] text-slate-400 w-10 text-right">
                              {item.percentage.toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Monthly Evolution of Selected Year Bar Chart */}
          <Card className="border-slate-200/80 shadow-xs">
            <CardHeader className="p-5 pb-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">
                    Evolução Mês a Mês ({selectedYear})
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Comportamento das receitas e despesas ao longo dos 12 meses do ano
                  </CardDescription>
                </div>
                <div className="text-xs text-slate-500 font-medium">
                  Clique em um mês abaixo para detalhar
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-5 pt-2">
              <div className="h-64 w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={monthsOfYearBreakdown}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis
                      dataKey="shortLabel"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 12, fill: '#64748b' }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      tickFormatter={(val) =>
                        `R$ ${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`
                      }
                    />
                    <Tooltip
                      formatter={(val: any, name: any) => [
                        formatCurrencyBRL(Number(val)),
                        name === 'income' ? 'Receitas' : 'Despesas',
                      ]}
                      labelFormatter={(_, payload) => {
                        if (payload && payload[0]) {
                          return `${payload[0].payload.fullLabel} de ${selectedYear}`
                        }
                        return ''
                      }}
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        color: '#fff',
                        borderRadius: '8px',
                        fontSize: '12px',
                        border: 'none',
                      }}
                    />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      formatter={(val) => (val === 'income' ? 'Receitas' : 'Despesas')}
                      wrapperStyle={{ fontSize: '12px', paddingBottom: '12px' }}
                    />
                    <Bar
                      dataKey="income"
                      name="income"
                      fill="#10B981"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={28}
                    />
                    <Bar
                      dataKey="expense"
                      name="expense"
                      fill="#EF4444"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={28}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Drill-Down Table: 12 Months of the Year Grid */}
          <Card className="border-slate-200/80 shadow-xs">
            <CardHeader className="p-5 pb-3 flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base font-bold text-slate-900">
                  Detalhamento por Mês ({selectedYear})
                </CardTitle>
                <CardDescription className="text-xs">
                  Selecione qualquer mês para abrir a visão mensal completa e auditar os lançamentos
                </CardDescription>
              </div>
              <Badge variant="secondary" className="text-xs font-semibold">
                {annualStats.transactionCount} lançamentos no ano
              </Badge>
            </CardHeader>

            <CardContent className="p-5 pt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {monthsOfYearBreakdown.map((m) => {
                  const isPositive = m.balance >= 0
                  const hasData = m.income > 0 || m.expense > 0 || m.count > 0

                  return (
                    <div
                      key={m.monthKey}
                      onClick={() => handleMonthDrillDown(m.monthKey)}
                      className="group p-3.5 rounded-xl border border-slate-200/90 bg-white hover:bg-slate-50/90 hover:border-emerald-300 transition-all cursor-pointer shadow-2xs flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-600 group-hover:scale-125 transition-transform" />
                          <span className="font-bold text-sm text-slate-900">{m.fullLabel}</span>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 opacity-80 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all">
                          <span>Ver mês</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </div>
                      </div>

                      {hasData ? (
                        <div className="space-y-1.5 pt-1 text-xs">
                          <div className="flex items-center justify-between text-slate-500">
                            <span>Receitas:</span>
                            <span className="font-semibold text-emerald-700">
                              {formatCurrencyBRL(m.income)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-slate-500">
                            <span>Despesas:</span>
                            <span className="font-semibold text-rose-600">
                              {formatCurrencyBRL(m.expense)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 font-medium">
                            <span className="text-slate-700">Saldo:</span>
                            <span
                              className={`font-bold ${
                                isPositive ? 'text-slate-900' : 'text-rose-600'
                              }`}
                            >
                              {formatCurrencyBRL(m.balance)}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="py-3 text-center text-slate-400 text-xs">
                          Sem movimentações
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

import React, { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  PiggyBank,
  AlertCircle,
  ArrowRight,
  PlusCircle,
  Clock,
  Sparkles,
  ChevronRight,
  ShieldAlert,
  Layers,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { MonthSelector } from '@/components/MonthSelector'
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

export default function Index() {
  const navigate = useNavigate()
  const { monthlyStats, transactions, currentMonth, categories, settings } = useFinance()

  // Month transactions
  const monthTransactions = useMemo(() => {
    return transactions
      .filter((t) => t.date.startsWith(currentMonth))
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [transactions, currentMonth])

  // Recent 8 transactions
  const recentTransactions = useMemo(() => {
    return monthTransactions.slice(0, 8)
  }, [monthTransactions])

  // Category map helper
  const categoryMap = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>()
    categories.forEach((c) => map.set(c.id, { name: c.name, color: c.color }))
    return map
  }, [categories])

  const {
    income,
    expense,
    balance,
    savingsRate,
    pendingReviewCount,
    expensesByCategory,
    last6MonthsHistory,
    budgetProgress,
  } = monthlyStats

  // Formatting helper
  const formatShortDate = (dateStr: string) => {
    const [, m, d] = dateStr.split('-')
    return `${d}/${m}`
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Header: Title + Month Selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Painel Financeiro</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Visão consolidada do seu orçamento e fluxo de caixa
          </p>
        </div>

        <MonthSelector />
      </div>

      {/* Pending Reviews Alert Banner (Requirement 4) */}
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

      {/* KPI Cards (4 Cards: Balance, Income, Expense, Savings Rate) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Balance Card */}
        <Card className="border-slate-200/80 shadow-xs relative overflow-hidden">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Saldo do Mês
            </CardTitle>
            <div
              className={`p-2 rounded-lg ${balance >= 0 ? 'bg-slate-100 text-slate-800' : 'bg-rose-100 text-rose-700'}`}
            >
              <Wallet className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <div
              className={`text-2xl font-bold tracking-tight ${balance >= 0 ? 'text-slate-900' : 'text-rose-600'}`}
            >
              {formatCurrencyBRL(balance)}
            </div>
            <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
              {balance >= 0 ? (
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
              {formatCurrencyBRL(income)}
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
              {formatCurrencyBRL(expense)}
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
              {savingsRate.toFixed(1)}%
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {income > 0
                ? `${formatCurrencyBRL(Math.max(0, balance))} poupados`
                : 'Sem receitas no mês'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row (2 columns: Donut expenses by category + Last 6 months bar chart) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Expenses by Category Donut (5 cols) */}
        <Card className="lg:col-span-5 border-slate-200/80 shadow-xs flex flex-col justify-between">
          <CardHeader className="p-5 pb-2">
            <CardTitle className="text-base font-bold text-slate-900 flex items-center justify-between">
              <span>Despesas por Categoria</span>
              <span className="text-xs font-normal text-slate-500">
                {formatCurrencyBRL(expense)}
              </span>
            </CardTitle>
            <CardDescription className="text-xs">
              Distribuição dos gastos no mês selecionado
            </CardDescription>
          </CardHeader>

          <CardContent className="p-5 pt-2 flex-1 flex flex-col justify-between">
            {expensesByCategory.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center text-slate-400">
                <Layers className="w-10 h-10 mb-2 stroke-1 text-slate-300" />
                <p className="text-sm font-medium">Nenhuma despesa neste mês</p>
                <p className="text-xs mt-1">Importe seu extrato ou adicione lançamentos.</p>
              </div>
            ) : (
              <div>
                {/* Donut Chart */}
                <div className="h-56 relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={expensesByCategory}
                        dataKey="total"
                        nameKey="categoryName"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={3}
                      >
                        {expensesByCategory.map((entry) => (
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
                      {formatCurrencyBRL(expense)}
                    </span>
                  </div>
                </div>

                {/* Category Legend List */}
                <div className="space-y-2 mt-3 pt-3 border-t">
                  {expensesByCategory.slice(0, 5).map((item) => (
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

      {/* Bottom Row: Budget Progress (Left) + Recent Transactions (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Budget Progress Card */}
        <Card className="lg:col-span-5 border-slate-200/80 shadow-xs">
          <CardHeader className="p-5 pb-3 flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base font-bold text-slate-900">Orçamento do Mês</CardTitle>
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
            {budgetProgress.length === 0 ? (
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
                {budgetProgress.slice(0, 5).map((item) => {
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
                          <span className="font-semibold text-slate-800">{item.categoryName}</span>
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
    </div>
  )
}

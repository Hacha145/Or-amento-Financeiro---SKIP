import React, { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Search,
  Filter,
  CheckCircle2,
  Trash2,
  Edit2,
  AlertCircle,
  Plus,
  ArrowDownRight,
  ArrowUpRight,
  Sparkles,
  Download,
  HelpCircle,
  CreditCard,
  UserCheck,
  TrendingUp,
} from 'lucide-react'
import { identifyIncome } from '@/lib/incomeIdentity'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { MonthSelector } from '@/components/MonthSelector'
import { useFinance } from '@/context/FinanceContext'
import { formatCurrencyBRL, exportTransactionsToCSV } from '@/lib/parsers'
import { Transaction } from '@/types/finance'
import { normalizeDescription } from '@/lib/learningEngine'
import { useToast } from '@/hooks/use-toast'

export default function Transactions() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { toast } = useToast()
  const {
    transactions,
    categories,
    currentMonth,
    updateTransaction,
    deleteTransaction,
    batchDeleteTransactions,
    classifyAndConfirmTransaction,
    batchConfirmTransactions,
    addTransaction,
    settings,
  } = useFinance()

  // URL status query param (e.g. ?status=pendente)
  const initialStatusFilter = searchParams.get('status') === 'pendente' ? 'pending' : 'all'

  // Filter States
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all') // all | expense | income
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter) // all | pending | classified
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // Modal / Edit state
  const [editModalTx, setEditModalTx] = useState<Transaction | null>(null)
  const [editCategory, setEditCategory] = useState<string>('')
  const [editDescription, setEditDescription] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editType, setEditType] = useState<
    | 'expense'
    | 'income'
    | 'investment_in'
    | 'investment_out'
    | 'transfer'
    | 'credit_card_payment'
    | 'reimbursement'
    | 'adjustment'
    | 'loan'
  >('expense')
  const [editNotes, setEditNotes] = useState('')

  // Batch action state
  const [batchCategoryModal, setBatchCategoryModal] = useState(false)
  const [selectedBatchCat, setSelectedBatchCat] = useState<string>('')

  // Keep URL param in sync if changed
  useEffect(() => {
    if (searchParams.get('status') === 'pendente' && statusFilter !== 'pending') {
      setStatusFilter('pending')
    }
  }, [searchParams])

  // Category map
  const categoryMap = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>()
    categories.forEach((c) => map.set(c.id, { name: c.name, color: c.color }))
    return map
  }, [categories])

  // Filtered transactions for the selected month
  const monthTransactions = useMemo(() => {
    return transactions.filter((t) => t.date.startsWith(currentMonth))
  }, [transactions, currentMonth])

  const filteredTransactions = useMemo(() => {
    return monthTransactions.filter((tx) => {
      // Search
      if (searchTerm.trim()) {
        const norm = searchTerm.toLowerCase()
        const matchesDesc = tx.description.toLowerCase().includes(norm)
        const matchesNotes = (tx.notes || '').toLowerCase().includes(norm)
        if (!matchesDesc && !matchesNotes) return false
      }

      // Category
      if (categoryFilter !== 'all') {
        if (categoryFilter === 'none') {
          if (tx.categoryId) return false
        } else {
          if (tx.categoryId !== categoryFilter) return false
        }
      }

      // Type
      if (typeFilter !== 'all' && tx.type !== typeFilter) {
        return false
      }

      // Status
      if (statusFilter === 'pending' && !tx.needsReview) return false
      if (statusFilter === 'classified' && tx.needsReview) return false

      return true
    })
  }, [monthTransactions, searchTerm, categoryFilter, typeFilter, statusFilter])

  // Selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(filteredTransactions.map((t) => t.id))
    } else {
      setSelectedIds([])
    }
  }

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds((prev) => [...prev, id])
    } else {
      setSelectedIds((prev) => prev.filter((item) => item !== id))
    }
  }

  // Quick confirm single transaction
  const handleConfirmOne = (tx: Transaction, targetCatId?: string) => {
    const catId = targetCatId || tx.suggestedCategoryId || tx.categoryId
    if (!catId) {
      // open edit
      openEditModal(tx)
      return
    }
    classifyAndConfirmTransaction(tx.id, catId)
    toast({
      title: 'Classificação confirmada!',
      description: `Regra memorizada com normalização inteligente: "${tx.description}" agora será classificado automaticamente.`,
    })
  }

  // Batch delete
  const handleBatchDelete = () => {
    if (selectedIds.length === 0) return
    batchDeleteTransactions(selectedIds)
    setSelectedIds([])
    toast({
      title: 'Lançamentos removidos',
      description: `${selectedIds.length} transações foram excluídas.`,
    })
  }

  // Batch category assign
  const handleBatchAssignCategory = () => {
    if (selectedIds.length === 0 || !selectedBatchCat) return
    const items = selectedIds.map((id) => ({ id, categoryId: selectedBatchCat }))
    batchConfirmTransactions(items)
    setSelectedIds([])
    setBatchCategoryModal(false)
    toast({
      title: 'Classificação em lote realizada!',
      description: `${items.length} lançamentos foram classificados e memorizados.`,
    })
  }

  // Open Edit Modal
  const openEditModal = (tx: Transaction) => {
    setEditModalTx(tx)
    setEditDescription(tx.description)
    setEditAmount(String(tx.amount))
    setEditDate(tx.date)
    setEditType(tx.type)
    setEditCategory(tx.categoryId || tx.suggestedCategoryId || 'none')
    setEditNotes(tx.notes || '')
  }

  // Save Edit Modal
  const handleSaveEdit = () => {
    if (!editModalTx) return
    const cleanAmt = editAmount.replace(/[R$\s]/g, '').replace(',', '.')
    const parsedAmt = Math.abs(parseFloat(cleanAmt))
    if (isNaN(parsedAmt) || parsedAmt <= 0) return

    const catToSave = editCategory === 'none' || !editCategory ? null : editCategory

    updateTransaction(editModalTx.id, {
      description: editDescription.trim(),
      amount: parsedAmt,
      date: editDate,
      type: editType,
      categoryId: catToSave,
      needsReview: false,
      suggestedCategoryId: null,
      notes: editNotes.trim(),
    })

    // If category was chosen, learn rule
    if (catToSave) {
      classifyAndConfirmTransaction(editModalTx.id, catToSave)
    }

    setEditModalTx(null)
    toast({
      title: 'Lançamento atualizado',
      description: 'Alterações salvas com sucesso.',
    })
  }

  // Export current view to CSV
  const handleExportFiltered = () => {
    const dataToExport = filteredTransactions.map((t) => ({
      date: t.date,
      description: t.description,
      amount: t.amount,
      type: t.type,
      categoryName: t.categoryId ? categoryMap.get(t.categoryId)?.name : '',
      notes: t.notes,
    }))

    const csvContent = exportTransactionsToCSV(dataToExport)
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `transacoes_${currentMonth}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast({
      title: 'Exportação concluída',
      description: 'Arquivo CSV gerado com sucesso.',
    })
  }

  return (
    <div className="space-y-6 animate-fade-in text-[#F8FAFC]">
      {/* Header & Month Selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-white/5">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-['Lexend']">
            Transações
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Filtre, revise e gerencie os lançamentos sem perder contexto.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          <MonthSelector />
        </div>
      </div>

      {/* Filter Toolbar */}
      <Card className="border-white/10 bg-[#192134] rounded-2xl shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Search */}
            <div className="relative lg:col-span-2">
              <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-3 pointer-events-none" />
              <Input
                placeholder="Buscar por descrição ou observação..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 text-xs h-10 bg-[#101A34] text-[#F8FAFC] border-white/10 placeholder:text-[#94A3B8] rounded-xl focus-visible:ring-blue-400"
              />
            </div>

            {/* Category Filter */}
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="text-xs h-10 bg-[#101A34] text-[#F8FAFC] border-white/10 rounded-xl">
                <SelectValue placeholder="Todas categorias" />
              </SelectTrigger>
              <SelectContent className="bg-[#192134] text-[#F8FAFC] border-white/10">
                <SelectItem value="all">Todas categorias</SelectItem>
                <SelectItem value="none">Sem categoria</SelectItem>
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

            {/* Type Filter */}
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="text-xs h-10 bg-[#101A34] text-[#F8FAFC] border-white/10 rounded-xl">
                <SelectValue placeholder="Todos os tipos" />
              </SelectTrigger>
              <SelectContent className="bg-[#192134] text-[#F8FAFC] border-white/10">
                <SelectItem value="all">Todas (Receitas & Despesas)</SelectItem>
                <SelectItem value="expense">Apenas Despesas</SelectItem>
                <SelectItem value="income">Apenas Receitas</SelectItem>
              </SelectContent>
            </Select>

            {/* Status Filter (Classified / Pending) */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="text-xs h-10 bg-[#101A34] text-[#F8FAFC] border-white/10 rounded-xl">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="bg-[#192134] text-[#F8FAFC] border-white/10">
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="pending">
                  Aguardando revisão ({monthTransactions.filter((t) => t.needsReview).length})
                </SelectItem>
                <SelectItem value="classified">Classificadas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Selection Actions Bar (when rows are selected) */}
          {selectedIds.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-blue-500/10 border border-blue-500/30 rounded-xl text-xs animate-fade-in">
              <span className="font-semibold text-blue-300">
                {selectedIds.length}{' '}
                {selectedIds.length === 1 ? 'item selecionado' : 'itens selecionados'}
              </span>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBatchCategoryModal(true)}
                  className="h-8 text-xs bg-[#202A40] text-blue-300 hover:bg-[#202A40]/80 border-blue-500/30 rounded-xl"
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
                  Atribuir Categoria em lote
                </Button>

                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleBatchDelete}
                  className="h-8 text-xs rounded-xl bg-red-600 hover:bg-red-700 text-white"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  Excluir selecionados
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transactions Table / List */}
      <Card className="border-white/10 bg-[#192134] rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 bg-[#101A34]/60">
          <div className="text-xs text-[#B6C2D4] font-medium">
            Exibindo <strong className="text-[#F8FAFC]">{filteredTransactions.length}</strong> de{' '}
            <strong className="text-[#F8FAFC]">{monthTransactions.length}</strong> transações no mês
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExportFiltered}
            className="text-xs h-8 gap-1.5 text-blue-300 hover:text-white hover:bg-[#202A40] rounded-xl border border-white/5"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar CSV
          </Button>
        </div>

        {filteredTransactions.length === 0 ? (
          <div className="py-16 text-center text-[#94A3B8]">
            <Filter className="w-10 h-10 mx-auto mb-2 text-slate-600" />
            <p className="text-base font-semibold text-[#F8FAFC]">Nenhuma transação encontrada</p>
            <p className="text-xs text-[#B6C2D4] mt-1 max-w-sm mx-auto">
              Nenhum lançamento corresponde aos filtros ativos para este mês.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#101A34] border-b border-white/5 text-[#94A3B8] font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="p-3.5 w-10 text-center">
                    <Checkbox
                      aria-label="Selecionar todas as transações"
                      checked={
                        selectedIds.length === filteredTransactions.length &&
                        filteredTransactions.length > 0
                      }
                      onCheckedChange={(c) => handleSelectAll(Boolean(c))}
                    />
                  </th>
                  <th className="p-3.5 w-24">Data</th>
                  <th className="p-3.5">Descrição</th>
                  <th className="p-3.5 w-44">Categoria</th>
                  <th className="p-3.5 w-32 text-right">Valor</th>
                  <th className="p-3.5 w-28 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredTransactions.map((tx) => {
                  const cat = tx.categoryId ? categoryMap.get(tx.categoryId) : null
                  const suggestedCat = tx.suggestedCategoryId
                    ? categoryMap.get(tx.suggestedCategoryId)
                    : null
                  const isExpense = tx.type === 'expense'
                  const isSelected = selectedIds.includes(tx.id)

                  // Format Date DD/MM/YYYY
                  const [y, m, d] = tx.date.split('-')
                  const formattedDate = `${d}/${m}/${y}`

                  return (
                    <tr
                      key={tx.id}
                      className={`hover:bg-[#202A40]/70 transition-colors ${
                        tx.needsReview ? 'bg-amber-500/5' : ''
                      } ${isSelected ? 'bg-blue-600/10' : ''}`}
                    >
                      {/* Checkbox */}
                      <td className="p-3.5 text-center">
                        <Checkbox
                          aria-label={`Selecionar transação: ${tx.description}`}
                          checked={isSelected}
                          onCheckedChange={(c) => handleSelectOne(tx.id, Boolean(c))}
                        />
                      </td>

                      {/* Date */}
                      <td className="p-3.5 text-[#B6C2D4] whitespace-nowrap font-medium tabular-nums">
                        {formattedDate}
                      </td>

                      {/* Description + Notes */}
                      <td className="p-3.5">
                        <div className="flex items-start gap-2.5 max-w-md">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0 mt-1"
                            style={{
                              backgroundColor: cat
                                ? cat.color
                                : suggestedCat
                                  ? suggestedCat.color
                                  : '#64748b',
                            }}
                          />
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-[#F8FAFC]">{tx.description}</span>
                              {(() => {
                                const incomeIdResult = identifyIncome(
                                  {
                                    description: tx.description,
                                    amount: tx.amount,
                                    type: tx.type,
                                  },
                                  {
                                    userName: settings.userName,
                                    userAliases: settings.userAliases,
                                  },
                                )

                                if (incomeIdResult.isIdentifiedIncome) {
                                  return (
                                    <Badge
                                      className={`text-[10px] gap-1 py-0 px-1.5 font-medium border ${
                                        incomeIdResult.isUserLinked
                                          ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                                          : 'border-teal-500/30 bg-teal-500/10 text-teal-300'
                                      }`}
                                      title={incomeIdResult.reason || 'Entrada identificada'}
                                    >
                                      {incomeIdResult.isUserLinked ? (
                                        <UserCheck className="w-2.5 h-2.5 text-emerald-400" />
                                      ) : (
                                        <TrendingUp className="w-2.5 h-2.5 text-teal-400" />
                                      )}
                                      {incomeIdResult.isUserLinked
                                        ? 'Entrada vinculada a você'
                                        : 'Entrada identificada'}
                                    </Badge>
                                  )
                                }
                                return null
                              })()}
                              {tx.isCreditCardPayment && (
                                <Badge
                                  className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px] gap-1 font-medium py-0 px-1.5"
                                  title="Pagamento de fatura: potencial duplicação de gastos individuais (ignorado do total de despesas do Dashboard por padrão)"
                                >
                                  <CreditCard className="w-2.5 h-2.5 text-amber-300" />
                                  Fatura
                                </Badge>
                              )}
                            </div>
                            {tx.notes && (
                              <span className="text-[11px] text-[#94A3B8] block truncate mt-0.5">
                                {tx.notes}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Category & Status */}
                      <td className="p-3.5 whitespace-nowrap">
                        {cat ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border"
                              style={{
                                backgroundColor: `${cat.color}22`,
                                borderColor: `${cat.color}44`,
                                color: cat.color,
                              }}
                            >
                              <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: cat.color }}
                              />
                              {cat.name}
                            </span>
                            <Badge
                              variant="outline"
                              className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-[10px] gap-1 py-0 px-1.5 font-normal"
                              title="Classificado por correspondência exata inteligente"
                            >
                              <CheckCircle2 className="w-2.5 h-2.5" /> Exata
                            </Badge>
                          </div>
                        ) : tx.needsReview ? (
                          <div className="space-y-1">
                            {suggestedCat ? (
                              <div className="flex items-center gap-1.5">
                                <Badge
                                  variant="outline"
                                  className="border-amber-500/40 bg-amber-500/10 text-amber-300 text-[10px] gap-1"
                                >
                                  <Sparkles className="w-3 h-3 text-amber-400" />
                                  Sugestão: {suggestedCat.name}
                                </Badge>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="min-h-[44px] min-w-[44px] h-11 w-11 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-lg"
                                  onClick={() =>
                                    handleConfirmOne(tx, tx.suggestedCategoryId || undefined)
                                  }
                                  aria-label={`Confirmar sugestão de categoria para ${tx.description}`}
                                  title="Confirmar esta sugestão"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                </Button>
                              </div>
                            ) : (
                              <Badge
                                variant="outline"
                                className="border-white/10 bg-[#101A34] text-[#B6C2D4] text-[10px]"
                              >
                                Não classificado
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-[#94A3B8] italic">Sem categoria</span>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="p-3.5 text-right whitespace-nowrap">
                        <span
                          className={`font-bold text-sm tabular-nums ${
                            isExpense ? 'text-[#FB7185]' : 'text-[#34D399]'
                          }`}
                        >
                          {isExpense ? '- ' : '+ '}
                          {formatCurrencyBRL(tx.amount)}
                        </span>
                      </td>

                      {/* Action buttons */}
                      <td className="p-3.5 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          {tx.needsReview && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="min-h-[44px] min-w-[44px] h-11 w-11 text-emerald-400 hover:bg-emerald-500/10 rounded-lg"
                              onClick={() => openEditModal(tx)}
                              aria-label={`Classificar e confirmar ${tx.description}`}
                              title="Classificar e confirmar"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="min-h-[44px] min-w-[44px] h-11 w-11 text-[#B6C2D4] hover:text-[#F8FAFC] hover:bg-[#202A40] rounded-lg"
                            onClick={() => openEditModal(tx)}
                            aria-label={`Editar lançamento ${tx.description}`}
                            title="Editar lançamento"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="min-h-[44px] min-w-[44px] h-11 w-11 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg"
                            onClick={() => deleteTransaction(tx.id)}
                            aria-label={`Excluir lançamento ${tx.description}`}
                            title="Excluir"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* EDIT TRANSACTION MODAL */}
      <Dialog open={Boolean(editModalTx)} onOpenChange={(open) => !open && setEditModalTx(null)}>
        <DialogContent className="sm:max-w-[480px] bg-[#192134] text-[#F8FAFC] border border-white/10 rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-lg font-bold text-[#F8FAFC]">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                <Edit2 className="w-4 h-4" />
              </div>
              Editar Lançamento
            </DialogTitle>
          </DialogHeader>

          {editModalTx && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-2 p-1 bg-[#101A34] rounded-xl border border-white/5">
                <button
                  type="button"
                  onClick={() => setEditType('expense')}
                  className={`flex items-center justify-center gap-2 py-2 rounded-lg font-medium text-xs transition-all ${
                    editType === 'expense'
                      ? 'bg-[#202A40] text-rose-300 border border-white/10 shadow-sm'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                  }`}
                >
                  <ArrowDownRight className="w-3.5 h-3.5 text-rose-400" />
                  Despesa
                </button>
                <button
                  type="button"
                  onClick={() => setEditType('income')}
                  className={`flex items-center justify-center gap-2 py-2 rounded-lg font-medium text-xs transition-all ${
                    editType === 'income'
                      ? 'bg-[#202A40] text-emerald-300 border border-white/10 shadow-sm'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                  }`}
                >
                  <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
                  Receita
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-[#B6C2D4]">Data</Label>
                  <Input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="text-xs h-10 bg-[#101A34] text-[#F8FAFC] border-white/10 rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-[#B6C2D4]">Valor (R$)</Label>
                  <Input
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    className="text-xs h-10 bg-[#101A34] text-[#F8FAFC] border-white/10 rounded-xl tabular-nums"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-[#B6C2D4]">Descrição completa</Label>
                <Input
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="text-xs font-medium h-10 bg-[#101A34] text-[#F8FAFC] border-white/10 rounded-xl"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-[#B6C2D4]">Categoria</Label>
                <Select value={editCategory} onValueChange={setEditCategory}>
                  <SelectTrigger className="text-xs h-10 bg-[#101A34] text-[#F8FAFC] border-white/10 rounded-xl">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#192134] text-[#F8FAFC] border-white/10">
                    <SelectItem value="none">Sem categoria</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full inline-block"
                            style={{ backgroundColor: cat.color }}
                          />
                          <span>{cat.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-emerald-400 font-medium pt-0.5">
                  ✓ Salvar aprenderá esta regra com normalização inteligente (trata maiúsculas,
                  espaços e pontuações) para novos extratos bancários.
                </p>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-[#B6C2D4]">Observação</Label>
                <Textarea
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="text-xs bg-[#101A34] text-[#F8FAFC] border-white/10 rounded-xl"
                  placeholder="Detalhes opcionais..."
                />
              </div>

              <DialogFooter className="gap-2 sm:gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditModalTx(null)}
                  className="border-white/10 bg-transparent text-[#B6C2D4] hover:bg-[#202A40] hover:text-[#F8FAFC] rounded-xl h-10"
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-10 px-4"
                  onClick={handleSaveEdit}
                >
                  Salvar e Confirmar
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* BATCH CATEGORY ASSIGN MODAL */}
      <Dialog open={batchCategoryModal} onOpenChange={setBatchCategoryModal}>
        <DialogContent className="sm:max-w-[420px] bg-[#192134] text-[#F8FAFC] border border-white/10 rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-[#F8FAFC]">
              Classificar {selectedIds.length} Lançamentos
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Label className="text-xs text-[#B6C2D4]">
              Escolha a categoria para todos os itens selecionados:
            </Label>
            <Select value={selectedBatchCat} onValueChange={setSelectedBatchCat}>
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

            <p className="text-xs text-[#94A3B8]">
              O sistema aprenderá a descrição de cada um dos itens para classificar automaticamente
              as próximas ocorrências.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBatchCategoryModal(false)}
              className="border-white/10 bg-transparent text-[#B6C2D4] hover:bg-[#202A40] hover:text-[#F8FAFC] rounded-xl h-10"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={!selectedBatchCat}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-10 px-4 disabled:opacity-50"
              onClick={handleBatchAssignCategory}
            >
              Confirmar Classificação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

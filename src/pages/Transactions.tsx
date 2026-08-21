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
} from 'lucide-react'
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
  const [editType, setEditType] = useState<'expense' | 'income'>('expense')
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
      description: `Regra memorizada: "${tx.description}" agora é classificado automaticamente.`,
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
    <div className="space-y-6 animate-fade-in">
      {/* Header & Month Selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Transações</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Gerencie, filtre e aprove a classificação de cada lançamento
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          <MonthSelector />
        </div>
      </div>

      {/* Filter Toolbar */}
      <Card className="border-slate-200/80 shadow-xs">
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Search */}
            <div className="relative lg:col-span-2">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
              <Input
                placeholder="Buscar por descrição ou observação..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 text-xs h-9 bg-white"
              />
            </div>

            {/* Category Filter */}
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="text-xs h-9 bg-white">
                <SelectValue placeholder="Todas categorias" />
              </SelectTrigger>
              <SelectContent>
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
              <SelectTrigger className="text-xs h-9 bg-white">
                <SelectValue placeholder="Todos os tipos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas (Receitas & Despesas)</SelectItem>
                <SelectItem value="expense">Apenas Despesas</SelectItem>
                <SelectItem value="income">Apenas Receitas</SelectItem>
              </SelectContent>
            </Select>

            {/* Status Filter (Classified / Pending) */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="text-xs h-9 bg-white">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
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
            <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs animate-fade-in">
              <span className="font-semibold text-emerald-900">
                {selectedIds.length}{' '}
                {selectedIds.length === 1 ? 'item selecionado' : 'itens selecionados'}
              </span>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBatchCategoryModal(true)}
                  className="h-7 text-xs bg-white text-emerald-800 hover:bg-emerald-100 border-emerald-300"
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                  Atribuir Categoria em lote
                </Button>

                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleBatchDelete}
                  className="h-7 text-xs"
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
      <Card className="border-slate-200/80 shadow-xs overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b bg-slate-50/50">
          <div className="text-xs text-slate-500 font-medium">
            Exibindo <strong>{filteredTransactions.length}</strong> de{' '}
            <strong>{monthTransactions.length}</strong> transações no mês
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExportFiltered}
            className="text-xs h-7 gap-1 text-slate-600 hover:text-slate-900"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar CSV
          </Button>
        </div>

        {filteredTransactions.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <Filter className="w-10 h-10 mx-auto mb-2 text-slate-300" />
            <p className="text-base font-semibold text-slate-700">Nenhuma transação encontrada</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Nenhum lançamento corresponde aos filtros ativos para este mês.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="p-3.5 w-10 text-center">
                    <Checkbox
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
              <tbody className="divide-y divide-slate-100">
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
                      className={`hover:bg-slate-50/80 transition-colors ${
                        tx.needsReview ? 'bg-amber-50/40' : ''
                      } ${isSelected ? 'bg-emerald-50/50' : ''}`}
                    >
                      {/* Checkbox */}
                      <td className="p-3.5 text-center">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(c) => handleSelectOne(tx.id, Boolean(c))}
                        />
                      </td>

                      {/* Date */}
                      <td className="p-3.5 text-slate-500 whitespace-nowrap font-medium">
                        {formattedDate}
                      </td>

                      {/* Description + Notes */}
                      <td className="p-3.5">
                        <div className="flex items-start gap-2 max-w-md">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0 mt-1"
                            style={{
                              backgroundColor: cat
                                ? cat.color
                                : suggestedCat
                                  ? suggestedCat.color
                                  : '#cbd5e1',
                            }}
                          />
                          <div>
                            <span className="font-semibold text-slate-900 block">
                              {tx.description}
                            </span>
                            {tx.notes && (
                              <span className="text-[11px] text-slate-500 block truncate">
                                {tx.notes}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Category & Status */}
                      <td className="p-3.5 whitespace-nowrap">
                        {cat ? (
                          <div className="flex items-center gap-1.5">
                            <span
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold"
                              style={{
                                backgroundColor: `${cat.color}15`,
                                color: cat.color,
                              }}
                            >
                              <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: cat.color }}
                              />
                              {cat.name}
                            </span>
                          </div>
                        ) : tx.needsReview ? (
                          <div className="space-y-1">
                            {suggestedCat ? (
                              <div className="flex items-center gap-1.5">
                                <Badge
                                  variant="outline"
                                  className="border-amber-300 bg-amber-100/70 text-amber-900 text-[10px] gap-1"
                                >
                                  <Sparkles className="w-3 h-3 text-amber-600" />
                                  Sugestão: {suggestedCat.name}
                                </Badge>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                  onClick={() =>
                                    handleConfirmOne(tx, tx.suggestedCategoryId || undefined)
                                  }
                                  title="Confirmar esta sugestão"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                </Button>
                              </div>
                            ) : (
                              <Badge
                                variant="outline"
                                className="border-slate-300 bg-slate-100 text-slate-600 text-[10px]"
                              >
                                Não classificado
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Sem categoria</span>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="p-3.5 text-right whitespace-nowrap">
                        <span
                          className={`font-bold text-sm ${
                            isExpense ? 'text-rose-600' : 'text-emerald-600'
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
                              className="h-7 w-7 text-emerald-600 hover:bg-emerald-50"
                              onClick={() => openEditModal(tx)}
                              title="Classificar e confirmar"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-slate-500 hover:bg-slate-100"
                            onClick={() => openEditModal(tx)}
                            title="Editar lançamento"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-rose-500 hover:bg-rose-50"
                            onClick={() => deleteTransaction(tx.id)}
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
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <Edit2 className="w-5 h-5 text-emerald-600" />
              Editar Lançamento
            </DialogTitle>
          </DialogHeader>

          {editModalTx && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setEditType('expense')}
                  className={`flex items-center justify-center gap-2 py-2 rounded-md font-medium text-xs transition-all ${
                    editType === 'expense' ? 'bg-white text-rose-700 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  <ArrowDownRight className="w-3.5 h-3.5 text-rose-500" />
                  Despesa
                </button>
                <button
                  type="button"
                  onClick={() => setEditType('income')}
                  className={`flex items-center justify-center gap-2 py-2 rounded-md font-medium text-xs transition-all ${
                    editType === 'income' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />
                  Receita
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Data</Label>
                  <Input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Valor (R$)</Label>
                  <Input
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Descrição completa</Label>
                <Input
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="text-xs font-medium"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Categoria</Label>
                <Select value={editCategory} onValueChange={setEditCategory}>
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
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
                <p className="text-[11px] text-emerald-700 font-medium pt-0.5">
                  ✓ Salvar aprenderá esta regra exata para novos extratos bancários.
                </p>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Observação</Label>
                <Textarea
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="text-xs"
                  placeholder="Detalhes opcionais..."
                />
              </div>

              <DialogFooter className="gap-2 sm:gap-0 pt-2">
                <Button variant="outline" size="sm" onClick={() => setEditModalTx(null)}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
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
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              Classificar {selectedIds.length} Lançamentos
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Label className="text-xs">Escolha a categoria para todos os itens selecionados:</Label>
            <Select value={selectedBatchCat} onValueChange={setSelectedBatchCat}>
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

            <p className="text-xs text-slate-500">
              O sistema aprenderá a descrição de cada um dos itens para classificar automaticamente
              as próximas ocorrências.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setBatchCategoryModal(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={!selectedBatchCat}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
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

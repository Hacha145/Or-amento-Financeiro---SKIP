import React, { useMemo, useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useFinance } from '@/context/FinanceContext'
import {
  ArrowDownRight,
  ArrowUpRight,
  ArrowLeftRight,
  CreditCard,
  PiggyBank,
  Undo2,
  SlidersHorizontal,
  PlusCircle,
  Copy,
} from 'lucide-react'
import type { TransactionType } from '@/types/finance'

interface NewTransactionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialType?: 'expense' | 'income'
  /** Optional preset to duplicate an existing transaction */
  duplicateFrom?: {
    description: string
    amount: number
    type: TransactionType
    itemId: string | null
    accountId?: string | null
    creditCardId?: string | null
    notes?: string
  } | null
  onSaved?: () => void
}

const TYPE_OPTIONS: {
  value: TransactionType
  label: string
  icon: React.ReactNode
  color: string
}[] = [
  {
    value: 'expense',
    label: 'Despesa',
    icon: <ArrowDownRight className="w-4 h-4 text-rose-500" />,
    color: 'rose',
  },
  {
    value: 'income',
    label: 'Receita',
    icon: <ArrowUpRight className="w-4 h-4 text-emerald-500" />,
    color: 'emerald',
  },
  {
    value: 'investment_in',
    label: 'Aporte',
    icon: <PiggyBank className="w-4 h-4 text-blue-500" />,
    color: 'blue',
  },
  {
    value: 'investment_out',
    label: 'Resgate',
    icon: <PiggyBank className="w-4 h-4 text-indigo-500" />,
    color: 'indigo',
  },
  {
    value: 'transfer',
    label: 'Transferência',
    icon: <ArrowLeftRight className="w-4 h-4 text-slate-500" />,
    color: 'slate',
  },
  {
    value: 'credit_card_payment',
    label: 'Pgto Fatura',
    icon: <CreditCard className="w-4 h-4 text-purple-500" />,
    color: 'purple',
  },
  {
    value: 'reimbursement',
    label: 'Reembolso',
    icon: <Undo2 className="w-4 h-4 text-cyan-500" />,
    color: 'cyan',
  },
  {
    value: 'adjustment',
    label: 'Ajuste',
    icon: <SlidersHorizontal className="w-4 h-4 text-amber-500" />,
    color: 'amber',
  },
  {
    value: 'loan',
    label: 'Empréstimo',
    icon: <ArrowUpRight className="w-4 h-4 text-orange-500" />,
    color: 'orange',
  },
]

export const NewTransactionDialog: React.FC<NewTransactionDialogProps> = ({
  open,
  onOpenChange,
  initialType = 'expense',
  duplicateFrom = null,
  onSaved,
}) => {
  const {
    financialClasses,
    financialCategories,
    financialItems,
    accounts,
    creditCards,
    transactions,
    addTransaction,
  } = useFinance()

  const [type, setType] = useState<TransactionType>(initialType)
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])
  const [description, setDescription] = useState('')
  const [amountStr, setAmountStr] = useState('')
  const [classId, setClassId] = useState<string>('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [itemId, setItemId] = useState<string>('')
  const [accountId, setAccountId] = useState<string>('')
  const [creditCardId, setCreditCardId] = useState<string>('')
  const [transferToAccountId, setTransferToAccountId] = useState<string>('')
  const [reimbursesTransactionId, setReimbursesTransactionId] = useState<string>('')
  const [installments, setInstallments] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [needsReview, setNeedsReview] = useState(false)

  // Seed from a duplicate target when provided
  useEffect(() => {
    if (duplicateFrom) {
      setDescription(duplicateFrom.description)
      setAmountStr(String(duplicateFrom.amount).replace('.', ','))
      setType(duplicateFrom.type)
      setItemId(duplicateFrom.itemId ?? '')
      setAccountId(duplicateFrom.accountId ?? '')
      setCreditCardId(duplicateFrom.creditCardId ?? '')
      setNotes(duplicateFrom.notes ?? '')
      if (duplicateFrom.itemId) {
        const item = financialItems.find((i) => i.id === duplicateFrom.itemId)
        if (item) {
          setClassId(item.classId)
          setCategoryId(item.categoryId ?? '')
        }
      }
    }
  }, [duplicateFrom, financialItems])

  // When type changes, default class selection
  useEffect(() => {
    if (type === 'income' && !classId) setClassId('receitas')
    if ((type === 'investment_in' || type === 'investment_out') && !classId)
      setClassId('investimentos')
    if (
      type === 'transfer' ||
      type === 'credit_card_payment' ||
      type === 'adjustment' ||
      type === 'loan'
    ) {
      // no class needed
      setClassId('')
      setCategoryId('')
      setItemId('')
    }
  }, [type, classId])

  // Reset selection when class changes
  const categoriesInClass = useMemo(
    () => financialCategories.filter((c) => c.classId === classId),
    [financialCategories, classId],
  )
  const hasSubcategories = categoriesInClass.length > 0

  const itemsInScope = useMemo(() => {
    if (!classId) return []
    let list = financialItems.filter((i) => i.classId === classId && i.active)
    if (hasSubcategories && categoryId) {
      list = list.filter((i) => i.categoryId === categoryId)
    }
    return list
  }, [financialItems, classId, categoryId, hasSubcategories])

  const resetForm = () => {
    setDescription('')
    setAmountStr('')
    setItemId('')
    setCategoryId('')
    setClassId('')
    setAccountId('')
    setCreditCardId('')
    setTransferToAccountId('')
    setReimbursesTransactionId('')
    setInstallments('')
    setNotes('')
    setNeedsReview(false)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!description.trim() || !amountStr) return

    const cleanAmt = amountStr.replace(/[R$\s]/g, '').replace(',', '.')
    const parsedAmount = Math.abs(parseFloat(cleanAmt))
    if (isNaN(parsedAmount) || parsedAmount <= 0) return

    const totalInstallments = installments ? parseInt(installments, 10) : null

    addTransaction({
      date,
      description: description.trim(),
      amount: parsedAmount,
      type,
      categoryId: categoryId || null,
      itemId: itemId || null,
      accountId: accountId || null,
      creditCardId: creditCardId || null,
      transferToAccountId: type === 'transfer' ? transferToAccountId || null : null,
      reimbursementOfTransactionId:
        type === 'reimbursement' ? reimbursesTransactionId || null : null,
      totalInstallments: totalInstallments && totalInstallments > 1 ? totalInstallments : null,
      installmentNumber: totalInstallments && totalInstallments > 1 ? 1 : null,
      needsReview,
      notes: notes.trim(),
      source: 'manual',
    })

    resetForm()
    onOpenChange(false)
    onSaved?.()
  }

  const isTransfer = type === 'transfer'
  const isReimbursement = type === 'reimbursement'
  const needsItem =
    type === 'expense' ||
    type === 'income' ||
    type === 'investment_in' ||
    type === 'investment_out' ||
    type === 'reimbursement'

  const expenseTransactionsForReimbursement = useMemo(
    () => transactions.filter((t) => t.type === 'expense').slice(0, 50),
    [transactions],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[92vh] overflow-y-auto bg-[#192134] text-[#F8FAFC] border border-white/10 shadow-2xl rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 text-lg font-bold text-[#F8FAFC]">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <PlusCircle className="w-4 h-4" />
            </div>
            {duplicateFrom ? 'Duplicar Lançamento' : 'Novo Lançamento'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Type selector */}
          <div>
            <Label className="mb-1.5 block text-xs font-semibold text-[#B6C2D4] uppercase tracking-wider">
              Tipo
            </Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setType(opt.value)}
                  className={`flex items-center justify-center gap-1.5 min-h-[44px] py-2 px-1.5 rounded-xl text-xs font-medium transition-all border cursor-pointer ${
                    type === opt.value
                      ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-600/30 font-semibold'
                      : 'bg-[#101A34] text-[#B6C2D4] border-white/5 hover:bg-[#202A40] hover:text-[#F8FAFC]'
                  }`}
                >
                  {opt.icon}
                  <span className="truncate">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tx-date">Data</Label>
              <Input
                id="tx-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tx-amount">Valor (R$)</Label>
              <Input
                id="tx-amount"
                placeholder="0,00"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tx-desc">Descrição</Label>
            <Input
              id="tx-desc"
              placeholder="Ex: Pão de Açúcar, Salário, Uber..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>

          {/* Cascading Class → Category → Item */}
          {needsItem && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="tx-class">Classe</Label>
                  <Select
                    value={classId}
                    onValueChange={(v) => {
                      setClassId(v)
                      setCategoryId('')
                      setItemId('')
                    }}
                  >
                    <SelectTrigger id="tx-class">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {financialClasses
                        .filter((c) => {
                          if (type === 'income') return c.id === 'receitas'
                          if (type === 'investment_in' || type === 'investment_out')
                            return c.id === 'investimentos'
                          if (type === 'reimbursement') return c.isExpense
                          return c.isExpense
                        })
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2.5 h-2.5 rounded-full inline-block"
                                style={{ backgroundColor: c.color }}
                              />
                              <span>{c.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {hasSubcategories && (
                  <div className="space-y-1.5">
                    <Label htmlFor="tx-cat">Categoria</Label>
                    <Select
                      value={categoryId}
                      onValueChange={(v) => {
                        setCategoryId(v)
                        setItemId('')
                      }}
                    >
                      <SelectTrigger id="tx-cat">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        {categoriesInClass.map((c) => (
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
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tx-item">Item</Label>
                <Select value={itemId} onValueChange={setItemId}>
                  <SelectTrigger id="tx-item">
                    <SelectValue placeholder="Selecione um item..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Itens</SelectLabel>
                      {itemsInScope.map((it) => (
                        <SelectItem key={it.id} value={it.id}>
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full inline-block"
                              style={{ backgroundColor: it.color }}
                            />
                            <span>{it.name}</span>
                            {it.aliases.length > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                ({it.aliases.join(', ')})
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* Account + credit card */}
          {!isTransfer && type !== 'adjustment' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tx-account">Conta</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger id="tx-account">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts
                      .filter((a) => a.active)
                      .map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tx-card">Cartão (opcional)</Label>
                <Select value={creditCardId} onValueChange={setCreditCardId}>
                  <SelectTrigger id="tx-card">
                    <SelectValue placeholder="Sem cartão" />
                  </SelectTrigger>
                  <SelectContent>
                    {creditCards
                      .filter((c) => c.active)
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {isTransfer && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tx-from">Conta origem</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger id="tx-from">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts
                      .filter((a) => a.active)
                      .map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tx-to">Conta destino</Label>
                <Select value={transferToAccountId} onValueChange={setTransferToAccountId}>
                  <SelectTrigger id="tx-to">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts
                      .filter((a) => a.active)
                      .map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {isReimbursement && (
            <div className="space-y-1.5">
              <Label htmlFor="tx-reimb">Reembolsa transação</Label>
              <Select value={reimbursesTransactionId} onValueChange={setReimbursesTransactionId}>
                <SelectTrigger id="tx-reimb">
                  <SelectValue placeholder="Selecione a despesa original..." />
                </SelectTrigger>
                <SelectContent>
                  {expenseTransactionsForReimbursement.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.date} — {t.description} (R$ {t.amount.toFixed(2).replace('.', ',')})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Installments */}
          {(type === 'expense' || type === 'income') && (
            <div className="space-y-1.5">
              <Label htmlFor="tx-installments">Parcelamento (opcional)</Label>
              <Input
                id="tx-installments"
                type="number"
                min={1}
                placeholder="1 (à vista)"
                value={installments}
                onChange={(e) => setInstallments(e.target.value)}
              />
              {installments && parseInt(installments, 10) > 1 && (
                <p className="text-[11px] text-muted-foreground">
                  Será criada a 1ª de {installments} parcelas. Use a tela de transações para gerar
                  as demais.
                </p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="tx-notes">Observação (opcional)</Label>
            <Textarea
              id="tx-notes"
              rows={2}
              placeholder="Detalhes adicionais..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#101A34] px-3.5 py-2.5">
            <div>
              <Label htmlFor="tx-review" className="text-sm font-medium text-[#F8FAFC]">
                Marcar para revisão
              </Label>
              <p className="text-[11px] text-[#94A3B8]">
                Deixe ligado para revisar a classificação depois.
              </p>
            </div>
            <Switch id="tx-review" checked={needsReview} onCheckedChange={setNeedsReview} />
          </div>

          <DialogFooter className="gap-2 sm:gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-white/10 bg-transparent text-slate-300 hover:bg-[#202A40] hover:text-white rounded-lg h-11 cursor-pointer"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="bg-[#059669] hover:bg-[#059669]/90 text-white font-semibold rounded-lg h-11 px-5 shadow-sm cursor-pointer transition-transform hover:-translate-y-0.5 focus:ring-2 focus:ring-white"
            >
              {duplicateFrom ? (
                <>
                  <Copy className="w-4 h-4 mr-1.5" /> Duplicar
                </>
              ) : (
                'Salvar Lançamento'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

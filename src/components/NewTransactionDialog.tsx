import React, { useState } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useFinance } from '@/context/FinanceContext'
import { ArrowDownRight, ArrowUpRight, PlusCircle } from 'lucide-react'

interface NewTransactionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialType?: 'expense' | 'income'
}

export const NewTransactionDialog: React.FC<NewTransactionDialogProps> = ({
  open,
  onOpenChange,
  initialType = 'expense',
}) => {
  const { categories, addTransaction } = useFinance()
  const [type, setType] = useState<'expense' | 'income'>(initialType)
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])
  const [description, setDescription] = useState('')
  const [amountStr, setAmountStr] = useState('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [notes, setNotes] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!description.trim() || !amountStr) return

    const cleanAmt = amountStr.replace(/[R$\s]/g, '').replace(',', '.')
    const parsedAmount = Math.abs(parseFloat(cleanAmt))
    if (isNaN(parsedAmount) || parsedAmount <= 0) return

    addTransaction({
      date,
      description: description.trim(),
      amount: parsedAmount,
      type,
      categoryId: categoryId === 'none' || !categoryId ? null : categoryId,
      needsReview: false,
      notes: notes.trim(),
      source: 'manual',
    })

    // Reset and close
    setDescription('')
    setAmountStr('')
    setCategoryId('')
    setNotes('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <PlusCircle className="w-5 h-5 text-emerald-600" />
            Novo Lançamento
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Type Toggle */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setType('expense')}
              className={`flex items-center justify-center gap-2 py-2 rounded-md font-medium text-sm transition-all ${
                type === 'expense'
                  ? 'bg-white text-rose-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ArrowDownRight className="w-4 h-4 text-rose-500" />
              Despesa
            </button>
            <button
              type="button"
              onClick={() => setType('income')}
              className={`flex items-center justify-center gap-2 py-2 rounded-md font-medium text-sm transition-all ${
                type === 'income'
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ArrowUpRight className="w-4 h-4 text-emerald-500" />
              Receita
            </button>
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
            <Label htmlFor="tx-desc">Descrição completa</Label>
            <Input
              id="tx-desc"
              placeholder="Ex: Pão de Açúcar, Salário, Uber..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
            <p className="text-[11px] text-muted-foreground">
              O sistema memorizará esta descrição exata para lançamentos futuros.
            </p>
          </div>

          {type === 'expense' && (
            <div className="space-y-1.5">
              <Label htmlFor="tx-category">Categoria</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger id="tx-category">
                  <SelectValue placeholder="Selecione uma categoria..." />
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

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              className={
                type === 'expense'
                  ? 'bg-slate-900 hover:bg-slate-800'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }
            >
              Salvar Lançamento
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

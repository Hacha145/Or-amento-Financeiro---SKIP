import React from 'react'
import { Button } from '@/components/ui/button'
import { useFinance } from '@/context/FinanceContext'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'

export const MonthSelector: React.FC = () => {
  const { currentMonth, setCurrentMonth } = useFinance()

  const [yearStr, monthStr] = currentMonth.split('-')
  const year = parseInt(yearStr, 10)
  const monthIndex = parseInt(monthStr, 10) - 1 // 0-indexed

  const dateObj = new Date(year, monthIndex, 1)

  const monthLabel = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
  }).format(dateObj)

  const handlePrev = () => {
    const prevDate = new Date(year, monthIndex - 1, 1)
    const y = prevDate.getFullYear()
    const m = String(prevDate.getMonth() + 1).padStart(2, '0')
    setCurrentMonth(`${y}-${m}`)
  }

  const handleNext = () => {
    const nextDate = new Date(year, monthIndex + 1, 1)
    const y = nextDate.getFullYear()
    const m = String(nextDate.getMonth() + 1).padStart(2, '0')
    setCurrentMonth(`${y}-${m}`)
  }

  const handleToday = () => {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    setCurrentMonth(`${y}-${m}`)
  }

  return (
    <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border shadow-sm">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-slate-600 hover:text-slate-900"
        onClick={handlePrev}
        title="Mês anterior"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <div className="flex items-center gap-2 min-w-[170px] justify-center px-1">
        <Calendar className="h-4 w-4 text-emerald-600" />
        <span className="font-semibold text-slate-800 capitalize text-sm">{monthLabel}</span>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-slate-600 hover:text-slate-900"
        onClick={handleNext}
        title="Próximo mês"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>

      <Button
        variant="secondary"
        size="sm"
        className="h-7 text-xs font-medium px-2.5 ml-1 text-slate-700 hover:bg-slate-200"
        onClick={handleToday}
      >
        Hoje
      </Button>
    </div>
  )
}

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
    <div className="flex items-center gap-1.5 bg-[#192134] px-2.5 py-1.5 rounded-xl border border-white/10 shadow-sm">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-[#B6C2D4] hover:text-[#F8FAFC] hover:bg-[#202A40] rounded-lg"
        onClick={handlePrev}
        title="Mês anterior"
        aria-label="Mês anterior"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <div className="flex items-center gap-2 min-w-[170px] justify-center px-1">
        <Calendar className="h-4 w-4 text-blue-400" />
        <span className="font-semibold text-[#F8FAFC] capitalize text-sm">{monthLabel}</span>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-[#B6C2D4] hover:text-[#F8FAFC] hover:bg-[#202A40] rounded-lg"
        onClick={handleNext}
        title="Próximo mês"
        aria-label="Próximo mês"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>

      <Button
        variant="secondary"
        size="sm"
        className="h-7 text-xs font-medium px-2.5 ml-1 text-[#B6C2D4] hover:text-[#F8FAFC] bg-[#202A40] hover:bg-[#202A40]/80 border border-white/5 rounded-lg"
        onClick={handleToday}
      >
        Hoje
      </Button>
    </div>
  )
}

import React from 'react'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useFinance } from '@/context/FinanceContext'
import { cn } from '@/lib/utils'

interface MonthSelectorProps {
  className?: string
  onChange?: (newMonth: string) => void
}

export function MonthSelector({ className, onChange }: MonthSelectorProps) {
  const { currentMonth, setCurrentMonth } = useFinance()

  const MONTH_NAMES = [
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

  const [yearStr, monthStr] = currentMonth.split('-')
  const currentYear = parseInt(yearStr || '2025', 10)
  const currentMonthIdx = parseInt(monthStr || '1', 10) - 1

  const changeMonth = (delta: number) => {
    let newMonthIdx = currentMonthIdx + delta
    let newYear = currentYear

    if (newMonthIdx < 0) {
      newMonthIdx = 11
      newYear -= 1
    } else if (newMonthIdx > 11) {
      newMonthIdx = 0
      newYear += 1
    }

    const formattedMonth = `${newYear}-${String(newMonthIdx + 1).padStart(2, '0')}`
    setCurrentMonth(formattedMonth)
    onChange?.(formattedMonth)
  }

  const handleResetToCurrent = () => {
    const now = new Date()
    const formattedMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    setCurrentMonth(formattedMonth)
    onChange?.(formattedMonth)
  }

  const currentLabel = `${MONTH_NAMES[currentMonthIdx] || 'Mês'} de ${currentYear}`

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 bg-[#192134] border border-white/10 rounded-xl p-1 shadow-sm',
        className,
      )}
      role="group"
      aria-label="Controle de navegação por mês"
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={() => changeMonth(-1)}
        className="min-h-[44px] min-w-[44px] h-11 w-11 text-slate-300 hover:text-white hover:bg-[#202A40] rounded-lg cursor-pointer focus:ring-1 focus:ring-white"
        aria-label="Mês anterior"
        title="Mês anterior"
      >
        <ChevronLeft className="w-4 h-4" />
      </Button>

      <button
        type="button"
        onClick={handleResetToCurrent}
        className="px-2.5 sm:px-3 min-h-[44px] flex items-center gap-2 text-xs font-semibold text-white hover:text-blue-300 rounded-lg hover:bg-[#202A40] transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-white"
        title="Clique para voltar ao mês atual"
      >
        <Calendar className="w-3.5 h-3.5 text-blue-400 shrink-0" />
        <span className="capitalize whitespace-nowrap font-['Lexend'] text-[11px] sm:text-xs">
          {currentLabel}
        </span>
      </button>

      <Button
        variant="ghost"
        size="icon"
        onClick={() => changeMonth(1)}
        className="min-h-[44px] min-w-[44px] h-11 w-11 text-slate-300 hover:text-white hover:bg-[#202A40] rounded-lg cursor-pointer focus:ring-1 focus:ring-white"
        aria-label="Próximo mês"
        title="Próximo mês"
      >
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  )
}
export default MonthSelector

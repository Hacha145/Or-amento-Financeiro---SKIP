import React from 'react'
import { ChevronLeft, ChevronRight, CalendarRange } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface YearSelectorProps {
  year?: number
  currentYear?: number
  onChange?: (year: number) => void
  onChangeYear?: (year: number) => void
  availableYears?: number[]
  className?: string
}

export function YearSelector(props: YearSelectorProps) {
  const { availableYears, className } = props
  const year = props.year ?? props.currentYear ?? new Date().getFullYear()
  const onChange = props.onChange ?? props.onChangeYear ?? (() => {})

  const handlePrev = () => onChange(year - 1)
  const handleNext = () => onChange(year + 1)

  const isPrevDisabled = availableYears && !availableYears.includes(year - 1)
  const isNextDisabled = availableYears && !availableYears.includes(year + 1)

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 bg-[#192134] border border-white/10 rounded-xl p-1 shadow-sm',
        className,
      )}
      role="group"
      aria-label="Controle de navegação por ano"
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={handlePrev}
        disabled={isPrevDisabled}
        className="h-8 w-8 text-slate-300 hover:text-white hover:bg-[#202A40] rounded-lg disabled:opacity-30 cursor-pointer focus:ring-1 focus:ring-white"
        aria-label="Ano anterior"
        title="Ano anterior"
      >
        <ChevronLeft className="w-4 h-4" />
      </Button>

      <div className="px-3 py-1 flex items-center gap-2 text-xs font-semibold text-white">
        <CalendarRange className="w-3.5 h-3.5 text-blue-400" />
        <span className="font-['Lexend'] tabular-nums tracking-wide">{year}</span>
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={handleNext}
        disabled={isNextDisabled}
        className="h-8 w-8 text-slate-300 hover:text-white hover:bg-[#202A40] rounded-lg disabled:opacity-30 cursor-pointer focus:ring-1 focus:ring-white"
        aria-label="Próximo ano"
        title="Próximo ano"
      >
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  )
}

export default YearSelector

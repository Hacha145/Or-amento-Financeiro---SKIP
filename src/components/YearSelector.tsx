import React from 'react'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'

interface YearSelectorProps {
  currentYear: number
  onChangeYear: (year: number) => void
  availableYears?: number[]
}

export const YearSelector: React.FC<YearSelectorProps> = ({ currentYear, onChangeYear }) => {
  const handlePrev = () => {
    onChangeYear(currentYear - 1)
  }

  const handleNext = () => {
    onChangeYear(currentYear + 1)
  }

  const handleCurrentYear = () => {
    onChangeYear(new Date().getFullYear())
  }

  const isCurrentYear = currentYear === new Date().getFullYear()

  return (
    <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border shadow-xs">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-slate-600 hover:text-slate-900"
        onClick={handlePrev}
        title="Ano anterior"
        aria-label="Ano anterior"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <div className="flex items-center gap-2 min-w-[110px] justify-center px-1">
        <Calendar className="h-4 w-4 text-emerald-600" />
        <span className="font-semibold text-slate-800 text-sm">{currentYear}</span>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-slate-600 hover:text-slate-900"
        onClick={handleNext}
        title="Próximo ano"
        aria-label="Próximo ano"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>

      <Button
        variant={isCurrentYear ? 'outline' : 'secondary'}
        size="sm"
        className="h-7 text-xs font-medium px-2.5 ml-1 text-slate-700 hover:bg-slate-200"
        onClick={handleCurrentYear}
      >
        Ano Atual
      </Button>
    </div>
  )
}

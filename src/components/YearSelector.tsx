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
    <div className="flex items-center gap-1.5 bg-[#192134] px-2.5 py-1.5 rounded-xl border border-white/10 shadow-xs">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-[#B6C2D4] hover:text-[#F8FAFC] hover:bg-[#202A40] rounded-lg"
        onClick={handlePrev}
        title="Ano anterior"
        aria-label="Ano anterior"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <div className="flex items-center gap-2 min-w-[110px] justify-center px-1">
        <Calendar className="h-4 w-4 text-blue-400" />
        <span className="font-semibold text-[#F8FAFC] text-sm tabular-nums">{currentYear}</span>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-[#B6C2D4] hover:text-[#F8FAFC] hover:bg-[#202A40] rounded-lg"
        onClick={handleNext}
        title="Próximo ano"
        aria-label="Próximo ano"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>

      <Button
        variant={isCurrentYear ? 'outline' : 'secondary'}
        size="sm"
        className={`h-7 text-xs font-medium px-2.5 ml-1 rounded-lg border transition-colors ${
          isCurrentYear
            ? 'border-blue-500/40 text-blue-300 bg-blue-500/10'
            : 'border-white/5 text-[#B6C2D4] bg-[#202A40] hover:text-[#F8FAFC]'
        }`}
        onClick={handleCurrentYear}
      >
        Ano Atual
      </Button>
    </div>
  )
}

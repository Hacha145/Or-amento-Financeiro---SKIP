import React from 'react'
import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: React.ReactNode
  subtext?: React.ReactNode
  icon?: LucideIcon
  iconColor?: string
  trend?: {
    value: string
    isPositive?: boolean
    neutral?: boolean
  }
  className?: string
}

export function StatCard({
  label,
  value,
  subtext,
  icon: Icon,
  iconColor = 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  trend,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'relative bg-[#192134] rounded-xl p-5 border border-white/10 shadow-sm card-hover-lift flex flex-col justify-between overflow-hidden',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          {label}
        </span>
        {Icon && (
          <div
            className={cn(
              'w-8 h-8 rounded-lg border flex items-center justify-center shrink-0',
              iconColor,
            )}
          >
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>

      <div className="space-y-1">
        <div className="text-2xl font-bold text-white tabular-nums tracking-tight font-['Lexend']">
          {value}
        </div>
        {(subtext || trend) && (
          <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
            {trend && (
              <span
                className={cn(
                  'font-semibold px-1.5 py-0.5 rounded text-[10px]',
                  trend.neutral
                    ? 'bg-slate-800 text-slate-300'
                    : trend.isPositive
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
                )}
              >
                {trend.value}
              </span>
            )}
            {subtext && <span className="truncate">{subtext}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

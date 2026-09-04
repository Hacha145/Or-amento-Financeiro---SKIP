import React from 'react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  description?: React.ReactNode
  badge?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

export function PageHeader({ title, description, badge, action, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-white/5',
        className,
      )}
    >
      <div className="space-y-1 min-w-0">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-['Lexend']">
            {title}
          </h1>
          {badge}
        </div>
        {description && (
          <p className="text-xs sm:text-sm text-slate-400 max-w-2xl leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {action && (
        <div className="flex items-center gap-2 shrink-0 self-stretch sm:self-auto">{action}</div>
      )}
    </header>
  )
}

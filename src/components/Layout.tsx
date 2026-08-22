import React, { useState } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  ArrowLeftRight,
  UploadCloud,
  Target,
  Tag,
  Settings,
  Plus,
  Menu,
  X,
  Wallet,
  ShieldCheck,
  AlertCircle,
  Layers,
  CalendarClock,
  ListChecks,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useFinance } from '@/context/FinanceContext'
import { NewTransactionDialog } from './NewTransactionDialog'

const navItems = [
  { to: '/', label: 'Início', icon: LayoutDashboard },
  { to: '/transacoes', label: 'Transações', icon: ArrowLeftRight, badgeKey: 'pending' },
  { to: '/importar', label: 'Importar', icon: UploadCloud },
  { to: '/orcamento', label: 'Orçamento', icon: Target },
  { to: '/categorias', label: 'Categorias', icon: Tag },
  { to: '/hierarquia', label: 'Hierarquia', icon: Layers },
  { to: '/regras', label: 'Regras', icon: ListChecks },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
]

/** Format an ISO date (YYYY-MM-DD) as DD/MM/YYYY (pt-BR). */
function formatBRDate(iso?: string | null): string | null {
  if (!iso) return null
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return null
  return `${d}/${m}/${y}`
}

export default function Layout() {
  const { monthlyStats, settings, dataUpdatedAt } = useFinance()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [newTxOpen, setNewTxOpen] = useState(false)

  // If setup not completed and not on onboarding, we handle via onboarding route or let user explore
  const pendingCount = monthlyStats.pendingReviewCount
  const updatedAtBR = formatBRDate(dataUpdatedAt)

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row text-slate-900 font-sans">
      {/* Desktop Sidebar (≥1024px) */}
      <aside className="hidden lg:flex flex-col w-[248px] bg-[#FBFBFA] border-r border-slate-200/80 p-4 shrink-0 justify-between sticky top-0 h-screen z-30">
        <div>
          {/* Logo & Brand */}
          <div className="flex items-center gap-3 px-2 py-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center shadow-md shadow-emerald-600/20 text-white">
              <Wallet className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h1 className="font-bold text-base leading-tight tracking-tight text-slate-900">
                Orçamento
              </h1>
              <p className="text-xs text-emerald-700 font-semibold tracking-wide">
                Pessoal &middot; Offline
              </p>
            </div>
          </div>

          {/* "Dados atualizados até" indicator */}
          {updatedAtBR && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="mb-4 flex items-center gap-2 text-[11px] text-slate-500 bg-slate-100/80 rounded-md px-2.5 py-1.5 cursor-help">
                    <CalendarClock className="w-3.5 h-3.5 text-emerald-600" />
                    <span>
                      Dados atualizados até:{' '}
                      <strong className="text-slate-700 font-semibold">{updatedAtBR}</strong>
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Data da transação mais recente registrada.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* New Transaction Button */}
          <Button
            onClick={() => setNewTxOpen(true)}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm mb-6 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Novo Lançamento
          </Button>

          {/* Navigation Links */}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive =
                item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-emerald-50 text-emerald-800 font-semibold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      className={`w-4 h-4 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`}
                    />
                    <span>{item.label}</span>
                  </div>

                  {item.badgeKey === 'pending' && pendingCount > 0 && (
                    <Badge
                      variant="outline"
                      className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] px-1.5 py-0 h-5"
                    >
                      {pendingCount}
                    </Badge>
                  )}
                </NavLink>
              )
            })}
          </nav>
        </div>

        {/* Local Storage Privacy Reminder */}
        <div className="bg-emerald-50/60 border border-emerald-100 p-3 rounded-xl">
          <div className="flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-semibold text-emerald-950">Dados seguros</p>
              <p className="text-slate-600 text-[11px] leading-relaxed mt-0.5">
                Seus dados ficam 100% gravados neste navegador.
              </p>
              <button
                onClick={() => navigate('/configuracoes')}
                className="text-[11px] text-emerald-700 font-medium hover:underline mt-1.5 inline-block"
              >
                Fazer backup &rarr;
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Top Header for Mobile & Tablet (<1024px) */}
      <header className="lg:hidden sticky top-0 z-40 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2">
          {/* Tablet Drawer Button */}
          <Sheet open={mobileDrawerOpen} onOpenChange={setMobileDrawerOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Menu className="h-5 w-5 text-slate-700" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3 px-2 py-3 mb-6 border-b pb-4">
                  <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center text-white">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-bold text-base text-slate-900">Orçamento Pessoal</h2>
                    <p className="text-xs text-emerald-700 font-medium">Controle Offline</p>
                  </div>
                </div>

                <nav className="space-y-1">
                  {navItems.map((item) => {
                    const Icon = item.icon
                    const isActive =
                      item.to === '/'
                        ? location.pathname === '/'
                        : location.pathname.startsWith(item.to)
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => setMobileDrawerOpen(false)}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-emerald-50 text-emerald-800 font-semibold'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Icon
                            className={`w-4 h-4 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`}
                          />
                          <span>{item.label}</span>
                        </div>
                        {item.badgeKey === 'pending' && pendingCount > 0 && (
                          <Badge
                            variant="outline"
                            className="bg-amber-100 text-amber-800 border-amber-300 text-xs"
                          >
                            {pendingCount}
                          </Badge>
                        )}
                      </NavLink>
                    )
                  })}
                </nav>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border text-xs text-slate-600">
                <p className="font-medium text-slate-900 mb-1">Armazenamento Local</p>
                Lembre-se de exportar seu backup periodicamente em Configurações.
              </div>
            </SheetContent>
          </Sheet>

          {/* Mobile Logo */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center text-white">
              <Wallet className="w-4 h-4" />
            </div>
            <span className="font-bold text-sm tracking-tight text-slate-900">Orçamento</span>
          </div>
        </div>

        {/* Action Button */}
        <Button
          size="sm"
          onClick={() => setNewTxOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 px-3 gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Lançamento</span>
        </Button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 pb-20 sm:pb-8">
        <div className="w-full max-w-[1280px] mx-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>

      {/* Mobile Bottom Navigation (<640px) */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 z-40 px-2 py-1.5 flex items-center justify-around shadow-lg">
        {[
          { to: '/', label: 'Início', icon: LayoutDashboard },
          { to: '/transacoes', label: 'Transações', icon: ArrowLeftRight, badge: pendingCount },
          { to: '/importar', label: 'Importar', icon: UploadCloud },
          { to: '/orcamento', label: 'Orçamento', icon: Target },
          { to: '/configuracoes', label: 'Config', icon: Settings },
        ].map((item) => {
          const Icon = item.icon
          const isActive =
            item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)

          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`flex flex-col items-center justify-center py-1 px-2 rounded-md relative text-[11px] font-medium transition-colors ${
                isActive ? 'text-emerald-700 font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <div className="relative">
                <Icon
                  className={`w-5 h-5 ${isActive ? 'text-emerald-600 stroke-[2.2]' : 'text-slate-400'}`}
                />
                {item.badge && item.badge > 0 ? (
                  <span className="absolute -top-1 -right-2 bg-amber-500 text-white rounded-full text-[9px] w-4 h-4 flex items-center justify-center font-bold">
                    {item.badge}
                  </span>
                ) : null}
              </div>
              <span className="mt-0.5">{item.label}</span>
              {isActive && <span className="w-1 h-1 bg-emerald-600 rounded-full mt-0.5" />}
            </NavLink>
          )
        })}
      </nav>

      {/* New Transaction Global Modal */}
      <NewTransactionDialog open={newTxOpen} onOpenChange={setNewTxOpen} />
    </div>
  )
}

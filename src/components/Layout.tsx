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
    <div className="min-h-screen bg-[#0F172A] flex flex-col lg:flex-row text-[#F8FAFC] font-sans selection:bg-blue-600 selection:text-white">
      {/* Desktop Sidebar (≥1024px) */}
      <aside className="hidden lg:flex flex-col w-[260px] bg-[#09101F] border-r border-white/10 p-4 shrink-0 justify-between sticky top-0 h-screen z-30">
        <div>
          {/* Logo & Brand */}
          <div className="flex items-center gap-3 px-2 py-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/25 text-white">
              <Wallet className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h1 className="font-bold text-base leading-tight tracking-tight text-[#F8FAFC]">
                Orçamento Pessoal
              </h1>
              <p className="text-[11px] text-emerald-400 font-semibold tracking-wider uppercase mt-0.5">
                Controle Offline
              </p>
            </div>
          </div>

          {/* "Dados atualizados até" indicator */}
          {updatedAtBR && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="mb-4 flex items-center gap-2 text-[11px] text-[#B6C2D4] bg-[#192134] border border-white/5 rounded-lg px-2.5 py-1.5 cursor-help">
                    <CalendarClock className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span className="truncate">
                      Dados atualizados até:{' '}
                      <strong className="text-[#F8FAFC] font-semibold">{updatedAtBR}</strong>
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="bg-[#192134] text-[#F8FAFC] border border-white/10">
                  <p>Data da transação mais recente registrada.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* New Transaction Button */}
          <Button
            onClick={() => setNewTxOpen(true)}
            className="w-full h-11 bg-[#047857] hover:bg-[#059669] text-white font-medium rounded-xl shadow-sm mb-5 flex items-center justify-center gap-2 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Novo Lançamento</span>
          </Button>

          {/* Navigation Links */}
          <nav className="space-y-1" aria-label="Navegação principal">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive =
                item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-600/20 text-[#93C5FD] font-semibold border border-blue-500/30'
                      : 'text-[#B6C2D4] hover:text-[#F8FAFC] hover:bg-[#202A40]/70'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-[#94A3B8]'}`} />
                    <span>{item.label}</span>
                  </div>

                  {item.badgeKey === 'pending' && pendingCount > 0 && (
                    <Badge
                      variant="outline"
                      className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-[10px] px-2 py-0.5 h-5 rounded-full font-bold"
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
        <div className="bg-[#101A34] border border-white/5 p-3.5 rounded-xl">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-semibold text-[#F8FAFC]">Dados seguros</p>
              <p className="text-[#B6C2D4] text-[11px] leading-relaxed mt-0.5">
                Seus dados ficam 100% gravados neste navegador.
              </p>
              <button
                type="button"
                onClick={() => navigate('/configuracoes')}
                className="text-[11px] text-blue-400 hover:text-blue-300 font-medium hover:underline mt-1.5 inline-block cursor-pointer"
              >
                Fazer backup &rarr;
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Top Header for Mobile & Tablet (<1024px) */}
      <header className="lg:hidden sticky top-0 z-40 bg-[#09101F]/95 backdrop-blur-md border-b border-white/10 px-4 py-3 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2">
          {/* Tablet Drawer Button */}
          <Sheet open={mobileDrawerOpen} onOpenChange={setMobileDrawerOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 text-[#B6C2D4] hover:text-[#F8FAFC] hover:bg-[#202A40] rounded-xl"
                aria-label="Abrir menu de navegação"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-[280px] p-4 flex flex-col justify-between bg-[#09101F] text-[#F8FAFC] border-r border-white/10"
            >
              <div>
                <div className="flex items-center gap-3 px-2 py-3 mb-6 border-b border-white/10 pb-4">
                  <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-600/30">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-bold text-base text-[#F8FAFC]">Orçamento Pessoal</h2>
                    <p className="text-xs text-emerald-400 font-semibold tracking-wider uppercase">
                      Controle Offline
                    </p>
                  </div>
                </div>

                <nav className="space-y-1" aria-label="Navegação móvel">
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
                        aria-current={isActive ? 'page' : undefined}
                        onClick={() => setMobileDrawerOpen(false)}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-blue-600/20 text-[#93C5FD] font-semibold border border-blue-500/30'
                            : 'text-[#B6C2D4] hover:text-[#F8FAFC] hover:bg-[#202A40]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Icon
                            className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-[#94A3B8]'}`}
                          />
                          <span>{item.label}</span>
                        </div>
                        {item.badgeKey === 'pending' && pendingCount > 0 && (
                          <Badge
                            variant="outline"
                            className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-xs px-2 py-0.5 rounded-full font-bold"
                          >
                            {pendingCount}
                          </Badge>
                        )}
                      </NavLink>
                    )
                  })}
                </nav>
              </div>

              <div className="bg-[#101A34] p-3 rounded-xl border border-white/5 text-xs text-[#B6C2D4]">
                <p className="font-medium text-[#F8FAFC] mb-1">Armazenamento Local</p>
                Lembre-se de exportar seu backup periodicamente em Configurações.
              </div>
            </SheetContent>
          </Sheet>

          {/* Mobile Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-600/30">
              <Wallet className="w-4 h-4" />
            </div>
            <span className="font-bold text-sm tracking-tight text-[#F8FAFC]">
              Orçamento Pessoal
            </span>
          </div>
        </div>

        {/* Action Button */}
        <Button
          size="sm"
          onClick={() => setNewTxOpen(true)}
          className="bg-[#047857] hover:bg-[#059669] text-white text-xs h-9 px-3 gap-1.5 rounded-xl font-medium shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Lançamento</span>
        </Button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 pb-24 sm:pb-8 bg-[#0F172A]">
        <div className="w-full max-w-[1360px] mx-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>

      {/* Mobile Bottom Navigation (<640px) */}
      <nav
        aria-label="Navegação inferior"
        className="sm:hidden fixed bottom-0 left-0 right-0 bg-[#09101F]/95 backdrop-blur-md border-t border-white/10 z-40 px-2 py-1.5 flex items-center justify-around shadow-xl"
      >
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
              aria-current={isActive ? 'page' : undefined}
              className={`flex flex-col items-center justify-center min-h-[44px] min-w-[48px] py-1 px-2 rounded-lg relative text-[11px] font-medium transition-colors ${
                isActive ? 'text-blue-400 font-bold' : 'text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              <div className="relative">
                <Icon
                  className={`w-5 h-5 ${isActive ? 'text-blue-400 stroke-[2.2]' : 'text-[#94A3B8]'}`}
                />
                {item.badge && item.badge > 0 ? (
                  <span className="absolute -top-1 -right-2 bg-amber-500 text-slate-950 rounded-full text-[9px] w-4 h-4 flex items-center justify-center font-bold">
                    {item.badge}
                  </span>
                ) : null}
              </div>
              <span className="mt-0.5">{item.label}</span>
              {isActive && <span className="w-1.5 h-1.5 bg-blue-400 rounded-full mt-0.5" />}
            </NavLink>
          )
        })}
      </nav>

      {/* New Transaction Global Modal */}
      <NewTransactionDialog open={newTxOpen} onOpenChange={setNewTxOpen} />
    </div>
  )
}

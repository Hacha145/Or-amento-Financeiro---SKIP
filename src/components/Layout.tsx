import React, { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Receipt,
  Upload,
  PieChart,
  Tag,
  Layers,
  ListChecks,
  Settings,
  Plus,
  HelpCircle,
  Menu,
  X,
  Wallet,
  ShieldCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { NewTransactionDialog } from '@/components/NewTransactionDialog'
import { useFinance } from '@/context/FinanceContext'
import { cn } from '@/lib/utils'

import { Outlet } from 'react-router-dom'

interface LayoutProps {
  children?: React.ReactNode
}

interface NavItem {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badge?: number | string
  badgeVariant?: 'default' | 'destructive' | 'outline' | 'secondary'
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const { monthlyStats, currentMonth } = useFinance()
  const reviewQueueCount = monthlyStats?.pendingReviewCount ?? 0
  const [isNewTxOpen, setIsNewTxOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Primary navigation (desktop sidebar + mobile drawer)
  const navItems: NavItem[] = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    {
      name: 'Transações',
      href: '/transacoes',
      icon: Receipt,
      badge: reviewQueueCount > 0 ? `${reviewQueueCount} rev` : undefined,
      badgeVariant: reviewQueueCount > 0 ? 'destructive' : undefined,
    },
    { name: 'Importar', href: '/importar', icon: Upload },
    { name: 'Orçamento', href: '/orcamento', icon: PieChart },
    { name: 'Categorias', href: '/categorias', icon: Tag },
    { name: 'Hierarquia', href: '/hierarquia', icon: Layers },
    { name: 'Regras', href: '/regras', icon: ListChecks },
    { name: 'Configurações', href: '/configuracoes', icon: Settings },
  ]

  // SKILL rule 9: Mobile bottom nav MUST have <= 5 items
  const mobileBottomNav: NavItem[] = [
    { name: 'Início', href: '/', icon: LayoutDashboard },
    {
      name: 'Transações',
      href: '/transacoes',
      icon: Receipt,
      badge: reviewQueueCount > 0 ? reviewQueueCount : undefined,
    },
    { name: 'Importar', href: '/importar', icon: Upload },
    { name: 'Orçamento', href: '/orcamento', icon: PieChart },
    { name: 'Menu', href: '#menu', icon: Menu },
  ]

  const formatMonthBadge = (isoMonth: string) => {
    if (!isoMonth) return ''
    const [y, m] = isoMonth.split('-')
    const months = [
      'Jan',
      'Fev',
      'Mar',
      'Abr',
      'Mai',
      'Jun',
      'Jul',
      'Ago',
      'Set',
      'Out',
      'Nov',
      'Dez',
    ]
    const idx = parseInt(m, 10) - 1
    return `${months[idx] || m} ${y}`
  }

  const isCurrentPage = (href: string) => {
    if (href === '/') return location.pathname === '/'
    return location.pathname.startsWith(href)
  }

  return (
    <div className="min-h-screen bg-[#0F172A] text-white flex flex-col antialiased selection:bg-[#1E40AF] selection:text-white">
      {/* SKIP NAVIGATION LINK (Accessibility Priority 1) */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 z-50 bg-[#1E40AF] text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-lg focus:outline-none focus:ring-2 focus:ring-white"
      >
        Pular para o conteúdo principal
      </a>

      {/* DESKTOP APP SHELL (Sidebar + Main Content) */}
      <div className="flex-1 flex w-full">
        {/* DESKTOP SIDEBAR */}
        <aside
          className="hidden md:flex w-64 flex-col fixed inset-y-0 left-0 z-30 glass-sidebar"
          aria-label="Navegação lateral"
        >
          {/* Brand header */}
          <div className="h-16 flex items-center justify-between px-6 border-b border-white/5">
            <NavLink
              to="/"
              className="flex items-center gap-3 group focus:outline-none focus:ring-2 focus:ring-[#1E40AF] rounded-lg p-1"
              aria-label="Orçamento Pessoal - Ir para Dashboard"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1E40AF] to-[#3B82F6] flex items-center justify-center shadow-md shadow-[#1E40AF]/25 group-hover:scale-105 transition-transform">
                <Wallet className="w-5 h-5 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="font-['Lexend'] font-bold text-sm tracking-tight text-white leading-tight">
                  Orçamento Pessoal
                </span>
                <span className="text-[10px] text-slate-400 font-medium">Finanças offline</span>
              </div>
            </NavLink>
          </div>

          {/* Quick Action: New Transaction CTA */}
          <div className="p-4 pb-2">
            <Button
              onClick={() => setIsNewTxOpen(true)}
              className="w-full bg-[#059669] hover:bg-[#059669]/90 text-white font-semibold text-xs h-11 rounded-lg gap-2 shadow-sm transition-all hover:-translate-y-0.5 cursor-pointer focus:ring-2 focus:ring-white focus:outline-none"
              aria-label="Novo Lançamento"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Lançamento</span>
            </Button>
          </div>

          {/* Nav items list */}
          <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto" aria-label="Menu principal">
            {navItems.map((item) => {
              const Icon = item.icon
              const active = isCurrentPage(item.href)

              return (
                <NavLink
                  key={item.href}
                  to={item.href}
                  className={cn(
                    'flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-medium transition-all group cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#1E40AF]',
                    active
                      ? 'bg-[#1E40AF]/20 text-white font-semibold border border-[#1E40AF]/40 shadow-xs'
                      : 'text-slate-300 hover:text-white hover:bg-[#192134]/70 border border-transparent',
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon
                      className={cn(
                        'w-4 h-4 shrink-0 transition-colors',
                        active ? 'text-[#3B82F6]' : 'text-slate-400 group-hover:text-slate-200',
                      )}
                    />
                    <span className="truncate">{item.name}</span>
                  </div>

                  {item.badge && (
                    <Badge
                      variant={item.badgeVariant || 'outline'}
                      className={cn(
                        'text-[10px] px-1.5 py-0 h-5 font-semibold shrink-0 ml-2',
                        item.badgeVariant === 'destructive'
                          ? 'bg-[#DC2626]/20 text-red-300 border-[#DC2626]/40'
                          : 'bg-[#101A34] text-slate-300 border-white/10',
                      )}
                    >
                      {item.badge}
                    </Badge>
                  )}
                </NavLink>
              )
            })}
          </nav>

          {/* Footer of desktop sidebar */}
          <div className="p-4 border-t border-white/5 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Dados 100% locais
              </span>
              <span className="font-mono text-[10px] text-slate-400 bg-[#101A34] px-1.5 py-0.5 rounded border border-white/5">
                {formatMonthBadge(currentMonth)}
              </span>
            </div>
            <NavLink
              to="/boas-vindas"
              className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 px-2 py-1.5 rounded-lg hover:bg-[#192134] transition-colors cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Guia &amp; Template</span>
            </NavLink>
          </div>
        </aside>

        {/* MAIN COLUMN (Header + Page Content) */}
        <div className="flex-1 flex flex-col md:pl-64 min-w-0">
          {/* TOP HEADER (Sticky, functional glassmorphism) */}
          <header className="sticky top-0 z-20 h-16 glass-header flex items-center justify-between px-4 sm:px-6">
            <div className="flex items-center gap-3 min-w-0">
              {/* Mobile menu hamburger button */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 rounded-lg text-slate-300 hover:text-white hover:bg-[#192134] focus:outline-none focus:ring-2 focus:ring-[#1E40AF] cursor-pointer"
                aria-label="Abrir menu de navegação"
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>

              {/* Brand on mobile */}
              <div className="flex items-center gap-2 md:hidden">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#1E40AF] to-[#3B82F6] flex items-center justify-center">
                  <Wallet className="w-4 h-4 text-white" />
                </div>
                <span className="font-['Lexend'] font-bold text-sm tracking-tight text-white truncate">
                  Orçamento Pessoal
                </span>
              </div>

              {/* Desktop breadcrumb / current section */}
              <div className="hidden md:flex items-center gap-2 text-xs text-slate-400">
                <span>App</span>
                <span>/</span>
                <span className="text-white font-medium">
                  {navItems.find((i) => isCurrentPage(i.href))?.name || 'Visão Geral'}
                </span>
              </div>
            </div>

            {/* Header Right Actions */}
            <div className="flex items-center gap-2 sm:gap-3">
              {reviewQueueCount > 0 && (
                <NavLink
                  to="/transacoes?filtro=revisao"
                  className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#DC2626]/20 text-red-300 border border-[#DC2626]/30 hover:bg-[#DC2626]/30 transition-colors cursor-pointer"
                  title="Transações que exigem revisão"
                >
                  <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                  <span>{reviewQueueCount} pendentes</span>
                </NavLink>
              )}

              {/* Quick transaction button for tablet/mobile */}
              <Button
                size="sm"
                onClick={() => setIsNewTxOpen(true)}
                className="bg-[#059669] hover:bg-[#059669]/90 text-white font-semibold text-xs h-9 px-3 sm:px-4 rounded-lg gap-1.5 shadow-sm transition-transform hover:-translate-y-0.5 cursor-pointer focus:ring-2 focus:ring-white focus:outline-none"
                aria-label="Adicionar lançamento"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Lançamento</span>
              </Button>
            </div>
          </header>

          {/* MAIN CONTENT AREA */}
          <main
            id="main-content"
            className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto pb-24 md:pb-12"
            tabIndex={-1}
          >
            {children ?? <Outlet />}
          </main>
        </div>
      </div>

      {/* MOBILE DRAWER / OVERLAY MENU */}
      {mobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 glass-modal-overlay flex"
          role="dialog"
          aria-modal="true"
          aria-label="Menu de navegação mobile"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="w-4/5 max-w-xs bg-[#0F172A] border-r border-white/10 h-full p-5 flex flex-col justify-between shadow-2xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#1E40AF] to-[#3B82F6] flex items-center justify-center">
                    <Wallet className="w-4 h-4 text-white" />
                  </div>
                  <span className="font-['Lexend'] font-bold text-sm text-white">
                    Orçamento Pessoal
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#192134] cursor-pointer"
                  aria-label="Fechar menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav className="space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon
                  const active = isCurrentPage(item.href)

                  return (
                    <NavLink
                      key={item.href}
                      to={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        'flex items-center justify-between px-3.5 py-3 rounded-lg text-sm font-medium transition-colors cursor-pointer',
                        active
                          ? 'bg-[#1E40AF]/20 text-white font-semibold border border-[#1E40AF]/40'
                          : 'text-slate-300 hover:text-white hover:bg-[#192134]',
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Icon
                          className={cn('w-4 h-4', active ? 'text-[#3B82F6]' : 'text-slate-400')}
                        />
                        <span>{item.name}</span>
                      </div>
                      {item.badge && (
                        <Badge
                          variant={item.badgeVariant || 'outline'}
                          className="text-[10px] px-1.5 py-0 h-5"
                        >
                          {item.badge}
                        </Badge>
                      )}
                    </NavLink>
                  )
                })}
              </nav>
            </div>

            <div className="pt-4 border-t border-white/10 text-xs text-slate-400 space-y-2">
              <NavLink
                to="/boas-vindas"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 text-slate-300 hover:text-white py-2"
              >
                <HelpCircle className="w-4 h-4" />
                <span>Boas-vindas &amp; Guia</span>
              </NavLink>
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Armazenamento 100% local no navegador
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MOBILE BOTTOM NAVIGATION (SKILL Rule 9: <= 5 items, touch target >= 44x44px) */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 h-16 glass-header border-t border-white/10 flex items-center justify-around px-2"
        aria-label="Navegação móvel inferior"
      >
        {mobileBottomNav.map((item) => {
          const Icon = item.icon
          const isMenuTrigger = item.href === '#menu'
          const active = !isMenuTrigger && isCurrentPage(item.href)

          if (isMenuTrigger) {
            return (
              <button
                key="menu-trigger"
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="flex flex-col items-center justify-center min-w-[56px] min-h-[44px] py-1 px-2 text-[10px] font-medium text-slate-400 hover:text-white transition-colors cursor-pointer"
                aria-label="Mais opções de menu"
              >
                <Icon className="w-5 h-5 mb-0.5" />
                <span>{item.name}</span>
              </button>
            )
          }

          return (
            <NavLink
              key={item.href}
              to={item.href}
              className={cn(
                'relative flex flex-col items-center justify-center min-w-[56px] min-h-[44px] py-1 px-2 text-[10px] font-medium transition-colors cursor-pointer',
                active ? 'text-[#3B82F6] font-semibold' : 'text-slate-400 hover:text-slate-200',
              )}
            >
              <Icon className="w-5 h-5 mb-0.5" />
              <span>{item.name}</span>
              {item.badge !== undefined && (
                <span className="absolute top-1 right-2 w-4 h-4 rounded-full bg-[#DC2626] text-white text-[9px] font-bold flex items-center justify-center">
                  {item.badge}
                </span>
              )}
            </NavLink>
          )
        })}
      </nav>

      {/* NEW TRANSACTION DIALOG (Global access) */}
      <NewTransactionDialog open={isNewTxOpen} onOpenChange={setIsNewTxOpen} />
    </div>
  )
}

export default Layout

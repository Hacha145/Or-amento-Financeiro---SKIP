/* Main App Component - Handles routing (using react-router-dom), query client and other providers */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FinanceProvider, useFinance } from '@/context/FinanceContext'
import Layout from './components/Layout'

// Pages
import Index from './pages/Index'
import Transactions from './pages/Transactions'
import ImportBank from './pages/Import'
import Budget from './pages/Budget'
import Categories from './pages/Categories'
import Settings from './pages/Settings'
import Welcome from './pages/Welcome'
import NotFound from './pages/NotFound'

// Onboarding gate guard wrapper
function AppRoutes() {
  const { settings, transactions } = useFinance()

  // Only redirect to onboarding on root "/" if setup has not been completed AND there are no transactions
  const shouldShowOnboarding = !settings.setupCompleted && transactions.length === 0

  return (
    <Routes>
      <Route path="/boas-vindas" element={<Welcome />} />

      <Route element={<Layout />}>
        <Route
          path="/"
          element={shouldShowOnboarding ? <Navigate to="/boas-vindas" replace /> : <Index />}
        />
        <Route path="/transacoes" element={<Transactions />} />
        <Route path="/importar" element={<ImportBank />} />
        <Route path="/orcamento" element={<Budget />} />
        <Route path="/categorias" element={<Categories />} />
        <Route path="/configuracoes" element={<Settings />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

const App = () => (
  <BrowserRouter>
    <TooltipProvider>
      <FinanceProvider>
        <Toaster />
        <Sonner />
        <AppRoutes />
      </FinanceProvider>
    </TooltipProvider>
  </BrowserRouter>
)

export default App

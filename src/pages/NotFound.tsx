/* 404 Page - Displays when a user attempts to access a non-existent route - translate to the language of the user */
import { useLocation } from 'react-router-dom'
import { useEffect } from 'react'

const NotFound = () => {
  const location = useLocation()

  useEffect(() => {
    console.error('404 Error: User attempted to access non-existent route:', location.pathname)
  }, [location.pathname])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F172A] text-[#F8FAFC] p-4">
      <div className="text-center max-w-md bg-[#192134] border border-white/10 rounded-2xl p-8 shadow-xl">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 text-2xl font-bold">
          404
        </div>
        <h1 className="text-2xl font-bold mb-2 text-[#F8FAFC]">Página não encontrada</h1>
        <p className="text-sm text-[#B6C2D4] mb-6">
          A rota que você tentou acessar não existe ou foi movida.
        </p>
        <a
          href="/"
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors shadow-sm focus:outline-hidden focus:ring-2 focus:ring-blue-400"
        >
          Voltar ao Início
        </a>
      </div>
    </div>
  )
}

export default NotFound

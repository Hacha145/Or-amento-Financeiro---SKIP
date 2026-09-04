/* 404 Page - Displays when a user attempts to access a non-existent route - translate to the language of the user */
import { useLocation } from 'react-router-dom'
import { useEffect } from 'react'

const NotFound = () => {
  const location = useLocation()

  useEffect(() => {
    console.error('404 Error: User attempted to access non-existent route:', location.pathname)
  }, [location.pathname])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F172A] p-4 text-white">
      <div className="max-w-md w-full text-center bg-[#192134] border border-white/10 rounded-2xl p-8 shadow-xl">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#1E40AF]/20 text-[#3B82F6] flex items-center justify-center font-bold text-2xl border border-[#1E40AF]/30 font-['Lexend']">
          404
        </div>
        <h1 className="text-2xl font-bold mb-2 text-white font-['Lexend']">
          Página não encontrada
        </h1>
        <p className="text-sm text-slate-400 mb-6">
          A rota que você tentou acessar não existe ou foi movida.
        </p>
        <a
          href="/"
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-[#059669] hover:bg-[#059669]/90 text-white font-semibold text-sm transition-transform hover:-translate-y-0.5 shadow-sm focus:outline-none focus:ring-2 focus:ring-white cursor-pointer"
        >
          Voltar ao Início
        </a>
      </div>
    </div>
  )
}

export default NotFound

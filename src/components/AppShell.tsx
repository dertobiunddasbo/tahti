import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

function navClass({ isActive }: { isActive: boolean }) {
  return [
    'rounded-lg px-3 py-1.5 text-sm font-medium transition',
    isActive ? 'bg-accent-50 text-accent-700' : 'text-slate-500 hover:text-slate-900',
  ].join(' ')
}

export default function AppShell({ children }: { children: ReactNode }) {
  const { person, isPlaner, signOut } = useAuth()

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur print:hidden">
        <div className="flex items-center gap-4">
          <span className="text-base font-semibold tracking-tight">liiku</span>
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={navClass}>
              Meine Schichten
            </NavLink>
            {isPlaner && (
              <NavLink to="/dispo" className={navClass}>
                Dispo
              </NavLink>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-slate-400 sm:inline">{person?.name}</span>
          <button
            onClick={signOut}
            className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:text-slate-900"
          >
            Abmelden
          </button>
        </div>
      </header>
      <main className="flex-1 px-4 py-6">{children}</main>
    </div>
  )
}

import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useProductions } from '../productions/ProductionProvider'
import { useTheme } from '../lib/theme'

function navClass({ isActive }: { isActive: boolean }) {
  return [
    'rounded-lg px-2.5 py-1 font-mono text-xs uppercase tracking-wide transition',
    isActive ? 'bg-accent/15 text-accent-strong' : 'text-muted hover:text-ink',
  ].join(' ')
}

export default function AppShell({ children }: { children: ReactNode }) {
  const { isPlaner, signOut } = useAuth()
  const { productions, selectedId, setSelectedId } = useProductions()
  const { dark, toggle } = useTheme()

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col">
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface/90 px-4 py-3 backdrop-blur print:hidden">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 font-mono text-base font-bold tracking-tight">
            tahti
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
          </span>
          <nav className="flex flex-wrap items-center gap-1">
            <NavLink to="/" end className={navClass}>
              Schichten
            </NavLink>
            {isPlaner && (
              <NavLink to="/produktionen" className={navClass}>
                Produktionen
              </NavLink>
            )}
            {isPlaner && (
              <NavLink to="/setup" className={navClass}>
                Setup
              </NavLink>
            )}
            {isPlaner && (
              <NavLink to="/crew" className={navClass}>
                Crew
              </NavLink>
            )}
            {isPlaner && (
              <NavLink to="/dispo" className={navClass}>
                Dispo
              </NavLink>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          {isPlaner && productions.length > 0 && (
            <select
              value={selectedId ?? ''}
              onChange={(e) => setSelectedId(e.target.value)}
              className="max-w-[170px] rounded-lg border border-line bg-elevated px-2 py-1 font-mono text-xs text-ink"
              title="Aktive Produktion"
            >
              {productions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={toggle}
            className="rounded-lg border border-line px-2 py-1 text-sm text-muted transition hover:text-ink"
            title={dark ? 'Light Mode' : 'Dark Mode'}
            aria-label="Theme umschalten"
          >
            {dark ? '☀' : '☾'}
          </button>
          <button
            onClick={signOut}
            className="rounded-lg px-2 py-1 font-mono text-xs uppercase tracking-wide text-muted transition hover:text-ink"
          >
            Abmelden
          </button>
        </div>
      </header>
      <main className="flex-1 px-4 py-6">{children}</main>
    </div>
  )
}

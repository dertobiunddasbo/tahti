import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
import AppShell from './components/AppShell'
import Login from './auth/Login'
import CrewHome from './pages/CrewHome'
import DispoMatrix from './pages/DispoMatrix'
import Produktionen from './pages/Produktionen'
import Setup from './pages/Setup'
import Crew from './pages/Crew'

function FullScreen({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-full items-center justify-center px-4">{children}</div>
}

function NoAccess() {
  const { person, signOut } = useAuth()
  return (
    <FullScreen>
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 text-center">
        <h1 className="text-lg font-semibold">Kein Zugang</h1>
        <p className="mt-2 text-sm text-muted">
          {person
            ? 'Dein Account ist noch keiner Organisation zugeordnet. Wende dich an die Disposition.'
            : 'Dieser Login ist noch nicht freigeschaltet. Wende dich an die Disposition.'}
        </p>
        <button
          onClick={signOut}
          className="mt-6 rounded-lg px-3 py-1.5 text-sm text-muted hover:text-ink"
        >
          Abmelden
        </button>
      </div>
    </FullScreen>
  )
}

export default function App() {
  const { loading, session, person, memberships, isPlaner } = useAuth()

  if (loading) {
    return (
      <FullScreen>
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-accent" />
      </FullScreen>
    )
  }

  if (!session) return <Login />

  // Eingeloggt, aber (noch) keine verknüpfte person oder keine Mitgliedschaft → kein Zugang.
  if (!person || memberships.length === 0) return <NoAccess />

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<CrewHome />} />
        {isPlaner && <Route path="/produktionen" element={<Produktionen />} />}
        {isPlaner && <Route path="/setup" element={<Setup />} />}
        {isPlaner && <Route path="/crew" element={<Crew />} />}
        {isPlaner && <Route path="/dispo" element={<DispoMatrix />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}

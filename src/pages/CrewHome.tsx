import { useAuth } from '../auth/AuthProvider'

export default function CrewHome() {
  const { person } = useAuth()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Hallo{person?.name ? `, ${person.name.split(' ')[0]}` : ''}
        </h1>
        <p className="mt-1 text-sm text-slate-500">Deine nächste Schicht auf einen Blick.</p>
      </div>

      {/* Platzhalter — JetztKarte / NächsteSchicht folgen im nächsten Schritt */}
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <p className="text-sm font-medium text-slate-700">Noch keine Schichten geladen</p>
        <p className="mt-1 text-sm text-slate-400">
          Hier erscheint gleich „Jetzt“ und „als nächstes“ — Datenanbindung kommt im nächsten
          Schritt.
        </p>
      </div>
    </div>
  )
}

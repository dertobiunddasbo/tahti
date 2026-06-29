export default function DispoMatrix() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dispo-Matrix</h1>
        <p className="mt-1 text-sm text-slate-500">Position × Zeit, Live-Sync.</p>
      </div>

      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <p className="text-sm font-medium text-slate-700">Matrix folgt</p>
        <p className="mt-1 text-sm text-slate-400">
          Timeline (Position × Zeit), Schicht-Zuweisung und Realtime werden hier aufgebaut.
        </p>
      </div>
    </div>
  )
}

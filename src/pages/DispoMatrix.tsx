import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useProductions } from '../productions/ProductionProvider'

interface Position {
  id: string
  label: string
  location_id: string | null
  department: { name: string; sortierung: number } | null
}
interface Block {
  id: string
  label: string
  start_zeit: string
  ende_zeit: string
  farbe: string | null
}
interface PersonOpt {
  id: string
  name: string
  kuerzel: string | null
  rolle: string
}
interface Shift {
  id: string
  person_id: string | null
  position_id: string | null
  schichtblock_id: string | null
  bestaetigt: boolean
}

const dayFmt = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

export default function DispoMatrix() {
  const { selected: projekt } = useProductions()
  const [positionen, setPositionen] = useState<Position[]>([])
  const [bloecke, setBloecke] = useState<Block[]>([])
  const [personen, setPersonen] = useState<PersonOpt[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [tag, setTag] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [error, setError] = useState<string | null>(null)

  // Tag initial auf Projektstart (bzw. heute, falls schon im Zeitraum)
  useEffect(() => {
    if (projekt?.start_datum) {
      const today = new Date().toISOString().slice(0, 10)
      setTag(today < projekt.start_datum ? projekt.start_datum : today)
    }
  }, [projekt?.id, projekt?.start_datum])

  // Stammdaten zum Projekt
  useEffect(() => {
    if (!projekt) return
    supabase
      .from('position')
      .select('id, label, location_id, department:department_id (name, sortierung)')
      .eq('projekt_id', projekt.id)
      .then(({ data }) => setPositionen((data as unknown as Position[]) ?? []))
    supabase
      .from('schichtblock')
      .select('id, label, start_zeit, ende_zeit, farbe')
      .eq('projekt_id', projekt.id)
      .order('start_zeit', { ascending: true })
      .then(({ data }) => setBloecke((data as Block[]) ?? []))
    supabase
      .from('person_public')
      .select('id, name, kuerzel, rolle')
      .eq('org_id', projekt.org_id)
      .order('name', { ascending: true })
      .then(({ data }) => setPersonen((data as PersonOpt[]) ?? []))
  }, [projekt])

  const loadShifts = useCallback(() => {
    if (!projekt) return
    supabase
      .from('schicht')
      .select('id, person_id, position_id, schichtblock_id, bestaetigt')
      .eq('projekt_id', projekt.id)
      .eq('tag', tag)
      .then(({ data }) => setShifts((data as Shift[]) ?? []))
  }, [projekt, tag])

  useEffect(() => {
    loadShifts()
  }, [loadShifts])

  // Realtime: bei jeder Schicht-Änderung im Projekt neu laden
  useEffect(() => {
    if (!projekt) return
    const channel = supabase
      .channel(`dispo-${projekt.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'schicht', filter: `projekt_id=eq.${projekt.id}` },
        () => loadShifts(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [projekt, loadShifts])

  const positionenSortiert = useMemo(
    () =>
      [...positionen].sort(
        (a, b) =>
          (a.department?.sortierung ?? 99) - (b.department?.sortierung ?? 99) ||
          a.label.localeCompare(b.label),
      ),
    [positionen],
  )
  const personMap = useMemo(() => new Map(personen.map((p) => [p.id, p])), [personen])

  async function assign(positionId: string, blockId: string, personId: string, locationId: string | null) {
    if (!projekt || !personId) return
    const { error } = await supabase.from('schicht').insert({
      org_id: projekt.org_id,
      projekt_id: projekt.id,
      person_id: personId,
      position_id: positionId,
      schichtblock_id: blockId,
      location_id: locationId,
      tag,
      typ: 'arbeit',
    })
    if (error) setError(error.message)
    else loadShifts()
  }

  async function remove(shiftId: string) {
    const { error } = await supabase.from('schicht').delete().eq('id', shiftId)
    if (error) setError(error.message)
    else loadShifts()
  }

  function cellShifts(positionId: string, blockId: string) {
    return shifts.filter((s) => s.position_id === positionId && s.schichtblock_id === blockId)
  }

  if (!projekt) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        Keine Produktion gewählt.{' '}
        <Link to="/produktionen" className="font-medium text-accent-600 hover:underline">
          Produktion anlegen oder auswählen →
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dispo-Matrix</h1>
        <p className="mt-1 text-sm text-slate-500">
          {projekt.name} · Position × Schichtblock · Live-Sync
        </p>
      </div>

      {/* Tag-Navigation */}
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2">
        <button
          onClick={() => setTag((t) => addDays(t, -1))}
          className="rounded-lg px-3 py-1 text-sm text-slate-500 hover:bg-slate-100"
        >
          ← Vortag
        </button>
        <span className="text-sm font-medium capitalize">{dayFmt.format(new Date(`${tag}T00:00:00`))}</span>
        <button
          onClick={() => setTag((t) => addDays(t, 1))}
          className="rounded-lg px-3 py-1 text-sm text-slate-500 hover:bg-slate-100"
        >
          Folgetag →
        </button>
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {positionenSortiert.length === 0 || bloecke.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
          Keine Positionen/Schichtblöcke für diese Produktion. (Setup-UI folgt in Phase 2.)
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="sticky left-0 z-10 bg-white p-3 text-left font-medium text-slate-500">
                  Position
                </th>
                {bloecke.map((b) => (
                  <th key={b.id} className="min-w-[180px] p-3 text-left font-medium">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: b.farbe ?? '#94a3b8' }}
                      />
                      {b.label}
                      <span className="text-xs font-normal text-slate-400">
                        {b.start_zeit.slice(0, 5)}–{b.ende_zeit.slice(0, 5)}
                      </span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {positionenSortiert.map((pos) => (
                <tr key={pos.id} className="border-b border-slate-100 last:border-0">
                  <td className="sticky left-0 z-10 bg-white p-3 align-top">
                    <div className="font-medium">{pos.label}</div>
                    {pos.department?.name && (
                      <div className="text-xs text-slate-400">{pos.department.name}</div>
                    )}
                  </td>
                  {bloecke.map((b) => {
                    const cs = cellShifts(pos.id, b.id)
                    return (
                      <td key={b.id} className="p-2 align-top">
                        <div className="space-y-1.5">
                          {cs.map((s) => {
                            const p = s.person_id ? personMap.get(s.person_id) : null
                            return (
                              <div
                                key={s.id}
                                className="group flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1"
                              >
                                <span className="flex items-center gap-1.5 truncate">
                                  <span
                                    className={[
                                      'h-1.5 w-1.5 rounded-full',
                                      s.bestaetigt ? 'bg-emerald-500' : 'bg-amber-400',
                                    ].join(' ')}
                                  />
                                  <span className="truncate">{p?.name ?? 'Unbekannt'}</span>
                                </span>
                                <button
                                  onClick={() => remove(s.id)}
                                  className="text-slate-300 opacity-0 transition hover:text-red-500 group-hover:opacity-100"
                                  title="Entfernen"
                                >
                                  ×
                                </button>
                              </div>
                            )
                          })}
                          <select
                            value=""
                            onChange={(e) => {
                              assign(pos.id, b.id, e.target.value, pos.location_id)
                              e.target.value = ''
                            }}
                            className="w-full rounded-lg border border-dashed border-slate-300 bg-transparent px-2 py-1 text-xs text-slate-400 hover:border-accent-400 hover:text-accent-600"
                          >
                            <option value="">+ zuweisen</option>
                            {personen.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

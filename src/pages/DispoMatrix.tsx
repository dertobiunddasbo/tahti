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
}
interface Shift {
  id: string
  person_id: string | null
  position_id: string | null
  schichtblock_id: string | null
  bestaetigt: boolean
}
interface RangeShift extends Shift {
  tag: string
}

const dayFmt = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})
const colFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

export default function DispoMatrix() {
  const { selected: projekt } = useProductions()
  const [view, setView] = useState<'tag' | 'zeitraum'>('tag')
  const [positionen, setPositionen] = useState<Position[]>([])
  const [bloecke, setBloecke] = useState<Block[]>([])
  const [personen, setPersonen] = useState<PersonOpt[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [rangeShifts, setRangeShifts] = useState<RangeShift[]>([])
  const [tag, setTag] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (projekt?.start_datum) {
      const today = new Date().toISOString().slice(0, 10)
      setTag(today < projekt.start_datum ? projekt.start_datum : today)
    }
  }, [projekt?.id, projekt?.start_datum])

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
      .from('besetzung')
      .select('person:person_id (id, name, kuerzel)')
      .eq('projekt_id', projekt.id)
      .then(({ data }) => {
        const list = ((data as unknown as { person: PersonOpt | null }[]) ?? [])
          .map((r) => r.person)
          .filter((p): p is PersonOpt => !!p)
          .sort((a, b) => a.name.localeCompare(b.name))
        setPersonen(list)
      })
  }, [projekt])

  // Tagesschichten
  const loadShifts = useCallback(() => {
    if (!projekt) return
    supabase
      .from('schicht')
      .select('id, person_id, position_id, schichtblock_id, bestaetigt')
      .eq('projekt_id', projekt.id)
      .eq('tag', tag)
      .then(({ data }) => setShifts((data as Shift[]) ?? []))
  }, [projekt, tag])

  // Zeitraum: Tagesliste aus Projektzeitraum (sonst Fenster um den gewählten Tag)
  const days = useMemo(() => {
    if (!projekt) return []
    const start = projekt.start_datum ?? addDays(tag, -3)
    const end = projekt.end_datum ?? addDays(tag, 3)
    const out: string[] = []
    let d = new Date(`${start}T00:00:00`)
    const e = new Date(`${end}T00:00:00`)
    let guard = 0
    while (d <= e && guard < 60) {
      out.push(d.toISOString().slice(0, 10))
      d = new Date(d.getTime() + 86400000)
      guard++
    }
    return out
  }, [projekt, tag])

  const loadRange = useCallback(() => {
    if (!projekt || days.length === 0) return
    supabase
      .from('schicht')
      .select('id, person_id, position_id, schichtblock_id, bestaetigt, tag')
      .eq('projekt_id', projekt.id)
      .gte('tag', days[0])
      .lte('tag', days[days.length - 1])
      .then(({ data }) => setRangeShifts((data as RangeShift[]) ?? []))
  }, [projekt, days])

  useEffect(() => {
    loadShifts()
  }, [loadShifts])
  useEffect(() => {
    if (view === 'zeitraum') loadRange()
  }, [view, loadRange])

  useEffect(() => {
    if (!projekt) return
    const channel = supabase
      .channel(`dispo-${projekt.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'schicht', filter: `projekt_id=eq.${projekt.id}` },
        () => {
          loadShifts()
          if (view === 'zeitraum') loadRange()
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [projekt, loadShifts, loadRange, view])

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
  const blockById = useMemo(() => new Map(bloecke.map((b) => [b.id, b])), [bloecke])

  // Konflikte: gleiche Person mit zeitlich überlappenden Schichten am Tag
  const { conflictIds, conflictList } = useMemo(() => {
    const win = (blockId: string | null) => {
      const b = blockId ? blockById.get(blockId) : null
      if (!b) return null
      const s = new Date(`${tag}T${b.start_zeit}`)
      let e = new Date(`${tag}T${b.ende_zeit}`)
      if (e <= s) e = new Date(e.getTime() + 86400000)
      return { s, e }
    }
    const byPerson = new Map<string, Shift[]>()
    for (const sh of shifts) {
      if (!sh.person_id) continue
      const arr = byPerson.get(sh.person_id) ?? []
      arr.push(sh)
      byPerson.set(sh.person_id, arr)
    }
    const ids = new Set<string>()
    const seen = new Set<string>()
    const list: { person: string; a: string; b: string }[] = []
    for (const [pid, arr] of byPerson) {
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const wi = win(arr[i].schichtblock_id)
          const wj = win(arr[j].schichtblock_id)
          if (wi && wj && wi.s < wj.e && wj.s < wi.e) {
            ids.add(arr[i].id)
            ids.add(arr[j].id)
            const la = blockById.get(arr[i].schichtblock_id!)?.label ?? '?'
            const lb = blockById.get(arr[j].schichtblock_id!)?.label ?? '?'
            const key = `${pid}-${[la, lb].sort().join('-')}`
            if (!seen.has(key)) {
              seen.add(key)
              list.push({ person: personMap.get(pid)?.name ?? 'Unbekannt', a: la, b: lb })
            }
          }
        }
      }
    }
    return { conflictIds: ids, conflictList: list }
  }, [shifts, blockById, personMap, tag])

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
  function rangeCell(positionId: string, day: string) {
    return rangeShifts.filter((s) => s.position_id === positionId && s.tag === day)
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

  const tabCls = (v: 'tag' | 'zeitraum') =>
    [
      'rounded-lg px-3 py-1 text-sm font-medium transition',
      view === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
    ].join(' ')

  const emptyStructure = positionenSortiert.length === 0 || bloecke.length === 0

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dispo-Matrix</h1>
          <p className="mt-1 text-sm text-slate-500">{projekt.name} · Live-Sync</p>
        </div>
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
          <button className={tabCls('tag')} onClick={() => setView('tag')}>
            Tag
          </button>
          <button className={tabCls('zeitraum')} onClick={() => setView('zeitraum')}>
            Zeitraum
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {emptyStructure ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Noch keine Positionen/Schichtblöcke.{' '}
          <Link to="/setup" className="font-medium text-accent-600 hover:underline">
            Jetzt im Setup einrichten →
          </Link>
        </div>
      ) : view === 'tag' ? (
        <>
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2">
            <button
              onClick={() => setTag((t) => addDays(t, -1))}
              className="rounded-lg px-3 py-1 text-sm text-slate-500 hover:bg-slate-100"
            >
              ← Vortag
            </button>
            <span className="text-sm font-medium capitalize">
              {dayFmt.format(new Date(`${tag}T00:00:00`))}
            </span>
            <button
              onClick={() => setTag((t) => addDays(t, 1))}
              className="rounded-lg px-3 py-1 text-sm text-slate-500 hover:bg-slate-100"
            >
              Folgetag →
            </button>
          </div>

          {conflictList.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <span className="font-medium">⚠ Doppelbelegung:</span>{' '}
              {conflictList.map((c) => `${c.person} (${c.a} ↔ ${c.b})`).join(' · ')}
            </div>
          )}

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
                                  title={conflictIds.has(s.id) ? 'Zeitliche Doppelbelegung' : undefined}
                                  className={[
                                    'group flex items-center justify-between gap-2 rounded-lg px-2 py-1',
                                    conflictIds.has(s.id) ? 'bg-red-50 ring-1 ring-red-300' : 'bg-slate-50',
                                  ].join(' ')}
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
        </>
      ) : (
        // Zeitraum-Übersicht: Positionen × Tage (read-only; Tag-Header springt in Tagesansicht)
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="sticky left-0 z-10 bg-white p-3 text-left font-medium text-slate-500">
                  Position
                </th>
                {days.map((d) => (
                  <th key={d} className="min-w-[130px] p-2 text-left font-medium">
                    <button
                      onClick={() => {
                        setTag(d)
                        setView('tag')
                      }}
                      className="capitalize text-slate-600 hover:text-accent-600"
                      title="In Tagesansicht öffnen"
                    >
                      {colFmt.format(new Date(`${d}T00:00:00`))}
                    </button>
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
                  {days.map((d) => {
                    const cs = rangeCell(pos.id, d)
                    return (
                      <td key={d} className="p-2 align-top">
                        <div className="space-y-1">
                          {cs.map((s) => {
                            const p = s.person_id ? personMap.get(s.person_id) : null
                            const b = s.schichtblock_id ? blockById.get(s.schichtblock_id) : null
                            return (
                              <div
                                key={s.id}
                                className="flex items-center gap-1.5 truncate rounded-md bg-slate-50 px-1.5 py-0.5 text-xs"
                                title={b?.label}
                              >
                                <span
                                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                                  style={{ backgroundColor: b?.farbe ?? '#94a3b8' }}
                                />
                                <span className="truncate">{p?.kuerzel ?? p?.name ?? '—'}</span>
                              </div>
                            )
                          })}
                          {cs.length === 0 && <span className="text-xs text-slate-300">·</span>}
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

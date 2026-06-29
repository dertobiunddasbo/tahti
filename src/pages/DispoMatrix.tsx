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
  timeZone: 'UTC',
})
const colFmt = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  timeZone: 'UTC',
})

// Datums-Arithmetik konsequent in UTC, damit es in keiner Zeitzone verrutscht.
function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
function dDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`)
}

interface WarnShift {
  id: string
  person_id: string | null
  schichtblock_id: string | null
  tag: string
}

// ArbZG-nahe Schwellen: § 5 (11 h Ruhezeit), § 3 (max. 10 h/Tag)
const REST_MS = 11 * 3600 * 1000
const MAXDAY_MS = 10 * 3600 * 1000

export default function DispoMatrix() {
  const { selected: projekt } = useProductions()
  const [view, setView] = useState<'tag' | 'zeitraum'>('tag')
  const [positionen, setPositionen] = useState<Position[]>([])
  const [bloecke, setBloecke] = useState<Block[]>([])
  const [personen, setPersonen] = useState<PersonOpt[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [rangeShifts, setRangeShifts] = useState<RangeShift[]>([])
  const [allShifts, setAllShifts] = useState<WarnShift[]>([])
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
    let d = new Date(`${start}T00:00:00Z`)
    const e = new Date(`${end}T00:00:00Z`)
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

  // Alle Schichten der Produktion (für tagesübergreifende Ruhezeit-/Arbeitszeit-Prüfung)
  const loadAll = useCallback(() => {
    if (!projekt) return
    supabase
      .from('schicht')
      .select('id, person_id, schichtblock_id, tag')
      .eq('projekt_id', projekt.id)
      .then(({ data }) => setAllShifts((data as WarnShift[]) ?? []))
  }, [projekt])

  useEffect(() => {
    loadShifts()
  }, [loadShifts])
  useEffect(() => {
    loadAll()
  }, [loadAll])
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
          loadAll()
          if (view === 'zeitraum') loadRange()
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [projekt, loadShifts, loadRange, loadAll, view])

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

  // ArbZG-Warnungen: < 11 h Ruhezeit (§5) und > 10 h/Tag (§3), tagesübergreifend
  const { warnIds, warnList } = useMemo(() => {
    const ids = new Set<string>()
    const seen = new Set<string>()
    const msgs: { person: string; text: string }[] = []
    const interval = (sh: WarnShift) => {
      const b = sh.schichtblock_id ? blockById.get(sh.schichtblock_id) : null
      if (!b) return null
      const s = new Date(`${sh.tag}T${b.start_zeit}Z`)
      let e = new Date(`${sh.tag}T${b.ende_zeit}Z`)
      if (e <= s) e = new Date(e.getTime() + 86400000)
      return { id: sh.id, tag: sh.tag, start: s.getTime(), end: e.getTime(), dur: e.getTime() - s.getTime() }
    }
    const byPerson = new Map<string, ReturnType<typeof interval>[]>()
    for (const sh of allShifts) {
      if (!sh.person_id) continue
      const iv = interval(sh)
      if (!iv) continue
      const arr = byPerson.get(sh.person_id) ?? []
      arr.push(iv)
      byPerson.set(sh.person_id, arr)
    }
    for (const [pid, arr0] of byPerson) {
      const arr = arr0.filter(Boolean).sort((a, b) => a!.start - b!.start)
      const name = personMap.get(pid)?.name ?? 'Crew'
      // Ruhezeit zwischen aufeinanderfolgenden Schichten
      for (let i = 1; i < arr.length; i++) {
        const gap = arr[i]!.start - arr[i - 1]!.end
        if (gap >= 0 && gap < REST_MS) {
          ids.add(arr[i]!.id)
          ids.add(arr[i - 1]!.id)
          if (arr[i]!.tag === tag || arr[i - 1]!.tag === tag) {
            const k = `rest-${arr[i - 1]!.id}-${arr[i]!.id}`
            if (!seen.has(k)) {
              seen.add(k)
              msgs.push({ person: name, text: `Ruhezeit nur ${(gap / 3600000).toFixed(1)} h (<11 h)` })
            }
          }
        }
      }
      // Tagesarbeitszeit
      const byDay = new Map<string, { sum: number; ids: string[] }>()
      for (const iv of arr) {
        const d = byDay.get(iv!.tag) ?? { sum: 0, ids: [] }
        d.sum += iv!.dur
        d.ids.push(iv!.id)
        byDay.set(iv!.tag, d)
      }
      for (const [d, info] of byDay) {
        if (info.sum > MAXDAY_MS) {
          info.ids.forEach((id) => ids.add(id))
          if (d === tag) {
            const k = `day-${pid}-${d}`
            if (!seen.has(k)) {
              seen.add(k)
              msgs.push({ person: name, text: `${(info.sum / 3600000).toFixed(1)} h am Tag (>10 h)` })
            }
          }
        }
      }
    }
    return { warnIds: ids, warnList: msgs }
  }, [allShifts, blockById, personMap, tag])

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
      <div className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
        Keine Produktion gewählt.{' '}
        <Link to="/produktionen" className="font-medium text-accent-strong hover:underline">
          Produktion anlegen oder auswählen →
        </Link>
      </div>
    )
  }

  const tabCls = (v: 'tag' | 'zeitraum') =>
    [
      'rounded-lg px-3 py-1 text-sm font-medium transition',
      view === v ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
    ].join(' ')

  const emptyStructure = positionenSortiert.length === 0 || bloecke.length === 0

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dispo-Matrix</h1>
          <p className="mt-1 text-sm text-muted">{projekt.name} · Live-Sync</p>
        </div>
        <div className="flex gap-1 rounded-xl bg-line/40 p-1">
          <button className={tabCls('tag')} onClick={() => setView('tag')}>
            Tag
          </button>
          <button className={tabCls('zeitraum')} onClick={() => setView('zeitraum')}>
            Zeitraum
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</div>}

      {emptyStructure ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
          Noch keine Positionen/Schichtblöcke.{' '}
          <Link to="/setup" className="font-medium text-accent-strong hover:underline">
            Jetzt im Setup einrichten →
          </Link>
        </div>
      ) : view === 'tag' ? (
        <>
          <div className="flex items-center justify-between rounded-xl border border-line bg-surface px-3 py-2">
            <button
              onClick={() => setTag((t) => addDays(t, -1))}
              className="rounded-lg px-3 py-1 text-sm text-muted hover:bg-line/40"
            >
              ← Vortag
            </button>
            <span className="text-sm font-medium capitalize">
              {dayFmt.format(dDate(tag))}
            </span>
            <button
              onClick={() => setTag((t) => addDays(t, 1))}
              className="rounded-lg px-3 py-1 text-sm text-muted hover:bg-line/40"
            >
              Folgetag →
            </button>
          </div>

          {conflictList.length > 0 && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
              <span className="font-medium">⚠ Doppelbelegung:</span>{' '}
              {conflictList.map((c) => `${c.person} (${c.a} ↔ ${c.b})`).join(' · ')}
            </div>
          )}

          {warnList.length > 0 && (
            <div className="rounded-lg border border-warn/30 bg-warn/15 p-3 text-sm text-warn">
              <span className="font-medium">⚠ Arbeitszeit (ArbZG):</span>{' '}
              {warnList.map((w) => `${w.person}: ${w.text}`).join(' · ')}
            </div>
          )}

          <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className="sticky left-0 z-10 bg-surface p-3 text-left font-medium text-muted">
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
                        <span className="font-mono tnum text-xs font-normal text-muted">
                          {b.start_zeit.slice(0, 5)}–{b.ende_zeit.slice(0, 5)}
                        </span>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {positionenSortiert.map((pos) => (
                  <tr key={pos.id} className="border-b border-line last:border-0">
                    <td className="sticky left-0 z-10 bg-surface p-3 align-top">
                      <div className="font-medium">{pos.label}</div>
                      {pos.department?.name && (
                        <div className="text-xs text-muted">{pos.department.name}</div>
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
                                  title={
                                    conflictIds.has(s.id)
                                      ? 'Zeitliche Doppelbelegung'
                                      : warnIds.has(s.id)
                                        ? 'Arbeitszeit/Ruhezeit (ArbZG) prüfen'
                                        : undefined
                                  }
                                  className={[
                                    'group flex items-center justify-between gap-2 rounded-lg px-2 py-1',
                                    conflictIds.has(s.id)
                                      ? 'bg-danger/10 ring-1 ring-danger/40'
                                      : warnIds.has(s.id)
                                        ? 'bg-warn/15 ring-1 ring-warn/40'
                                        : 'bg-canvas',
                                  ].join(' ')}
                                >
                                  <span className="flex items-center gap-1.5 truncate">
                                    <span
                                      className={[
                                        'h-1.5 w-1.5 rounded-full',
                                        s.bestaetigt ? 'bg-ok' : 'bg-warn',
                                      ].join(' ')}
                                    />
                                    <span className="truncate">{p?.name ?? 'Unbekannt'}</span>
                                  </span>
                                  <button
                                    onClick={() => remove(s.id)}
                                    className="text-muted/60 opacity-0 transition hover:text-danger group-hover:opacity-100"
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
                              className="w-full rounded-lg border border-dashed border-line bg-transparent px-2 py-1 text-xs text-muted hover:border-accent hover:text-accent-strong"
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
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="sticky left-0 z-10 bg-surface p-3 text-left font-medium text-muted">
                  Position
                </th>
                {days.map((d) => (
                  <th key={d} className="min-w-[130px] p-2 text-left font-medium">
                    <button
                      onClick={() => {
                        setTag(d)
                        setView('tag')
                      }}
                      className="capitalize text-muted hover:text-accent-strong"
                      title="In Tagesansicht öffnen"
                    >
                      {colFmt.format(dDate(d))}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {positionenSortiert.map((pos) => (
                <tr key={pos.id} className="border-b border-line last:border-0">
                  <td className="sticky left-0 z-10 bg-surface p-3 align-top">
                    <div className="font-medium">{pos.label}</div>
                    {pos.department?.name && (
                      <div className="text-xs text-muted">{pos.department.name}</div>
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
                                className="flex items-center gap-1.5 truncate rounded-md bg-canvas px-1.5 py-0.5 text-xs"
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
                          {cs.length === 0 && <span className="text-xs text-muted/60">·</span>}
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

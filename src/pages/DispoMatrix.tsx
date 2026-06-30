import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useProductions } from '../productions/ProductionProvider'
import type { CrewStatus } from '../lib/types'

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
  tag: string
}
interface PersonOpt {
  id: string
  name: string
  kuerzel: string | null
}
interface CrewMember extends PersonOpt {
  status: CrewStatus
}
interface Shift {
  id: string
  person_id: string | null
  position_id: string | null
  schichtblock_id: string | null
  bestaetigt: boolean
  typ: string
  open_end: boolean
  notiz: string | null
  start_zeit: string | null
  ende_zeit: string | null
}
const SCHICHT_TYPEN = ['arbeit', 'standby', 'eigendispo', 'nachtwache'] as const
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
  start_zeit: string | null
  ende_zeit: string | null
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
  const [crew, setCrew] = useState<CrewMember[]>([])
  const [pSkills, setPSkills] = useState<Map<string, string[]>>(new Map())
  const [overCell, setOverCell] = useState<string | null>(null)
  const [toast, setToast] = useState<{ text: string; undo: () => void } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [editShift, setEditShift] = useState<Shift | null>(null)
  const [shifts, setShifts] = useState<Shift[]>([])
  const [rangeShifts, setRangeShifts] = useState<RangeShift[]>([])
  const [allShifts, setAllShifts] = useState<WarnShift[]>([])
  const [tag, setTag] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [error, setError] = useState<string | null>(null)
  // Tages-Block-Verwaltung (inline) + „Tag kopieren"
  const [blockForm, setBlockForm] = useState({ label: '', start_zeit: '', ende_zeit: '', farbe: '#6366f1' })
  const [editBlock, setEditBlock] = useState<{ id: string; label: string; start_zeit: string; ende_zeit: string; farbe: string } | null>(null)
  const [copyTo, setCopyTo] = useState('')
  const [copyBesetzung, setCopyBesetzung] = useState(false)

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
      .from('besetzung')
      .select('status, person:person_id (id, name, kuerzel)')
      .eq('projekt_id', projekt.id)
      .then(({ data }) => {
        const rows = (data as unknown as { status: CrewStatus; person: PersonOpt | null }[]) ?? []
        const list = rows
          .filter((r) => r.person)
          .map((r) => ({ ...(r.person as PersonOpt), status: r.status }))
          .sort((a, b) => a.name.localeCompare(b.name))
        setCrew(list)
        setPersonen(list.map(({ status: _status, ...p }) => p))
      })
    supabase
      .from('person_skill')
      .select('person_id, skill:skill_id!inner (name, org_id)')
      .eq('skill.org_id', projekt.org_id)
      .then(({ data }) => {
        const m = new Map<string, string[]>()
        for (const r of (data as unknown as { person_id: string; skill: { name: string } | null }[]) ?? []) {
          if (!r.skill) continue
          const arr = m.get(r.person_id) ?? []
          arr.push(r.skill.name)
          m.set(r.person_id, arr)
        }
        setPSkills(m)
      })
  }, [projekt])

  // Alle Schichtblöcke der Produktion (tagesübergreifend; für Konflikt-/ArbZG-Karten + Zeitraum).
  // Die Spalten der Tagesmatrix filtern daraus auf den gewählten Tag (dayBloecke).
  const loadBlocks = useCallback(() => {
    if (!projekt) return
    supabase
      .from('schichtblock')
      .select('id, label, start_zeit, ende_zeit, farbe, tag')
      .eq('projekt_id', projekt.id)
      .order('tag', { ascending: true })
      .order('start_zeit', { ascending: true })
      .then(({ data }) => setBloecke((data as Block[]) ?? []))
  }, [projekt])

  // Tagesschichten
  const loadShifts = useCallback(() => {
    if (!projekt) return
    supabase
      .from('schicht')
      .select('id, person_id, position_id, schichtblock_id, bestaetigt, typ, open_end, notiz, start_zeit, ende_zeit')
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
      .select('id, person_id, position_id, schichtblock_id, bestaetigt, tag, start_zeit, ende_zeit')
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
      .select('id, person_id, schichtblock_id, tag, start_zeit, ende_zeit')
      .eq('projekt_id', projekt.id)
      .then(({ data }) => setAllShifts((data as WarnShift[]) ?? []))
  }, [projekt])

  useEffect(() => {
    loadBlocks()
  }, [loadBlocks])
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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'schichtblock', filter: `projekt_id=eq.${projekt.id}` },
        () => loadBlocks(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [projekt, loadShifts, loadRange, loadAll, loadBlocks, view])

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
  const posLocById = useMemo(() => new Map(positionen.map((p) => [p.id, p.location_id])), [positionen])
  // Spalten der Tagesmatrix = nur Blöcke des gewählten Drehtags
  const dayBloecke = useMemo(() => bloecke.filter((b) => b.tag === tag), [bloecke, tag])

  // Effektive Zeit einer Schicht: eigener Override sonst Block-Zeit (HH:MM[:SS]).
  // Null, wenn weder Override noch Block eine Zeit liefern.
  const effTimes = useCallback(
    (sh: { start_zeit: string | null; ende_zeit: string | null; schichtblock_id: string | null }) => {
      const b = sh.schichtblock_id ? blockById.get(sh.schichtblock_id) : null
      const start = sh.start_zeit ?? b?.start_zeit ?? null
      const ende = sh.ende_zeit ?? b?.ende_zeit ?? null
      return start && ende ? { start, ende } : null
    },
    [blockById],
  )

  // Auslastung je Person am gewählten Tag (Blöcke + Stunden) für die Panel-Hinweise
  const dayLoad = useMemo(() => {
    const m = new Map<string, { blocks: string[]; ms: number }>()
    for (const sh of allShifts) {
      if (!sh.person_id || sh.tag !== tag) continue
      const b = sh.schichtblock_id ? blockById.get(sh.schichtblock_id) : null
      const et = effTimes(sh)
      const cur = m.get(sh.person_id) ?? { blocks: [], ms: 0 }
      if (b) cur.blocks.push(b.label)
      if (et) {
        const s = new Date(`${tag}T${et.start}Z`).getTime()
        let e = new Date(`${tag}T${et.ende}Z`).getTime()
        if (e <= s) e += 86400000
        cur.ms += e - s
      }
      m.set(sh.person_id, cur)
    }
    return m
  }, [allShifts, tag, blockById, effTimes])

  // Konflikte: gleiche Person mit zeitlich überlappenden Schichten am Tag
  const { conflictIds, conflictList } = useMemo(() => {
    const win = (sh: Shift) => {
      const et = effTimes(sh)
      if (!et) return null
      const s = new Date(`${tag}T${et.start}`)
      let e = new Date(`${tag}T${et.ende}`)
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
          const wi = win(arr[i])
          const wj = win(arr[j])
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
  }, [shifts, blockById, personMap, tag, effTimes])

  // ArbZG-Warnungen: < 11 h Ruhezeit (§5) und > 10 h/Tag (§3), tagesübergreifend
  const { warnIds, warnList, warnPersons } = useMemo(() => {
    const ids = new Set<string>()
    const seen = new Set<string>()
    const persons = new Set<string>()
    const msgs: { person: string; text: string }[] = []
    const interval = (sh: WarnShift) => {
      const et = effTimes(sh)
      if (!et) return null
      const s = new Date(`${sh.tag}T${et.start}Z`)
      let e = new Date(`${sh.tag}T${et.ende}Z`)
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
              persons.add(pid)
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
              persons.add(pid)
              msgs.push({ person: name, text: `${(info.sum / 3600000).toFixed(1)} h am Tag (>10 h)` })
            }
          }
        }
      }
    }
    return { warnIds: ids, warnList: msgs, warnPersons: persons }
  }, [allShifts, blockById, personMap, tag, effTimes])

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

  function showToast(text: string, undo: () => void) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ text, undo })
    toastTimer.current = setTimeout(() => setToast(null), 6000)
  }

  async function remove(s: Shift, locationId: string | null) {
    if (!projekt) return
    const { error } = await supabase.from('schicht').delete().eq('id', s.id)
    if (error) {
      setError(error.message)
      return
    }
    loadShifts()
    // Undo: Zuweisung mit gleichen Daten neu anlegen (neue id)
    const payload = {
      org_id: projekt.org_id,
      projekt_id: projekt.id,
      person_id: s.person_id,
      position_id: s.position_id,
      schichtblock_id: s.schichtblock_id,
      location_id: locationId,
      tag,
      typ: 'arbeit',
      bestaetigt: s.bestaetigt,
      start_zeit: s.start_zeit,
      ende_zeit: s.ende_zeit,
    }
    showToast('Schicht entfernt', async () => {
      const { error: e } = await supabase.from('schicht').insert(payload)
      if (e) setError(e.message)
      else loadShifts()
    })
  }

  async function saveEdit() {
    if (!editShift) return
    const { error } = await supabase
      .from('schicht')
      .update({
        person_id: editShift.person_id,
        position_id: editShift.position_id,
        schichtblock_id: editShift.schichtblock_id,
        typ: editShift.typ,
        open_end: editShift.open_end,
        notiz: editShift.notiz,
        bestaetigt: editShift.bestaetigt,
        start_zeit: editShift.start_zeit,
        ende_zeit: editShift.ende_zeit,
      })
      .eq('id', editShift.id)
    if (error) setError(error.message)
    else {
      setEditShift(null)
      loadShifts()
    }
  }

  // --- Tages-Blöcke: anlegen / bearbeiten / löschen ---
  async function addBlock(e: FormEvent) {
    e.preventDefault()
    if (!projekt || !blockForm.label.trim() || !blockForm.start_zeit || !blockForm.ende_zeit) return
    const { error } = await supabase.from('schichtblock').insert({
      org_id: projekt.org_id,
      projekt_id: projekt.id,
      tag,
      label: blockForm.label.trim(),
      start_zeit: blockForm.start_zeit,
      ende_zeit: blockForm.ende_zeit,
      farbe: blockForm.farbe,
    })
    if (error) setError(error.message)
    else {
      setBlockForm({ label: '', start_zeit: '', ende_zeit: '', farbe: '#6366f1' })
      loadBlocks()
    }
  }

  async function saveBlock() {
    if (!editBlock) return
    const { error } = await supabase
      .from('schichtblock')
      .update({
        label: editBlock.label.trim(),
        start_zeit: editBlock.start_zeit,
        ende_zeit: editBlock.ende_zeit,
        farbe: editBlock.farbe,
      })
      .eq('id', editBlock.id)
    if (error) setError(error.message)
    else {
      setEditBlock(null)
      loadBlocks()
    }
  }

  async function deleteBlock(id: string) {
    const { error } = await supabase.from('schichtblock').delete().eq('id', id)
    if (error) setError(error.message)
    else {
      loadBlocks()
      loadShifts()
      loadAll()
    }
  }

  // „Tag kopieren": Blöcke des aktuellen Tags (optional samt Besetzung) auf ein Zieldatum übertragen
  async function copyDay(e: FormEvent) {
    e.preventDefault()
    if (!projekt || !copyTo) return
    if (copyTo === tag) {
      setError('Zieldatum entspricht dem aktuellen Tag.')
      return
    }
    if (dayBloecke.length === 0) {
      setError('Dieser Tag hat keine Blöcke zum Kopieren.')
      return
    }
    setError(null)
    const { data: inserted, error: be } = await supabase
      .from('schichtblock')
      .insert(
        dayBloecke.map((b) => ({
          org_id: projekt.org_id,
          projekt_id: projekt.id,
          tag: copyTo,
          label: b.label,
          start_zeit: b.start_zeit,
          ende_zeit: b.ende_zeit,
          farbe: b.farbe,
        })),
      )
      .select('id, label, start_zeit, ende_zeit')
    if (be) {
      setError(be.message)
      return
    }
    const newIds = (inserted ?? []).map((b) => b.id)
    if (copyBesetzung) {
      const key = (x: { label: string; start_zeit: string; ende_zeit: string }) =>
        `${x.label}|${x.start_zeit}|${x.ende_zeit}`
      const newByKey = new Map((inserted ?? []).map((b) => [key(b), b.id as string]))
      const rows = shifts
        .filter((s) => s.schichtblock_id)
        .map((s) => {
          const ob = blockById.get(s.schichtblock_id!)
          const nb = ob ? newByKey.get(key(ob)) : null
          if (!nb) return null
          return {
            org_id: projekt.org_id,
            projekt_id: projekt.id,
            person_id: s.person_id,
            position_id: s.position_id,
            schichtblock_id: nb,
            location_id: s.position_id ? posLocById.get(s.position_id) ?? null : null,
            tag: copyTo,
            typ: s.typ,
            open_end: s.open_end,
            notiz: s.notiz,
            start_zeit: s.start_zeit,
            ende_zeit: s.ende_zeit,
          }
        })
        .filter(Boolean)
      if (rows.length > 0) {
        const { error: se } = await supabase.from('schicht').insert(rows as object[])
        if (se) setError(se.message)
      }
    }
    const ziel = copyTo
    const mitBesetzung = copyBesetzung
    setCopyTo('')
    setCopyBesetzung(false)
    loadBlocks()
    loadAll()
    showToast(`Tag → ${ziel} kopiert${mitBesetzung ? ' (inkl. Besetzung)' : ''}`, async () => {
      await supabase.from('schicht').delete().eq('tag', ziel).in('schichtblock_id', newIds)
      await supabase.from('schichtblock').delete().in('id', newIds)
      loadBlocks()
      loadAll()
    })
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

  // Blöcke werden jetzt pro Tag inline angelegt; nur fehlende Positionen verweisen ins Setup.
  const emptyStructure = positionenSortiert.length === 0

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
          Noch keine Positionen.{' '}
          <Link to="/setup" className="font-medium text-accent-strong hover:underline">
            Jetzt im Setup einrichten →
          </Link>
          <div className="mt-1 text-xs text-muted/70">Schichtblöcke legst du pro Drehtag hier in der Matrix an.</div>
        </div>
      ) : view === 'tag' ? (
        <div className="lg:grid lg:grid-cols-[230px_minmax(0,1fr)] lg:items-start lg:gap-5">
          {/* Crew-Panel (Desktop): Karte auf eine Schicht ziehen → zuweisen */}
          <aside className="mb-4 hidden lg:sticky lg:top-20 lg:mb-0 lg:block">
            <div className="space-y-4 rounded-2xl border border-line bg-surface p-3">
              <div className="font-mono text-xs uppercase tracking-wide text-muted">
                Crew · ziehen → zuweisen
              </div>
              {[
                { label: 'Verfügbar', list: crew.filter((m) => m.status === 'zugesagt') },
                { label: 'Angefragt', list: crew.filter((m) => m.status === 'eingeladen') },
              ].map((grp) => (
                <div key={grp.label} className="space-y-1.5">
                  <div className="font-mono text-[10px] uppercase tracking-wide text-muted/70">
                    {grp.label} ({grp.list.length})
                  </div>
                  {grp.list.map((m) => {
                    const load = dayLoad.get(m.id)
                    const hrs = load ? load.ms / 3600000 : 0
                    const sk = pSkills.get(m.id) ?? []
                    const cond = warnPersons.has(m.id) ? 'red' : hrs > 8 ? 'amber' : 'green'
                    const barColor = cond === 'red' ? 'bg-danger' : cond === 'amber' ? 'bg-warn' : 'bg-ok'
                    const labelColor = cond === 'red' ? 'text-danger' : cond === 'amber' ? 'text-warn' : 'text-muted'
                    const pct = Math.min(hrs / 12, 1) * 100
                    return (
                      <div
                        key={m.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', m.id)
                          e.dataTransfer.effectAllowed = 'copy'
                        }}
                        className="cursor-grab rounded-lg border border-line bg-canvas px-2.5 py-1.5 transition hover:border-accent active:cursor-grabbing"
                      >
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 font-mono text-[10px] font-bold text-accent-strong">
                            {(m.kuerzel ?? m.name.slice(0, 2)).toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.name}</span>
                        </div>
                        {sk.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {sk.slice(0, 3).map((s) => (
                              <span key={s} className="rounded bg-line/50 px-1.5 py-0.5 text-[9px] text-muted">
                                {s}
                              </span>
                            ))}
                            {sk.length > 3 && <span className="text-[9px] text-muted/60">+{sk.length - 3}</span>}
                          </div>
                        )}
                        <div className="mt-1.5 flex items-center gap-1.5" title={load ? load.blocks.join(' + ') : 'frei'}>
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line/50">
                            <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className={`font-mono text-[9px] ${labelColor}`}>
                            {load ? `${hrs.toFixed(1)}h` : 'frei'}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                  {grp.list.length === 0 && <div className="text-[10px] text-muted/60">—</div>}
                </div>
              ))}
            </div>
          </aside>

          <div className="min-w-0 space-y-4">
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

          {/* Schichtblöcke dieses Drehtags: anlegen / bearbeiten / löschen / Tag kopieren */}
          <div className="rounded-2xl border border-line bg-surface p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-wide text-muted">
                Schichtblöcke · dieser Drehtag
              </span>
              {dayBloecke.length === 0 && (
                <span className="text-xs text-muted/70">Noch keine Blöcke — unten anlegen oder Tag kopieren.</span>
              )}
            </div>

            {dayBloecke.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {dayBloecke.map((b) =>
                  editBlock?.id === b.id ? (
                    <li key={b.id} className="flex items-center gap-1.5 rounded-lg border border-accent/50 bg-canvas px-2 py-1">
                      <input
                        className="w-24 rounded border border-line bg-elevated px-1.5 py-0.5 text-xs"
                        value={editBlock.label}
                        onChange={(e) => setEditBlock({ ...editBlock, label: e.target.value })}
                      />
                      <input
                        type="time"
                        className="rounded border border-line bg-elevated px-1 py-0.5 text-xs"
                        value={editBlock.start_zeit}
                        onChange={(e) => setEditBlock({ ...editBlock, start_zeit: e.target.value })}
                      />
                      <input
                        type="time"
                        className="rounded border border-line bg-elevated px-1 py-0.5 text-xs"
                        value={editBlock.ende_zeit}
                        onChange={(e) => setEditBlock({ ...editBlock, ende_zeit: e.target.value })}
                      />
                      <input
                        type="color"
                        className="h-6 w-7 rounded border border-line"
                        value={editBlock.farbe}
                        onChange={(e) => setEditBlock({ ...editBlock, farbe: e.target.value })}
                      />
                      <button onClick={saveBlock} className="rounded bg-accent px-2 py-0.5 text-xs font-medium text-accent-ink">
                        ✓
                      </button>
                      <button onClick={() => setEditBlock(null)} className="px-1 text-xs text-muted hover:text-ink">
                        ×
                      </button>
                    </li>
                  ) : (
                    <li key={b.id} className="group flex items-center gap-2 rounded-lg border border-line bg-canvas px-2.5 py-1 text-sm">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: b.farbe ?? '#94a3b8' }} />
                      <span className="font-medium">{b.label}</span>
                      <span className="font-mono tnum text-xs text-muted">
                        {b.start_zeit.slice(0, 5)}–{b.ende_zeit.slice(0, 5)}
                      </span>
                      <button
                        onClick={() => setEditBlock({ id: b.id, label: b.label, start_zeit: b.start_zeit.slice(0, 5), ende_zeit: b.ende_zeit.slice(0, 5), farbe: b.farbe ?? '#6366f1' })}
                        className="text-muted/60 opacity-0 transition hover:text-accent-strong group-hover:opacity-100"
                        title="Block bearbeiten"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => deleteBlock(b.id)}
                        className="text-muted/60 opacity-0 transition hover:text-danger group-hover:opacity-100"
                        title="Block löschen"
                      >
                        ×
                      </button>
                    </li>
                  ),
                )}
              </ul>
            )}

            <div className="flex flex-wrap items-end gap-3 border-t border-line pt-3">
              <form onSubmit={addBlock} className="flex flex-wrap items-center gap-1.5">
                <input
                  className="w-28 rounded-lg border border-line bg-elevated px-2 py-1 text-sm"
                  placeholder="Block (z. B. Drehblock)"
                  value={blockForm.label}
                  onChange={(e) => setBlockForm({ ...blockForm, label: e.target.value })}
                />
                <input
                  type="time"
                  className="rounded-lg border border-line bg-elevated px-1.5 py-1 text-sm"
                  value={blockForm.start_zeit}
                  onChange={(e) => setBlockForm({ ...blockForm, start_zeit: e.target.value })}
                />
                <input
                  type="time"
                  className="rounded-lg border border-line bg-elevated px-1.5 py-1 text-sm"
                  value={blockForm.ende_zeit}
                  onChange={(e) => setBlockForm({ ...blockForm, ende_zeit: e.target.value })}
                />
                <input
                  type="color"
                  className="h-8 w-9 rounded-lg border border-line"
                  value={blockForm.farbe}
                  onChange={(e) => setBlockForm({ ...blockForm, farbe: e.target.value })}
                />
                <button className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink transition hover:opacity-90">
                  + Block
                </button>
              </form>

              <form onSubmit={copyDay} className="ml-auto flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted">Tag kopieren →</span>
                <input
                  type="date"
                  className="rounded-lg border border-line bg-elevated px-2 py-1 text-sm"
                  value={copyTo}
                  onChange={(e) => setCopyTo(e.target.value)}
                />
                <label className="flex items-center gap-1.5 text-xs text-muted">
                  <input type="checkbox" checked={copyBesetzung} onChange={(e) => setCopyBesetzung(e.target.checked)} />
                  inkl. Besetzung
                </label>
                <button
                  disabled={!copyTo || dayBloecke.length === 0}
                  className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium transition hover:border-accent hover:text-accent-strong disabled:opacity-40"
                >
                  Kopieren
                </button>
              </form>
            </div>
          </div>

          {dayBloecke.length > 0 && (
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className="sticky left-0 z-10 bg-surface p-3 text-left font-medium text-muted">
                    Position
                  </th>
                  {dayBloecke.map((b) => (
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
                    {dayBloecke.map((b) => {
                      const cs = cellShifts(pos.id, b.id)
                      const cellKey = `${pos.id}:${b.id}`
                      return (
                        <td
                          key={b.id}
                          onDragOver={(e) => {
                            e.preventDefault()
                            setOverCell(cellKey)
                          }}
                          onDragLeave={() => setOverCell((c) => (c === cellKey ? null : c))}
                          onDrop={(e) => {
                            e.preventDefault()
                            const id = e.dataTransfer.getData('text/plain')
                            setOverCell(null)
                            if (id) assign(pos.id, b.id, id, pos.location_id)
                          }}
                          className={[
                            'p-2 align-top transition',
                            overCell === cellKey ? 'bg-accent/10 ring-2 ring-inset ring-accent/50' : '',
                          ].join(' ')}
                        >
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
                                  <button
                                    onClick={() => setEditShift(s)}
                                    title="Schicht bearbeiten"
                                    className="flex items-center gap-1.5 truncate text-left hover:underline"
                                  >
                                    <span
                                      className={[
                                        'h-1.5 w-1.5 shrink-0 rounded-full',
                                        s.bestaetigt ? 'bg-ok' : 'bg-warn',
                                      ].join(' ')}
                                    />
                                    <span className="truncate">{p?.name ?? 'Unbekannt'}</span>
                                    {(s.start_zeit || s.ende_zeit) && (
                                      <span className="shrink-0 font-mono text-[9px] text-muted">
                                        {(s.start_zeit ?? b.start_zeit).slice(0, 5)}–{(s.ende_zeit ?? b.ende_zeit).slice(0, 5)}
                                      </span>
                                    )}
                                  </button>
                                  <button
                                    onClick={() => remove(s, pos.location_id)}
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
          )}
          </div>
        </div>
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

      {toast && (
        <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-line bg-elevated px-4 py-2 text-sm shadow-lg">
          <span>{toast.text}</span>
          <button
            onClick={() => {
              if (toastTimer.current) clearTimeout(toastTimer.current)
              toast.undo()
              setToast(null)
            }}
            className="font-medium text-accent-strong hover:underline"
          >
            Rückgängig
          </button>
        </div>
      )}

      {editShift && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setEditShift(null)}
        >
          <div
            className="w-full max-w-sm space-y-3 rounded-2xl border border-line bg-surface p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold tracking-tight">Schicht bearbeiten</h2>

            <label className="block text-sm">
              <span className="text-muted">Person</span>
              <select
                value={editShift.person_id ?? ''}
                onChange={(e) => setEditShift({ ...editShift, person_id: e.target.value || null })}
                className="mt-1 w-full rounded-lg border border-line bg-elevated px-3 py-2 text-sm text-ink"
              >
                <option value="">— offen —</option>
                {personen.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-muted">Position</span>
                <select
                  value={editShift.position_id ?? ''}
                  onChange={(e) => setEditShift({ ...editShift, position_id: e.target.value || null })}
                  className="mt-1 w-full rounded-lg border border-line bg-elevated px-3 py-2 text-sm text-ink"
                >
                  {positionenSortiert.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-muted">Schichtblock</span>
                <select
                  value={editShift.schichtblock_id ?? ''}
                  onChange={(e) => setEditShift({ ...editShift, schichtblock_id: e.target.value || null })}
                  className="mt-1 w-full rounded-lg border border-line bg-elevated px-3 py-2 text-sm text-ink"
                >
                  {dayBloecke.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label} ({b.start_zeit.slice(0, 5)}–{b.ende_zeit.slice(0, 5)})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-muted">Von (optional)</span>
                <input
                  type="time"
                  value={editShift.start_zeit?.slice(0, 5) ?? ''}
                  onChange={(e) => setEditShift({ ...editShift, start_zeit: e.target.value || null })}
                  className="mt-1 w-full rounded-lg border border-line bg-elevated px-3 py-2 text-sm text-ink"
                />
              </label>
              <label className="block text-sm">
                <span className="text-muted">Bis (optional)</span>
                <input
                  type="time"
                  value={editShift.ende_zeit?.slice(0, 5) ?? ''}
                  onChange={(e) => setEditShift({ ...editShift, ende_zeit: e.target.value || null })}
                  className="mt-1 w-full rounded-lg border border-line bg-elevated px-3 py-2 text-sm text-ink"
                />
              </label>
            </div>
            <p className="-mt-1 text-xs text-muted/70">Leer = Zeiten des Schichtblocks. Eigene Zeit überschreibt den Block für diese Schicht.</p>

            <label className="block text-sm">
              <span className="text-muted">Typ</span>
              <select
                value={editShift.typ}
                onChange={(e) => setEditShift({ ...editShift, typ: e.target.value })}
                className="mt-1 w-full rounded-lg border border-line bg-elevated px-3 py-2 text-sm capitalize text-ink"
              >
                {SCHICHT_TYPEN.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="text-muted">Notiz</span>
              <input
                value={editShift.notiz ?? ''}
                onChange={(e) => setEditShift({ ...editShift, notiz: e.target.value })}
                className="mt-1 w-full rounded-lg border border-line bg-elevated px-3 py-2 text-sm text-ink"
              />
            </label>

            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editShift.open_end}
                  onChange={(e) => setEditShift({ ...editShift, open_end: e.target.checked })}
                />
                Open End
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setEditShift(null)}
                className="rounded-lg px-3 py-2 text-sm text-muted hover:text-ink"
              >
                Abbrechen
              </button>
              <button
                onClick={saveEdit}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:opacity-90"
              >
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

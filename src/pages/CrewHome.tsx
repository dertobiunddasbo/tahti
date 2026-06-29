import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'

interface ShiftRow {
  id: string
  tag: string
  typ: string
  bestaetigt: boolean
  open_end: boolean
  notiz: string | null
  schichtblock: { label: string; start_zeit: string; ende_zeit: string; farbe: string | null } | null
  position: { label: string } | null
  location: { name: string } | null
  projekt: { name: string } | null
}

function toDate(tag: string, time: string) {
  return new Date(`${tag}T${time}`)
}

/** Start/Ende als Date; Nachtschichten laufen über Mitternacht. */
function shiftWindow(s: ShiftRow): { start: Date; end: Date } | null {
  if (!s.schichtblock) return null
  const start = toDate(s.tag, s.schichtblock.start_zeit)
  let end = toDate(s.tag, s.schichtblock.ende_zeit)
  if (end <= start) end = new Date(end.getTime() + 24 * 3600 * 1000)
  return { start, end }
}

const dayFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })
const timeFmt = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' })

function ShiftCard({ s, highlight }: { s: ShiftRow; highlight?: 'now' | 'next' }) {
  const win = shiftWindow(s)
  const color = s.schichtblock?.farbe ?? '#94a3b8'
  return (
    <div
      className={[
        'rounded-2xl border bg-white p-4',
        highlight === 'now' ? 'border-accent-500 ring-2 ring-accent-100' : 'border-slate-200',
      ].join(' ')}
    >
      {highlight && (
        <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-400">
          {highlight === 'now' ? (
            <>
              <span className="h-2 w-2 animate-pulse rounded-full bg-accent-500" /> Jetzt
            </>
          ) : (
            'Als nächstes'
          )}
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="font-medium">{s.schichtblock?.label ?? 'Schicht'}</span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-600">{s.position?.label ?? 'Position offen'}</span>
          </div>
          <div className="mt-1 text-sm text-slate-500">
            {win ? `${dayFmt.format(win.start)} · ${timeFmt.format(win.start)}–${timeFmt.format(win.end)}` : s.tag}
            {s.location?.name ? ` · ${s.location.name}` : ''}
          </div>
          {s.projekt?.name && <div className="mt-0.5 text-xs text-slate-400">{s.projekt.name}</div>}
        </div>
        <span
          className={[
            'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
            s.bestaetigt ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
          ].join(' ')}
        >
          {s.bestaetigt ? 'bestätigt' : 'offen'}
        </span>
      </div>
    </div>
  )
}

export default function CrewHome() {
  const { person } = useAuth()
  const [shifts, setShifts] = useState<ShiftRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!person) return
    supabase
      .from('schicht')
      .select(
        'id, tag, typ, bestaetigt, open_end, notiz, ' +
          'schichtblock:schichtblock_id (label, start_zeit, ende_zeit, farbe), ' +
          'position:position_id (label), location:location_id (name), projekt:projekt_id (name)',
      )
      .eq('person_id', person.id)
      .order('tag', { ascending: true })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setShifts((data as unknown as ShiftRow[]) ?? [])
      })
  }, [person])

  const now = useMemo(() => new Date(), [])

  const { current, next, upcoming } = useMemo(() => {
    const list = (shifts ?? [])
      .map((s) => ({ s, win: shiftWindow(s) }))
      .filter((x) => x.win && x.win.end >= now)
      .sort((a, b) => a.win!.start.getTime() - b.win!.start.getTime())
    const current = list.find((x) => x.win!.start <= now && now <= x.win!.end)?.s ?? null
    const future = list.filter((x) => x.win!.start > now).map((x) => x.s)
    const next = current ? future[0] ?? null : future[0] ?? null
    return { current, next, upcoming: future }
  }, [shifts, now])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Hallo{person?.name ? `, ${person.name.split(' ')[0]}` : ''}
        </h1>
        <p className="mt-1 text-sm text-slate-500">Deine nächste Schicht auf einen Blick.</p>
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {shifts === null ? (
        <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
      ) : current || next ? (
        <div className="space-y-3">
          {current && <ShiftCard s={current} highlight="now" />}
          {next && next !== current && <ShiftCard s={next} highlight={current ? undefined : 'next'} />}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm font-medium text-slate-700">Keine anstehenden Schichten</p>
          <p className="mt-1 text-sm text-slate-400">Sobald du eingeplant bist, erscheint es hier.</p>
        </div>
      )}

      {upcoming.length > 1 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-slate-500">Kommende Schichten</h2>
          <div className="space-y-2">
            {upcoming.slice(current ? 0 : 1).map((s) => (
              <ShiftCard key={s.id} s={s} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

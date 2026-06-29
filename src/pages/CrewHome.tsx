import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { PLANER_ROLLEN } from '../lib/types'

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

interface Kontakt {
  id: string
  name: string
  rolle: string
  mobil: string | null
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

function ShiftCard({
  s,
  highlight,
  onConfirm,
}: {
  s: ShiftRow
  highlight?: 'now' | 'next'
  onConfirm: (id: string) => void
}) {
  const win = shiftWindow(s)
  const color = s.schichtblock?.farbe ?? '#94a3b8'
  return (
    <div
      className={[
        'rounded-2xl border bg-surface p-4',
        highlight === 'now' ? 'border-accent ring-2 ring-accent/30' : 'border-line',
      ].join(' ')}
    >
      {highlight && (
        <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted">
          {highlight === 'now' ? (
            <>
              <span className="h-2 w-2 animate-pulse rounded-full bg-accent/100" /> Jetzt
            </>
          ) : (
            'Als nächstes'
          )}
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="font-medium">{s.schichtblock?.label ?? 'Schicht'}</span>
            <span className="text-muted">·</span>
            <span className="truncate text-muted">{s.position?.label ?? 'Position offen'}</span>
          </div>
          <div className="mt-1 text-sm text-muted">
            {win
              ? `${dayFmt.format(win.start)} · ${timeFmt.format(win.start)}–${timeFmt.format(win.end)}`
              : s.tag}
            {s.location?.name ? ` · ${s.location.name}` : ''}
          </div>
          {s.projekt?.name && <div className="mt-0.5 text-xs text-muted">{s.projekt.name}</div>}
        </div>
        <div className="shrink-0">
          {s.bestaetigt ? (
            <span className="rounded-full bg-ok/15 px-2 py-0.5 text-xs font-medium text-ok">
              ✓ bestätigt
            </span>
          ) : (
            <button
              onClick={() => onConfirm(s.id)}
              className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-ink transition hover:opacity-90 print:hidden"
            >
              Bestätigen
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function CrewHome() {
  const { person, memberships } = useAuth()
  const [shifts, setShifts] = useState<ShiftRow[] | null>(null)
  const [kontakte, setKontakte] = useState<Kontakt[]>([])
  const [error, setError] = useState<string | null>(null)

  const selectStr =
    'id, tag, typ, bestaetigt, open_end, notiz, ' +
    'schichtblock:schichtblock_id (label, start_zeit, ende_zeit, farbe), ' +
    'position:position_id (label), location:location_id (name), projekt:projekt_id (name)'

  const load = useCallback(() => {
    if (!person) return
    supabase
      .from('schicht')
      .select(selectStr)
      .eq('person_id', person.id)
      .order('tag', { ascending: true })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setShifts((data as unknown as ShiftRow[]) ?? [])
      })
  }, [person, selectStr])

  useEffect(() => {
    load()
  }, [load])

  // Kontakte: Planer (admin/disponent/lead) der eigenen Orgs mit Mobilnummer
  useEffect(() => {
    const orgIds = memberships.map((m) => m.org_id)
    if (orgIds.length === 0) return
    supabase
      .from('person_public')
      .select('id, name, rolle, mobil, org_id')
      .in('org_id', orgIds)
      .in('rolle', PLANER_ROLLEN)
      .then(({ data }) => {
        const seen = new Set<string>()
        const list: Kontakt[] = []
        for (const r of (data as Kontakt[]) ?? []) {
          if (seen.has(r.id)) continue
          seen.add(r.id)
          list.push(r)
        }
        setKontakte(list)
      })
  }, [memberships])

  async function confirm(id: string) {
    setShifts((prev) => prev?.map((s) => (s.id === id ? { ...s, bestaetigt: true } : s)) ?? prev)
    const { error } = await supabase.from('schicht').update({ bestaetigt: true }).eq('id', id)
    if (error) {
      setError(error.message)
      load()
    }
  }

  const now = useMemo(() => new Date(), [])

  const { current, next, upcoming } = useMemo(() => {
    const list = (shifts ?? [])
      .map((s) => ({ s, win: shiftWindow(s) }))
      .filter((x) => x.win && x.win.end >= now)
      .sort((a, b) => a.win!.start.getTime() - b.win!.start.getTime())
    const current = list.find((x) => x.win!.start <= now && now <= x.win!.end)?.s ?? null
    const future = list.filter((x) => x.win!.start > now).map((x) => x.s)
    const next = future[0] ?? null
    return { current, next, upcoming: future }
  }, [shifts, now])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Hallo{person?.name ? `, ${person.name.split(' ')[0]}` : ''}
          </h1>
          <p className="mt-1 text-sm text-muted">Deine nächste Schicht auf einen Blick.</p>
        </div>
        <button
          onClick={() => window.print()}
          className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-line/40 print:hidden"
        >
          Plan drucken
        </button>
      </div>

      {error && <div className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</div>}

      {shifts === null ? (
        <div className="h-24 animate-pulse rounded-2xl bg-line/40" />
      ) : current || next ? (
        <div className="space-y-3">
          {current && <ShiftCard s={current} highlight="now" onConfirm={confirm} />}
          {next && next !== current && (
            <ShiftCard s={next} highlight={current ? undefined : 'next'} onConfirm={confirm} />
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center">
          <p className="text-sm font-medium text-ink">Keine anstehenden Schichten</p>
          <p className="mt-1 text-sm text-muted">Sobald du eingeplant bist, erscheint es hier.</p>
        </div>
      )}

      {upcoming.length > 1 && (
        <div className="space-y-2">
          <h2 className="font-mono text-xs uppercase tracking-wide text-muted">Kommende Schichten</h2>
          <div className="space-y-2">
            {upcoming.slice(current ? 0 : 1).map((s) => (
              <ShiftCard key={s.id} s={s} onConfirm={confirm} />
            ))}
          </div>
        </div>
      )}

      {kontakte.length > 0 && (
        <div className="space-y-2 print:hidden">
          <h2 className="font-mono text-xs uppercase tracking-wide text-muted">Kontakte</h2>
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {kontakte.map((k) => (
              <div key={k.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{k.name}</div>
                  <div className="text-xs capitalize text-muted">{k.rolle}</div>
                </div>
                {k.mobil ? (
                  <a
                    href={`tel:${k.mobil.replace(/\s/g, '')}`}
                    className="shrink-0 rounded-lg bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent-strong hover:bg-accent/20"
                  >
                    Anrufen
                  </a>
                ) : (
                  <span className="text-xs text-muted/60">keine Nummer</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

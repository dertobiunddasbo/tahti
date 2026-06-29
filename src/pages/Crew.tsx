import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useProductions } from '../productions/ProductionProvider'
import type { CrewStatus, PersonTyp, SystemRolle } from '../lib/types'

interface PoolPerson { id: string; name: string; email: string; mobil: string | null; rolle: SystemRolle }
interface BesetzungRow {
  id: string
  person_id: string
  status: CrewStatus
  rolle_im_projekt: string | null
  person: { id: string; name: string; email: string; mobil: string | null } | null
}

const STATUS: { value: CrewStatus; label: string; cls: string }[] = [
  { value: 'eingeladen', label: 'eingeladen', cls: 'bg-warn/15 text-warn' },
  { value: 'zugesagt', label: 'zugesagt', cls: 'bg-ok/15 text-ok' },
  { value: 'abgesagt', label: 'abgesagt', cls: 'bg-line/40 text-muted' },
]

const input =
  'rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30'

export default function Crew() {
  const { selected: projekt } = useProductions()
  const [pool, setPool] = useState<PoolPerson[]>([])
  const [besetzung, setBesetzung] = useState<BesetzungRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [addId, setAddId] = useState('')
  const [open, setOpen] = useState(false)
  const [neu, setNeu] = useState({ name: '', email: '', mobil: '', rolle: 'crew' as SystemRolle })

  const reload = useCallback(() => {
    if (!projekt) return
    supabase
      .from('person_public')
      .select('id, name, email, mobil, rolle')
      .eq('org_id', projekt.org_id)
      .order('name')
      .then(({ data }) => setPool((data as PoolPerson[]) ?? []))
    supabase
      .from('besetzung')
      .select('id, person_id, status, rolle_im_projekt, person:person_id (id, name, email, mobil)')
      .eq('projekt_id', projekt.id)
      .then(({ data }) => setBesetzung((data as unknown as BesetzungRow[]) ?? []))
  }, [projekt])

  useEffect(() => {
    reload()
  }, [reload])

  const imTeam = useMemo(() => new Set(besetzung.map((b) => b.person_id)), [besetzung])
  const verfuegbar = useMemo(() => pool.filter((p) => !imTeam.has(p.id)), [pool, imTeam])

  async function addToTeam(personId: string) {
    if (!projekt || !personId) return
    setError(null)
    const { error } = await supabase
      .from('besetzung')
      .insert({ org_id: projekt.org_id, projekt_id: projekt.id, person_id: personId, status: 'eingeladen' })
    if (error) setError(error.message)
    else {
      setAddId('')
      reload()
    }
  }

  async function setStatus(id: string, status: CrewStatus) {
    setBesetzung((prev) => prev.map((b) => (b.id === id ? { ...b, status } : b)))
    const { error } = await supabase.from('besetzung').update({ status }).eq('id', id)
    if (error) {
      setError(error.message)
      reload()
    }
  }

  async function removeFromTeam(id: string) {
    setError(null)
    const { error } = await supabase.from('besetzung').delete().eq('id', id)
    if (error) setError(error.message)
    else reload()
  }

  async function createPerson(e: FormEvent) {
    e.preventDefault()
    if (!projekt || !neu.name.trim() || !neu.email.trim()) return
    setError(null)
    // id clientseitig: kein RETURNING noetig (sonst greift die person-SELECT-Policy,
    // und die frische Person ist mangels Mitgliedschaft noch nicht sichtbar).
    const id = crypto.randomUUID()
    const { error: pe } = await supabase
      .from('person')
      .insert({ id, name: neu.name.trim(), email: neu.email.trim().toLowerCase(), mobil: neu.mobil.trim() || null })
    if (pe) return setError(pe.message)
    const { error: me } = await supabase.from('membership').insert({
      person_id: id,
      org_id: projekt.org_id,
      rolle: neu.rolle as SystemRolle,
      typ: 'freelance' as PersonTyp,
    })
    if (me) return setError(me.message)
    // direkt zur Produktion hinzufügen
    const { error: be } = await supabase
      .from('besetzung')
      .insert({ org_id: projekt.org_id, projekt_id: projekt.id, person_id: id, status: 'eingeladen' })
    if (be) return setError(be.message)
    setNeu({ name: '', email: '', mobil: '', rolle: 'crew' })
    setOpen(false)
    reload()
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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Crew</h1>
          <p className="mt-1 text-sm text-muted">{projekt.name} · Besetzung der Produktion</p>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-line/40"
        >
          {open ? 'Abbrechen' : '+ Neue Person'}
        </button>
      </div>

      {error && <div className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</div>}

      {open && (
        <form onSubmit={createPerson} className="flex flex-wrap gap-2 rounded-2xl border border-line bg-surface p-4">
          <input className={`${input} flex-1`} placeholder="Name" value={neu.name} onChange={(e) => setNeu({ ...neu, name: e.target.value })} />
          <input className={`${input} flex-1`} type="email" placeholder="E-Mail" value={neu.email} onChange={(e) => setNeu({ ...neu, email: e.target.value })} />
          <input className={`${input} flex-1`} placeholder="Mobil (optional)" value={neu.mobil} onChange={(e) => setNeu({ ...neu, mobil: e.target.value })} />
          <select className={input} value={neu.rolle} onChange={(e) => setNeu({ ...neu, rolle: e.target.value as SystemRolle })}>
            <option value="crew">Crew</option>
            <option value="lead">Lead</option>
            <option value="disponent">Disponent</option>
            <option value="admin">Admin</option>
            <option value="gast">Gast</option>
          </select>
          <button className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:opacity-90">
            Anlegen &amp; hinzufügen
          </button>
        </form>
      )}

      {/* Person aus Pool hinzufügen */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-4">
        <span className="text-sm text-muted">Aus Firmen-Pool hinzufügen:</span>
        <select className={`${input} flex-1`} value={addId} onChange={(e) => setAddId(e.target.value)}>
          <option value="">Person wählen …</option>
          {verfuegbar.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.rolle})
            </option>
          ))}
        </select>
        <button
          onClick={() => addToTeam(addId)}
          disabled={!addId}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:opacity-90 disabled:opacity-50"
        >
          Hinzufügen
        </button>
      </div>

      {/* Besetzungsliste */}
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="border-b border-line px-4 py-2 text-sm font-medium text-muted">
          Team ({besetzung.length})
        </div>
        <ul className="divide-y divide-line">
          {besetzung.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate font-medium">{b.person?.name ?? 'Unbekannt'}</div>
                <div className="truncate text-xs text-muted">{b.person?.email}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <select
                  value={b.status}
                  onChange={(e) => setStatus(b.id, e.target.value as CrewStatus)}
                  className={`rounded-full px-2 py-1 text-xs font-medium ${STATUS.find((s) => s.value === b.status)?.cls ?? ''}`}
                >
                  {STATUS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <button onClick={() => removeFromTeam(b.id)} className="text-muted/60 hover:text-danger" title="Entfernen">
                  ×
                </button>
              </div>
            </li>
          ))}
          {besetzung.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-muted">Noch niemand in der Crew.</li>
          )}
        </ul>
      </div>
    </div>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
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
interface Skill { id: string; name: string }

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
  const [skills, setSkills] = useState<Skill[]>([])
  const [pSkills, setPSkills] = useState<Map<string, Set<string>>>(new Map())
  const [newSkill, setNewSkill] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [toast, setToast] = useState<{ text: string; undo: () => void } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

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
    supabase
      .from('skill')
      .select('id, name')
      .eq('org_id', projekt.org_id)
      .order('sortierung')
      .then(({ data }) => setSkills((data as Skill[]) ?? []))
    supabase
      .from('person_skill')
      .select('person_id, skill_id, skill:skill_id!inner (org_id)')
      .eq('skill.org_id', projekt.org_id)
      .then(({ data }) => {
        const m = new Map<string, Set<string>>()
        for (const r of (data as unknown as { person_id: string; skill_id: string }[]) ?? []) {
          const set = m.get(r.person_id) ?? new Set<string>()
          set.add(r.skill_id)
          m.set(r.person_id, set)
        }
        setPSkills(m)
      })
  }, [projekt])

  useEffect(() => {
    reload()
  }, [reload])

  const imTeam = useMemo(() => new Set(besetzung.map((b) => b.person_id)), [besetzung])
  const verfuegbar = useMemo(() => pool.filter((p) => !imTeam.has(p.id)), [pool, imTeam])
  const skillById = useMemo(() => new Map(skills.map((s) => [s.id, s.name])), [skills])

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

  function showToast(text: string, undo: () => void) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ text, undo })
    toastTimer.current = setTimeout(() => setToast(null), 6000)
  }

  async function removeFromTeam(b: BesetzungRow) {
    if (!projekt) return
    if (b.status === 'zugesagt' && !window.confirm('Diese Person hat zugesagt. Wirklich aus der Crew entfernen?')) return
    setError(null)
    const { error } = await supabase.from('besetzung').delete().eq('id', b.id)
    if (error) return setError(error.message)
    reload()
    const payload = {
      org_id: projekt.org_id,
      projekt_id: projekt.id,
      person_id: b.person_id,
      status: b.status,
      rolle_im_projekt: b.rolle_im_projekt,
    }
    showToast('Aus Crew entfernt', async () => {
      const { error: e } = await supabase.from('besetzung').insert(payload)
      if (e) setError(e.message)
      else reload()
    })
  }

  async function addSkill() {
    if (!projekt || !newSkill.trim()) return
    setError(null)
    const { error } = await supabase
      .from('skill')
      .insert({ org_id: projekt.org_id, name: newSkill.trim(), sortierung: skills.length + 1 })
    if (error) setError(error.message)
    else {
      setNewSkill('')
      reload()
    }
  }
  async function deleteSkill(id: string) {
    setError(null)
    const { error } = await supabase.from('skill').delete().eq('id', id)
    if (error) setError(error.message)
    else reload()
  }
  async function togglePersonSkill(personId: string, skillId: string, on: boolean) {
    setError(null)
    if (on) {
      const { error } = await supabase.from('person_skill').insert({ person_id: personId, skill_id: skillId })
      if (error) return setError(error.message)
    } else {
      const { error } = await supabase
        .from('person_skill')
        .delete()
        .eq('person_id', personId)
        .eq('skill_id', skillId)
      if (error) return setError(error.message)
    }
    reload()
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
    <div className="mx-auto max-w-3xl space-y-5">
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

      {/* Skill-Katalog (Firma) */}
      <div className="space-y-3 rounded-2xl border border-line bg-surface p-4">
        <div className="font-mono text-xs uppercase tracking-wide text-muted">Skills (Firma)</div>
        <div className="flex flex-wrap gap-1.5">
          {skills.map((s) => (
            <span
              key={s.id}
              className="group inline-flex items-center gap-1 rounded-full bg-line/40 px-2.5 py-1 text-xs"
            >
              {s.name}
              <button
                onClick={() => deleteSkill(s.id)}
                className="text-muted/60 hover:text-danger"
                title="Skill löschen"
              >
                ×
              </button>
            </span>
          ))}
          {skills.length === 0 && <span className="text-xs text-muted">Noch keine Skills im Katalog.</span>}
        </div>
        <div className="flex gap-2">
          <input
            className={`${input} flex-1`}
            placeholder="Neuer Skill (z. B. Ü-Wagen)"
            value={newSkill}
            onChange={(e) => setNewSkill(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addSkill()}
          />
          <button
            onClick={addSkill}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:opacity-90"
          >
            + Skill
          </button>
        </div>
      </div>

      {/* Besetzungsliste */}
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="border-b border-line px-4 py-2 text-sm font-medium text-muted">
          Team ({besetzung.length})
        </div>
        <ul className="divide-y divide-line">
          {besetzung.map((b) => {
            const mySkills = pSkills.get(b.person_id) ?? new Set<string>()
            return (
              <li key={b.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{b.person?.name ?? 'Unbekannt'}</div>
                    <div className="truncate text-xs text-muted">{b.person?.email}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => setExpanded((e) => (e === b.person_id ? null : b.person_id))}
                      className="rounded-lg border border-line px-2 py-1 text-xs text-muted hover:text-ink"
                      title="Skills bearbeiten"
                    >
                      Skills
                    </button>
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
                    <button onClick={() => removeFromTeam(b)} className="text-muted/60 hover:text-danger" title="Entfernen">
                      ×
                    </button>
                  </div>
                </div>

                {mySkills.size > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {[...mySkills].map((sid) => (
                      <span key={sid} className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] text-accent-strong">
                        {skillById.get(sid) ?? '?'}
                      </span>
                    ))}
                  </div>
                )}

                {expanded === b.person_id && (
                  <div className="mt-2 flex flex-wrap gap-1.5 rounded-lg bg-canvas p-2">
                    {skills.map((s) => {
                      const on = mySkills.has(s.id)
                      return (
                        <button
                          key={s.id}
                          onClick={() => togglePersonSkill(b.person_id, s.id, !on)}
                          className={[
                            'rounded-full px-2.5 py-1 text-xs transition',
                            on ? 'bg-accent text-accent-ink' : 'bg-line/40 text-muted hover:text-ink',
                          ].join(' ')}
                        >
                          {s.name}
                        </button>
                      )
                    })}
                    {skills.length === 0 && <span className="text-xs text-muted">Lege oben Skills an.</span>}
                  </div>
                )}
              </li>
            )
          })}
          {besetzung.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-muted">Noch niemand in der Crew.</li>
          )}
        </ul>
      </div>

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
    </div>
  )
}

import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useProductions, type Produktion } from '../productions/ProductionProvider'
import { PLANER_ROLLEN, type ProjektTyp } from '../lib/types'

const TYP_LABEL: Record<ProjektTyp, string> = { event: 'Event', dreh: 'Dreh', live: 'Live' }

const dateFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
function fmt(d: string | null) {
  return d ? dateFmt.format(new Date(`${d}T00:00:00`)) : '—'
}

function status(p: Produktion): { label: string; cls: string } {
  const today = new Date().toISOString().slice(0, 10)
  if (p.end_datum && p.end_datum < today) return { label: 'abgeschlossen', cls: 'bg-line/40 text-muted' }
  if (p.start_datum && p.start_datum > today) return { label: 'kommend', cls: 'bg-warn/15 text-warn' }
  return { label: 'aktiv', cls: 'bg-ok/15 text-ok' }
}

export default function Produktionen() {
  const { memberships } = useAuth()
  const { productions, loading, setSelectedId, reload } = useProductions()
  const navigate = useNavigate()

  const planerOrgs = useMemo(
    () =>
      memberships
        .filter((m) => PLANER_ROLLEN.includes(m.rolle) && m.org)
        .map((m) => m.org!)
        .filter((o, i, arr) => arr.findIndex((x) => x.id === o.id) === i),
    [memberships],
  )

  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    typ: 'event' as ProjektTyp,
    org_id: planerOrgs[0]?.id ?? '',
    client: '',
    start_datum: '',
    end_datum: '',
  })

  async function create(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const { data, error } = await supabase
      .from('projekt')
      .insert({
        name: form.name.trim(),
        typ: form.typ,
        org_id: form.org_id || planerOrgs[0]?.id,
        client: form.client.trim() || null,
        start_datum: form.start_datum || null,
        end_datum: form.end_datum || null,
      })
      .select('id')
      .single()
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    setOpen(false)
    setForm((f) => ({ ...f, name: '', client: '', start_datum: '', end_datum: '' }))
    reload()
    if (data) setSelectedId(data.id)
  }

  function openInDispo(p: Produktion) {
    setSelectedId(p.id)
    navigate('/dispo')
  }

  const inputCls =
    'mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Produktionen</h1>
          <p className="mt-1 text-sm text-muted">Alle Events &amp; Drehs deiner Firma.</p>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          disabled={planerOrgs.length === 0}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition hover:opacity-90 disabled:opacity-50"
        >
          {open ? 'Abbrechen' : '+ Neue Produktion'}
        </button>
      </div>

      {open && (
        <form onSubmit={create} className="space-y-4 rounded-2xl border border-line bg-surface p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-ink">Name</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="z. B. Sommerfestival 2026"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink">Typ</label>
              <select
                value={form.typ}
                onChange={(e) => setForm({ ...form, typ: e.target.value as ProjektTyp })}
                className={inputCls}
              >
                <option value="event">Event</option>
                <option value="dreh">Dreh</option>
                <option value="live">Live</option>
              </select>
            </div>
            {planerOrgs.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-ink">Firma</label>
                <select
                  value={form.org_id}
                  onChange={(e) => setForm({ ...form, org_id: e.target.value })}
                  className={inputCls}
                >
                  {planerOrgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-ink">Client (optional)</label>
              <input
                value={form.client}
                onChange={(e) => setForm({ ...form, client: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink">Start</label>
              <input
                type="date"
                value={form.start_datum}
                onChange={(e) => setForm({ ...form, start_datum: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink">Ende</label>
              <input
                type="date"
                value={form.end_datum}
                onChange={(e) => setForm({ ...form, end_datum: e.target.value })}
                className={inputCls}
              />
            </div>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition hover:opacity-90 disabled:opacity-60"
          >
            {saving ? 'Speichere …' : 'Produktion anlegen'}
          </button>
        </form>
      )}

      {loading ? (
        <div className="h-24 animate-pulse rounded-2xl bg-line/40" />
      ) : productions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center">
          <p className="text-sm font-medium text-ink">Noch keine Produktionen</p>
          <p className="mt-1 text-sm text-muted">Lege oben deine erste Produktion an.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {productions.map((p) => {
            const st = status(p)
            return (
              <div key={p.id} className="flex flex-col rounded-2xl border border-line bg-surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{p.name}</div>
                    <div className="mt-0.5 text-xs text-muted">
                      {TYP_LABEL[p.typ]}
                      {p.client ? ` · ${p.client}` : ''}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>
                    {st.label}
                  </span>
                </div>
                <div className="mt-2 text-sm text-muted">
                  {fmt(p.start_datum)} – {fmt(p.end_datum)}
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => openInDispo(p)}
                    className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-line/40"
                  >
                    Dispo öffnen →
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

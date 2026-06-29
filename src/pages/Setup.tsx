import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useProductions } from '../productions/ProductionProvider'

interface Loc { id: string; name: string; adresse: string | null }
interface Dept { id: string; name: string; sortierung: number }
interface Block { id: string; label: string; start_zeit: string; ende_zeit: string; farbe: string | null }
interface Pos { id: string; label: string; department_id: string | null; location_id: string | null }

const card = 'rounded-2xl border border-line bg-surface p-5 space-y-3'
const input = 'rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30'
const addBtn = 'rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-ink transition hover:opacity-90 disabled:opacity-50'
const delBtn = 'text-muted/60 transition hover:text-danger'
const editBtn = 'text-muted/60 transition hover:text-accent-strong'
const saveBtn = 'rounded-lg bg-accent px-2.5 py-1 text-sm font-medium text-accent-ink transition hover:opacity-90'

export default function Setup() {
  const { selected: projekt } = useProductions()
  const [locs, setLocs] = useState<Loc[]>([])
  const [depts, setDepts] = useState<Dept[]>([])
  const [blocks, setBlocks] = useState<Block[]>([])
  const [positions, setPositions] = useState<Pos[]>([])
  const [error, setError] = useState<string | null>(null)
  const [edit, setEdit] = useState<{ table: string; id: string } | null>(null)
  const [draft, setDraft] = useState<Record<string, unknown>>({})
  const isEditing = (table: string, id: string) => edit?.table === table && edit?.id === id
  function startEdit(table: string, id: string, values: Record<string, unknown>) {
    setEdit({ table, id })
    setDraft(values)
  }

  const reloadAll = useCallback(() => {
    if (!projekt) return
    const pid = projekt.id
    supabase.from('location').select('id, name, adresse').eq('projekt_id', pid).order('name').then(({ data }) => setLocs((data as Loc[]) ?? []))
    supabase.from('department').select('id, name, sortierung').eq('projekt_id', pid).order('sortierung').then(({ data }) => setDepts((data as Dept[]) ?? []))
    supabase.from('schichtblock').select('id, label, start_zeit, ende_zeit, farbe').eq('projekt_id', pid).order('start_zeit').then(({ data }) => setBlocks((data as Block[]) ?? []))
    supabase.from('position').select('id, label, department_id, location_id').eq('projekt_id', pid).order('label').then(({ data }) => setPositions((data as Pos[]) ?? []))
  }, [projekt])

  useEffect(() => { reloadAll() }, [reloadAll])

  async function insert(table: string, row: Record<string, unknown>) {
    if (!projekt) return
    setError(null)
    const { error } = await supabase.from(table).insert({ org_id: projekt.org_id, projekt_id: projekt.id, ...row })
    if (error) setError(error.message)
    else reloadAll()
  }
  async function del(table: string, id: string) {
    if (!window.confirm('Wirklich löschen? Zugewiesene Schichten/Positionen verlieren diese Zuordnung.')) return
    setError(null)
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) setError(error.message)
    else reloadAll()
  }
  async function saveEdit() {
    if (!edit) return
    const nullable = new Set(['adresse', 'department_id', 'location_id'])
    const patch: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(draft)) {
      patch[k] = nullable.has(k) && v === '' ? null : k === 'sortierung' ? Number(v) : v
    }
    setError(null)
    const { error } = await supabase.from(edit.table).update(patch).eq('id', edit.id)
    if (error) setError(error.message)
    else {
      setEdit(null)
      reloadAll()
    }
  }

  // Formularzustände
  const [loc, setLoc] = useState({ name: '', adresse: '' })
  const [dept, setDept] = useState({ name: '' })
  const [block, setBlock] = useState({ label: '', start_zeit: '', ende_zeit: '', farbe: '#6366f1' })
  const [pos, setPos] = useState({ label: '', department_id: '', location_id: '' })

  if (!projekt) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
        Keine Produktion gewählt.{' '}
        <Link to="/produktionen" className="font-medium text-accent-strong hover:underline">Produktion anlegen oder auswählen →</Link>
      </div>
    )
  }

  const submitLoc = (e: FormEvent) => { e.preventDefault(); if (!loc.name.trim()) return; insert('location', { name: loc.name.trim(), adresse: loc.adresse.trim() || null }); setLoc({ name: '', adresse: '' }) }
  const submitDept = (e: FormEvent) => { e.preventDefault(); if (!dept.name.trim()) return; insert('department', { name: dept.name.trim(), sortierung: depts.length + 1 }); setDept({ name: '' }) }
  const submitBlock = (e: FormEvent) => { e.preventDefault(); if (!block.label.trim() || !block.start_zeit || !block.ende_zeit) return; insert('schichtblock', { label: block.label.trim(), start_zeit: block.start_zeit, ende_zeit: block.ende_zeit, farbe: block.farbe }); setBlock({ label: '', start_zeit: '', ende_zeit: '', farbe: '#6366f1' }) }
  const submitPos = (e: FormEvent) => { e.preventDefault(); if (!pos.label.trim()) return; insert('position', { label: pos.label.trim(), department_id: pos.department_id || null, location_id: pos.location_id || null }); setPos({ label: '', department_id: '', location_id: '' }) }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Setup</h1>
        <p className="mt-1 text-sm text-muted">{projekt.name} · Struktur einrichten</p>
      </div>
      {error && <div className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</div>}

      {/* Locations */}
      <div className={card}>
        <h2 className="font-medium">Locations</h2>
        <ul className="divide-y divide-line">
          {locs.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              {isEditing('location', l.id) ? (
                <>
                  <div className="flex flex-1 flex-wrap gap-2">
                    <input className={`${input} flex-1`} value={draft.name as string} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                    <input className={`${input} flex-1`} placeholder="Adresse" value={(draft.adresse as string) ?? ''} onChange={(e) => setDraft({ ...draft, adresse: e.target.value })} />
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button onClick={saveEdit} className={saveBtn}>Speichern</button>
                    <button onClick={() => setEdit(null)} className={delBtn} title="Abbrechen">×</button>
                  </div>
                </>
              ) : (
                <>
                  <span>{l.name}{l.adresse ? <span className="text-muted"> · {l.adresse}</span> : null}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    <button onClick={() => startEdit('location', l.id, { name: l.name, adresse: l.adresse ?? '' })} className={editBtn} title="Bearbeiten">✎</button>
                    <button onClick={() => del('location', l.id)} className={delBtn} title="Löschen">×</button>
                  </div>
                </>
              )}
            </li>
          ))}
          {locs.length === 0 && <li className="py-2 text-sm text-muted">Noch keine Locations.</li>}
        </ul>
        <form onSubmit={submitLoc} className="flex flex-wrap gap-2">
          <input className={`${input} flex-1`} placeholder="Name" value={loc.name} onChange={(e) => setLoc({ ...loc, name: e.target.value })} />
          <input className={`${input} flex-1`} placeholder="Adresse (optional)" value={loc.adresse} onChange={(e) => setLoc({ ...loc, adresse: e.target.value })} />
          <button className={addBtn}>+ Hinzufügen</button>
        </form>
      </div>

      {/* Departments */}
      <div className={card}>
        <h2 className="font-medium">Departments</h2>
        <ul className="divide-y divide-line">
          {depts.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              {isEditing('department', d.id) ? (
                <>
                  <div className="flex flex-1 gap-2">
                    <input type="number" className={`${input} w-16`} value={draft.sortierung as number} onChange={(e) => setDraft({ ...draft, sortierung: e.target.value })} />
                    <input className={`${input} flex-1`} value={draft.name as string} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button onClick={saveEdit} className={saveBtn}>Speichern</button>
                    <button onClick={() => setEdit(null)} className={delBtn} title="Abbrechen">×</button>
                  </div>
                </>
              ) : (
                <>
                  <span><span className="text-muted">{d.sortierung}.</span> {d.name}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    <button onClick={() => startEdit('department', d.id, { name: d.name, sortierung: d.sortierung })} className={editBtn} title="Bearbeiten">✎</button>
                    <button onClick={() => del('department', d.id)} className={delBtn} title="Löschen">×</button>
                  </div>
                </>
              )}
            </li>
          ))}
          {depts.length === 0 && <li className="py-2 text-sm text-muted">Noch keine Departments.</li>}
        </ul>
        <form onSubmit={submitDept} className="flex gap-2">
          <input className={`${input} flex-1`} placeholder="z. B. Kamera" value={dept.name} onChange={(e) => setDept({ name: e.target.value })} />
          <button className={addBtn}>+ Hinzufügen</button>
        </form>
      </div>

      {/* Schichtblöcke */}
      <div className={card}>
        <h2 className="font-medium">Schichtblöcke</h2>
        <ul className="divide-y divide-line">
          {blocks.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              {isEditing('schichtblock', b.id) ? (
                <>
                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    <input className={`${input} flex-1`} value={draft.label as string} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
                    <input type="time" className={input} value={draft.start_zeit as string} onChange={(e) => setDraft({ ...draft, start_zeit: e.target.value })} />
                    <input type="time" className={input} value={draft.ende_zeit as string} onChange={(e) => setDraft({ ...draft, ende_zeit: e.target.value })} />
                    <input type="color" className="h-9 w-10 rounded-lg border border-line" value={(draft.farbe as string) ?? '#6366f1'} onChange={(e) => setDraft({ ...draft, farbe: e.target.value })} />
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button onClick={saveEdit} className={saveBtn}>Speichern</button>
                    <button onClick={() => setEdit(null)} className={delBtn} title="Abbrechen">×</button>
                  </div>
                </>
              ) : (
                <>
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: b.farbe ?? '#94a3b8' }} />
                    {b.label} <span className="font-mono tnum text-muted">{b.start_zeit.slice(0, 5)}–{b.ende_zeit.slice(0, 5)}</span>
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <button onClick={() => startEdit('schichtblock', b.id, { label: b.label, start_zeit: b.start_zeit.slice(0, 5), ende_zeit: b.ende_zeit.slice(0, 5), farbe: b.farbe ?? '#6366f1' })} className={editBtn} title="Bearbeiten">✎</button>
                    <button onClick={() => del('schichtblock', b.id)} className={delBtn} title="Löschen">×</button>
                  </div>
                </>
              )}
            </li>
          ))}
          {blocks.length === 0 && <li className="py-2 text-sm text-muted">Noch keine Schichtblöcke.</li>}
        </ul>
        <form onSubmit={submitBlock} className="flex flex-wrap items-center gap-2">
          <input className={`${input} flex-1`} placeholder="Label (z. B. Früh)" value={block.label} onChange={(e) => setBlock({ ...block, label: e.target.value })} />
          <input type="time" className={input} value={block.start_zeit} onChange={(e) => setBlock({ ...block, start_zeit: e.target.value })} />
          <input type="time" className={input} value={block.ende_zeit} onChange={(e) => setBlock({ ...block, ende_zeit: e.target.value })} />
          <input type="color" className="h-9 w-10 rounded-lg border border-line" value={block.farbe} onChange={(e) => setBlock({ ...block, farbe: e.target.value })} />
          <button className={addBtn}>+ Hinzufügen</button>
        </form>
      </div>

      {/* Positionen */}
      <div className={card}>
        <h2 className="font-medium">Positionen</h2>
        <ul className="divide-y divide-line">
          {positions.map((p) => {
            const d = depts.find((x) => x.id === p.department_id)
            const l = locs.find((x) => x.id === p.location_id)
            return (
              <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                {isEditing('position', p.id) ? (
                  <>
                    <div className="flex flex-1 flex-wrap gap-2">
                      <input className={`${input} flex-1`} value={draft.label as string} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
                      <select className={input} value={(draft.department_id as string) ?? ''} onChange={(e) => setDraft({ ...draft, department_id: e.target.value })}>
                        <option value="">Department —</option>
                        {depts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                      <select className={input} value={(draft.location_id as string) ?? ''} onChange={(e) => setDraft({ ...draft, location_id: e.target.value })}>
                        <option value="">Location —</option>
                        {locs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button onClick={saveEdit} className={saveBtn}>Speichern</button>
                      <button onClick={() => setEdit(null)} className={delBtn} title="Abbrechen">×</button>
                    </div>
                  </>
                ) : (
                  <>
                    <span>{p.label}{(d || l) && <span className="text-muted"> · {[d?.name, l?.name].filter(Boolean).join(' / ')}</span>}</span>
                    <div className="flex shrink-0 items-center gap-2">
                      <button onClick={() => startEdit('position', p.id, { label: p.label, department_id: p.department_id ?? '', location_id: p.location_id ?? '' })} className={editBtn} title="Bearbeiten">✎</button>
                      <button onClick={() => del('position', p.id)} className={delBtn} title="Löschen">×</button>
                    </div>
                  </>
                )}
              </li>
            )
          })}
          {positions.length === 0 && <li className="py-2 text-sm text-muted">Noch keine Positionen.</li>}
        </ul>
        <form onSubmit={submitPos} className="flex flex-wrap gap-2">
          <input className={`${input} flex-1`} placeholder="Label (z. B. Kamera K1)" value={pos.label} onChange={(e) => setPos({ ...pos, label: e.target.value })} />
          <select className={input} value={pos.department_id} onChange={(e) => setPos({ ...pos, department_id: e.target.value })}>
            <option value="">Department —</option>
            {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select className={input} value={pos.location_id} onChange={(e) => setPos({ ...pos, location_id: e.target.value })}>
            <option value="">Location —</option>
            {locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <button className={addBtn}>+ Hinzufügen</button>
        </form>
      </div>
    </div>
  )
}

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

export default function Setup() {
  const { selected: projekt } = useProductions()
  const [locs, setLocs] = useState<Loc[]>([])
  const [depts, setDepts] = useState<Dept[]>([])
  const [blocks, setBlocks] = useState<Block[]>([])
  const [positions, setPositions] = useState<Pos[]>([])
  const [error, setError] = useState<string | null>(null)

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
    setError(null)
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) setError(error.message)
    else reloadAll()
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
            <li key={l.id} className="flex items-center justify-between py-2 text-sm">
              <span>{l.name}{l.adresse ? <span className="text-muted"> · {l.adresse}</span> : null}</span>
              <button onClick={() => del('location', l.id)} className={delBtn} title="Löschen">×</button>
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
            <li key={d.id} className="flex items-center justify-between py-2 text-sm">
              <span><span className="text-muted">{d.sortierung}.</span> {d.name}</span>
              <button onClick={() => del('department', d.id)} className={delBtn} title="Löschen">×</button>
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
            <li key={b.id} className="flex items-center justify-between py-2 text-sm">
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: b.farbe ?? '#94a3b8' }} />
                {b.label} <span className="text-muted">{b.start_zeit.slice(0, 5)}–{b.ende_zeit.slice(0, 5)}</span>
              </span>
              <button onClick={() => del('schichtblock', b.id)} className={delBtn} title="Löschen">×</button>
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
              <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                <span>{p.label}{(d || l) && <span className="text-muted"> · {[d?.name, l?.name].filter(Boolean).join(' / ')}</span>}</span>
                <button onClick={() => del('position', p.id)} className={delBtn} title="Löschen">×</button>
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

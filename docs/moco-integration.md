# Moco → Tahti Integration — Konzept

> Stand: 2026-06-30 · Status: Konzept / Entscheidungsvorlage (noch keine Implementierung)

## 1. Ziel & Kurzfazit

Daten **aus Moco in Tahti** übernehmen — Richtung ist einseitig, Moco bleibt
führendes System (Finance/Billing):

1. **Projekte** aus Moco → Tahti `projekt`
2. **Mitarbeiter** aus Moco → Tahti `person` + `membership`
3. **Zeiterfassung** aus Moco → Tahti (neue Tabelle, s. u.)

**Fazit:** Projekte und Mitarbeiter lassen sich sauber abbilden — das Schema ist
fast fertig dafür (E-Mail als Personen-Schlüssel, `custom jsonb` für die
Moco-ID, `kuerzel` deckt sich mit Mocos `initials`). Die Zeiterfassung braucht
eine **neue Tabelle**, weil Tahti bisher nur _geplante_ Schichten (`schicht`),
aber keine _geloggten Ist-Stunden_ kennt.

Technisch gibt es genau eine saubere Stelle für den Sync: eine **serverseitige
Supabase Edge Function**, weil der Moco-API-Key kein Frontend-Secret sein darf
(`VITE_`-Variablen werden in das Client-Bundle eingebacken und sind damit
öffentlich).

---

## 2. Ausgangslage

### Tahti
- **Stack:** React 19 + Vite + Supabase (Postgres + Auth + Realtime + RLS), Vercel.
- **Kein eigenes Backend** — die App spricht direkt mit Supabase.
- **Multi-Tenant:** `person` (global, E-Mail-eindeutig) ─< `membership` >─ `org` ─< `projekt`.
  Jede projektbezogene Tabelle trägt `org_id`, abgesichert per RLS.
- Jede Kerntabelle (`person`, `projekt`, `position`, `schicht`, `location`, `callsheet`)
  hat bereits eine **`custom jsonb`-Spalte** → Platz für externe IDs ohne Schemabruch.
- `schicht` = **geplante** Disposition (Person × Position × Block × Tag, `bestaetigt`),
  **keine** geloggten Stunden.

### Moco (Konto bsp media, `bsp.mocoapp.com`)
- **Projects** (~40 aktiv): `id`, `identifier` (z. B. `RB-DE-0019`), `name`,
  `company{id,name}`, `leader{id,name}`, `isActive`, `isIntern`, `budget`,
  `currency`, `startDate`/`finishDate`, `tags`, `projectType`.
- **Users** (~19 intern, alle `@bsp-media.de`): `id`, `firstname`, `name`,
  `email`, `initials` (z. B. `HG`), `unit{name}` (Event, Producing & Kreation,
  Produktion, Finance), `role.isAdmin`.
- **Project Tasks**: `id`, `name` (z. B. „Producing", „Editor inkl. Schnittplatz",
  „Kamera Operator", „Projektleitung") — Leistungen/Positionen je Projekt.
- **Activities** (Ist-Zeiten): `id`, `date`, `seconds`/`workedSeconds`,
  `description`, `isBillable`, `isBilled`, `user{id}`, `project{id,identifier}`,
  `task{id,name}`.
- **Presences** (Anwesenheit/Stempelzeiten): separater Datentyp (Check-in/out).

Zugriff per Moco REST API (API-Key pro User + Subdomain). In dieser Umgebung
zusätzlich als MCP-Tools verfügbar (`find_projects`, `list_users`,
`find_project_tasks`, `find_global_activities`, `find_global_presences` …) —
gut für einen **manuellen Erst-Import / Prototyp**.

---

## 3. Daten-Mapping

### 3.1 Projekte — Moco `project` → Tahti `projekt`

| Tahti `projekt`     | Moco `project`            | Hinweis |
|---------------------|---------------------------|---------|
| `name`              | `name`                    | direkt |
| `projektnr`         | `identifier`              | z. B. `RB-DE-0019` |
| `client`            | `company.name`            | Kundenname |
| `start_datum`       | `startDate`               | oft `null` in Moco |
| `end_datum`         | `finishDate`              | oft `null` |
| `org_id`            | —                         | feste Ziel-Org „bsp media" (s. Offene Punkte) |
| `typ` (dreh/event/live) | — (`projectType`/`tags`/Name) | keine 1:1-Quelle → Default `event`, manuell verfeinern |
| `custom.moco_id`    | `id`                      | **Idempotenz-Schlüssel** |
| `custom.moco_leader`| `leader.name`             | kein eigenes Feld in Tahti |
| `custom.budget` / `custom.currency` | `budget` / `currency` | optional |
| `agentur`, `set_handy`, `hinweise` | —          | bleiben Tahti-eigen |

**Filter:** Interne Moco-Projekte (`isIntern: true` — Akquise, Intern,
Geschäftsbedarf, KI Tools, bsp Marketing …) sind **keine** Produktionen und
sollten **nicht** importiert werden. Empfehlung: nur `isIntern == false`
(optional zusätzlich `isActive == true`).

### 3.2 Mitarbeiter — Moco `user` → Tahti `person` + `membership`

| Tahti `person`      | Moco `user`               | Hinweis |
|---------------------|---------------------------|---------|
| `email`             | `email`                   | **natürlicher Schlüssel** (`person.email` unique) → idempotenter Upsert |
| `name`              | `fullName` / `firstname`+`name` | |
| `kuerzel`           | `initials`                | deckt sich mit Matrix-Kürzel (z. B. „HG") |
| `custom.moco_id`    | `id`                      | zusätzlicher Schlüssel |

| Tahti `membership`  | Moco `user`               | Hinweis |
|---------------------|---------------------------|---------|
| `org_id`            | —                         | feste Ziel-Org |
| `typ`               | (intern)                  | Moco-User = Festangestellte → `intern` |
| `rolle`             | `role.isAdmin` / `unit`   | Mapping festzulegen (s. u.) |

**Wichtig:** Moco-`users` sind nur **interne Festangestellte**. Freelancer,
lokale Crew, Volunteers tauchen dort nicht als User auf (höchstens als Moco
*Contacts/Suppliers*). Der Moco→Tahti-Sync liefert also den **festen
Kern-Stamm**; der Freelance-Pool bleibt in Tahti gepflegt.

**Rollen-Mapping (Vorschlag, anpassbar):**
- `role.isAdmin == true` → Tahti `admin`
- sonst → `disponent` (interne Planer) — oder feiner über `unit`
  (Event/Producing → `disponent`, Produktion → `crew`).

### 3.3 Zeiterfassung — Moco `activity` → Tahti (neue Tabelle)

Tahti hat **keine** Ist-Zeit-Tabelle. Vorschlag: neue Tabelle `zeiterfassung`
als **read-only Spiegel** der Moco-Activities (für Soll-/Ist-Auswertung,
Auslastung, „Form-Balken"):

| Tahti `zeiterfassung` | Moco `activity`          | Hinweis |
|-----------------------|--------------------------|---------|
| `moco_activity_id`    | `id`                     | unique → Upsert |
| `person_id`           | `user.id` → über `custom.moco_id`/E-Mail | FK auf `person` |
| `projekt_id`          | `project.id` → über `custom.moco_id`     | FK auf `projekt` |
| `tag`                 | `date`                   | |
| `sekunden`            | `seconds`                | (`workedSeconds` bei abweichend) |
| `task_name`           | `task.name`              | optional als Positionsbezug |
| `beschreibung`        | `description`            | |
| `billable`            | `isBillable`             | |
| `org_id`              | —                        | feste Ziel-Org (für RLS) |

Granularität klären: **Activities** (leistungsbezogen, je Task, billable —
Standard für Reporting) vs. **Presences** (reine Anwesenheit). Empfehlung:
mit **Activities** starten.

> Mengengerüst zur Einordnung: Juni 2026 ~445 Activities. Ein monatlicher/
> nächtlicher Sync ist unkritisch.

---

## 4. Technische Architektur

### Warum serverseitig?
Der Moco-API-Key ist ein **Secret**. Tahti-Frontend-Variablen (`VITE_*`) werden
zur Buildzeit ins öffentliche Client-Bundle eingebacken → der Key wäre für jeden
sichtbar. Der Sync muss daher **server-/edge-seitig** mit dem `service_role`-Key
(umgeht RLS für den Schreibvorgang) laufen.

### Empfohlenes Muster: Supabase Edge Function `moco-sync`

```
┌─────────────┐   REST (API-Key)   ┌──────────────────────┐   service_role   ┌────────────┐
│   Moco API  │ ◀───────────────── │ Supabase Edge Function│ ───────────────▶ │  Postgres  │
│ bsp.mocoapp │   projects/users/  │      „moco-sync"      │   Upsert nach    │  (Tahti)   │
└─────────────┘   activities       └──────────────────────┘   moco_id        └────────────┘
                                            ▲
                                   Trigger: pg_cron (nächtlich)
                                            oder manueller Button (Admin)
```

Ablauf der Function:
1. **Users** holen → `person` + `membership` upserten (Key: `email`).
2. **Projects** (`isIntern=false`) holen → `projekt` upserten (Key: `custom.moco_id`).
3. **Activities** (Zeitfenster) holen → `zeiterfassung` upserten (Key: `moco_activity_id`),
   `person_id`/`projekt_id` über die Moco-IDs auflösen.
4. Lauf protokollieren (Anzahl, Fehler, Zeitstempel).

**Secrets** (Supabase → Edge Function Secrets, nie im Repo/Frontend):
`MOCO_API_KEY`, `MOCO_SUBDOMAIN`, `SUPABASE_SERVICE_ROLE_KEY`.

**Trigger-Optionen:**
- **Nächtlicher Cron** (`pg_cron` / Supabase Scheduled Function) — einfachster Start.
- **Manueller „Jetzt synchronisieren"-Button** in Tahti (Admin), ruft die Function auf.
- **Webhooks** (Moco kann Events pushen) — später für Near-Realtime.

### Idempotenz
Jeder Datensatz wird über eine stabile Moco-ID dedupliziert (`ON CONFLICT … DO UPDATE`):
- `person`: `email` (bereits unique)
- `projekt`: neue unique-Strategie auf Moco-ID (s. Schema unten)
- `zeiterfassung`: `moco_activity_id` unique

So ist jeder Lauf wiederholbar, ohne Duplikate.

---

## 5. Nötige Schema-Änderungen

Minimal-invasiv; nutzt vorhandene `custom jsonb` plus eine neue Tabelle.

```sql
-- 1) Eindeutige Moco-IDs für idempotenten Upsert (aus custom jsonb herausgezogen)
alter table projekt add column if not exists moco_id text;
create unique index if not exists projekt_moco_id_uniq
  on projekt (org_id, moco_id) where moco_id is not null;

alter table person add column if not exists moco_id text;
-- (person.email ist bereits unique und bleibt Primär-Schlüssel des Upserts)

-- 2) Ist-Zeiten aus Moco
create table zeiterfassung (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references org(id) on delete cascade,
  moco_activity_id text not null,
  person_id       uuid references person(id) on delete set null,
  projekt_id      uuid references projekt(id) on delete set null,
  tag             date not null,
  sekunden        int  not null default 0,
  task_name       text,
  beschreibung    text,
  billable        boolean not null default false,
  synced_at       timestamptz not null default now(),
  unique (moco_activity_id)
);
create index on zeiterfassung (projekt_id, tag);
create index on zeiterfassung (person_id, tag);

-- RLS analog zu den übrigen Tabellen: lesen = Mitglied der Org, schreiben = Planer.
-- (Der Sync schreibt mit service_role und umgeht RLS.)
alter table zeiterfassung enable row level security;
create policy zeiterfassung_select on zeiterfassung for select using ( is_member(org_id) );
create policy zeiterfassung_write  on zeiterfassung for all   using ( is_planer(org_id) ) with check ( is_planer(org_id) );
grant select, insert, update, delete on zeiterfassung to authenticated;
```

> Hinweis Tagessatz/Datenschutz: Ist-Zeiten können sensibel sein. RLS so wählen,
> dass Crew **nicht** fremde Zeiten/Auswertungen sieht (analog zur bestehenden
> `person_public`-Logik bei Tagessätzen).

---

## 6. Offene Entscheidungen (vor Implementierung)

1. **Ziel-Org:** Welche Tahti-`org` ist „bsp media"? (existierende `org_id`
   verwenden oder neu seeden — alle Importe hängen daran.)
2. **Rollen-Mapping** Moco → Tahti (Vorschlag in 3.2): reicht `admin`/`disponent`,
   oder feiner über `unit`?
3. **Projekt-Filter:** nur `isIntern=false`? Zusätzlich nur `isActive=true`?
   Oder über ein bestimmtes Moco-Tag steuern?
4. **`projekt.typ`** (dreh/event/live): manuell in Tahti pflegen oder aus Moco
   `tags`/Name ableiten?
5. **Zeiterfassung:** Activities (empfohlen) oder zusätzlich Presences?
   Welches Zeitfenster pro Sync (laufender Monat / letzte 90 Tage)?
6. **Sync-Auslöser:** nächtlicher Cron, manueller Button oder beides?
7. **Konflikt-Politik:** Moco überschreibt Tahti-Felder bei jedem Lauf (Moco =
   Quelle), oder nur leere Felder füllen (manuelle Tahti-Edits schützen)?

---

## 7. Vorgeschlagenes Vorgehen (Phasen)

- **Phase 0 — Erst-Import / Proof of Concept (manuell):** Über die vorhandenen
  Moco-MCP-Tools einmalig Users + Projekte lesen und nach Tahti schreiben, um
  Mapping und Org-Zuordnung an echten Daten zu validieren — ohne Infrastruktur.
- **Phase 1 — Schema:** Migration aus Abschnitt 5 (Moco-IDs + `zeiterfassung`).
- **Phase 2 — Edge Function `moco-sync`:** Users → Projekte → Activities,
  idempotent, mit Secrets + Logging. Erst manuell auslösbar.
- **Phase 3 — Automatik & UI:** Cron-Schedule + Admin-„Jetzt synchronisieren",
  Status/Fehleranzeige; optional Soll-/Ist-Auswertung in der Dispo.
- **Phase 4 (optional):** Webhooks für Near-Realtime; Freelancer-Abgleich über
  Moco-Contacts.

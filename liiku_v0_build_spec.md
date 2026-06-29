# liiku Crew & Dispo — V0 Build-Spec
**Für den Coding-Agent · 29.06.2026 · Pilot: Last Soul Ultra Live ’26**

Diese Spec ist so geschrieben, dass sie direkt in einen AI-Coding-Agenten gekippt werden kann. Begleitdokument: `liiku_crew_callsheet_konzept.md` (Was/Warum). Diese Spec = Wie.

---

## 0. Scope V0

**Format:** Event-Schichtmatrix (nicht Dreh-Call-Sheet). **Pilot:** LSU.

**V0 liefert:**
- Multi-Tenant-Fundament (Person global, Organisation = Mandant, Projekt darunter)
- Personen-Pool pro Org
- Ein Projekt mit Departments, Positionen, Schichtblöcken, Schichten
- **Crew-PWA**: Default-Ansicht = „jetzt / als nächstes" ohne Navigation
- **Dispo-Matrix**: Position × Zeit, überlappende Blöcke, Live-Sync
- Magic-Link-Login (kein Passwort)
- RBAC über Row Level Security
- Realtime-Sync
- PDF-Export Schichtblatt (Matrix + Einzelblatt) im LSU-Look

**NICHT in V0** (spätere Stufen): Dreh-Call-Sheet-Format, Master-Ablaufplan, Meetings, Lieferanten/Logistik, Verfügbarkeit/Blocker, SMS, iCal, MOCO, AI-Import, Lizenz-Enforcement, Versionierung.

**Leitprinzip (nicht verhandelbar):** Crew-Erfahrung = null Reibung. Nach Login sieht die Crew in <2 s ihre nächste Schicht, ohne zu navigieren.

---

## 1. Stack

- **Supabase** (EU-Region Frankfurt): Postgres + Auth (Magic Link) + Realtime + RLS + Storage
- **React + Vite**, PWA, mobile-first; Service Worker (Workbox) für Offline-Cache der Crew-Ansicht
- **Vercel** (EU) Hosting
- **PDF**: Supabase Edge Function (Deno) mit serverseitigem Renderer (z. B. `@react-pdf/renderer` oder Puppeteer-Lambda)
- Realtime über `supabase.channel()` auf der `schicht`-Tabelle

---

## 2. Mandanten-Architektur

```
person (global)  ──< membership >──  org (Mandant, z.B. bsp)
                                       │
                                       └──< projekt (Event/Dreh)
```

- `person` existiert einmal global (eine E-Mail = ein Account)
- `membership` verknüpft person × org mit einer System-Rolle
- eine Person kann in mehreren orgs/projekten sein → Crew-Login zeigt alle eigenen Schichten orgübergreifend
- Tenant-Isolation: jede projektbezogene Tabelle trägt `org_id`; RLS isoliert strikt nach Mitgliedschaft

---

## 3. SQL-Schema (V0)

```sql
-- ENUMS
create type person_typ as enum ('intern','freelance','lokal','volunteer','vendor','client');
create type system_rolle as enum ('admin','disponent','lead','crew','gast');
create type projekt_typ as enum ('dreh','event','live');
create type schicht_typ as enum ('arbeit','standby','eigendispo','nachtwache');
create type besetzung_status as enum ('person','offen','extern_zugesagt');

-- PERSON (global)
create table person (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id), -- null bis Account aktiviert
  name text not null,
  kuerzel text,                 -- z.B. "HG" für die Matrix
  email text unique not null,
  mobil text,
  created_at timestamptz default now()
);

-- ORG (Mandant)
create table org (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

-- MEMBERSHIP (person × org × rolle)
create table membership (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references person(id) on delete cascade,
  org_id uuid not null references org(id) on delete cascade,
  rolle system_rolle not null default 'crew',
  tagessatz numeric,            -- rechtebeschränkt (nur admin/disponent)
  typ person_typ not null default 'freelance',
  unique (person_id, org_id)
);

-- PROJEKT
create table projekt (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references org(id) on delete cascade,
  typ projekt_typ not null default 'event',
  name text not null,
  client text, agentur text, projektnr text,
  start_datum date, end_datum date,
  hinweise text,
  lizenz_aktiv_bis date,        -- Per-Event-Fenster (V0: nur Feld, keine Enforcement)
  created_at timestamptz default now()
);

-- LOCATION (mehrere pro Projekt)
create table location (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references org(id),
  projekt_id uuid not null references projekt(id) on delete cascade,
  name text not null, adresse text, maps_url text,
  tel text, kontakt text, krankenhaus text, notizen text
);

-- DEPARTMENT (Org-Chart-Ebene)
create table department (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references org(id),
  projekt_id uuid not null references projekt(id) on delete cascade,
  name text not null, sortierung int default 0
);

-- POSITION (Ebene-2-Rolle, ortsgebunden)
create table position (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references org(id),
  projekt_id uuid not null references projekt(id) on delete cascade,
  department_id uuid references department(id) on delete set null,
  location_id uuid references location(id) on delete set null,
  label text not null,                 -- "Kamera K7", "Regie Nacht"
  besetzung besetzung_status not null default 'offen',
  farbe text
);

-- SCHICHTBLOCK (überlappend erlaubt)
create table schichtblock (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references org(id),
  projekt_id uuid not null references projekt(id) on delete cascade,
  label text not null,                 -- "Früh","Spät","Nacht"
  start_zeit time not null, ende_zeit time not null, farbe text
);

-- SCHICHT (das Assignment)
create table schicht (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references org(id),
  projekt_id uuid not null references projekt(id) on delete cascade,
  person_id uuid references person(id) on delete set null,
  position_id uuid references position(id) on delete set null,
  schichtblock_id uuid references schichtblock(id) on delete set null,
  location_id uuid references location(id) on delete set null,
  tag date not null,
  typ schicht_typ not null default 'arbeit',
  open_end boolean default false,
  bestaetigt boolean default false,    -- Crew-Confirm
  notiz text,
  created_at timestamptz default now()
);

create index on schicht (projekt_id, tag);
create index on schicht (person_id);
```

---

## 4. RLS-Policies

```sql
-- Helper: Rolle der aktuellen Person in einer Org
create or replace function current_rolle(p_org uuid)
returns system_rolle language sql stable as $$
  select m.rolle from membership m
  join person p on p.id = m.person_id
  where p.auth_user_id = auth.uid() and m.org_id = p_org
$$;

create or replace function current_person_id()
returns uuid language sql stable as $$
  select id from person where auth_user_id = auth.uid()
$$;

alter table schicht enable row level security;

-- Crew sieht eigene Schichten; Planer sehen alle Schichten ihrer Org
create policy schicht_select on schicht for select using (
  current_rolle(org_id) in ('admin','disponent','lead')
  or person_id = current_person_id()
);

-- Nur Planer schreiben Schichten ...
create policy schicht_write on schicht for all using (
  current_rolle(org_id) in ('admin','disponent','lead')
) with check (
  current_rolle(org_id) in ('admin','disponent','lead')
);

-- ... AUSSER: Crew darf 'bestaetigt' der eigenen Schicht setzen (separate Update-Policy)
create policy schicht_confirm on schicht for update using (
  person_id = current_person_id()
) with check (
  person_id = current_person_id()
);
-- (Spaltenschutz für 'bestaetigt' via Trigger/Check; in V0 reicht App-seitige Beschränkung)

-- membership.tagessatz NIE an Crew ausliefern:
alter table membership enable row level security;
create policy membership_select on membership for select using (
  current_rolle(org_id) in ('admin','disponent')
  or person_id = current_person_id()  -- eigene Mitgliedschaft, aber tagessatz via View maskieren
);
```
**Tagessatz-Schutz:** Crew-Frontend liest Personen über eine View `person_public` (ohne `tagessatz`). `tagessatz` nur über planer-only Endpoints.

---

## 5. Auth-Flow

1. Disponent legt Person an (Name, E-Mail) + membership.
2. System schickt Magic Link (`supabase.auth.signInWithOtp`).
3. Person klickt → `auth.users`-Eintrag → `person.auth_user_id` wird verknüpft (Trigger oder Callback).
4. Kein Passwort. Folge-Logins ebenfalls per Magic Link.

---

## 6. PWA-Komponenten

```
App
├─ AuthGate (Magic-Link, Session)
├─ CrewHome              ← DEFAULT nach Login (rolle crew)
│   ├─ JetztKarte        "Jetzt: Nacht · Sa 02:00–06:00" (Pulse)
│   ├─ NaechsteSchicht   "als nächstes: Früh · So 05:30"
│   ├─ MeineSchichten    Liste kommender Schichten
│   ├─ Kontakte          Schichtleitung, Klick-zum-Anrufen (tel:)
│   ├─ ProjektWechsler   nur wenn Person in >1 Projekt
│   └─ PdfButton         "Mein Plan als PDF"
└─ DispoMatrix           ← rolle disponent/admin/lead
    ├─ Toolbar           Tag-/Projektwahl, Block-Legende
    ├─ Timeline          Position(Zeile) × Zeit(Spalte), überlappende Blöcke
    │                    Drag/Klick → Schicht zuweisen, Konfliktwarnung inline
    └─ Realtime-Layer    supabase.channel('schicht') optimistic UI
```

- **CrewHome** ist die Messlatte: render der „Jetzt/als nächstes"-Karte ohne weiteren Tap.
- Mehrere Projekte → ProjektWechsler, aber „meine nächste Schicht" aggregiert über ALLE Projekte der Person (orgübergreifend).
- **Offline:** Service Worker cached den letzten CrewHome-State (Workbox `StaleWhileRevalidate`); bei Reconnect Realtime-Resync.
- Look: schwarz/Signalrot (LSU-Branding), zwei Helligkeits-States (Tag/Nacht), große Touch-Targets.

---

## 7. PDF Edge Function

```
POST /functions/v1/generate-schichtblatt
body: { projekt_id, scope: "matrix" | "person", person_id? }
→ rendert Schichtblatt (Event-Look schwarz/rot), legt PDF in Storage,
  gibt signierte URL zurück.
```
Zwei Templates: **Matrix** (Gesamtübersicht Position×Tag) und **Einzelblatt** (eine Person, ihre Schichten + Kontakte).

---

## 8. Realtime & Resilienz

- `schicht`-Änderungen broadcasten an alle offenen Clients des Projekts.
- Optimistic UI im Dispo-Editor; bei Konflikt last-write-wins + Toast.
- Reconnect-Logik: WebSocket-Drop → exponentielles Retry, beim Reconnect Full-Resync der sichtbaren Spanne.

---

## 9. Akzeptanzkriterien

1. Crew loggt sich per Magic Link ein → sieht in <2 s ihre nächste Schicht, kein Navigationsschritt.
2. Disponent verschiebt eine Schicht → Crew-Gerät aktualisiert live (online) bzw. beim nächsten Sync (offline).
3. RLS-Test: Crew-Account kann weder fremde Schichten noch irgendeinen `tagessatz` lesen.
4. PDF-Matrix + Einzelblatt korrekt für die echte LSU-Crew.
5. Zwei Orgs angelegt → Daten strikt isoliert (Crew aus Org A sieht nichts aus Org B), eine Person mit Mitgliedschaft in beiden sieht beide Schichten im CrewHome.
6. **48-h-Soak-Test** der Dispo-Matrix offen im Browser: kein Memory-Leak, Realtime hält bzu, Reconnect funktioniert (gleicher Anspruch wie beim Grafik-System).

---

## 10. Pilot-Befüllung LSU

Echte Crew aus Stabliste LSU-0001 als `person` + `membership` (org „bsp"). Ein `projekt` „Last Soul Ultra Live ’26", typ `live`, 14.–18.08. Schichtblöcke Früh 05:30–14:00 / Spät 13:30–22:00 / Nacht 21:30–06:00. Positionen + Departments aus dem finalen Rollen-Mapping (steht noch aus — letzter offener Input von dir).

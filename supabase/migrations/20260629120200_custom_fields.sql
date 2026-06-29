-- liiku — Eigene Felder (Custom Fields)
-- Zwei Ebenen, kombinierbar:
--   (1) schemalose `custom jsonb`-Spalte auf den Kerntabellen -> sofort nutzbar, RLS gilt automatisch.
--   (2) verwaltete Felddefinitionen (feld_definition/feld_wert) -> typisiert, pro Org/Projekt
--       konfigurierbar, im UI anlegbar. "einmal definieren, ueberall nutzen".

-- ---------------------------------------------------------------------------
-- (1) Schemalose Zusatzfelder auf den Kerntabellen
-- ---------------------------------------------------------------------------
alter table person    add column if not exists custom jsonb not null default '{}'::jsonb;
alter table projekt   add column if not exists custom jsonb not null default '{}'::jsonb;
alter table position  add column if not exists custom jsonb not null default '{}'::jsonb;
alter table schicht   add column if not exists custom jsonb not null default '{}'::jsonb;
alter table location  add column if not exists custom jsonb not null default '{}'::jsonb;
alter table callsheet add column if not exists custom jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- (2) Verwaltete Felddefinitionen
-- ---------------------------------------------------------------------------
create type feld_entity as enum ('person','projekt','position','schicht','location','callsheet');
create type feld_typ    as enum ('text','zahl','datum','bool','select');

-- FELD_DEFINITION (was fuer ein Feld gibt es — pro Org, optional pro Projekt)
create table feld_definition (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references org(id) on delete cascade,
  projekt_id uuid references projekt(id) on delete cascade,   -- null = org-weit gueltig
  entity     feld_entity not null,
  key        text not null,                 -- Maschinen-Key, z.B. "funkkanal"
  label      text not null,                 -- Anzeigename, z.B. "Funkkanal"
  typ        feld_typ not null default 'text',
  optionen   text[] not null default '{}',  -- bei typ='select'
  pflicht    boolean not null default false,
  sortierung int not null default 0,
  created_at timestamptz not null default now()
);
-- Key eindeutig je (Org, Projekt-oder-orgweit, Entitaet). coalesce wegen nullable projekt_id.
create unique index feld_definition_key_uniq
  on feld_definition (org_id, coalesce(projekt_id, '00000000-0000-0000-0000-000000000000'::uuid), entity, key);
create index on feld_definition (org_id, entity);

-- FELD_WERT (konkreter Wert eines definierten Feldes an einer Zeile)
create table feld_wert (
  feld_id    uuid not null references feld_definition(id) on delete cascade,
  entity_id  uuid not null,                 -- id der person/position/schicht/... (polymorph, kein FK)
  org_id     uuid not null references org(id) on delete cascade,
  wert       text,                          -- als Text gespeichert; App castet je nach typ
  updated_at timestamptz not null default now(),
  primary key (feld_id, entity_id)
);
create index on feld_wert (entity_id);

create trigger trg_feld_wert_updated before update on feld_wert
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: lesen = Mitglied der Org, schreiben = Planer (admin/disponent/lead)
-- ---------------------------------------------------------------------------
alter table feld_definition enable row level security;
alter table feld_wert       enable row level security;

create policy feld_definition_select on feld_definition for select using ( is_member(org_id) );
create policy feld_definition_write  on feld_definition for all   using ( is_planer(org_id) ) with check ( is_planer(org_id) );

create policy feld_wert_select on feld_wert for select using ( is_member(org_id) );
create policy feld_wert_write  on feld_wert for all   using ( is_planer(org_id) ) with check ( is_planer(org_id) );

-- ---------------------------------------------------------------------------
-- Grants (neue Tabellen werden vom einmaligen Grant frueherer Migrationen nicht erfasst)
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on feld_definition to authenticated;
grant select, insert, update, delete on feld_wert       to authenticated;

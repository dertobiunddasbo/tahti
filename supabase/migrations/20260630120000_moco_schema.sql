-- Moco-Integration — Schema-Delta
-- Richtung der Integration ist einseitig: Moco -> Tahti (Moco bleibt fuehrend).
--   (1) stabile Moco-IDs fuer idempotenten Upsert (ON CONFLICT)
--   (2) Tabelle `zeiterfassung` als read-only Spiegel der Moco-Activities (Ist-Zeiten)

-- ---------------------------------------------------------------------------
-- (1) Moco-IDs als eigene Spalten (statt nur custom jsonb -> erlaubt Unique-Index)
-- ---------------------------------------------------------------------------
alter table projekt add column if not exists moco_id text;
alter table person  add column if not exists moco_id text;

-- projekt: eindeutig je Org (ein Moco-Projekt -> genau ein Tahti-Projekt pro Org).
-- Partial-Index: bestehende Zeilen ohne moco_id (manuell angelegt) bleiben unberuehrt.
create unique index if not exists projekt_moco_id_uniq
  on projekt (org_id, moco_id) where moco_id is not null;

-- person: global eindeutig (der Personen-Pool ist org-uebergreifend, eine Moco-ID = eine Person).
create unique index if not exists person_moco_id_uniq
  on person (moco_id) where moco_id is not null;

-- ---------------------------------------------------------------------------
-- (2) Zeiterfassung — Ist-Zeiten aus Moco (Activities). Read-only Spiegel.
--     person_id/projekt_id werden beim Sync ueber die jeweilige moco_id aufgeloest.
--     Inaktive Moco-User werden mitimportiert, damit person_id immer aufloest.
-- ---------------------------------------------------------------------------
create table zeiterfassung (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references org(id)     on delete cascade,
  moco_activity_id text not null,                       -- Idempotenz-Schluessel
  person_id        uuid references person(id)  on delete set null,
  projekt_id       uuid references projekt(id) on delete set null,
  tag              date not null,
  sekunden         int  not null default 0,             -- Moco `seconds`
  task_name        text,                                -- Moco `task.name` (Positionsbezug)
  beschreibung     text,                                -- Moco `description`
  billable         boolean not null default false,      -- Moco `isBillable`
  abgerechnet      boolean not null default false,      -- Moco `isBilled`
  synced_at        timestamptz not null default now(),
  unique (moco_activity_id)
);
create index on zeiterfassung (org_id);
create index on zeiterfassung (projekt_id, tag);
create index on zeiterfassung (person_id, tag);

-- RLS: Ist-Zeiten sind sensibel (Auslastung/Abrechnung) -> nur Planer (admin/disponent/lead)
-- duerfen lesen und schreiben. Crew sieht sie bewusst NICHT (analog Tagessatz-Schutz).
-- Der Sync schreibt mit service_role und umgeht RLS ohnehin.
alter table zeiterfassung enable row level security;
create policy zeiterfassung_select on zeiterfassung for select using ( is_planer(org_id) );
create policy zeiterfassung_write  on zeiterfassung for all   using ( is_planer(org_id) ) with check ( is_planer(org_id) );

-- Grants (neue Tabelle wird vom einmaligen Grant frueherer Migrationen nicht erfasst)
grant select, insert, update, delete on zeiterfassung to authenticated;

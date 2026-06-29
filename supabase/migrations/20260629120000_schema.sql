-- liiku Crew, Dispo & Call Sheet — V1 Datenmodell
-- Quelle: liiku_crew_callsheet_konzept.md (Abschnitt 4) + liiku_v0_build_spec.md (Abschnitt 3)
-- Multi-Tenant: person (global) -< membership >- org (Mandant) -< projekt
-- Jede projektbezogene Tabelle traegt org_id fuer strikte Tenant-Isolation via RLS.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------
create type person_typ        as enum ('intern','freelance','lokal','volunteer','vendor','client');
create type system_rolle      as enum ('admin','disponent','lead','crew','gast');
create type projekt_typ       as enum ('dreh','event','live');
create type schicht_typ       as enum ('arbeit','standby','eigendispo','nachtwache');
create type besetzung_status  as enum ('person','offen','lokal_gesucht','volunteer_gesucht','extern_zugesagt');
create type verfuegbar_status as enum ('frei','blockiert');
create type aufgabe_status    as enum ('offen','erledigt');
create type lieferung_richtung as enum ('an','ab');
create type fahrt_zweck       as enum ('travel','shooting','transfer');
create type versand_status    as enum ('offen','gesendet','gesehen','bestaetigt');

-- ---------------------------------------------------------------------------
-- updated_at-Trigger (fuer live editierte Tabellen)
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- KERN: Mandanten-Fundament
-- ---------------------------------------------------------------------------

-- PERSON (global, eventuebergreifender Pool — eine E-Mail = ein Account)
create table person (
  id           uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null, -- null bis Account aktiviert
  name         text not null,
  kuerzel      text,                       -- z.B. "HG" fuer die Matrix
  email        text unique not null,
  mobil        text,
  skills       text[] not null default '{}',
  aktiv        boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ORG (Mandant)
create table org (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

-- MEMBERSHIP (person x org x rolle). tagessatz lebt hier (org-bezogen, rechtebeschraenkt).
create table membership (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references person(id) on delete cascade,
  org_id     uuid not null references org(id) on delete cascade,
  rolle      system_rolle not null default 'crew',
  typ        person_typ not null default 'freelance',
  tagessatz  numeric,                      -- NIE an Crew ausliefern (RLS + View)
  created_at timestamptz not null default now(),
  unique (person_id, org_id)
);

-- PROJEKT (Event/Dreh/Live)
create table projekt (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references org(id) on delete cascade,
  typ             projekt_typ not null default 'event',
  name            text not null,
  client          text,
  agentur         text,
  projektnr       text,
  start_datum     date,
  end_datum       date,
  set_handy       text,
  hinweise        text,
  lizenz_aktiv_bis date,                    -- Per-Event-Fenster (V1: Feld, keine Enforcement)
  created_at      timestamptz not null default now()
);

-- LOCATION (mehrere pro Projekt, parallel)
create table location (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references org(id) on delete cascade,
  projekt_id  uuid not null references projekt(id) on delete cascade,
  name        text not null,
  adresse     text,
  maps_url    text,
  tel         text,
  kontakt     text,
  parken      text,
  krankenhaus text,
  notizen     text
);

-- DEPARTMENT (Gruppierungsebene ueber Positionen, Basis Org-Chart)
create table department (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references org(id) on delete cascade,
  projekt_id uuid not null references projekt(id) on delete cascade,
  name       text not null,
  sortierung int not null default 0
);

-- POSITION (Ebene-2-Rolle, frei pro Projekt, ortsgebunden)
create table position (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references org(id) on delete cascade,
  projekt_id    uuid not null references projekt(id) on delete cascade,
  department_id uuid references department(id) on delete set null,
  location_id   uuid references location(id) on delete set null,
  label         text not null,             -- "Kamera K7", "Regie Nacht"
  besetzung     besetzung_status not null default 'offen',
  farbe         text,
  sortierung    int not null default 0,
  updated_at    timestamptz not null default now()
);

-- SCHICHTBLOCK (Zeitraster, ueberlappend erlaubt)
create table schichtblock (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references org(id) on delete cascade,
  projekt_id uuid not null references projekt(id) on delete cascade,
  label      text not null,                -- "Frueh","Spaet","Nacht"
  start_zeit time not null,
  ende_zeit  time not null,
  farbe      text,
  sortierung int not null default 0
);

-- SCHICHT (das Assignment — Konfliktpruefung haengt hier)
create table schicht (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references org(id) on delete cascade,
  projekt_id     uuid not null references projekt(id) on delete cascade,
  person_id      uuid references person(id) on delete set null,
  position_id    uuid references position(id) on delete set null,
  schichtblock_id uuid references schichtblock(id) on delete set null,
  location_id    uuid references location(id) on delete set null,
  tag            date not null,
  typ            schicht_typ not null default 'arbeit',
  open_end       boolean not null default false,
  bestaetigt     boolean not null default false,  -- Crew-Confirm
  notiz          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on schicht (projekt_id, tag);
create index on schicht (person_id);
create index on schicht (org_id);

-- ---------------------------------------------------------------------------
-- V1: Verfuegbarkeit, Ablaufplan, Meetings, Logistik, Call Sheet
-- ---------------------------------------------------------------------------

-- VERFUEGBARKEIT (Sperrtermine/Blocker, org-bezogen)
create table verfuegbarkeit (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references org(id) on delete cascade,
  person_id uuid not null references person(id) on delete cascade,
  von       timestamptz not null,
  bis       timestamptz not null,
  status    verfuegbar_status not null default 'blockiert',
  grund     text
);
create index on verfuegbarkeit (person_id);

-- AUFGABE (Master-Ablaufplan, To-Do-Timeline pro Gewerk)
create table aufgabe (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references org(id) on delete cascade,
  projekt_id    uuid not null references projekt(id) on delete cascade,
  department_id uuid references department(id) on delete set null,
  location_id   uuid references location(id) on delete set null,
  tag           date not null,
  start_zeit    time,
  ende_zeit     time,
  titel         text not null,
  ort           text,
  status        aufgabe_status not null default 'offen',
  notiz         text,
  updated_at    timestamptz not null default now()
);
create index on aufgabe (projekt_id, tag);

-- AUFGABE_PERSON (verantwortliche[])
create table aufgabe_person (
  aufgabe_id uuid not null references aufgabe(id) on delete cascade,
  person_id  uuid not null references person(id) on delete cascade,
  org_id     uuid not null references org(id) on delete cascade,
  primary key (aufgabe_id, person_id)
);

-- MEETING
create table meeting (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references org(id) on delete cascade,
  projekt_id        uuid not null references projekt(id) on delete cascade,
  typ               text,
  zeit              timestamptz not null,
  ort               text,
  organizer_person_id uuid references person(id) on delete set null,
  themen            text
);
create index on meeting (projekt_id);

-- MEETING_PERSON (teilnehmer[])
create table meeting_person (
  meeting_id uuid not null references meeting(id) on delete cascade,
  person_id  uuid not null references person(id) on delete cascade,
  org_id     uuid not null references org(id) on delete cascade,
  primary key (meeting_id, person_id)
);

-- LIEFERANT (org-Pool, wiederverwendbar)
create table lieferant (
  id      uuid primary key default gen_random_uuid(),
  org_id  uuid not null references org(id) on delete cascade,
  name    text not null,
  gewerk  text,
  kontakt text
);

-- LIEFERUNG (externe Gewerke: Anlieferung/Abholung pro Projekt)
create table lieferung (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references org(id) on delete cascade,
  projekt_id    uuid not null references projekt(id) on delete cascade,
  lieferant_id  uuid references lieferant(id) on delete set null,
  location_id   uuid references location(id) on delete set null,
  tag           date not null,
  zeit_von      time,
  zeit_bis      time,
  was           text,
  ort           text,
  richtung      lieferung_richtung not null default 'an'
);
create index on lieferung (projekt_id, tag);

-- FAHRZEUG (Car-Pooling)
create table fahrzeug (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references org(id) on delete cascade,
  projekt_id uuid not null references projekt(id) on delete cascade,
  name       text not null              -- "V-Klasse", "Vito", "Ranger"
);

-- FAHRT
create table fahrt (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references org(id) on delete cascade,
  projekt_id      uuid not null references projekt(id) on delete cascade,
  fahrzeug_id     uuid references fahrzeug(id) on delete set null,
  fahrer_person_id uuid references person(id) on delete set null,
  tag             date not null,
  zeit            time,
  zweck           fahrt_zweck not null default 'transfer',
  route           text
);
create index on fahrt (projekt_id, tag);

-- FAHRT_PERSON (Mitfahrer)
create table fahrt_person (
  fahrt_id  uuid not null references fahrt(id) on delete cascade,
  person_id uuid not null references person(id) on delete cascade,
  org_id    uuid not null references org(id) on delete cascade,
  primary key (fahrt_id, person_id)
);

-- CALLSHEET (Dreh-Tagesdispo)
create table callsheet (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references org(id) on delete cascade,
  projekt_id uuid not null references projekt(id) on delete cascade,
  tag        date not null,
  banner     text,
  wetter     text,
  notfall    text,
  sektionen  jsonb not null default '{}'::jsonb,   -- Toggle-Konfig je Sektion
  updated_at timestamptz not null default now(),
  unique (projekt_id, tag)
);

-- CALLSHEET_PERSON (personalisierte Calltime + Versand-/Confirm-Status)
create table callsheet_person (
  callsheet_id uuid not null references callsheet(id) on delete cascade,
  person_id    uuid not null references person(id) on delete cascade,
  org_id       uuid not null references org(id) on delete cascade,
  calltime     time,
  status       versand_status not null default 'offen',
  primary key (callsheet_id, person_id)
);

-- ---------------------------------------------------------------------------
-- updated_at-Trigger
-- ---------------------------------------------------------------------------
create trigger trg_position_updated  before update on position  for each row execute function set_updated_at();
create trigger trg_schicht_updated   before update on schicht   for each row execute function set_updated_at();
create trigger trg_aufgabe_updated   before update on aufgabe   for each row execute function set_updated_at();
create trigger trg_callsheet_updated before update on callsheet for each row execute function set_updated_at();

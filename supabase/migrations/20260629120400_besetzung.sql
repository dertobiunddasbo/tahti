-- liiku — Besetzung: explizite Crew-Liste pro Produktion (Person x Projekt)
-- Wer gehoert zu einer Produktion (unabhaengig von einzelnen Schichten).

create type crew_status as enum ('eingeladen', 'zugesagt', 'abgesagt');

create table besetzung (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references org(id) on delete cascade,
  projekt_id uuid not null references projekt(id) on delete cascade,
  person_id uuid not null references person(id) on delete cascade,
  rolle_im_projekt text,
  status crew_status not null default 'eingeladen',
  notiz text,
  created_at timestamptz default now(),
  unique (projekt_id, person_id)
);
create index on besetzung (projekt_id);
create index on besetzung (person_id);

-- RLS: Mitglieder der Org sehen die Besetzung; nur Planer schreiben.
alter table besetzung enable row level security;
create policy besetzung_select on besetzung for select using ( is_member(org_id) );
create policy besetzung_write  on besetzung for all
  using ( is_planer(org_id) ) with check ( is_planer(org_id) );

grant select, insert, update, delete on besetzung to authenticated;

-- Backfill: bestehende Schicht-Zuordnungen ergeben die Crew-Liste je Projekt.
insert into besetzung (org_id, projekt_id, person_id, status)
select distinct org_id, projekt_id, person_id, 'zugesagt'::crew_status
from schicht
where person_id is not null
on conflict (projekt_id, person_id) do nothing;

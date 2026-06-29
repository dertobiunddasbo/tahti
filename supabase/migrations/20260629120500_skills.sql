-- tahti — Skills: org-weiter Katalog + Zuordnung zu Personen (Karten-Layer Dispo)

create table skill (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references org(id) on delete cascade,
  name text not null,
  sortierung int default 0,
  unique (org_id, name)
);
create index on skill (org_id);

create table person_skill (
  person_id uuid not null references person(id) on delete cascade,
  skill_id uuid not null references skill(id) on delete cascade,
  primary key (person_id, skill_id)
);

alter table skill enable row level security;
alter table person_skill enable row level security;

-- Lesen: Org-Mitglieder; Schreiben: admin/disponent (Stammdaten)
create policy skill_select on skill for select using ( is_member(org_id) );
create policy skill_write on skill for all
  using ( is_admin_disponent(org_id) ) with check ( is_admin_disponent(org_id) );

create policy person_skill_select on person_skill for select using (
  exists (select 1 from skill s where s.id = skill_id and is_member(s.org_id))
);
create policy person_skill_write on person_skill for all using (
  exists (select 1 from skill s where s.id = skill_id and is_admin_disponent(s.org_id))
) with check (
  exists (select 1 from skill s where s.id = skill_id and is_admin_disponent(s.org_id))
);

grant select, insert, update, delete on skill to authenticated;
grant select, insert, update, delete on person_skill to authenticated;

-- Demo-Katalog für die Mock-Org (bsp media) + zufällige Zuordnungen
do $$
declare v_org uuid := '00000000-0000-0000-0000-0000000000aa';
begin
  if exists (select 1 from org where id = v_org) then
    insert into skill (org_id, name, sortierung) values
      (v_org, 'Kamera', 1), (v_org, 'Ton', 2), (v_org, 'Licht', 3),
      (v_org, 'Regie', 4), (v_org, 'Bildmischung', 5), (v_org, 'Schnitt', 6),
      (v_org, 'Ü-Wagen', 7), (v_org, 'EFP', 8), (v_org, 'Aufnahmeleitung', 9),
      (v_org, 'Grafik', 10)
    on conflict (org_id, name) do nothing;

    insert into person_skill (person_id, skill_id)
    select p.id, s.id
    from person p
    join membership m on m.person_id = p.id and m.org_id = v_org
    join skill s on s.org_id = v_org
    where (abs(hashtext(p.email || s.name)) % 100) < 28
    on conflict do nothing;
  end if;
end $$;

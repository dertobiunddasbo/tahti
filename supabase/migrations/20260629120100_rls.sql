-- liiku — Row Level Security: Tenant-Isolation + Rollenrechte (RBAC Ebene 1)
-- Zwei feste Achsen: (a) org-Mitgliedschaft isoliert Mandanten, (b) system_rolle steuert Schreibrechte.
-- Crew sieht eigene Schichten + Kontakte der eigenen Org; nie fremde Schichten, nie Tagessaetze.

-- ---------------------------------------------------------------------------
-- Helper-Funktionen (SECURITY DEFINER: lesen membership/person ohne RLS-Rekursion)
-- ---------------------------------------------------------------------------
create or replace function current_person_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from person where auth_user_id = auth.uid()
$$;

create or replace function current_rolle(p_org uuid)
returns system_rolle language sql stable security definer set search_path = public as $$
  select m.rolle from membership m
  join person p on p.id = m.person_id
  where p.auth_user_id = auth.uid() and m.org_id = p_org
$$;

create or replace function is_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from membership m join person p on p.id = m.person_id
    where p.auth_user_id = auth.uid() and m.org_id = p_org
  )
$$;

create or replace function is_planer(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from membership m join person p on p.id = m.person_id
    where p.auth_user_id = auth.uid() and m.org_id = p_org
      and m.rolle in ('admin','disponent','lead')
  )
$$;

create or replace function is_admin_disponent(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from membership m join person p on p.id = m.person_id
    where p.auth_user_id = auth.uid() and m.org_id = p_org
      and m.rolle in ('admin','disponent')
  )
$$;

-- Ist der aktuelle Nutzer in IRGENDEINER Org admin/disponent (fuer globalen Personen-Pool)?
create or replace function is_any_admin_disponent()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from membership m join person p on p.id = m.person_id
    where p.auth_user_id = auth.uid() and m.rolle in ('admin','disponent')
  )
$$;

-- Teilt der aktuelle Nutzer mindestens eine Org mit der Zielperson?
create or replace function shares_org(p_person uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from membership me  join person p on p.id = me.person_id
    join membership them on them.org_id = me.org_id
    where p.auth_user_id = auth.uid() and them.person_id = p_person
  )
$$;

-- ---------------------------------------------------------------------------
-- RLS aktivieren
-- ---------------------------------------------------------------------------
alter table person           enable row level security;
alter table org              enable row level security;
alter table membership       enable row level security;
alter table projekt          enable row level security;
alter table location         enable row level security;
alter table department       enable row level security;
alter table position         enable row level security;
alter table schichtblock     enable row level security;
alter table schicht          enable row level security;
alter table verfuegbarkeit   enable row level security;
alter table aufgabe          enable row level security;
alter table aufgabe_person   enable row level security;
alter table meeting          enable row level security;
alter table meeting_person   enable row level security;
alter table lieferant        enable row level security;
alter table lieferung        enable row level security;
alter table fahrzeug         enable row level security;
alter table fahrt            enable row level security;
alter table fahrt_person     enable row level security;
alter table callsheet        enable row level security;
alter table callsheet_person enable row level security;

-- ---------------------------------------------------------------------------
-- PERSON (global)
-- ---------------------------------------------------------------------------
create policy person_select on person for select using (
  auth_user_id = auth.uid() or shares_org(id)
);
create policy person_insert on person for insert with check ( is_any_admin_disponent() );
create policy person_update on person for update using (
  auth_user_id = auth.uid() or is_any_admin_disponent()
) with check (
  auth_user_id = auth.uid() or is_any_admin_disponent()
);
create policy person_delete on person for delete using ( is_any_admin_disponent() );

-- ---------------------------------------------------------------------------
-- ORG  (Anlegen via service_role/Bootstrap; Nutzer: lesen wenn Mitglied, aendern wenn admin)
-- ---------------------------------------------------------------------------
create policy org_select on org for select using ( is_member(id) );
create policy org_update on org for update using ( current_rolle(id) = 'admin' )
  with check ( current_rolle(id) = 'admin' );
create policy org_delete on org for delete using ( current_rolle(id) = 'admin' );

-- ---------------------------------------------------------------------------
-- MEMBERSHIP (tagessatz nur fuer admin/disponent oder eigene Zeile sichtbar)
-- ---------------------------------------------------------------------------
create policy membership_select on membership for select using (
  is_admin_disponent(org_id) or person_id = current_person_id()
);
create policy membership_write on membership for all using (
  is_admin_disponent(org_id)
) with check (
  is_admin_disponent(org_id)
);

-- ---------------------------------------------------------------------------
-- Generisches Muster fuer projekt-/org-gebundene Tabellen:
--   SELECT = Mitglied der Org, WRITE = Planer (admin/disponent/lead)
-- ---------------------------------------------------------------------------
create policy projekt_select on projekt for select using ( is_member(org_id) );
create policy projekt_write  on projekt for all using ( is_planer(org_id) ) with check ( is_planer(org_id) );

create policy location_select on location for select using ( is_member(org_id) );
create policy location_write  on location for all using ( is_planer(org_id) ) with check ( is_planer(org_id) );

create policy department_select on department for select using ( is_member(org_id) );
create policy department_write  on department for all using ( is_planer(org_id) ) with check ( is_planer(org_id) );

create policy position_select on position for select using ( is_member(org_id) );
create policy position_write  on position for all using ( is_planer(org_id) ) with check ( is_planer(org_id) );

create policy schichtblock_select on schichtblock for select using ( is_member(org_id) );
create policy schichtblock_write  on schichtblock for all using ( is_planer(org_id) ) with check ( is_planer(org_id) );

create policy aufgabe_select on aufgabe for select using ( is_member(org_id) );
create policy aufgabe_write  on aufgabe for all using ( is_planer(org_id) ) with check ( is_planer(org_id) );

create policy aufgabe_person_select on aufgabe_person for select using ( is_member(org_id) );
create policy aufgabe_person_write  on aufgabe_person for all using ( is_planer(org_id) ) with check ( is_planer(org_id) );

create policy meeting_select on meeting for select using ( is_member(org_id) );
create policy meeting_write  on meeting for all using ( is_planer(org_id) ) with check ( is_planer(org_id) );

create policy meeting_person_select on meeting_person for select using ( is_member(org_id) );
create policy meeting_person_write  on meeting_person for all using ( is_planer(org_id) ) with check ( is_planer(org_id) );

create policy lieferant_select on lieferant for select using ( is_member(org_id) );
create policy lieferant_write  on lieferant for all using ( is_planer(org_id) ) with check ( is_planer(org_id) );

create policy lieferung_select on lieferung for select using ( is_member(org_id) );
create policy lieferung_write  on lieferung for all using ( is_planer(org_id) ) with check ( is_planer(org_id) );

create policy fahrzeug_select on fahrzeug for select using ( is_member(org_id) );
create policy fahrzeug_write  on fahrzeug for all using ( is_planer(org_id) ) with check ( is_planer(org_id) );

create policy fahrt_select on fahrt for select using ( is_member(org_id) );
create policy fahrt_write  on fahrt for all using ( is_planer(org_id) ) with check ( is_planer(org_id) );

create policy fahrt_person_select on fahrt_person for select using ( is_member(org_id) );
create policy fahrt_person_write  on fahrt_person for all using ( is_planer(org_id) ) with check ( is_planer(org_id) );

create policy callsheet_select on callsheet for select using ( is_member(org_id) );
create policy callsheet_write  on callsheet for all using ( is_planer(org_id) ) with check ( is_planer(org_id) );

-- ---------------------------------------------------------------------------
-- SCHICHT (Crew sieht/bestaetigt nur eigene; Planer voll)
-- ---------------------------------------------------------------------------
create policy schicht_select on schicht for select using (
  is_planer(org_id) or person_id = current_person_id()
);
create policy schicht_planer_write on schicht for all using (
  is_planer(org_id)
) with check (
  is_planer(org_id)
);
-- Crew darf die eigene Schicht updaten (Spaltenschutz via Trigger schicht_crew_guard)
create policy schicht_crew_confirm on schicht for update using (
  person_id = current_person_id()
) with check (
  person_id = current_person_id()
);

-- ---------------------------------------------------------------------------
-- VERFUEGBARKEIT (Crew pflegt eigene Sperrtermine; Planer sehen/pflegen alle)
-- ---------------------------------------------------------------------------
create policy verfuegbarkeit_select on verfuegbarkeit for select using (
  is_planer(org_id) or person_id = current_person_id()
);
create policy verfuegbarkeit_write on verfuegbarkeit for all using (
  is_planer(org_id) or person_id = current_person_id()
) with check (
  is_planer(org_id) or person_id = current_person_id()
);

-- ---------------------------------------------------------------------------
-- CALLSHEET_PERSON (Crew sieht/bestaetigt eigene Calltime; Planer voll)
-- ---------------------------------------------------------------------------
create policy callsheet_person_select on callsheet_person for select using (
  is_planer(org_id) or person_id = current_person_id()
);
create policy callsheet_person_planer_write on callsheet_person for all using (
  is_planer(org_id)
) with check (
  is_planer(org_id)
);
create policy callsheet_person_confirm on callsheet_person for update using (
  person_id = current_person_id()
) with check (
  person_id = current_person_id()
);

-- ---------------------------------------------------------------------------
-- Spaltenschutz: Crew darf an der eigenen Schicht nur 'bestaetigt' aendern
-- ---------------------------------------------------------------------------
create or replace function schicht_crew_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;       -- service_role / SQL-Editor
  if is_planer(new.org_id) then return new; end if;    -- Planer duerfen alles
  if new.person_id      is distinct from old.person_id
     or new.position_id    is distinct from old.position_id
     or new.schichtblock_id is distinct from old.schichtblock_id
     or new.location_id    is distinct from old.location_id
     or new.tag            is distinct from old.tag
     or new.typ            is distinct from old.typ
     or new.open_end       is distinct from old.open_end
     or new.notiz          is distinct from old.notiz
     or new.org_id         is distinct from old.org_id
     or new.projekt_id     is distinct from old.projekt_id then
    raise exception 'Crew darf nur "bestaetigt" der eigenen Schicht aendern';
  end if;
  return new;
end;
$$;
create trigger trg_schicht_crew_guard before update on schicht
  for each row execute function schicht_crew_guard();

-- ---------------------------------------------------------------------------
-- VIEW person_public: Personen + Org-Rolle/Typ OHNE tagessatz, RLS-respektierend
-- ---------------------------------------------------------------------------
create view person_public
  with (security_invoker = true) as
  select p.id, p.name, p.kuerzel, p.email, p.mobil, p.skills, p.aktiv,
         m.org_id, m.rolle, m.typ
  from person p
  join membership m on m.person_id = p.id;

-- ---------------------------------------------------------------------------
-- Grants (RLS gated den Zugriff; anon bleibt aussen vor — Login erforderlich)
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on person_public to authenticated;

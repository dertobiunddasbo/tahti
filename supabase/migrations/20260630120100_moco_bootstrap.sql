-- Moco-Integration — Bootstrap: Org "bsp media" + erster Admin
-- Zweck: ohne mindestens eine Admin-Mitgliedschaft laesst die RLS niemanden Daten sehen.
--        Dieser Bootstrap macht Tobias Abt zum ersten admin; der Moco-Sync fuellt den Rest.
-- Idempotent: kann beliebig oft laufen, legt nichts doppelt an.

do $$
declare
  v_org_id    uuid;
  v_person_id uuid;
begin
  -- 1) Org "bsp media" sicherstellen.
  --    In Produktion existiert die Zeile bereits (manuell angelegt, eigene UUID),
  --    daher per NAMEN referenziert statt per (abgetippter) UUID. Auf frischer DB
  --    (supabase db reset) wird sie hier angelegt.
  select id into v_org_id from org where name = 'bsp media' order by created_at limit 1;
  if v_org_id is null then
    insert into org (name) values ('bsp media') returning id into v_org_id;
  end if;

  -- 2) Bootstrap-Admin als person upserten (Schluessel: email; gleiche Logik wie der Sync).
  --    auth_user_id wird vom Trigger trg_link_person automatisch verknuepft, sobald/sofern
  --    ein passender auth.users-Eintrag existiert (Reihenfolge egal).
  insert into person (name, kuerzel, email, moco_id)
  values ('Tobias Abt', 'TA', 'tobias.abt@bsp-media.de', '933757002')
  on conflict (email) do update
    set name    = excluded.name,
        kuerzel = coalesce(person.kuerzel, excluded.kuerzel),
        moco_id = coalesce(person.moco_id, excluded.moco_id)
  returning id into v_person_id;

  -- 3) Admin-Mitgliedschaft in der Org sicherstellen.
  insert into membership (person_id, org_id, rolle, typ)
  values (v_person_id, v_org_id, 'admin', 'intern')
  on conflict (person_id, org_id) do update set rolle = 'admin';
end $$;

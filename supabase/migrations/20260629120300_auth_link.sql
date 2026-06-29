-- liiku — Auth-Verknuepfung: auth.users <-> person.auth_user_id (Magic-Link-Flow)
-- Disponent legt person (Name, E-Mail) + membership an; auth_user_id bleibt null.
-- Beim ersten Magic-Link-Login entsteht ein auth.users-Eintrag -> hier per E-Mail verknuepft.
-- Robust gegen Reihenfolge: deckt beide Faelle ab (Login vor/nach Anlage der person).

-- ---------------------------------------------------------------------------
-- Richtung 1: neuer auth.users-Eintrag -> passende person verknuepfen
-- ---------------------------------------------------------------------------
create or replace function link_auth_user_to_person()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.person
     set auth_user_id = new.id
   where auth_user_id is null
     and lower(email) = lower(new.email);
  return new;
end;
$$;

drop trigger if exists trg_link_auth_user on auth.users;
create trigger trg_link_auth_user
  after insert on auth.users
  for each row execute function link_auth_user_to_person();

-- ---------------------------------------------------------------------------
-- Richtung 2: person wird angelegt/E-Mail gesetzt, Login existiert bereits
-- ---------------------------------------------------------------------------
create or replace function link_person_to_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.auth_user_id is null then
    select u.id into new.auth_user_id
      from auth.users u
     where lower(u.email) = lower(new.email)
     limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_link_person on person;
create trigger trg_link_person
  before insert or update of email on person
  for each row execute function link_person_to_auth_user();

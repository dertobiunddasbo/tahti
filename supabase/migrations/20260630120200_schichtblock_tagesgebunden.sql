-- Schichtblöcke tagesgebunden machen.
-- Grund: Bei z. B. Werbedrehs ist jeder Drehtag eigenständig (eigene Zeitfenster);
-- eine produktionsweite Block-Palette passt dafür nicht. Jeder Block gehört nun
-- genau einem Drehtag (tag). Angelegt/kopiert werden Blöcke pro Tag in der Dispo-Matrix.

alter table schichtblock add column if not exists tag date;

-- Backfill bestehender Blöcke (Produktionsstart, sonst heute), damit tag vor NOT NULL nie leer ist.
update schichtblock sb
   set tag = coalesce((select p.start_datum from projekt p where p.id = sb.projekt_id), current_date)
 where sb.tag is null;

alter table schichtblock alter column tag set not null;
-- Defensiver Default: fängt Altaufrufe ohne tag ab (neues UI sendet tag stets explizit pro Drehtag).
alter table schichtblock alter column tag set default current_date;
create index if not exists schichtblock_projekt_tag_idx on schichtblock (projekt_id, tag);

-- Konsistenz-Garantie: eine Schicht darf nur einen Block desselben Drehtages
-- und derselben Produktion referenzieren (verhindert tagfremde Zuweisungen).
create or replace function schicht_block_tag_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare b_tag date; b_proj uuid;
begin
  if new.schichtblock_id is null then return new; end if;
  select tag, projekt_id into b_tag, b_proj from schichtblock where id = new.schichtblock_id;
  if b_tag is distinct from new.tag then
    raise exception 'Schichtblock gehört zu Drehtag %, Schicht ist am % (Tagesbindung verletzt)', b_tag, new.tag;
  end if;
  if b_proj is distinct from new.projekt_id then
    raise exception 'Schichtblock gehört zu einer anderen Produktion';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_schicht_block_tag on schicht;
create trigger trg_schicht_block_tag
  before insert or update of schichtblock_id, tag on schicht
  for each row execute function schicht_block_tag_guard();

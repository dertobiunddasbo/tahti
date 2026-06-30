-- Zeit-Override pro Schicht.
-- Einzelne Besetzungen können vom Block-Zeitfenster abweichen — z. B. 4 h Drohne
-- in einem 12 h Drehblock. NULL = es gilt die Block-Zeit (Standardfall).
-- Die effektive Zeit (Override sonst Block) fließt in Konflikt-/ArbZG-/Auslastungsrechnung.

alter table schicht add column if not exists start_zeit time;
alter table schicht add column if not exists ende_zeit  time;

# liiku — Crew, Dispo & Call Sheet

Datenbank-Fundament (V1-Datenmodell) für das liiku-Tool: ein Modell, mehrere Ausgabeformate
(Schichtmatrix · Call Sheet · Org-Chart · Ablaufplan · Crew-Mobilansicht).

Grundlage: `liiku_crew_callsheet_konzept.md` (Was/Warum) und `liiku_v0_build_spec.md` (Wie).
Diese Iteration liefert **Datenmodell + Backend zuerst** — Supabase-Schema, RLS-Policies und einen
anonymisierten Pilot-Seed. Frontend (Crew-PWA, Dispo-Matrix, PDF) folgt darauf.

## Was drin ist

```
supabase/
├─ migrations/
│  ├─ 20260629120000_schema.sql   Enums + alle Tabellen (Kern V0 + V1)
│  └─ 20260629120100_rls.sql      Helper-Funktionen, RLS-Policies, Spaltenschutz, person_public-View
└─ seed.sql                       Pilot "LSU '26" — ANONYMISIERTE Platzhalter
```

### Datenmodell (Überblick)
- **Multi-Tenant:** `person` (global) ─< `membership` >─ `org` (Mandant) ─< `projekt`.
  Jede projektbezogene Tabelle trägt `org_id` → strikte Isolation per RLS.
- **Kern (Dispo):** `location`, `department`, `position`, `schichtblock`, `schicht`.
- **V1:** `verfuegbarkeit`, `aufgabe` (+`aufgabe_person`), `meeting` (+`meeting_person`),
  `lieferant`/`lieferung`, `fahrzeug`/`fahrt` (+`fahrt_person`), `callsheet`/`callsheet_person`.

### Rechte (RBAC, serverseitig via RLS)
| Rolle | Kurz |
|---|---|
| `admin` | alles inkl. Stammdaten, Tagessätze, Pool |
| `disponent` | Projekte, Schichten, Call Sheets, alle Kontakte |
| `lead` | Planung (Schreibrechte auf Projektdaten) |
| `crew` | eigene Schichten + Kontakte der eigenen Org, bestätigen, eigene Verfügbarkeit |
| `gast` | Lesezugriff (Mitglied der Org) |

Sicherheitsgarantien (Akzeptanzkriterien-relevant):
- Crew sieht **nur eigene** Schichten (`schicht_select`), kann nur `bestaetigt` der eigenen Schicht
  ändern (DB-Trigger `schicht_crew_guard`, nicht nur App-seitig).
- `membership.tagessatz` geht nie an Crew (RLS); das Crew-Frontend liest Personen über die View
  `person_public` (ohne Tagessatz).
- Zwei Orgs → Daten strikt getrennt; eine Person in mehreren Orgs sieht ihre Schichten orgübergreifend.

## Setup gegen dein Supabase-Cloud-Projekt

Voraussetzung: Supabase-Projekt in der **EU-Region (Frankfurt)** anlegen (Dashboard).

```bash
# 1. CLI einloggen (interaktiv — im Chat mit ! ausführen):
#    ! supabase login

# 2. Repo mit deinem Projekt verknüpfen (PROJECT_REF aus der Dashboard-URL):
supabase link --project-ref <PROJECT_REF>

# 3. Schema + Policies pushen:
supabase db push

# 4. Seed einspielen (anonymisierte Pilotdaten):
psql "$DATABASE_URL" -f supabase/seed.sql
#    DATABASE_URL = Connection String aus dem Dashboard (Settings → Database).
```

> Der Seed enthält **nur Platzhalter**. Echte Stabliste, Mobilnummern und Tagessätze
> werden direkt im Projekt eingespielt — nicht in dieses Repo committen.

## Lokal entwickeln/testen (optional, Docker erforderlich)

```bash
supabase start            # lokaler Stack (Postgres, Auth, Realtime, Studio)
supabase db reset         # wendet Migrationen + seed.sql an
# Studio: http://127.0.0.1:54323
```

## Auth-Flow (Magic Link)
1. Disponent legt `person` (Name, E-Mail) + `membership` an.
2. Magic Link via `supabase.auth.signInWithOtp`.
3. Beim ersten Login wird `person.auth_user_id` mit `auth.users.id` verknüpft.
4. Kein Passwort; Folge-Logins ebenfalls per Magic Link.

## Nächste Schritte (noch offen)
- Finales Rollen-/Positions-Mapping LSU (Platzhalter im Seed ersetzen).
- Verknüpfungs-Trigger `auth.users` → `person.auth_user_id` beim ersten Login.
- Frontend: Crew-PWA (CrewHome), Dispo-Matrix (Realtime), PDF-Edge-Function.

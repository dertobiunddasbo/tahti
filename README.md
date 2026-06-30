# tahti — Crew, Dispo, Call Sheet – alle im Bild

Disposition für Bewegtbild-Produktionen: ein Datenmodell, mehrere Ansichten.
Crew plant Schichten und bestätigt sie mobil, die Disposition besetzt am Desktop
per Drag & Drop. Mandantenfähig (mehrere Produktionen parallel), serverseitig
über Row Level Security abgesichert.

## Was die App kann

- **Produktionen verwalten** — beliebig viele Events/Drehs pro Firma anlegen,
  Status (aktiv / kommend / abgeschlossen), globaler Produktions-Umschalter.
- **Setup pro Produktion** — Locations, Departments, Schichtblöcke (Zeit + Farbe)
  und Positionen anlegen/bearbeiten/löschen (inline).
- **Crew/Besetzung** — Personen-Pool der Firma pflegen, Crew je Produktion
  zuordnen (Status eingeladen/zugesagt/abgesagt), Skill-Katalog + Skills pro Person.
- **Dispo-Matrix** — Position × Schichtblock pro Tag **und** Zeitraum-Übersicht;
  Zuweisen/Entfernen per Drag & Drop aus dem Crew-Panel, **Realtime-Sync**.
  - Crew-Karten mit Skills und **Form-Balken** (abgeleitete Auslastung).
  - **Konfliktwarnung** bei zeitlicher Doppelbelegung.
  - **ArbZG-Warnungen**: < 11 h Ruhezeit (§ 5), > 10 h pro Tag (§ 3).
  - Schicht-Editor (Person, Position, Block, Typ, Notiz, Open-End).
  - Lösch-Schutz: „Rückgängig"-Toast beim Entfernen.
- **CrewHome** — „Jetzt / als Nächstes", kommende Schichten, **Bestätigen**,
  Kontakte (Klick-zum-Anrufen), „Plan drucken/PDF".
- **Auth** — Magic Link **und** Passwort-Login, Rollen-Gating.
- **PWA** — installierbar, Offline-Cache der zuletzt geladenen Daten.
- **Dark Mode** — folgt dem System, per Toggle umschaltbar.

## Stack

- **Frontend:** React 19 + Vite 6 + TypeScript, Tailwind v4, react-router,
  vite-plugin-pwa (Workbox). Schriften self-hosted (Inter, JetBrains Mono).
- **Backend:** Supabase (EU) — Postgres + Auth (Magic Link/Passwort) + Realtime + RLS.
- **Hosting:** Vercel (EU), Production-Branch `main`.

## Datenmodell (Überblick)

```
person (global)  ──< membership >──  org (Firma, Mandant)
                                       └──< projekt (= Produktion)
                                              ├─ location, department, position, schichtblock
                                              ├─ schicht          (das Assignment)
                                              └─ besetzung        (Crew-Liste je Produktion)
skill (org-weit)  ──< person_skill >──  person
```

Jede projektbezogene Tabelle trägt `org_id` → strikte Mandanten-Isolation per RLS.

### Rollen (RBAC, serverseitig via RLS)

| Rolle | Kurz |
|---|---|
| `admin` | alles inkl. Stammdaten, Personen-Pool, Tagessätze |
| `disponent` | Produktionen, Setup, Crew, Schichten, alle Kontakte |
| `lead` | Planung (Schreibrechte auf Projektdaten) |
| `crew` | eigene Schichten + Kontakte der eigenen Org, bestätigen |
| `gast` | Lesezugriff (Mitglied der Org) |

Sicherheitsgarantien (per RLS, getestet): Crew sieht **nur eigene** Schichten,
**keine** Tagessätze (View `person_public`), kann nur das eigene `bestaetigt`
ändern (DB-Trigger `schicht_crew_guard`), keine Schichten anlegen. Zwei Orgs →
Daten strikt getrennt.

## Projektstruktur

```
src/
├─ main.tsx · App.tsx           Routing + Rollen-Gating
├─ auth/                        AuthProvider (Session), Login (Magic Link/Passwort)
├─ productions/                 ProductionProvider (globaler Produktions-Kontext)
├─ components/AppShell.tsx      Header, Nav, Produktions-Umschalter, Dark-Toggle
├─ pages/
│  ├─ CrewHome.tsx              Crew-Ansicht
│  ├─ Produktionen.tsx          Liste + Anlegen
│  ├─ Setup.tsx                 Struktur je Produktion
│  ├─ Crew.tsx                  Besetzung + Skill-Katalog
│  └─ DispoMatrix.tsx           Dispo (Tag/Zeitraum, DnD, Warnungen, Editor)
└─ lib/                         supabase-Client, Typen, Theme
supabase/
├─ migrations/                  Schema, RLS, Custom Fields, Auth-Link, Besetzung, Skills
└─ seed.sql                     anonymisierter Beispiel-Seed
```

## Lokal entwickeln

```bash
# 1. .env.local anlegen (Werte aus Supabase → Settings → API)
cp .env.example .env.local
#    VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
#    VITE_SUPABASE_ANON_KEY=<publishable/anon key>

# 2. Abhängigkeiten + Dev-Server
npm install
npm run dev            # http://localhost:5173

# Weitere Skripte
npm run build          # tsc + Production-Build (dist/)
npm run typecheck      # nur Typprüfung
npm run preview        # Build lokal ausliefern
```

## Supabase einrichten

```bash
supabase link --project-ref <PROJECT_REF>
supabase db push          # wendet alle Migrationen an
# optional: psql "$DATABASE_URL" -f supabase/seed.sql
```

`uri_allow_list` und `site_url` in der Auth-Config auf die Dev- und
Produktions-URLs setzen (Dashboard → Authentication → URL Configuration).

## Deployment (Vercel)

1. Repo importieren; Framework wird als Vite erkannt (`vercel.json` setzt
   Build/Output/SPA-Rewrite).
2. **Environment Variables** setzen (Production *und* Preview):
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
   Diese werden **zur Buildzeit** eingebacken → nach dem Setzen einmal neu deployen.
3. **Production Branch = `main`.**

## Auth-Flow

1. Disposition legt `person` (Name, E-Mail) + `membership` an (Crew-Tab).
2. Login per **Magic Link** (`signInWithOtp`) oder **Passwort**.
3. Beim ersten Login verknüpft ein Trigger `auth.users` ↔ `person.auth_user_id`
   über die E-Mail (Reihenfolge egal).

> **Hinweis:** Echter Magic-Link-Versand braucht **eigenes SMTP** (Supabase →
> Authentication → SMTP). Der eingebaute Mailer ist stark rate-limitiert. Bis
> dahin: Passwort-Login.

## Offen / Roadmap

- Eigenes SMTP für Crew-Einladungen.
- Skill ↔ Position-Matching im Dispo-Panel („passend für diese Position").
- Verfügbarkeits-Blocker (`verfuegbarkeit`).
- Serverseitiges Call-Sheet-PDF (aktuell Browser-Druck).
- Soft-Delete/Stornieren mit Historie (statt Hard-Delete) bei Bedarf.

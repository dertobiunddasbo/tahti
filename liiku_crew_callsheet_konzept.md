# liiku.studio — Crew, Dispo & Call Sheet
**Produktkonzept & Architektur · v2 · 29.06.2026**
*Cases: bsp-Drehproduktionen + Events (Red Bull Wattlauf, SUP & WF Festival) + Live-TV (Last Soul Ultra). Ein Modell, mehrere Ausgabeformate.*

---

## 1. Worum es geht

bsp plant Crews heute mit Drive, Call-Sheet-Docs und riesigen Excel-Mappen. Das hält Daten, aber keine Logik: keine Wiederverwendung, keine Verknüpfung, keine Konfliktprüfung, kein „jeder sieht seinen Stand", kein Live-Update.

Die Analyse echter bsp-Artefakte (4 Dreh-Dispos + die RBWL-Eventmappe) zeigt den eigentlichen Befund: **Es gibt nicht „eine Dispo". Es gibt ein Datenmodell und mehrere Ausgabeformate.** Helene baut für ein Event heute parallel Department-Pool, Positions-Matrix, Tagesschicht-Raster, einen 30-Minuten-Master-Ablaufplan, einen Meeting-Plan und die Lieferantenspalten — alles von Hand, mehrfach, ohne Datenverknüpfung. Die Dreh-Dispo ist nochmal ein eigenes Format.

**Leitsatz: einmal pflegen, alle Formate ableiten.** Person, Projekt, Position, Schicht einmal erfassen → Call Sheet, Schichtmatrix, Org-Chart, Ablaufplan, Kalender und mobile Crew-Ansicht fallen daraus ab.

---

## 2. Markt & Positionierung

| Tool | Stärke | Lücke für uns |
|---|---|---|
| **StudioBinder** (US) | Call-Sheet-Standard: Auto-Fill, SMS/Mail/PDF, View-/Confirm-Tracking | Englisch, nur Drehtag-Format, keine Schicht-Rotation, keine Eventmatrix |
| **connactz** (DE) | Crew-Kalender, Verfügbarkeit/Blocker, RBAC, Push | Nur Kalender/Verfügbarkeit, kein Call Sheet, keine Eventmatrix, keine Datenhoheit |
| **Yamdu** (DE) | Vollsuite: Drehpläne, Tagesdispos, Stundenzettel | Schwer, breit, Spielfilm-Logik, kein Event |
| **PreProducer** (DE) | Drehplan, Kalkulation, Stabliste | Pre-Production/Kalkulation, nicht Live-Crew |
| **Troi** (DE) | Medien-/Agentur-ERP | ERP-Terrain → das macht bei euch MOCO |

**USP:** Keines dieser Tools deckt Dreh **und** Event auf einem Modell ab, und keines beherrscht Mehrtages-/24-h-Dauerbetrieb mit rotierenden Schichten. Die Stärke des liiku-Tools ist nicht ein einzelnes Format, sondern dass alle Formate aus einer Datenbasis fallen — plus deutsch, bsp-Workflow, MOCO-Anbindung, Datenhoheit.

**Build-vs-Buy:** connactz/StudioBinder decken je *ein* Format gut ab. Der Eigenbau rechtfertigt sich durch (a) liiku.studio als Produkt-Forschungszweig, (b) die unbesetzte „ein Modell, alle Formate"-Nische inkl. Event, (c) MOCO-Integration + Datenhoheit.

---

## 3. Das Prinzip: ein Modell, mehrere Ausgabeformate

Aus derselben Datenbasis erzeugt das Tool:

1. **Call Sheet / Tagesdispo** (Dreh) — Kontaktliste nach Gruppen, Calltimes pro Tag, Ablaufplan, Locations, Car-Pooling. *Format der 4 Dreh-Dispos.*
2. **Schichtmatrix** (Event) — Position × Zeitraster über mehrere Tage und Locations, mit Schichtblöcken, Pausen, Standby, Nachtwache. *Format der RBWL-Mappe.*
3. **Org-Chart** — Department → Position → Person. Fällt automatisch aus der Zuweisung, kein separates Bauen.
4. **Master-Ablaufplan** — granulare To-Do-Timeline pro Gewerk: Zeit, Ort, verantwortliche Personen, Status (offen/erledigt).
5. **Meeting-Plan** — Typ, Zeit, Ort, Organizer, Teilnehmer.
6. **Crew-Einzelansicht** (mobil) — „meine Schicht / mein Call", Kontakte, bestätigen.

Welche Sicht ein Projekt primär nutzt, steuert der **Projekt-Typ** (Dreh / Event / Live). Die Daten dahinter sind dieselben.

---

## 4. Datenmodell (Kern, geschärft an echten Daten)

```
person          id · typ(intern|freelance|lokal|volunteer|vendor|client)
                · name · kürzel(HG, MA…) · kontakt(mobil, mail)
                · skills/gewerke[] · tagessatz(rechtebeschränkt) · aktiv
                → eventübergreifender Pool

verfuegbarkeit  person · von · bis · status(frei|blockiert) · grund(optional)

projekt         id · typ(dreh|event|live) · name · client · agentur
                · projektnr · zeitraum · set-handy · hinweise(freitext)
                · personen-aggregat(crew/talent/client) [abgeleitet]

location        id · projekt · name · adresse · maps · tel · kontakt
                · parken · krankenhaus · notizen
                → mehrere pro Projekt, parallel (CUX + Neuwerk)

department      id · projekt · name(Event, Media, Safety, Programm…)
                → Gruppierungsebene über Positionen, Basis Org-Chart

position        id · projekt · department · label(frei) · location
                · besetzung(person | offen | „?Lokal" | „?Volunteer" | extern)
                → Ebene-2-Rolle, frei pro Projekt, ortsgebunden

schichtblock    id · projekt · label · start · ende · farbe (überlappend erlaubt)

schicht         id · person · projekt · position · schichtblock · tag
                · location · typ(arbeit|standby|eigendispo/pause|nachtwache)
                · open_end(bool) · notiz
                → Assignment. Konfliktprüfung hier.

aufgabe         id · projekt · tag · zeit(start/ende) · titel · ort
                · gewerk/department · verantwortliche[] · status(offen|erledigt)
                → Master-Ablaufplan (To-Do-Timeline)

meeting         id · projekt · typ · zeit · ort · organizer · teilnehmer[] · themen

lieferant       id · name · gewerk · kontakt
lieferung       lieferant · projekt · tag · zeitfenster · was · ort · richtung(an|ab)
                → externe Gewerke (Europcar, Kusch, Zeppelin, DRK, Caterer…)

fahrzeug        id · projekt · name(V-Klasse, Vito, Ranger…)
fahrt           fahrzeug · person · tag · zweck(travel|shooting) · route
                → Car-Pooling

callsheet       id · projekt · tag · sektionen(toggle) · banner · wetter · notfall
callsheet_person  callsheet · person · calltime · status(sent|viewed|confirmed)
```

**Fest vs. frei:** ein `person`-Pool, unterschieden über `typ` (intern/freelance/lokal/volunteer/vendor/client). Filter & Rechte hängen am Typ.

---

## 5. Zwei Rollen-Ebenen — nicht verwechseln

**Ebene 1 — Zugriffsrechte (RBAC):** *was darf jemand im Tool.* Wenige feste System-Rollen, serverseitig über Row Level Security erzwungen.

| System-Rolle | Darf |
|---|---|
| Owner / Admin | Alles, inkl. Nutzer-/Stammdaten, Tagessätze, Pool |
| Disponent / PL | Projekte, Schichten, Call Sheets, Ablaufplan, alle Kontakte |
| Gewerke-/Departmentleitung | Eigenes Department planen/sehen |
| Crew | Eigene Schichten + Call + nötige Kontakte, bestätigen, Verfügbarkeit |
| Gast / Client | Lesezugriff auf freigegebene Sicht |

**Ebene 2 — Produktions-Positionen:** *was jemand im Projekt macht.* Frei definierbare Daten ohne Rechte, ortsgebunden, mit Besetzungs-Status (Person / offen / ?Lokal / ?Volunteer / extern). → Türschloss vs. Job-Schild.

---

## 6. Call-Sheet- & Crew-App

Aus StudioBinder übernommen, weil es funktioniert: Auto-Fill (Location, Maps, Krankenhaus, Wetter, Kontakte), personalisierte Sicht pro Person, View-/Confirm-Tracking, Ausspielung als Web/PDF/Push.

Besser bei uns: Schicht-Rotation & überlappende Blöcke, Eventmatrix, Dauerbetrieb-Sicht („läuft gerade / als nächstes"), Car-Pooling im Crew-Blatt, der Prototyp als mobile Einzelansicht. PDF serverseitig im jeweiligen Format (Dreh-Call-Sheet ≠ Event-Schichtblatt).

---

## 7. Features — bewertet

**V0/V1:**
- **Live-Sync** (Supabase Realtime) — „ändert sich ständig" geschenkt.
- **Kalender-Sync** — persönlicher iCal-Feed (ICS-URL) pro Person zum Abonnieren. Kein OAuth.
- **Push** — Web-Push (PWA, gratis) primär; **SMS** (sipgate / seven.io, ~7–10 ct) als Fallback für kritische Änderungen, bewusst dosiert.
- **Verfügbarkeit/Blocker** — Sperrtermine vorab, automatisch berücksichtigt.
- **Konfliktwarnung** — Doppelbuchung, „zwei Nächte hintereinander", Schicht außerhalb An-/Abreise, Person an zwei Locations gleichzeitig.

**V2:**
- **AI-Dokumenten-Import** — alte Excel/Call-Sheet/Dispo reinwerfen, die KI befüllt Projekt, Personen, Schichten (Vorbild j.show „Mail in, show ready"). Löst den Kaltstart und treibt Adoption, passt zum AI-assisted Build.
- **MOCO-Anbindung** — Personen, Tagessätze, Projekte aus MOCO statt doppelt pflegen.
- **Lieferanten-/Logistikmodul** ausgebaut (Anlieferungen, Abholungen, Rückgabe-Deadlines).
- **Stundenzettel / Ist-Zeiten** zurück nach MOCO.
- **Client-Gastzugang**, Unterkunfts-/Fahrzeug-Belegung.

---

## 8. Tech-Stack (liiku-Standard)

- **Supabase** — Postgres + Auth (Magic-Link) + Realtime + RLS + Storage. EU-Region.
- **React PWA** — mobil-first, offline-fähig (Service Worker), installierbar.
- **Vercel** — Hosting, EU.
- **PDF** serverseitig (React-PDF / Puppeteer, Edge Function) — pro Format ein Template.
- **iCal** generierte ICS-Feeds. **SMS** sipgate/seven.io. **Push** Web-Push (VAPID).

Mobil ist der Hauptkanal: PWA mit Offline-Cache, große Touch-Targets, Klick-zum-Anrufen, Sync im Compound/Office-WLAN, lesbar bei Sonne und nachts.

---

## 9. Roadmap

**V0 — ein Format, lauffähig:** Personen-Pool · ein Projekt · Department/Position/Schicht zuweisen · Crew-PWA (meine Schicht, Call/Schicht, Kontakte, bestätigen) · serverseitiges PDF · Magic-Link · RBAC-Basis · Live-Sync. **Entscheidung: mit welchem Format starten — Dreh-Call-Sheet (häufiger) oder Event-Schichtmatrix (komplexer, größerer USP)?**

**V1 — beide Formate + rund:** zweites Ausgabeformat · Org-Chart-Auto-Generierung · Master-Ablaufplan · Verfügbarkeit/Blocker · View-/Confirm · Push + SMS · iCal · Konfliktwarnung.

**V2 — liiku-Produkt:** MOCO-Anbindung · Meetings · Lieferanten/Logistik · Multi-Event-Templates · Client-Gastzugang · Stundenzettel.

Grobaufwand V0: ~1 Woche fokussiert (Datenmodell simpel, Logik state-driven, gut AI-assisted baubar).

---

## 10. Offene Entscheidungen

1. **V0-Startformat** — Dreh-Call-Sheet oder Event-Schichtmatrix zuerst?
2. **SMS schon in V0** oder reicht Web-Push?
3. **MOCO jetzt mitdenken** (Modell anschlussfähig halten) oder erst V2?
4. **Pilotprojekt** — an welchem echten Projekt bauen wir V0 scharf (LSU? nächster Dreh? RBWL 2026)?
5. **Lizenzmodell** — bestätigen: Per-Event-Fenster mit Free-Ruhezustand (s. Abschnitt 11)?

---

## 11. Geschäftsmodell / Lizenzierung

Zwei Modelle am Markt:
- **Kontinuierliches Abo** (j.show: 199–499 €/Jahr pro Produktion) — passt zu *durchlaufendem* Betrieb wie Touring.
- **Per-Event-Fenster** (Rundown Studio: voller Zugang 10/20 Tage, danach Free, Daten bleiben) — passt zu *diskreten* Produktionen.

**Empfehlung: Per-Event-Fenster.** Produktionen sind diskret, nicht kontinuierlich — ein Jahresabo läuft zwischen Projekten leer und verkauft sich im Eventrhythmus schlecht. Per-Event passt zum Cashflow: zahlen, wenn das Event läuft.

**Kritisch:** Der Personen-Pool ist der Wiederverwendungswert. Free-Ruhezustand hält Stammdaten + Pool dauerhaft; nur das *aktive Planen/Live-Schalten eines Projekts* kostet fürs Zeitfenster. So bleibt die Wiederverwendung erhalten und der USP intakt.

Für bsp-Eigennutzung ist die Lizenzfrage zweitrangig (internes Tool); relevant erst beim liiku-Verkauf an Dritte. Validierung im Markt: j.show zeigt mit 750+ Produktionen und EU-Hosting, dass das Plattformmuster im Live-Bereich trägt — besetzt aber die Touring-Domäne, nicht Crew-Dispo.

---

*Datenschutz (auf deinen Wunsch nur Merkposten): vor Echtbetrieb mit Personaldaten + Tagessätzen gehören AVV (Supabase/Vercel), EU-Region und Löschkonzept auf die Liste — nicht V0-blockierend.*

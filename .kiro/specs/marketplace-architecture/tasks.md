# Implementation Plan: Marketplace-Architektur

## Overview

Dieser Plan transformiert GreenMatch von einem Demo-Prototyp zu einem echten, persistenten Marketplace. Die Aufgaben folgen der Abhängigkeitsreihenfolge: Datenstrukturen → ServerFns → UI-Refactoring → Datenbankmigrationen → Typen → Tests → Bereinigung.

**Stack:** TypeScript, TanStack Start, Supabase, fast-check (PBT)

---

## Tasks

- [ ] 1. Sample-Daten auslagern
  - [ ] 1.1 Datei `src/lib/sample-data.ts` anlegen und `sampleHelpers`-Array dorthin verschieben
    - Neue Datei `src/lib/sample-data.ts` erstellen
    - `HelperProfile`-Import aus `@/lib/customer-dashboard.functions` eintragen (zirkuläre Abhängigkeit vermeiden: Interface zuerst in eigene Datei oder gemeinsame Typen-Datei auslagern falls nötig)
    - Alle bestehenden hartkodiertes Sample-Objekte aus `customer-dashboard.tsx` in das `sampleHelpers`-Array in der neuen Datei verschieben
    - Sicherstellen, dass jedes Objekt das `HelperProfile`-Interface vollständig erfüllt (`is_sample: true`, alle Pflichtfelder vorhanden)
    - _Anforderungen: 5.3_

- [ ] 2. HelperProfile Interface und CustomerDashboard ServerFns anlegen
  - [ ] 2.1 `src/lib/customer-dashboard.functions.ts` neu anlegen mit Interface und Hilfsfunktionen
    - `HelperRole`-Typ und `HelperProfile`-Interface gemäß Design exportieren
    - `buildReviewMap`-Hilfsfunktion implementieren (gruppiert ReviewRows nach `helper_id`, berechnet avg und count)
    - `mergeWithSamples(dbHelpers: HelperProfile[]): HelperProfile[]` implementieren (hängt `sampleHelpers` an)
    - `applyFilters(helpers: HelperProfile[], criteria: FilterCriteria): HelperProfile[]` implementieren (Kategorie, Ort/PLZ, Mindestbewertung, Max-Preis; PLZ-null schließt nicht aus)
    - `sortHelpers(helpers: HelperProfile[]): HelperProfile[]` implementieren (`available_today=true` zuerst, dann `trust_score` absteigend)
    - `FilterCriteria`-Interface exportieren
    - _Anforderungen: 1.6, 7.2, 7.3, 7.4_

  - [ ]* 2.2 Property-Test schreiben: Property 1 – Merge enthält immer alle SampleHelpers
    - **Property 1: Merge enthält immer alle SampleHelpers**
    - **Validates: Anforderungen 1.2, 1.5**
    - Testdatei `src/lib/__tests__/customer-dashboard.functions.test.ts` anlegen
    - `fast-check` als Dev-Dependency installieren (`npm install --save-dev fast-check`)
    - Arbitrary für gültige `HelperProfile`-Objekte mit `is_sample: false` definieren
    - `fc.assert(fc.property(fc.array(helperArbitrary), dbHelpers => { ... }), { numRuns: 100 })` implementieren

  - [ ]* 2.3 Property-Test schreiben: Property 2 – Filter-Invariante
    - **Property 2: Filter verletzt keine Kriterien**
    - **Validates: Anforderungen 1.6, 7.4**
    - Arbitrary für `FilterCriteria` definieren (optional: Kategorie, Ort-String, Min-Rating 0–5, Max-Preis-Cents)
    - `fc.assert(fc.property(fc.array(helperArbitrary), filterArbitrary, (helpers, criteria) => { ... }), { numRuns: 200 })` implementieren
    - Sicherstellen dass `postal_code = null` im Helper nicht zum Ausschluss führt

  - [ ]* 2.4 Property-Test schreiben: Property 7 – Sortierung
    - **Property 7: Sortierung: verfügbar zuerst, dann trust_score absteigend**
    - **Validates: Anforderungen 7.3**
    - `fc.assert(fc.property(fc.array(helperArbitrary, { minLength: 2 }), helpers => { ... }), { numRuns: 200 })` implementieren
    - Invariante prüfen: kein `available_today=false` vor `available_today=true`, trust_score monoton nicht-steigend innerhalb jeder Gruppe

- [ ] 3. `getHelpersFn` ServerFn implementieren
  - [ ] 3.1 `getHelpersFn` in `src/lib/customer-dashboard.functions.ts` ergänzen
    - `createServerFn({ method: "GET" })` mit `requireSupabaseAuth`-Middleware anlegen
    - Profiles-Query mit `user_roles!inner`-Join und `.in("user_roles.role", [...])` implementieren
    - Review-Aggregation via `supabase.from("reviews").select("helper_id, rating").in("helper_id", helperIds)` hinzufügen
    - DB-Rows via `buildReviewMap` zu `HelperProfile[]` mappen (`is_sample: false`)
    - `mergeWithSamples` aufrufen und Ergebnis zurückgeben
    - Fehlerbehandlung: bei DB-Fehler `console.warn` mit Präfix + Fallback auf `sampleHelpers` (Anforderung 1.5)
    - _Anforderungen: 1.1, 1.2, 1.4, 1.5, 7.2_

- [ ] 4. `createGigFn` ServerFn implementieren
  - [ ] 4.1 `createGigFn` in `src/lib/customer-dashboard.functions.ts` ergänzen
    - `CreateGigSchema` mit zod definieren (alle Pflichtfelder aus Anforderung 2.1)
    - `createServerFn({ method: "POST" })` mit Middleware und Validator anlegen
    - Guard für `data.helperId.startsWith("sample-")` → `throw new Error("SAMPLE_HELPER_NOT_BOOKABLE")` implementieren
    - `supabase.from("gigs").insert({...}).select("id").single()` mit allen Pflichtfeldern implementieren
    - Bei Erfolg `{ ok: true, gigId: gig.id }` zurückgeben
    - Bei `PostgrestError` Fehler propagieren
    - _Anforderungen: 2.1, 2.3, 2.4_

  - [ ]* 4.2 Property-Test schreiben: Property 4 – Sample-Helfer-Guard
    - **Property 4: Sample-Helfer-Guard verhindert Gig-Erstellung**
    - **Validates: Anforderungen 2.4**
    - Unit-Test in `src/lib/__tests__/customer-dashboard.functions.test.ts`
    - `fc.assert(fc.property(fc.string({ minLength: 1 }), suffix => { ... }))` mit `helperId = "sample-" + suffix`
    - Erwarten dass `createGigFn` mit `SAMPLE_HELPER_NOT_BOOKABLE` abbricht (Supabase-Client mocken)

- [ ] 5. CustomerDashboard refactorn
  - [ ] 5.1 `src/components/dashboard/customer-dashboard.tsx` auf `getHelpersFn` und `HelperProfile` umstellen
    - Hartkodierte Mock-Daten und lokale SampleHelper-Definition entfernen
    - `import { getHelpersFn, createGigFn } from "@/lib/customer-dashboard.functions"` einbinden
    - `import { sampleHelpers } from "@/lib/sample-data"` entfernen (wird jetzt serverseitig zusammengeführt)
    - `useServerFn(getHelpersFn)` oder Route-Loader für initiale Daten verwenden
    - `HelperProfile`-Interface für alle lokalen Typen nutzen
    - Buchungslogik auf `createGigFn` umstellen mit vollständiger Fehlerbehandlung (PostgrestError + SAMPLE_HELPER_NOT_BOOKABLE)
    - _Anforderungen: 1.1, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4_

  - [ ]* 5.2 Property-Test schreiben: Property 3 – Display-Card rendert alle Pflichtfelder
    - **Property 3: Display-Card rendert alle Pflichtfelder**
    - **Validates: Anforderungen 1.4, 3.4**
    - Testdatei `src/components/__tests__/helper-card.test.tsx` anlegen (Vitest + Testing Library)
    - Arbitrary für `HelperProfile` mit optionalen `null`-Feldern (`city=null`, `bio=null`, `avg_rating=null`) definieren
    - Für jedes generierte Profil die HelferKarten-Komponente rendern und prüfen:
      - `display_name` ist sichtbar
      - Ort-Text: `city ?? "Ort nicht angegeben"` ist sichtbar
      - Rollen-Badge ist sichtbar
      - Bewertungsanzeige: Rating oder Fallback „—" ist sichtbar
    - `fc.assert(fc.property(helperArbitraryWithNulls, profile => { ... }), { numRuns: 100 })`

- [ ] 6. Checkpoint – Basis-Implementierung abgeschlossen
  - Sicherstellen dass alle Tests in `src/lib/__tests__/customer-dashboard.functions.test.ts` bestehen.
  - `tsc --noEmit` läuft fehlerfrei durch.
  - Fragen an den Nutzer stellen, falls Unklarheiten bestehen.

- [ ] 7. Inbox auf gigs-Tabelle umstellen
  - [ ] 7.1 `src/routes/_authenticated/dashboard/inbox.tsx` von `bookings` auf `gigs` umstellen
    - Alle `supabase.from("bookings")`-Aufrufe durch `supabase.from("gigs")`-Aufrufe ersetzen
    - Query-Filter anpassen: `assigned_helper_id IS NULL`, `status = 'open'`
    - Helfer-Rolle aus `user_roles` laden und als Filter `allowed_age_groups && ARRAY[helperRole]` auf Anwendungsebene anwenden
    - Angezeigte Felder an `gigs`-Schema anpassen (`title`, `service_type`, `budget_cents`, `scheduled_at`, `address`)
    - Sicherstellen dass kein Import oder Typ-Referenz auf `bookings` verbleibt
    - _Anforderungen: 2.5, 4.1_

- [ ] 8. Notifications-Migration und Typen
  - [ ] 8.1 SQL-Migration für `notifications`-Tabelle anlegen
    - Datei `supabase/migrations/YYYYMMDD_notifications.sql` erstellen (YYYYMMDD = aktuelles Datum)
    - `CREATE TABLE IF NOT EXISTS public.notifications` mit allen Spalten gemäß Design anlegen
    - `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` ausführen
    - `GRANT SELECT, INSERT, UPDATE ON ... TO authenticated` und `GRANT ALL ... TO service_role` setzen
    - Die drei RLS-Policies anlegen: Read own, System insert, Mark own as read
    - _Anforderungen: 4.1_

  - [ ] 8.2 `notifications`-Tabelle in `src/integrations/supabase/types.ts` typisieren
    - `Row`, `Insert` und `Update`-Typen für `notifications` in `Database.public.Tables` eintragen
    - Alle Spalten aus der Migration abbilden: `id`, `user_id`, `type`, `title`, `message`, `gig_id`, `is_read`, `created_at`
    - Sicherstellen dass Foreign-Key-Felder den richtigen Typ haben (`UUID`, nullable für `gig_id`)
    - _Anforderungen: 4.1_

- [ ] 9. `updateProfileFn` in HelperDashboard ergänzen
  - [ ] 9.1 `updateProfileFn` in `src/lib/helper-dashboard.functions.ts` implementieren
    - `UpdateProfileSchema` mit zod definieren (`bio: z.string().max(500).optional().nullable()`, `city: z.string().max(80).optional().nullable()`)
    - `createServerFn({ method: "POST" })` mit `requireSupabaseAuth`-Middleware und Validator anlegen
    - `supabase.from("profiles").update({ bio, city }).eq("id", context.userId)` implementieren
    - Bei Fehler `PostgrestError` propagieren, bei Erfolg `{ ok: true }` zurückgeben
    - Im `HelperDashboard` einen Save-Handler verdrahten, der `updateProfileFn` aufruft
    - _Anforderungen: 3.1, 3.3_

  - [ ]* 9.2 Property-Test schreiben: Property 5 – Onboarding-Daten-Roundtrip
    - **Property 5: Onboarding-Daten-Roundtrip**
    - **Validates: Anforderungen 3.1, 7.1**
    - Unit-Test in `src/lib/__tests__/helper-dashboard.functions.test.ts`
    - Supabase-Client mocken, der Insert-Operationen aufzeichnet
    - `fc.assert(fc.property(onboardingInputArbitrary, input => { ... }), { numRuns: 100 })` implementieren
    - Nach `completeOnboarding(input)` prüfen: Mock hat `display_name`, `city` und `role` korrekt erhalten

  - [ ]* 9.3 Property-Test schreiben: Property 6 – available_today Roundtrip
    - **Property 6: available_today Roundtrip**
    - **Validates: Anforderungen 3.2**
    - Supabase-Client mocken
    - `fc.assert(fc.property(fc.boolean(), b => { ... }), { numRuns: 50 })` implementieren
    - Nach `setAvailability(b)` prüfen: Mock-Update wurde mit `available_today = b` aufgerufen

- [ ] 10. Tote Dateien löschen und console.log bereinigen
  - [ ] 10.1 Tote Dateien entfernen
    - `src/components/dashboard.tsx` löschen (nicht importiert, ersetzt durch DashboardRouter)
    - `src/components/efferd-dashboard-2.tsx` löschen
    - Sicherstellen dass kein Import in einer aktiven Datei auf diese Pfade zeigt (Grep-Check)
    - _Anforderungen: 5.1_

  - [ ] 10.2 Alle `console.log`-Aufrufe bereinigen
    - Mit Grep alle `console.log`-Vorkommen in `src/` identifizieren
    - Debug-relevante Ausgaben durch `console.warn("[Präfix] ...")` ersetzen (z. B. `[getHelpersFn]`, `[createGigFn]`)
    - Reine Entwickler-Ausgaben vollständig entfernen
    - _Anforderungen: 5.2_

- [ ] 11. Finaler Checkpoint – Vollständige Qualitätsprüfung
  - `tsc --noEmit` muss mit Exit-Code 0 abschließen
  - `eslint . --max-warnings 0` muss ohne Warnungen durchlaufen
  - Alle Property-Tests und Unit-Tests müssen bestehen
  - `test ! -f src/components/dashboard.tsx` und `test ! -f src/components/efferd-dashboard-2.tsx` müssen erfüllt sein
  - Fragen an den Nutzer stellen, falls Unklarheiten bestehen.

---

## Notes

- Tasks mit `*` sind optional und können für ein schnelleres MVP übersprungen werden
- Jede Aufgabe referenziert die zugehörigen Anforderungen zur Nachvollziehbarkeit
- Die Abhängigkeitsreihenfolge ist zwingend: Task 1 → Task 2 → Task 3/4 → Task 5 → Task 7 → Task 8 → Task 9
- Property-Tests nutzen `fast-check` mit mindestens 100 Iterationen
- Supabase-Client in Unit-Tests immer mocken (kein echter DB-Zugriff in Tests)
- Der `requireSupabaseAuth`-Middleware ist bereits vorhanden – nicht neu implementieren

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "3.1"] },
    { "id": 3, "tasks": ["4.1", "8.1"] },
    { "id": 4, "tasks": ["4.2", "5.1", "8.2"] },
    { "id": 5, "tasks": ["5.2", "7.1", "9.1"] },
    { "id": 6, "tasks": ["9.2", "9.3", "10.1", "10.2"] }
  ]
}
```

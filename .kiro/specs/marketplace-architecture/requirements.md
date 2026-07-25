# Anforderungsdokument: Marketplace-Architektur

## Einleitung

Das Projekt „GreenMatch" (Garten Buddy Finder) ist eine Plattform, auf der **Kunden** (Gartenbesitzer) qualifizierte **Gartenhelfer** finden, buchen und bezahlen können. Die technische Grundstruktur – Supabase-Auth, Datenbankschema, Onboarding, HelperDashboard – ist bereits vorhanden und funktionsfähig.

Das zentrale Ziel dieser Spezifikation ist es, die verbleibenden Demo-Lücken zu schließen: Das `CustomerDashboard` soll statt hartkodierter Mockdaten echte Helfer-Profile aus der Datenbank anzeigen, der Buchungsfluss soll echte Gig-Datensätze erzeugen, und veralteter Code soll bereinigt werden. Damit wird aus dem Demo-Prototyp ein echter, persistenter Marketplace.

## Glossar

- **Customer**: Nutzer mit der Rolle `customer` – Gartenbesitzer, die Gartenhelfer suchen und buchen.
- **Helper**: Nutzer mit einer der Rollen `helper_youth`, `helper_adult` oder `helper_pro` – Personen, die Gartendienstleistungen anbieten.
- **Gig**: Ein konkreter Gartenauftrag, der von einem Customer erstellt und einem Helper zugewiesen wird. Entspricht der Tabelle `gigs` in Supabase.
- **Profile**: Öffentliches Nutzerprofil (Tabelle `profiles`), enthält `display_name`, `city`, `postal_code`, `bio`, `available_today`, `trust_score`.
- **SampleHelper**: Hartkodiertes, statisches Hilfsobjekt im Quellcode (`customer-dashboard.tsx`), das als Platzhalter dient und durch echte DB-Daten ersetzt werden soll.
- **Marketplace**: Der Zustand der Anwendung, in dem alle registrierten Helfer global sichtbar sind und Buchungen persistent in der Datenbank gespeichert werden.
- **Onboarding**: Der Schritt nach der Registrierung, in dem Nutzer ihre Rolle und Profildetails vervollständigen (Route `/onboarding`).
- **DashboardRouter**: Die Komponente in `dashboard.tsx`, die je nach Nutzerrolle entweder `HelperDashboard` oder `CustomerDashboard` rendert.
- **ServerFn**: Eine typsichere TanStack-Start-Funktion, die serverseitig auf Supabase zugreift und vom Client via RPC aufgerufen wird.
- **RLS**: Row Level Security – PostgreSQL-Mechanismus in Supabase, der steuert, welcher Nutzer welche Datenbankzeilen lesen/schreiben darf.
- **PStTG**: Plattformsteuertransparenzgesetz – deutsches Gesetz, das Meldeschwellen (25 Transaktionen oder 1.800 € Brutto pro Jahr) für Plattformbetreiber definiert.

---

## Anforderungen

### Anforderung 1: Helfer-Listing aus der Datenbank

**User Story:** Als Customer möchte ich alle registrierten Helfer aus der echten Datenbank sehen, damit ich aus einem aktuellen, globalen Pool von Anbietern wählen kann.

#### Akzeptanzkriterien

1. WHEN ein Customer das Dashboard aufruft, THE System SHALL eine Liste aller verfügbaren Helfer-Profile aus der Supabase-Tabelle `profiles` laden, die mindestens eine Helfer-Rolle (`helper_youth`, `helper_adult` oder `helper_pro`) in der Tabelle `user_roles` haben.
2. THE System SHALL die Demo-SampleHelper-Daten (`sampleHelpers`-Array) zusammen mit echten Datenbankprofilen anzeigen, solange noch keine oder wenige echte Helfer registriert sind, um einen leeren Marketplace zu vermeiden.
3. WHEN ein neuer Helfer das Onboarding abschließt, THE System SHALL das neue Profil innerhalb von 5 Sekunden in der Helferliste des Customers sichtbar machen, ohne dass eine manuelle Seitenaktualisierung erforderlich ist.
4. THE CustomerDashboard SHALL die folgenden Felder pro Helfer anzeigen: `display_name`, `city`, `postal_code`, `bio`, Rollenabzeichen (`helper_youth`/`helper_adult`/`helper_pro`), Durchschnittsbewertung aus der Tabelle `reviews`, und Anzahl der Bewertungen.
5. IF die Supabase-Abfrage fehlschlägt, THEN THE System SHALL eine benutzerfreundliche Fehlermeldung anzeigen und die statischen SampleHelper-Daten als Fallback einblenden.
6. THE System SHALL die Filteroptionen (Kategorie, Ort/PLZ, Mindestbewertung, Max. Preis) sowohl auf echte Datenbankprofile als auch auf SampleHelper-Einträge anwenden.

---

### Anforderung 2: Buchungsfluss mit persistenter Gig-Erstellung

**User Story:** Als Customer möchte ich einen Helfer buchen und einen echten Auftrag erstellen, damit der Helfer meine Anfrage sieht und annehmen kann.

#### Akzeptanzkriterien

1. WHEN ein Customer im Buchungs-Dialog auf „Jetzt buchen" klickt und den Termin bestätigt, THE System SHALL einen neuen `gig`-Datensatz in der Supabase-Tabelle `gigs` mit den Feldern `customer_id`, `title`, `service_type`, `budget_cents`, `scheduled_at`, `address`, `postal_code`, `duration_minutes`, `status = 'open'` erstellen.
2. WHEN ein Gig erfolgreich erstellt wurde, THE System SHALL dem Customer eine Bestätigungsmeldung anzeigen und das Buchungs-Dialog schließen.
3. IF die Gig-Erstellung fehlschlägt, THEN THE System SHALL dem Customer eine verständliche Fehlermeldung anzeigen und den Dialog offen halten, damit der Customer den Vorgang wiederholen kann.
4. THE System SHALL verhindern, dass ein Customer einen Gig für einen `SampleHelper` (id beginnt mit `"sample-"`) erstellt, und stattdessen eine Meldung anzeigen, dass Demo-Helfer nicht buchbar sind.
5. WHEN ein Helfer die Route `/inbox` aufruft, THE System SHALL alle offenen Gigs anzeigen, bei denen `assigned_helper_id IS NULL` und `status = 'open'` und `allowed_age_groups` die Altersgruppe des Helfers enthält.

---

### Anforderung 3: Helfer-Profil-Datenvervollständigung

**User Story:** Als Helfer möchte ich mein öffentliches Profil mit Stundensatz, Kategorien und Verfügbarkeit pflegen, damit Kunden mich finden und buchen können.

#### Akzeptanzkriterien

1. WHEN ein Helfer das Onboarding abschließt, THE System SHALL mindestens `display_name`, `city` und die Rolle in der Datenbank persistieren.
2. THE System SHALL dem Helfer im Dashboard ermöglichen, `available_today` (Boolean) umzuschalten; WHEN der Helfer `available_today` auf `false` setzt, THE System SHALL dieses Profil in der Kundensuchliste als „nicht verfügbar" markieren.
3. THE System SHALL das Feld `bio` in der `profiles`-Tabelle für Helfer nutzbar machen; WHEN ein Helfer eine Bio speichert, THE System SHALL diese im Customer-Listing anzeigen.
4. IF ein Helfer-Profil kein `city`-Feld gesetzt hat, THEN THE System SHALL im Customer-Listing „Ort nicht angegeben" anzeigen, anstatt einen leeren String oder `null` zu rendern.

---

### Anforderung 4: Datenbanktypen-Konsistenz

**User Story:** Als Entwickler möchte ich, dass alle verwendeten Datenbanktabellen vollständig in den TypeScript-Typen definiert sind, damit Typfehler zur Compile-Zeit erkannt werden.

#### Akzeptanzkriterien

1. THE System SHALL sicherstellen, dass alle in `inbox.tsx` verwendeten Tabellen (`bookings`, `notifications`) in der Datei `src/integrations/supabase/types.ts` vollständig typisiert sind oder durch typisierte Alternativen ersetzt werden.
2. THE System SHALL sicherstellen, dass alle `SampleHelper`-Felder, die für die Merge-Darstellung (DB-Helfer + Demo-Helfer) benötigt werden, einem gemeinsamen TypeScript-Interface entsprechen, das von beiden Quellen erfüllt werden kann.
3. WHEN ein Server Function einen Datenbankfehler zurückgibt, THE System SHALL den Fehler als `PostgrestError`-Typ behandeln und nicht als generischen `unknown`-Typ.

---

### Anforderung 5: Code-Qualität und Bereinigung

**User Story:** Als Entwickler möchte ich, dass veraltete Komponenten und doppelte Logik entfernt werden, damit die Codebasis wartbar und klar strukturiert bleibt.

#### Akzeptanzkriterien

1. THE System SHALL die Dateien `src/components/dashboard.tsx` und `src/components/efferd-dashboard-2.tsx` entfernen, sofern sie in keiner Route und keiner aktiven Komponente importiert werden.
2. THE System SHALL sicherstellen, dass kein Produktionscode `console.log`-Aufrufe enthält; vorhandene Debug-Ausgaben SHALL durch `console.warn` mit aussagekräftigem Präfix oder durch vollständige Entfernung ersetzt werden.
3. THE System SHALL die `SampleHelper`-Daten in eine separate Datei `src/lib/sample-data.ts` auslagern, damit `customer-dashboard.tsx` von Demo-Daten entkoppelt ist und die Trennlinie zwischen Produktions- und Demo-Code klar bleibt.
4. THE System SHALL keine TypeScript-Compiler-Fehler enthalten; WHEN `tsc --noEmit` ausgeführt wird, SHALL der Prozess mit Exit-Code 0 enden.
5. THE System SHALL keine ungenutzten Imports oder toten Variablen enthalten, wie sie durch den ESLint-Regelsatz (`eslint .`) aufgedeckt werden.

---

### Anforderung 6: Authentifizierungs- und Session-Sicherheit

**User Story:** Als Nutzer möchte ich, dass meine Session sicher verwaltet wird und ich nach dem Abmelden keinen Zugriff auf geschützte Routen habe.

#### Akzeptanzkriterien

1. WHEN ein nicht authentifizierter Nutzer eine Route unter `/_authenticated` aufruft, THE System SHALL den Nutzer auf `/auth` umleiten, ohne den ursprünglichen Pfad preiszugeben.
2. WHEN ein Nutzer sich abmeldet (signOut), THE System SHALL die Supabase-Session beenden und den Nutzer auf die Landing Page (`/`) umleiten.
3. THE System SHALL den Supabase Service Role Key (`SUPABASE_SERVICE_ROLE_KEY`) ausschließlich in serverseitigen Funktionen verwenden und niemals in client-seitigen Bundles oder Browser-zugänglichen Dateien exponieren.
4. IF ein JWT-Token in einer ServerFn abläuft oder ungültig ist, THEN THE System SHALL den HTTP-Status 401 zurückgeben und den Client auf `/auth` weiterleiten.

---

### Anforderung 7: Globale Helfer-Sichtbarkeit (Kernziel Marketplace)

**User Story:** Als frisch registrierter Helfer möchte ich, dass mein Profil sofort für Kunden sichtbar ist, damit ich Aufträge erhalten kann.

#### Akzeptanzkriterien

1. WHEN ein Helfer das Onboarding erfolgreich abschließt, THE System SHALL das Helfer-Profil in der `profiles`-Tabelle anlegen und die Rolle in `user_roles` eintragen, sodass es in der Kundensuche erscheint.
2. THE System SHALL beim Abrufen der Helferliste keine clientseitige Filterung nach Benutzer-ID durchführen, die dazu führt, dass Helfer sich selbst nicht sehen; die Helferliste SHALL alle Helfer-Profile zurückgeben, unabhängig davon, wer die Anfrage stellt.
3. THE Helferliste SHALL nach `available_today = true` vorsortiert sein (verfügbare Helfer zuerst), gefolgt von einer Sortierung nach `trust_score` absteigend.
4. WHERE ein Helfer in der Datenbank kein `postal_code`-Feld gesetzt hat, THE System SHALL dieses Profil trotzdem in den Suchergebnissen anzeigen, aber bei der PLZ-Filterung nicht ausschließen.

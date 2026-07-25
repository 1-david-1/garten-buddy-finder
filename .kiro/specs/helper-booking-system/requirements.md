# Requirements Document

## Introduction

Das **Helfer-Buchungssystem** erweitert die GreenMatch-App (Garten Buddy Finder) um eine vollständige Buchungsinfrastruktur. Kunden können Helfer über die vorhandene `BookingScheduler`-Komponente buchen. Helfer erhalten ein erweitertes Dashboard mit einer Anfragen-Inbox und einer Verfügbarkeitsverwaltung. Das System integriert sich in die bestehende Supabase-Datenbank (Tabellen `bookings`, `notifications`, `helper_availability`), das TanStack Router-Routing und das vorhandene i18n-System.

---

## Glossary

- **BookingScheduler**: Die React-Komponente (`booking-scheduler.tsx`), die eine Wochenansicht verfügbarer Zeitslots, Standorteingabe und eine Buchungsbestätigung anzeigt.
- **AvailabilityCalendar**: Die React-Komponente (`availability-calendar.tsx`), mit der ein Helfer seine verfügbaren Zeitslots pro Woche verwaltet.
- **Booking**: Ein Buchungsdatensatz in der Supabase-Tabelle `bookings` mit Felder wie `service_type`, `scheduled_date`, `scheduled_time`, `address`, `budget_cents`, `status`, `customer_id`, `helper_id`.
- **Notification**: Ein Datensatz in der Supabase-Tabelle `notifications` für eingehende Benachrichtigungen an Nutzer.
- **Helper_Availability**: Eine Supabase-Tabelle, die die vom Helfer freigegebenen Zeitslots (Datum + Uhrzeit) speichert.
- **Booking_Status**: Aufzählung der möglichen Buchungsstatus: `pending`, `accepted`, `declined`, `completed`, `cancelled`.
- **DashboardShell**: Die Wrapper-Komponente für das Helfer-Dashboard mit Sidebar-Navigation.
- **Server_Function**: Eine TanStack Start Server-Funktion (`createServerFn`), die serverseitige Datenbankoperationen kapselt.
- **Inbox**: Der Bereich im Helfer-Dashboard, in dem eingehende Buchungsanfragen und Benachrichtigungen angezeigt werden.
- **Supabase**: Das Backend-as-a-Service, das Authentifizierung, Datenbank (PostgreSQL) und Realtime bereitstellt.

---

## Requirements

### Anforderung 1: BookingScheduler-Integration für Kunden

**User Story:** Als Kunde möchte ich einen Helfer aus dessen Profil heraus buchen können, damit ich schnell und einfach einen Termin für Gartenarbeiten vereinbaren kann.

#### Akzeptanzkriterien

1. WHEN ein Kunde die Profilseite eines Helfers aufruft, THE BookingScheduler SHALL die verfügbaren Zeitslots des Helfers für die aktuelle Woche anzeigen.
2. WHEN ein Kunde auf einen verfügbaren Zeitslot klickt, THE BookingScheduler SHALL eine Buchungsbestätigungsansicht mit den Feldern Leistungsart (Pflichtfeld, Auswahl), Adresse (Pflichtfeld, Freitext) und Budget (Pflichtfeld, positive Ganzzahl in Euro) anzeigen.
3. WHEN ein Kunde auf „Buchungsanfrage senden" klickt und alle Pflichtfelder korrekt ausgefüllt sind (Leistungsart ausgewählt, Adresse ≥ 5 Zeichen, Budget eine positive Ganzzahl > 0), THE Booking_System SHALL einen neuen Datensatz in der Supabase-Tabelle `bookings` mit dem Status `pending` anlegen.
4. WHEN ein Kunde auf „Buchungsanfrage senden" klickt und ein oder mehrere Pflichtfelder ungültig sind, THE BookingScheduler SHALL die Schaltfläche deaktiviert lassen und unterhalb jedes ungültigen Feldes eine inline Fehlermeldung anzeigen.
5. WHEN eine neue Buchungsanfrage mit Status `pending` erfolgreich in `bookings` angelegt wird, THE Booking_System SHALL automatisch einen Datensatz in der Supabase-Tabelle `notifications` anlegen, der die `booking_id` und die `helper_id` des gebuchten Helfers enthält.
6. WHEN ein Kunde auf die Vor- oder Zurück-Schaltfläche der Wochennavigation klickt, THE BookingScheduler SHALL die Verfügbarkeitsslots der ausgewählten Woche aus der Tabelle `helper_availability` laden; die Navigation in vergangene Wochen (vor der aktuellen Woche) SHALL dabei gesperrt sein.
7. IF ein Helfer an einem bestimmten Tag keine Einträge in `helper_availability` hat, THEN THE BookingScheduler SHALL diesen Tag mit dem Label „Keine Verfügbarkeit" anzeigen und alle zugehörigen Zeitslots als nicht anklickbar darstellen.
8. IF der Supabase-Schreibvorgang beim Anlegen der Buchung fehlschlägt, THEN THE BookingScheduler SHALL eine Fehlermeldung oberhalb des Formulars anzeigen und den Nutzer auffordern, es erneut zu versuchen, ohne das Formular zurückzusetzen.

---

### Anforderung 2: Helfer-Inbox für Buchungsanfragen

**User Story:** Als Helfer möchte ich eingehende Buchungsanfragen in einer übersichtlichen Inbox sehen und darauf reagieren können, damit ich Anfragen annehmen oder ablehnen kann.

#### Akzeptanzkriterien

1. WHEN ein Helfer das Dashboard öffnet, THE DashboardShell SHALL einen Navigationslink zur Inbox anzeigen, der die Anzahl der Benachrichtigungen mit `is_read = false` des eingeloggten Helfers als numerisches Badge darstellt; wenn keine ungelesenen Benachrichtigungen vorhanden sind, SHALL kein Badge angezeigt werden.
2. WHEN ein Helfer die Inbox öffnet, THE Inbox SHALL alle Buchungsanfragen mit Status `pending` (sortiert nach `created_at` absteigend) anzeigen.
3. WHEN eine Buchungsanfrage in der Inbox angezeigt wird, THE Inbox SHALL pro Anfrage folgende Felder darstellen: Vollständiger Name des Kunden, Leistungsart, gewünschtes Datum (Format TT.MM.JJJJ), gewünschte Uhrzeit, Adresse und Budget in Euro.
4. WHEN ein Helfer auf „Annehmen" klickt, THE Booking_System SHALL den `status` der Buchung auf `accepted` setzen und in der Tabelle `notifications` einen Datensatz mit `type = booking_accepted` für den Kunden anlegen.
5. WHEN ein Helfer auf „Ablehnen" klickt, THE Booking_System SHALL den `status` der Buchung auf `declined` setzen und in der Tabelle `notifications` einen Datensatz mit `type = booking_declined` für den Kunden anlegen.
6. WHEN der Helfer eine Buchungsanfrage annimmt oder ablehnt und der Serveraufruf erfolgreich war, THE Inbox SHALL die bearbeitete Anfrage sofort aus der Pending-Liste entfernen, ohne die Seite neu zu laden; IF der Serveraufruf fehlschlägt, SHALL die Anfrage in der Liste verbleiben und eine Inline-Fehlermeldung angezeigt werden.
7. WHEN die Inbox geöffnet wird, THE Inbox SHALL bis zu 20 Benachrichtigungen des Helfers (sortiert nach `created_at` absteigend) anzeigen, wobei Benachrichtigungen mit `is_read = false` mit einem ausgefüllten Punkt-Marker links neben dem Eintrag hervorgehoben werden.
8. WHEN ein Helfer auf eine Benachrichtigung mit `is_read = false` klickt, THE Booking_System SHALL den `is_read`-Wert dieses Datensatzes in der Tabelle `notifications` auf `true` aktualisieren und den Punkt-Marker entfernen.
9. IF der Datenladevorgang der Inbox fehlschlägt, THEN THE Inbox SHALL eine Fehlermeldung und eine Schaltfläche „Erneut laden" anzeigen, über die der Ladevorgang erneut ausgelöst werden kann.
10. IF der Serveraufruf zum Annehmen oder Ablehnen einer Buchungsanfrage fehlschlägt, THEN THE Inbox SHALL eine Inline-Fehlermeldung unterhalb der betreffenden Anfrage anzeigen und die Anfrage in der Pending-Liste belassen.

---

### Anforderung 3: Helfer-Verfügbarkeitsverwaltung

**User Story:** Als Helfer möchte ich selbst bestimmen können, an welchen Tagen und Zeiten ich verfügbar bin, damit Kunden nur buchbare Slots angezeigt bekommen.

#### Akzeptanzkriterien

1. WHEN ein Helfer die Verfügbarkeitsverwaltung öffnet, THE AvailabilityCalendar SHALL die sieben Tage der aktuellen Woche (Montag bis Sonntag) anzeigen und dabei alle in der Tabelle `helper_availability` für diesen Helfer und diese Woche gespeicherten Zeitslots als aktiv (verfügbar) vormarkieren; alle übrigen Slots werden als inaktiv angezeigt.
2. WHEN ein Helfer auf einen Zeitslot-Button klickt, THE AvailabilityCalendar SHALL den visuellen Zustand des Buttons (aktiv/inaktiv) sofort umschalten, ohne dabei eine Netzwerkanfrage auszulösen.
3. WHEN ein Helfer auf „Speichern" klickt, THE Booking_System SHALL alle Zeitslots der aktuellen Woche als Upsert-Operation (INSERT … ON CONFLICT DO UPDATE) in die Tabelle `helper_availability` schreiben; dabei werden aktive Slots eingefügt/aktualisiert und inaktive Slots gelöscht.
4. WHEN der Speichervorgang erfolgreich abgeschlossen ist, THE AvailabilityCalendar SHALL eine Erfolgsmeldung anzeigen und den „Speichern"-Button deaktivieren, bis der Helfer weitere Änderungen vornimmt.
5. IF der Speichervorgang fehlschlägt, THEN THE AvailabilityCalendar SHALL eine Fehlermeldung oberhalb des Kalenders anzeigen und alle lokalen Änderungen erhalten, sodass der Helfer den Speichervorgang erneut auslösen kann.
6. WHEN ein Helfer auf die Vor- oder Zurück-Schaltfläche der Wochennavigation klickt, THE AvailabilityCalendar SHALL die Verfügbarkeitsdaten der ausgewählten Woche aus der Tabelle `helper_availability` laden und den Ladezustand (Spinner) anzeigen, bis die Daten vollständig geladen sind.
7. WHEN ein Helfer auf „Alle" für einen bestimmten Tag klickt, THE AvailabilityCalendar SHALL alle Zeitslots dieses Tages als aktiv (verfügbar) markieren.
8. WHEN ein Helfer auf „Keine" für einen bestimmten Tag klickt, THE AvailabilityCalendar SHALL alle Zeitslots dieses Tages als inaktiv (nicht verfügbar) markieren.
9. WHEN während des Ladevorgangs der Wochendaten eine Benutzeraktion (Slot-Klick, „Alle"/„Keine", „Speichern") ausgelöst wird, THE AvailabilityCalendar SHALL diese Aktionen bis zum Abschluss des Ladevorgangs blockieren, um inkonsistente Zustände zu vermeiden.

---

### Anforderung 4: Dashboard-Navigation und Routing

**User Story:** Als Helfer möchte ich über eine einheitliche Navigation zwischen Dashboard, Inbox und Verfügbarkeitsverwaltung wechseln können, damit ich alle Bereiche schnell erreiche.

#### Akzeptanzkriterien

1. THE DashboardShell SHALL Navigationseinträge für „Dashboard", „Postfach" und „Verfügbarkeit" in der Seitenleiste enthalten, wobei der aktive Eintrag visuell hervorgehoben wird (z. B. durch eine andere Hintergrundfarbe oder einen Akzentbalken).
2. WHEN ein Helfer auf den Navigationslink „Postfach" klickt, THE TanStack_Router SHALL zur Route `/_authenticated/inbox` navigieren, ohne einen vollständigen Seitenneulad auszulösen.
3. WHEN ein Helfer auf den Navigationslink „Verfügbarkeit" klickt, THE TanStack_Router SHALL zur Route `/_authenticated/availability` navigieren, ohne einen vollständigen Seitenneulad auszulösen.
4. WHEN ein nicht authentifizierter Nutzer versucht, auf `/_authenticated/inbox` oder `/_authenticated/availability` zuzugreifen, THE TanStack_Router SHALL den Nutzer zur Route `/auth` weiterleiten.
5. THE Inbox_Page SHALL die `DashboardShell`-Komponente als Layout-Wrapper verwenden, sodass Seitenleiste und Header auf der Inbox-Seite sichtbar sind.
6. THE Availability_Page SHALL die `DashboardShell`-Komponente als Layout-Wrapper verwenden, sodass Seitenleiste und Header auf der Verfügbarkeitsseite sichtbar sind.

---

### Anforderung 5: Datenbankschema – Buchungen und Verfügbarkeit

**User Story:** Als Entwickler möchte ich ein konsistentes Datenbankschema für Buchungen und Verfügbarkeiten haben, damit die Daten korrekt gespeichert und abgerufen werden können.

#### Akzeptanzkriterien

1. THE Supabase_Database SHALL eine Tabelle `bookings` mit den Spalten `id` (UUID, PK), `customer_id` (UUID, FK → auth.users), `helper_id` (UUID, FK → auth.users), `service_type` (text, NOT NULL), `description` (text), `address` (text, NOT NULL), `scheduled_date` (date im Format YYYY-MM-DD, NOT NULL), `scheduled_time` (time im Format HH:MM, NOT NULL), `budget_cents` (integer, Wertebereich 1–99.999.999, NOT NULL), `status` (text, erlaubte Werte: `pending`, `accepted`, `declined`, `completed`, `cancelled`, NOT NULL, Default: `pending`), `created_at` (timestamptz, Default: now()) und `updated_at` (timestamptz) enthalten.
2. THE Supabase_Database SHALL eine Tabelle `helper_availability` mit den Spalten `id` (UUID, PK), `helper_id` (UUID, FK → auth.users, NOT NULL), `available_date` (date im Format YYYY-MM-DD, NOT NULL), `available_time` (time im Format HH:MM, NOT NULL) und `created_at` (timestamptz, Default: now()) enthalten, wobei die Kombination (`helper_id`, `available_date`, `available_time`) durch einen UNIQUE-Constraint eindeutig ist.
3. THE Supabase_Database SHALL eine Tabelle `notifications` mit den Spalten `id` (UUID, PK), `user_id` (UUID, FK → auth.users, NOT NULL), `type` (text, erlaubte Werte: `booking_request`, `booking_accepted`, `booking_declined`, NOT NULL), `title` (text, NOT NULL), `message` (text), `booking_id` (UUID, FK → bookings, nullable), `is_read` (boolean, Default: false, NOT NULL) und `created_at` (timestamptz, Default: now()) enthalten.
4. IF ein nicht authentifizierter Nutzer versucht, Daten in den Tabellen `bookings`, `helper_availability` oder `notifications` zu lesen oder zu schreiben, THEN THE Supabase_Database SHALL den Zugriff durch Row-Level Security (RLS) mit dem Fehlercode `42501` verweigern.
5. IF ein authentifizierter Nutzer versucht, auf eine Buchung zuzugreifen, in der er weder als `customer_id` noch als `helper_id` eingetragen ist, THEN THE Supabase_Database SHALL den Zugriff durch Row-Level Security verweigern.
6. IF ein Helfer versucht, einen `helper_availability`-Datensatz zu schreiben oder zu löschen, dessen `helper_id` nicht seiner eigenen Nutzer-ID entspricht, THEN THE Supabase_Database SHALL den Schreibzugriff durch Row-Level Security verweigern.

---

### Anforderung 6: Lokalisierung (i18n)

**User Story:** Als Nutzer möchte ich alle Texte des Buchungssystems in meiner gewählten Sprache (Deutsch oder Englisch) sehen, damit die App konsistent bleibt.

#### Akzeptanzkriterien

1. THE i18n_System SHALL alle neuen UI-Texte der Komponenten `AvailabilityCalendar` und `BookingScheduler` (Buchungsbestätigung) als nicht-leere String-Einträge in den deutschen und englischen Wörterbüchern (`de` und `en`) in `src/lib/i18n.tsx` enthalten.
2. IF die Sprache des Nutzers auf Deutsch eingestellt ist, THEN THE BookingScheduler SHALL alle Labels, Buttons und Statusmeldungen auf Deutsch anzeigen.
3. IF die Sprache des Nutzers auf Englisch eingestellt ist, THEN THE BookingScheduler SHALL alle Labels, Buttons und Statusmeldungen auf Englisch anzeigen.
4. THE i18n_System SHALL nicht-leere Übersetzungsschlüssel für die Buchungsstatus `booking.status.pending`, `booking.status.accepted` und `booking.status.declined` in beiden Sprachen (`de` und `en`) enthalten.
5. IF ein Übersetzungsschlüssel im aktiven Wörterbuch nicht vorhanden ist, THEN THE i18n_System SHALL den Schlüssel-String als Fallback-Text zurückgeben, anstatt einen Fehler zu werfen.

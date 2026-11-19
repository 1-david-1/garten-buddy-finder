# SQL-Tests für die Migrationen

Diese Tests spielen die komplette Migrationskette in eine **lokale Wegwerf-Datenbank** ein und prüfen mit echten
Rollen (`anon`, `authenticated`) und echter Zeilen-Zugriffsregel (RLS), was Nutzer sehen und tun dürfen. Die Supabase-Teile
(`auth`, `storage`, Rollen) werden in `stubs.sql` nachgebildet.

```bash
# lokaler PostgreSQL-Server nötig (15 oder neuer), Superuser-Zugang über PG*-Variablen
bash supabase/tests/run.sh
```

| Datei | Prüft |
|---|---|
| `01_adressschutz.sql` | Adresse eines Auftrags nur für Auftraggeber, zugewiesenen Helfer (erst nach Annahme) und Admin |
| `02_stundenplan.sql` | Sperrzeiten der Helfer: wer sie sieht, und dass Buchungen in gesperrten Zeiten abgelehnt werden |
| `03_zahlung_freigeben.sql` | Auftrag abschließen und Zahlung freigeben in einem Schritt (Berechtigung, Wiederholung, Klärung) |

Die Tests laufen nicht gegen die echte Supabase-Datenbank und ändern dort nichts.

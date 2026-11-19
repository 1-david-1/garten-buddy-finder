#!/bin/bash
# Spielt alle Migrationen in eine frische lokale PostgreSQL-Datenbank ein und führt die SQL-Tests aus.
# Voraussetzung: lokaler PostgreSQL-Server (Version 15+), Verbindung als Superuser über die üblichen PG*-Variablen
# (z. B. PGUSER=postgres). Es wird nur die Wegwerf-Datenbank "greenmatch_migration_test" angefasst.
# Aufruf aus dem Projektordner:  bash supabase/tests/run.sh
set -u
DB=greenmatch_migration_test
HERE="$(cd "$(dirname "$0")" && pwd)"
MIGRATIONS="$HERE/../migrations"

psql -q -d postgres -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB" >/dev/null || { echo "Keine Verbindung zum PostgreSQL-Server."; exit 1; }
psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$HERE/stubs.sql" >/dev/null 2>&1 || { echo "stubs.sql fehlgeschlagen"; exit 1; }

for f in $(ls "$MIGRATIONS"/*.sql | sort); do
  out=$(psql -d "$DB" -q -v ON_ERROR_STOP=1 -1 -f "$f" 2>&1) || { echo "MIGRATION FEHLGESCHLAGEN: $(basename "$f")"; echo "$out" | grep -E "ERROR|DETAIL" | head -3; exit 1; }
done
echo "Alle $(ls "$MIGRATIONS"/*.sql | wc -l) Migrationen eingespielt."

fail=0
for t in "$HERE"/0*.sql; do
  # jede Testdatei bekommt eine frische Datenbank mit allen Migrationen
  psql -q -d postgres -c "DROP DATABASE IF EXISTS ${DB}_t" -c "CREATE DATABASE ${DB}_t TEMPLATE $DB" >/dev/null
  out=$(psql -d "${DB}_t" -f "$t" 2>&1)
  passes=$(echo "$out" | grep -c "PASS")
  if echo "$out" | grep -qE "FAIL|ERROR"; then
    echo "FEHLER in $(basename "$t") ($passes Prüfungen bestanden):"; echo "$out" | grep -E "FAIL|ERROR|DETAIL" | head -5; fail=1
  else
    echo "OK    $(basename "$t"): $passes Prüfungen bestanden"
  fi
done
psql -q -d postgres -c "DROP DATABASE IF EXISTS ${DB}_t" >/dev/null
exit $fail

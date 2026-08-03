-- Fehlende Spalten für Urlaubsmodus (Vacation Mode) und
-- Benachrichtigungs-Einstellungen. Der Code (helper-dashboard.functions.ts,
-- negotiations.functions.ts, profile.functions.ts) geht bereits von diesen
-- Spalten aus, sie wurden aber offenbar nie per Migration angelegt.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS vacation_mode BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vacation_return_date DATE,
  ADD COLUMN IF NOT EXISTS notification_prefs JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.profiles.vacation_mode IS
  'Wenn true, ist der Helfer im Urlaubsmodus und wird nicht als verfügbar angezeigt / erhält keine neuen Anfragen.';
COMMENT ON COLUMN public.profiles.vacation_return_date IS
  'Geplantes Rückkehrdatum; Urlaubsmodus wird beim nächsten Laden automatisch beendet, sobald dieses Datum erreicht ist.';
COMMENT ON COLUMN public.profiles.notification_prefs IS
  'Präferenzen für E-Mail-Benachrichtigungen als JSON, z.B. {"new_gig": true, "message": false}.';

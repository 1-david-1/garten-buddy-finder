-- ============================================================
-- Jugendliche und Tätigkeiten mit erhöhtem Risiko (Heckenschnitt u. a.)
--
-- Behebt die Fehlermeldung "Diese Tätigkeit ist für Jugendliche nicht möglich" bei Heckenschnitt.
-- Ursache: Der Datenbank-Trigger aus 20261008000000_guardian_accounts_and_safety.sql sperrte Heckenschnitt für
-- Jugendliche komplett; die Lockerung aus 20261024000300_youth_hedge_trimming.sql war in der Datenbank nicht aktiv.
--
-- Diese Migration stellt die Regel idempotent (CREATE OR REPLACE) her, egal ob 20261024000300 schon eingespielt wurde:
--   * Heckenschnitt, Gartenumgestaltung und Bewässerung sind für Jugendliche möglich - wie jeder Auftrag aber NUR nach
--     Freigabe der Eltern für genau diesen Auftrag (erzwingt enforce_youth_job_rules aus
--     20261021000000_security_hardening.sql beim Übergang in "angenommen"/"läuft"). Die Eltern bestätigen bei diesen
--     Tätigkeiten ausdrücklich im Eltern-Konto ("Trotzdem erlauben") und können es dauerhaft erlauben.
--   * IMMER gesperrt, auch mit Zustimmung der Eltern: Baumpflege und alles, was auf ein sehr gefährliches Gerät oder
--     große Höhe hinweist (Motor-/Kettensäge, Benzin-/Stangengeräte, Häcksler, Leiter, Gerüst, Bagger ...).
--     Dieselben Stichwörter prüft die App (src/lib/hedge-rules.ts).
-- ============================================================

DO $$
BEGIN
  IF to_regclass('public.gigs') IS NULL THEN
    RAISE EXCEPTION 'Die Tabelle public.gigs fehlt in dieser Datenbank. Diese Migration setzt die Basis-Migrationen (ab 20260720070048) voraus. Bitte zuerst supabase/diagnostics/check_database.sql ausführen und die fehlenden Migrationen einspielen.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'has_role'
  ) THEN
    RAISE EXCEPTION 'Die Funktion public.has_role fehlt in dieser Datenbank. Bitte zuerst supabase/diagnostics/check_database.sql ausführen und die fehlenden Migrationen einspielen.';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.enforce_youth_activity_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_text TEXT;
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF NEW.assigned_helper_id IS NULL
     OR NEW.status NOT IN ('pending_helper', 'assigned', 'in_progress') THEN
    RETURN NEW;
  END IF;
  IF NOT public.has_role(NEW.assigned_helper_id, 'helper_youth') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT'
     OR OLD.assigned_helper_id IS DISTINCT FROM NEW.assigned_helper_id
     OR OLD.status IS DISTINCT FROM NEW.status
     OR OLD.service_type IS DISTINCT FROM NEW.service_type
     OR OLD.title IS DISTINCT FROM NEW.title
     OR OLD.description IS DISTINCT FROM NEW.description THEN

    -- Nie vermittelt, auch nicht mit Zustimmung der Eltern
    IF NEW.service_type = 'baumpflege' THEN
      RAISE EXCEPTION 'Diese Tätigkeit ist für Jugendliche nicht möglich: Baumpflege (Klettern, Sägen, Arbeiten in der Höhe) wird Jugendlichen nicht vermittelt.';
    END IF;

    -- Tätigkeiten mit erhöhtem Risiko: nur ohne sehr gefährliches Gerät und ohne große Höhe
    IF NEW.service_type IN ('heckenschnitt', 'gartendesign', 'bewässerung') THEN
      v_text := lower(coalesce(NEW.title, '') || ' ' || coalesce(NEW.description, ''));
      IF v_text ~ '(kettens(ä|ae|a)ge|motors(ä|ae|a)ge|baums(ä|ae|a)ge|h(ä|ae|a)cksler|hochentaster|stangenheckenschere|stangenschere|teleskop|benzin|\mleiter\M|ger(ü|ue|u)st|hubarbeitsb(ü|ue)hne|\msteiger\M|bagger|r(ü|ue|u)ttelplatte|motorhacke|trennschleifer|winkelschleifer)' THEN
        RAISE EXCEPTION 'Diese Tätigkeit ist für Jugendliche nur ohne sehr gefährliche Geräte (z. B. Motor-/Kettensäge, Benzin- oder Stangenheckenschere, Bagger) und ohne Leiter oder Gerüst möglich.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_youth_activity_rules ON public.gigs;
CREATE TRIGGER trg_enforce_youth_activity_rules
  BEFORE INSERT OR UPDATE ON public.gigs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_youth_activity_rules();

-- ============================================================
-- Heckenschnitt für Jugendliche: Fehlermeldung "Diese Tätigkeit ist für Jugendliche nicht möglich" beheben
--
-- Ursache: Der Datenbank-Trigger aus 20261008000000_guardian_accounts_and_safety.sql sperrt Heckenschnitt für
-- Jugendliche komplett. Die Lockerung aus 20261024000300_youth_hedge_trimming.sql war in der Datenbank nicht
-- aktiv (Migration nicht eingespielt) - der alte Trigger lief weiter und warf den Fehler bei JEDEM Heckenschnitt.
--
-- Diese Migration stellt die Regel idempotent (CREATE OR REPLACE) wieder her, egal ob 20261024000300 schon
-- eingespielt wurde:
--   * Heckenschnitt ist für Jugendliche erlaubt - wie jeder Auftrag aber NUR nach Freigabe der Eltern für
--     genau diesen Auftrag (erzwingt enforce_youth_job_rules aus 20261021000000_security_hardening.sql beim
--     Übergang in "angenommen"/"läuft"). Die Eltern sehen im Eltern-Konto einen Info-Banner und bestätigen
--     per Klick auf "Trotzdem erlauben".
--   * NICHT möglich bleiben: Baumpflege, Gartenumgestaltung, Bewässerungsanlagen.
--   * Heckenschnitt wird abgelehnt, wenn Titel oder Beschreibung auf ein sehr gefährliches Gerät oder zu große
--     Höhe hinweisen (Motor-/Kettensäge, Benzin-/Stangenheckenschere, Häcksler, Leiter, Gerüst ...).
--     Dieselben Stichwörter prüft die App (src/lib/hedge-rules.ts).
-- ============================================================
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

    IF NEW.service_type IN ('baumpflege', 'gartendesign', 'bewässerung') THEN
      RAISE EXCEPTION 'Diese Tätigkeit ist für Jugendliche nicht möglich: Es werden nur leichte, geeignete und ungefährliche Tätigkeiten vermittelt.';
    END IF;

    IF NEW.service_type = 'heckenschnitt' THEN
      v_text := lower(coalesce(NEW.title, '') || ' ' || coalesce(NEW.description, ''));
      IF v_text ~ '(kettens(ä|ae|a)ge|motors(ä|ae|a)ge|baums(ä|ae|a)ge|h(ä|ae|a)cksler|hochentaster|stangenheckenschere|stangenschere|teleskop|benzin|\mleiter\M|ger(ü|ue|u)st|hubarbeitsb(ü|ue)hne|\msteiger\M)' THEN
        RAISE EXCEPTION 'Heckenschnitt ist für Jugendliche nur ohne sehr gefährliche Geräte (z. B. Motor-/Kettensäge, Benzin- oder Stangenheckenschere) und ohne Leiter bei niedrigen Hecken möglich.';
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

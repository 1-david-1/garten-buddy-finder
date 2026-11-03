-- ============================================================
-- Heckenschnitt für Jugendliche: mit Zustimmung der Eltern möglich
--
-- Bisher war Heckenschnitt für Jugendliche in der Datenbank komplett gesperrt, obwohl die App-Texte sagen,
-- dass er "in Absprache mit den Erziehungsberechtigten" möglich ist. Jetzt gilt:
--   * Heckenschnitt ist erlaubt - wie jeder Auftrag nur nach Freigabe der Eltern für genau diesen Auftrag.
--   * NICHT erlaubt (weiterhin): Baumpflege, Gartenumgestaltung, Bewässerungsanlagen.
--   * Heckenschnitt wird abgelehnt, wenn Titel oder Beschreibung auf ein sehr gefährliches Gerät oder
--     zu große Höhe hinweisen (Motor-/Kettensäge, Benzin-/Stangenheckenschere, Häcksler, Leiter, Gerüst,
--     Hubarbeitsbühne ...). Zusätzlich bestätigen die Eltern bei der Freigabe ausdrücklich, dass die Hecke
--     nicht zu hoch ist und kein sehr gefährliches Gerät genutzt wird (App-seitig erzwungen).
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

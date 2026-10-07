-- ============================================================
-- Kindersicherheit pro Auftrag
--
-- 1. Eltern-Freigabe für JEDEN einzelnen Auftrag eines jugendlichen Helfers
--    (verification_requests.kind = 'job_approval', verknüpft mit gigs.id).
-- 2. Automatische Jugendschutz-Grenzen direkt in der Datenbank (Trigger auf gigs):
--      - höchstens 2 Stunden pro Tag (Summe aller Aufträge des Tages),
--      - nur zwischen 08:00 und 18:00 Uhr (Europe/Berlin),
--      - Auftrag annehmen/starten nur mit Eltern-Freigabe für genau diesen Auftrag
--        und bestehender Eltern-Zustimmung zum Konto.
--    Der Trigger greift bei jedem Weg (App, RPC, direkter API-Aufruf).
--    Bereits laufende Aufträge (status 'assigned'/'in_progress') bleiben unberührt.
-- ============================================================

ALTER TABLE public.verification_requests
  DROP CONSTRAINT IF EXISTS verification_requests_kind_check;
ALTER TABLE public.verification_requests
  ADD CONSTRAINT verification_requests_kind_check
  CHECK (kind IN ('guardian_consent', 'identity', 'job_approval'));

ALTER TABLE public.verification_requests
  ADD COLUMN IF NOT EXISTS gig_id UUID REFERENCES public.gigs(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS verification_requests_gig_idx
  ON public.verification_requests (gig_id, user_id, status) WHERE kind = 'job_approval';

CREATE OR REPLACE FUNCTION public.enforce_youth_job_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start TIMESTAMP;
  v_end TIMESTAMP;
  v_duration INT;
  v_day_total INT;
BEGIN
  -- Service-Role / direkte DB-Verbindung und Admins sind ausgenommen.
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

  -- Zeitgrenzen: nur prüfen, wenn sich etwas Relevantes geändert hat und ein Termin feststeht.
  IF NEW.scheduled_at IS NOT NULL AND (
       TG_OP = 'INSERT'
       OR OLD.scheduled_at IS DISTINCT FROM NEW.scheduled_at
       OR OLD.duration_minutes IS DISTINCT FROM NEW.duration_minutes
       OR OLD.assigned_helper_id IS DISTINCT FROM NEW.assigned_helper_id
       OR OLD.status IS DISTINCT FROM NEW.status
     ) THEN
    v_duration := COALESCE(NEW.duration_minutes, 60);
    IF v_duration > 120 THEN
      RAISE EXCEPTION 'Jugendliche dürfen höchstens 2 Stunden pro Tag arbeiten.';
    END IF;

    v_start := NEW.scheduled_at AT TIME ZONE 'Europe/Berlin';
    v_end := v_start + make_interval(mins => v_duration);
    IF v_start::time < TIME '08:00' OR v_end::date <> v_start::date OR v_end::time > TIME '18:00' THEN
      RAISE EXCEPTION 'Jugendliche dürfen nur zwischen 08:00 und 18:00 Uhr arbeiten.';
    END IF;

    SELECT COALESCE(SUM(g.duration_minutes), 0) INTO v_day_total
    FROM public.gigs g
    WHERE g.assigned_helper_id = NEW.assigned_helper_id
      AND g.id <> NEW.id
      AND g.status IN ('assigned', 'in_progress', 'completed')
      AND g.scheduled_at IS NOT NULL
      AND (g.scheduled_at AT TIME ZONE 'Europe/Berlin')::date = v_start::date;
    IF v_day_total + v_duration > 120 THEN
      RAISE EXCEPTION 'An diesem Tag hat der Jugendliche schon Aufträge – höchstens 2 Stunden pro Tag sind erlaubt.';
    END IF;
  END IF;

  -- Freigabe: beim Übergang in "angenommen"/"läuft" muss dieser Auftrag von den Eltern freigegeben sein.
  IF NEW.status IN ('assigned', 'in_progress') AND (
       TG_OP = 'INSERT'
       OR OLD.status NOT IN ('assigned', 'in_progress')
       OR OLD.assigned_helper_id IS DISTINCT FROM NEW.assigned_helper_id
     ) THEN
    IF NOT public.has_guardian_consent(NEW.assigned_helper_id) THEN
      RAISE EXCEPTION 'Für Jugendliche ist zuerst die Zustimmung der Eltern zum Konto nötig.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.verification_requests v
      WHERE v.kind = 'job_approval'
        AND v.gig_id = NEW.id
        AND v.user_id = NEW.assigned_helper_id
        AND v.status = 'approved'
    ) THEN
      RAISE EXCEPTION 'Für Jugendliche ist die Freigabe der Eltern für diesen Auftrag nötig.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_youth_job_rules ON public.gigs;
CREATE TRIGGER trg_enforce_youth_job_rules
  BEFORE INSERT OR UPDATE ON public.gigs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_youth_job_rules();

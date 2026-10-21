-- ============================================================
-- Sicherheits-Härtung (Audit vom 20.10.2026)
--   1. Rate-Limiting (public.check_rate_limit)
--   2. Jugendschutz: Dauer/Zeitfenster auch ohne festen Termin, Start nur 08:00-18:00
--   3. Kontaktdaten-Erkennung: Unicode-/Leetspeak-/Ziffernwort-Umgehungen
--   4. Automatische Umstellung helper_youth -> helper_adult mit 18
-- ============================================================

-- ------------------------------------------------------------
-- 1. Rate-Limiting
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rate_limit_hits (
  id BIGSERIAL PRIMARY KEY,
  bucket TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_hits_bucket ON public.rate_limit_hits (bucket, created_at DESC);

ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limit_hits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.rate_limit_hits TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.rate_limit_hits_id_seq TO service_role;

-- Liefert true, wenn die Aktion erlaubt ist (und zählt sie dann mit), false bei Überschreitung.
CREATE OR REPLACE FUNCTION public.check_rate_limit(_bucket TEXT, _max INT, _window_seconds INT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_count INT;
BEGIN
  IF _bucket IS NULL OR length(_bucket) = 0 OR length(_bucket) > 200 THEN
    RAISE EXCEPTION 'Ungültiger Rate-Limit-Schlüssel';
  END IF;

  -- Pro Bucket serialisieren, damit parallele Anfragen das Limit nicht umgehen.
  PERFORM pg_advisory_xact_lock(hashtext(_bucket));

  -- Gelegentlich aufräumen.
  IF random() < 0.01 THEN
    DELETE FROM public.rate_limit_hits WHERE created_at < now() - interval '2 days';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.rate_limit_hits
  WHERE bucket = _bucket
    AND created_at > now() - make_interval(secs => _window_seconds);

  IF v_count >= _max THEN
    RETURN false;
  END IF;

  INSERT INTO public.rate_limit_hits (bucket) VALUES (_bucket);
  RETURN true;
END;
$fn$;

REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INT, INT) TO service_role;

-- ------------------------------------------------------------
-- 2. Jugendschutz-Regeln für Aufträge (Lücken geschlossen)
--    - Dauer (max. 2 h) wird auch ohne festen Termin geprüft
--    - Angenommene/laufende Aufträge brauchen einen festen Termin
--    - Arbeitsbeginn ("läuft") nur zwischen 08:00 und 18:00 Uhr (Europe/Berlin)
-- ------------------------------------------------------------
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
  v_now_berlin TIMESTAMP;
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

  IF TG_OP = 'INSERT'
     OR OLD.scheduled_at IS DISTINCT FROM NEW.scheduled_at
     OR OLD.duration_minutes IS DISTINCT FROM NEW.duration_minutes
     OR OLD.assigned_helper_id IS DISTINCT FROM NEW.assigned_helper_id
     OR OLD.status IS DISTINCT FROM NEW.status THEN

    v_duration := COALESCE(NEW.duration_minutes, 60);
    IF v_duration > 120 THEN
      RAISE EXCEPTION 'Jugendliche dürfen höchstens 2 Stunden pro Tag arbeiten.';
    END IF;

    IF NEW.scheduled_at IS NULL THEN
      IF NEW.status IN ('assigned', 'in_progress') THEN
        RAISE EXCEPTION 'Für Jugendliche muss ein fester Termin (zwischen 08:00 und 18:00 Uhr) feststehen.';
      END IF;
    ELSE
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
  END IF;

  -- Arbeitsbeginn nur im erlaubten Zeitfenster.
  IF NEW.status = 'in_progress' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'in_progress') THEN
    v_now_berlin := now() AT TIME ZONE 'Europe/Berlin';
    IF v_now_berlin::time < TIME '08:00' OR v_now_berlin::time >= TIME '18:00' THEN
      RAISE EXCEPTION 'Jugendliche dürfen nur zwischen 08:00 und 18:00 Uhr arbeiten – der Auftrag kann jetzt nicht gestartet werden.';
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

-- ------------------------------------------------------------
-- 3. Kontaktdaten-Erkennung (gleiche Logik wie src/lib/contact-detection.ts - gemeinsam pflegen)
--    Vor der Prüfung wird der Text normalisiert: Unicode NFKC (z. B. Vollbreite-Ziffern),
--    unsichtbare Zeichen entfernt, Kleinschreibung, kyrillische/griechische Lookalikes -> lateinisch.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_contact_text(_text TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $fn$
  SELECT translate(
    lower(regexp_replace(normalize(_text, NFKC), '[\u200B-\u200D\u2060\uFEFF\u00AD]', '', 'g')),
    U&'\0430\0435\043E\0440\0441\0443\0445\0456\0458\0455\03BF',
    'aeopcyxijso'
  )
$fn$;

CREATE OR REPLACE FUNCTION public.contains_private_contact(_text TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
AS $fn$
  SELECT
    n ~ '[a-z0-9._%+-]+\s*(@|\(at\)|\[at\])\s*[a-z0-9.-]+\s*(\.|\(dot\)|\[dot\])\s*[a-z]{2,}'
    OR n ~ '(https?://|www\.)\S+'
    OR n ~ '(\+|\m00)\d[\d\s/()-]{7,}\d'
    OR n ~ '\m0\d{2,4}[\s/-]?\d{3,}[\s/-]?\d{2,}'
    OR n ~ '\d{9,}'
    -- einzelne Ziffern mit Trennzeichen: "0 1 7 6 1 2 3 4 5"
    OR n ~ '(\d[\s.*_-]){8,}\d'
    -- Messenger / soziale Netzwerke, auch mit Leetspeak und Trennzeichen (w h a t s a p p, 1nstagram)
    OR n ~ '(^|[^a-z])(w[\s._*-]?h[\s._*-]?[a4@][\s._*-]?[t7][\s._*-]?[s5$][\s._*-]?[a4@][\s._*-]?p[\s._*-]?p|[t7][\s._*-]?[e3][\s._*-]?l[\s._*-]?[e3][\s._*-]?g[\s._*-]?r[\s._*-]?[a4@][\s._*-]?m|[s5$][\s._*-]?[i1!|][\s._*-]?g[\s._*-]?n[\s._*-]?[a4@][\s._*-]?l|[s5$][\s._*-]?n[\s._*-]?[a4@][\s._*-]?p[\s._*-]?c[\s._*-]?h[\s._*-]?[a4@][\s._*-]?[t7]|[i1!|][\s._*-]?n[\s._*-]?[s5$][\s._*-]?[t7][\s._*-]?[a4@][\s._*-]?g[\s._*-]?r[\s._*-]?[a4@][\s._*-]?m|[i1!|][\s._*-]?n[\s._*-]?[s5$][\s._*-]?[t7][\s._*-]?[a4@]|[t7][\s._*-]?[i1!|][\s._*-]?k[\s._*-]?[t7][\s._*-]?[o0][\s._*-]?k|d[\s._*-]?[i1!|][\s._*-]?[s5$][\s._*-]?c[\s._*-]?[o0][\s._*-]?r[\s._*-]?d|f[\s._*-]?[a4@][\s._*-]?c[\s._*-]?[e3][\s._*-]?b[\s._*-]?[o0][\s._*-]?[o0][\s._*-]?k|m[\s._*-]?[e3][\s._*-]?[s5$][\s._*-]?[s5$][\s._*-]?[e3][\s._*-]?n[\s._*-]?g[\s._*-]?[e3][\s._*-]?r)($|[^a-z])'
    -- ausgeschriebene Ziffern: "null eins sieben sechs ..." (mindestens 6 in Folge)
    OR n ~ '(^|[^a-zäöüß])((null|eins|ein|zwei|drei|vier|fünf|fuenf|sechs|sieben|acht|neun|zero|one|two|three|four|five|six|seven|eight|nine|oh)[\s,.\-]+){5,}(null|eins|ein|zwei|drei|vier|fünf|fuenf|sechs|sieben|acht|neun|zero|one|two|three|four|five|six|seven|eight|nine|oh)($|[^a-zäöüß])'
  FROM (SELECT public.normalize_contact_text(_text) AS n) s
$fn$;

-- ------------------------------------------------------------
-- 4. Mit 18 vom Jugendlichen zum Erwachsenen
--    Rolle helper_youth -> helper_adult, erneute Verifizierung als Erwachsene/r nötig
--    (die Eltern-Zustimmung gilt nicht mehr). Wird beim Laden des eigenen Profils und
--    täglich per pg_cron (falls aktiviert) ausgeführt. Nur für service_role.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_youth_to_adult(_user_id UUID DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r RECORD;
  v_count INT := 0;
BEGIN
  FOR r IN
    SELECT ur.user_id
    FROM public.user_roles ur
    JOIN public.profile_private pp ON pp.id = ur.user_id
    WHERE ur.role = 'helper_youth'
      AND pp.birthdate IS NOT NULL
      AND pp.birthdate <= (current_date - interval '18 years')::date
      AND (_user_id IS NULL OR ur.user_id = _user_id)
  LOOP
    DELETE FROM public.user_roles WHERE user_id = r.user_id AND role = 'helper_youth';
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = r.user_id AND role = 'helper_adult'
    ) THEN
      INSERT INTO public.user_roles (user_id, role) VALUES (r.user_id, 'helper_adult');
    END IF;

    UPDATE public.profiles SET reverification_required_at = now() WHERE id = r.user_id;
    UPDATE public.verification_results SET status = 'reverification_required' WHERE user_id = r.user_id;

    INSERT INTO public.notifications (user_id, category, title, body, link)
    VALUES (
      r.user_id,
      'system',
      'Du bist jetzt volljährig',
      'Dein Konto wurde auf „Erwachsener Helfer“ umgestellt. Bitte verifiziere dich einmal neu mit deinem Ausweis, damit du weiter Aufträge annehmen kannst.',
      '/profile'
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$fn$;

REVOKE ALL ON FUNCTION public.sync_youth_to_adult(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_youth_to_adult(UUID) TO service_role;

-- Tägliche Ausführung, falls pg_cron verfügbar ist (sonst greift die Prüfung beim Profil-Laden).
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('sync-youth-to-adult', '15 3 * * *', 'SELECT public.sync_youth_to_adult(NULL)');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron-Job konnte nicht angelegt werden: %', SQLERRM;
END
$do$;

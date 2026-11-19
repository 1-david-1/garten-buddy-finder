-- Prüft Migration 20261116000000_helper_recurring_blocks.sql: Wer die Sperrzeiten sieht und dass Buchungen in gesperrten Zeiten abgelehnt werden.
\set ON_ERROR_STOP 1
\set QUIET 1
SELECT gen_random_uuid() AS c, gen_random_uuid() AS h1, gen_random_uuid() AS h2, gen_random_uuid() AS adm \gset
INSERT INTO auth.users (id, email) VALUES (:'c','c@test.de'), (:'h1','h1@test.de'), (:'h2','h2@test.de'), (:'adm','adm@test.de');
INSERT INTO public.user_roles (user_id, role) VALUES (:'c','customer'),(:'h1','helper_adult'),(:'h2','helper_adult'),(:'adm','admin') ON CONFLICT DO NOTHING;
UPDATE public.profiles SET verified_at = now() WHERE id IN (:'c', :'h1', :'h2', :'adm');
SELECT (date_trunc('week', now() + interval '9 days'))::date AS nextmon \gset

SELECT set_config('test.nextmon', :'nextmon', false), set_config('test.h1', :'h1', false) \g /dev/null
-- ===== Helfer 1 trägt Stundenplan ein: Mo-Fr 08:00-13:00 =====
BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', :'h1', true);
INSERT INTO public.helper_recurring_blocks (helper_id, weekday, start_time, end_time, label)
SELECT :'h1', d, '08:00', '13:00', 'Schule' FROM generate_series(1,5) d;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.helper_recurring_blocks) <> 5 THEN RAISE EXCEPTION 'FAIL: Helfer sieht eigene Sperrzeiten nicht'; END IF;
  RAISE NOTICE 'PASS 1: Helfer kann Stundenplan anlegen und lesen';
END $$; COMMIT;

-- ===== Niemand sonst sieht die Regeln =====
BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', :'c', true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.helper_recurring_blocks) <> 0 THEN RAISE EXCEPTION 'FAIL: Kunde sieht Sperrzeiten'; END IF;
  BEGIN INSERT INTO public.helper_recurring_blocks (helper_id, weekday, start_time, end_time) VALUES (auth.uid(), 1, '08:00', '09:00'); 
  EXCEPTION WHEN others THEN RAISE EXCEPTION 'FAIL: eigener Insert eines Kunden sollte (harmlos) möglich sein: %', SQLERRM; END;
  RAISE NOTICE 'PASS 2a: Kunde sieht keine fremden Sperrzeiten';
END $$; ROLLBACK;
BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', :'h2', true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.helper_recurring_blocks) <> 0 THEN RAISE EXCEPTION 'FAIL: fremder Helfer sieht Sperrzeiten'; END IF;
  BEGIN INSERT INTO public.helper_recurring_blocks (helper_id, weekday, start_time, end_time) VALUES (current_setting('test.h1')::uuid, 6, '08:00', '09:00'); RAISE EXCEPTION 'FAIL: Insert für fremde Helfer-ID erlaubt';
  EXCEPTION WHEN insufficient_privilege THEN NULL; WHEN others THEN IF SQLERRM NOT LIKE '%row-level security%' THEN RAISE; END IF; END;
  BEGIN UPDATE public.helper_recurring_blocks SET end_time = '23:00'; IF FOUND THEN RAISE EXCEPTION 'FAIL: fremdes Update'; END IF; END;
  BEGIN DELETE FROM public.helper_recurring_blocks; IF FOUND THEN RAISE EXCEPTION 'FAIL: fremdes Delete'; END IF; END;
  RAISE NOTICE 'PASS 2b: fremder Helfer kann Sperrzeiten weder lesen noch ändern';
END $$; COMMIT;
BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', :'adm', true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.helper_recurring_blocks) <> 5 THEN RAISE EXCEPTION 'FAIL: Admin sieht Sperrzeiten nicht'; END IF;
  RAISE NOTICE 'PASS 2c: Admin darf lesen';
END $$; COMMIT;
BEGIN; SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN PERFORM 1 FROM public.helper_recurring_blocks; RAISE EXCEPTION 'FAIL: anon liest';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'PASS 2d: anon hat keinen Zugriff';
END $$; COMMIT;

-- ===== Durchsetzung: Buchung (INSERT, pending_helper) =====
SELECT set_config('test.nextmon', :'nextmon', false), set_config('test.h1', :'h1', false) \g /dev/null
BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', :'c', true);
DO $$
DECLARE mon date := current_setting('test.nextmon')::date; h uuid := current_setting('test.h1')::uuid;
BEGIN
  -- Montag 09:00 Berlin -> gesperrt
  BEGIN
    INSERT INTO public.gigs (customer_id, assigned_helper_id, title, description, service_type, budget_cents, address, postal_code, district, scheduled_at, duration_minutes, allowed_age_groups, status)
    VALUES (auth.uid(), h, 'Buchung Mo 09', 'Rasen mähen.', 'sonstiges', 3000, 'Hauptstraße 1', '79098', 'Altstadt', (mon + time '09:00') AT TIME ZONE 'Europe/Berlin', 60, ARRAY['helper_adult'], 'pending_helper');
    RAISE EXCEPTION 'FAIL: Buchung in Sperrzeit erlaubt';
  EXCEPTION WHEN others THEN IF SQLERRM NOT LIKE '%nicht verfügbar%' THEN RAISE; END IF; END;
  RAISE NOTICE 'PASS 3a: Buchung während des Stundenplans (Mo 09:00) wird abgelehnt';
  -- Termin, der in die Sperre hineinragt (07:30-08:30)
  BEGIN
    INSERT INTO public.gigs (customer_id, assigned_helper_id, title, description, service_type, budget_cents, address, postal_code, district, scheduled_at, duration_minutes, allowed_age_groups, status)
    VALUES (auth.uid(), h, 'Buchung Mo 0730', 'Rasen mähen.', 'sonstiges', 3000, 'Hauptstraße 2', '79098', 'Altstadt', (mon + time '07:30') AT TIME ZONE 'Europe/Berlin', 60, ARRAY['helper_adult'], 'pending_helper');
    RAISE EXCEPTION 'FAIL: überlappende Buchung erlaubt';
  EXCEPTION WHEN others THEN IF SQLERRM NOT LIKE '%nicht verfügbar%' THEN RAISE; END IF; END;
  RAISE NOTICE 'PASS 3b: Termin, der in die Sperrzeit hineinragt, wird abgelehnt';
  -- direkt nach dem Stundenplan (13:00) -> frei
  INSERT INTO public.gigs (customer_id, assigned_helper_id, title, description, service_type, budget_cents, address, postal_code, district, scheduled_at, duration_minutes, allowed_age_groups, status)
  VALUES (auth.uid(), h, 'Buchung Mo 13', 'Rasen mähen.', 'sonstiges', 3000, 'Hauptstraße 3', '79098', 'Altstadt', (mon + time '13:00') AT TIME ZONE 'Europe/Berlin', 60, ARRAY['helper_adult'], 'pending_helper');
  RAISE NOTICE 'PASS 3c: Buchung direkt nach dem Stundenplan (13:00) ist möglich';
  -- Samstag -> frei
  INSERT INTO public.gigs (customer_id, assigned_helper_id, title, description, service_type, budget_cents, address, postal_code, district, scheduled_at, duration_minutes, allowed_age_groups, status)
  VALUES (auth.uid(), h, 'Buchung Sa 09', 'Rasen mähen.', 'sonstiges', 3000, 'Hauptstraße 4', '79098', 'Altstadt', ((mon + 5) + time '09:00') AT TIME ZONE 'Europe/Berlin', 60, ARRAY['helper_adult'], 'pending_helper');
  RAISE NOTICE 'PASS 3d: Samstag ist frei buchbar';
  -- offener Auftrag (Gebote) in der Sperrzeit: nicht betroffen
  INSERT INTO public.gigs (customer_id, title, description, service_type, budget_cents, address, postal_code, district, scheduled_at, duration_minutes, allowed_age_groups, status)
  VALUES (auth.uid(), 'Offen Mo 09', 'Hecke schneiden.', 'sonstiges', 3000, 'Hauptstraße 5', '79098', 'Altstadt', (mon + time '09:00') AT TIME ZONE 'Europe/Berlin', 60, ARRAY['helper_adult'], 'open');
  RAISE NOTICE 'PASS 3e: offene Aufträge (Gebote) sind nicht von der Sperre betroffen';
END $$;
COMMIT;

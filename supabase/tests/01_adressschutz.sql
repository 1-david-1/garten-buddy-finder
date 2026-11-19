-- Prüft Migration 20261115000000_gig_location_privacy.sql: Wer die Adresse eines Auftrags sieht (Auftraggeber, zugewiesener Helfer erst nach der Annahme, Admin) und dass sie sonst nirgends erscheint.
\set ON_ERROR_STOP 1
\set QUIET 1
-- ===== Testdaten =====
SELECT gen_random_uuid() AS c, gen_random_uuid() AS h1, gen_random_uuid() AS h2, gen_random_uuid() AS adm \gset
INSERT INTO auth.users (id, email) VALUES (:'c','c@test.de'), (:'h1','h1@test.de'), (:'h2','h2@test.de'), (:'adm','adm@test.de');
INSERT INTO public.user_roles (user_id, role) VALUES (:'c','customer'),(:'h1','helper_adult'),(:'h2','helper_adult'),(:'adm','admin') ON CONFLICT DO NOTHING;
UPDATE public.profiles SET verified_at = now() WHERE id IN (:'c', :'h1', :'h2', :'adm');
SELECT (date_trunc('week', now() + interval '9 days'))::date AS nextmon \gset

-- ===== 1. Kunde legt Auftrag an (wie createGig) =====
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'c', true);
INSERT INTO public.gigs (customer_id, title, description, service_type, budget_cents, address, postal_code, district, scheduled_at, duration_minutes, allowed_age_groups, status)
VALUES (:'c', 'Rasen mähen', 'Vorderen Rasen mähen, Mäher vorhanden.', 'sonstiges', 4000, 'Schwarzwaldstraße 12', '79102', 'Wiehre',
        (:'nextmon'::date + time '10:00') AT TIME ZONE 'Europe/Berlin', 60, ARRAY['helper_adult'], 'open')
RETURNING id AS gig \gset
COMMIT;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.gigs WHERE address IS NOT NULL OR postal_code IS NOT NULL) THEN RAISE EXCEPTION 'FAIL: Adresse steht noch in gigs'; END IF;
  IF (SELECT count(*) FROM public.gig_locations) <> 1 THEN RAISE EXCEPTION 'FAIL: gig_locations nicht befüllt'; END IF;
  IF (SELECT district FROM public.gigs LIMIT 1) <> 'Wiehre' THEN RAISE EXCEPTION 'FAIL: Stadtteil fehlt'; END IF;
  RAISE NOTICE 'PASS 1: Adresse wird aus gigs in gig_locations umgeleitet, Stadtteil bleibt öffentlich';
END $$;

-- ===== 2. Wer sieht die Adresse? =====
-- Fremder Helfer, offener Auftrag
BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', :'h2', true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.gigs) <> 1 THEN RAISE EXCEPTION 'FAIL: Helfer sieht offenen Auftrag nicht'; END IF;
  IF (SELECT count(*) FROM public.gig_locations) <> 0 THEN RAISE EXCEPTION 'FAIL: fremder Helfer sieht die Adresse'; END IF;
  RAISE NOTICE 'PASS 2a: fremder Helfer sieht den Auftrag, aber keine Adresse';
END $$; COMMIT;
-- Auftraggeber
BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', :'c', true);
DO $$ BEGIN
  IF (SELECT address FROM public.gig_locations) <> 'Schwarzwaldstraße 12' THEN RAISE EXCEPTION 'FAIL: Auftraggeber sieht eigene Adresse nicht'; END IF;
  RAISE NOTICE 'PASS 2b: Auftraggeber sieht die eigene Adresse';
END $$; COMMIT;
-- Kunde weist Helfer 1 zu (Buchungsanfrage, noch nicht angenommen)
BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', :'c', true);
UPDATE public.gigs SET assigned_helper_id = :'h1', status = 'pending_helper' WHERE id = :'gig';
COMMIT;
BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', :'h1', true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.gig_locations) <> 0 THEN RAISE EXCEPTION 'FAIL: Helfer sieht Adresse schon bei pending_helper'; END IF;
  RAISE NOTICE 'PASS 2c: zugewiesener Helfer sieht die Adresse vor der Annahme NICHT';
END $$; COMMIT;
-- Helfer nimmt an
BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', :'h1', true);
UPDATE public.gigs SET status = 'assigned' WHERE id = :'gig';
DO $$ BEGIN
  IF (SELECT address FROM public.gig_locations) IS DISTINCT FROM 'Schwarzwaldstraße 12' THEN RAISE EXCEPTION 'FAIL: Helfer sieht Adresse nach Annahme nicht'; END IF;
  RAISE NOTICE 'PASS 2d: nach der Annahme sieht der zugewiesene Helfer die Adresse';
END $$; COMMIT;
BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', :'h2', true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.gig_locations) <> 0 THEN RAISE EXCEPTION 'FAIL: dritter Helfer sieht Adresse'; END IF;
  RAISE NOTICE 'PASS 2e: unbeteiligter Helfer sieht sie weiterhin nicht';
END $$; COMMIT;
BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', :'adm', true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.gig_locations) <> 1 THEN RAISE EXCEPTION 'FAIL: Admin sieht Adresse nicht'; END IF;
  RAISE NOTICE 'PASS 2f: Admin sieht die Adresse';
END $$; COMMIT;
-- Nach Abschluss: Helfer sieht sie nicht mehr
UPDATE public.gigs SET status = 'completed' WHERE id = :'gig';
BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', :'h1', true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.gig_locations) <> 0 THEN RAISE EXCEPTION 'FAIL: Helfer sieht Adresse nach Abschluss'; END IF;
  RAISE NOTICE 'PASS 2g: nach Abschluss ist die Adresse für den Helfer wieder verborgen';
END $$; COMMIT;
UPDATE public.gigs SET status = 'assigned' WHERE id = :'gig';

-- ===== 3. Schreibzugriffe / Umgehungsversuche =====
BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', :'h2', true);
DO $$ BEGIN
  BEGIN INSERT INTO public.gig_locations (gig_id, address) VALUES ((SELECT id FROM public.gigs LIMIT 1), 'x'); RAISE EXCEPTION 'FAIL: INSERT erlaubt';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.gig_locations SET address = 'x'; RAISE EXCEPTION 'FAIL: UPDATE erlaubt';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM public.gig_locations; RAISE EXCEPTION 'FAIL: DELETE erlaubt';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'PASS 3a: Nutzer können gig_locations nicht direkt schreiben';
END $$; COMMIT;
BEGIN; SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN PERFORM 1 FROM public.gig_locations; RAISE EXCEPTION 'FAIL: anon darf lesen';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'PASS 3b: anon hat keinen Zugriff';
END $$; COMMIT;
-- Update über gigs wird ebenfalls umgeleitet
UPDATE public.gigs SET address = 'Neue Str. 5', postal_code = '79104' WHERE id = :'gig';
DO $$ BEGIN
  IF (SELECT address FROM public.gigs WHERE address IS NOT NULL LIMIT 1) IS NOT NULL THEN RAISE EXCEPTION 'FAIL: Update schreibt Adresse in gigs'; END IF;
  IF (SELECT address FROM public.gig_locations) <> 'Neue Str. 5' OR (SELECT postal_code FROM public.gig_locations) <> '79104' THEN RAISE EXCEPTION 'FAIL: Update wurde nicht umgeleitet'; END IF;
  RAISE NOTICE 'PASS 3c: auch ein UPDATE von address/postal_code auf gigs landet in gig_locations';
END $$;
-- Sicherung: ohne Trigger darf keine Adresse in gigs stehen
ALTER TABLE public.gigs DISABLE TRIGGER trg_zz_gig_location_divert;
DO $$ BEGIN
  BEGIN UPDATE public.gigs SET address = 'Leak 1'; RAISE EXCEPTION 'FAIL: CHECK greift nicht';
  EXCEPTION WHEN check_violation THEN NULL; END;
  RAISE NOTICE 'PASS 3d: CHECK-Constraint verhindert eine Adresse in gigs, selbst ohne Trigger';
END $$;
ALTER TABLE public.gigs ENABLE TRIGGER trg_zz_gig_location_divert;

-- ===== 4. Duplikat-Prüfung (neu geschriebene Funktion) =====
BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', :'c', true);
UPDATE public.gigs SET address = 'Schwarzwaldstraße 12' WHERE id = :'gig';  -- (als Kunde über gigs: wird umgeleitet)
DO $$ BEGIN
  BEGIN
    INSERT INTO public.gigs (customer_id, title, description, service_type, budget_cents, address, postal_code, district, scheduled_at, duration_minutes, allowed_age_groups, status)
    VALUES (auth.uid(), 'Rasen mähen', 'Vorderen Rasen mähen, Mäher vorhanden.', 'sonstiges', 4000, 'Schwarzwaldstraße 12', '79102', 'Wiehre', now() + interval '10 days', 60, ARRAY['helper_adult'], 'open');
    RAISE EXCEPTION 'FAIL: Duplikat nicht erkannt';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%schon veröffentlicht%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'PASS 4: Duplikat an derselben Adresse wird weiterhin erkannt';
END $$; COMMIT;

-- ===== 5. Fremde PLZ wird weiterhin abgelehnt =====
BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', :'c', true);
DO $$ BEGIN
  BEGIN
    INSERT INTO public.gigs (customer_id, title, description, service_type, budget_cents, address, postal_code, district, status)
    VALUES (auth.uid(), 'Anderer Auftrag', 'Hecke schneiden bitte.', 'sonstiges', 3000, 'Musterweg 3', '10115', 'Wiehre', 'open');
    RAISE EXCEPTION 'FAIL: fremde PLZ akzeptiert';
  EXCEPTION WHEN others THEN IF SQLERRM NOT LIKE '%innerhalb von Freiburg%' THEN RAISE; END IF; END;
  RAISE NOTICE 'PASS 5: Aufträge außerhalb Freiburgs werden weiterhin abgelehnt';
END $$; COMMIT;

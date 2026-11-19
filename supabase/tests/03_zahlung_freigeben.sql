-- Prüft Migration 20261117000000_complete_gig_release.sql: Abschluss und Zahlungsfreigabe in einem Schritt (Berechtigung, Wiederholung, Zahlung in Klärung, Reparatur halb abgeschlossener Aufträge).
\set ON_ERROR_STOP 1
\set QUIET 1
CREATE SCHEMA tt;
GRANT USAGE ON SCHEMA tt TO PUBLIC;
CREATE FUNCTION tt.ok(cond boolean, name text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  IF cond IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: %', name; END IF; RAISE NOTICE 'PASS: %', name; END $$;
CREATE FUNCTION tt.raises(stmt text, pattern text, name text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  BEGIN EXECUTE stmt; EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%' || pattern || '%' THEN RAISE NOTICE 'PASS: %', name; RETURN; END IF;
    RAISE EXCEPTION 'FAIL: % (falsche Meldung: %)', name, SQLERRM; END;
  RAISE EXCEPTION 'FAIL: % (kein Fehler)', name; END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tt TO PUBLIC;

SELECT gen_random_uuid() AS c, gen_random_uuid() AS h1, gen_random_uuid() AS other, gen_random_uuid() AS adm \gset
INSERT INTO auth.users (id, email) VALUES (:'c','c@test.de'), (:'h1','h1@test.de'), (:'other','o@test.de'), (:'adm','a@test.de');
INSERT INTO public.user_roles (user_id, role) VALUES (:'c','customer'),(:'h1','helper_adult'),(:'other','helper_adult'),(:'adm','admin') ON CONFLICT DO NOTHING;
UPDATE public.profiles SET verified_at = now() WHERE id IN (:'c', :'h1', :'other', :'adm');
SELECT EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Berlin'))::int AS yr \gset

CREATE FUNCTION tt.mk(p_c uuid, p_h uuid, p_status text, p_escrow text, p_bid int) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE gid uuid;
BEGIN
  INSERT INTO public.gigs (customer_id, assigned_helper_id, title, description, service_type, budget_cents, status, scheduled_at)
  VALUES (p_c, p_h, 'Job', 'Rasen mähen.', 'sonstiges', p_bid, p_status::public.gig_status, now()) RETURNING id INTO gid;
  IF p_escrow IS NOT NULL THEN
    INSERT INTO public.escrow_transactions (gig_id, customer_id, helper_id, bid_cents, customer_fee_cents, helper_fee_cents, state, held_at)
    VALUES (gid, p_c, p_h, p_bid, 0, 0, p_escrow::public.escrow_state, now());
  END IF;
  RETURN gid;
END $$;

SELECT tt.mk(:'c', :'h1', 'in_progress', 'held', 4000) AS g1 \gset
SELECT tt.mk(:'c', :'h1', 'pending_helper', 'held', 1000) AS g_pend \gset
SELECT tt.mk(:'c', :'h1', 'in_progress', 'disputed', 2500) AS g_disp \gset
SELECT tt.mk(:'c', :'h1', 'completed', 'held', 3000) AS g_half \gset
SELECT tt.mk(:'c', :'h1', 'assigned', NULL, 500) AS g_noesc \gset
SELECT tt.mk(:'c', :'h1', 'assigned', 'held', 700) AS g_adm \gset
SELECT tt.mk(:'c', :'h1', 'cancelled', 'held', 900) AS g_canc \gset
SELECT tt.mk(:'c', :'h1', 'in_progress', 'cancelled', 600) AS g_escc \gset

-- 1. Kunde schließt ab: alles in einem Schritt, mit dem Konto des Kunden
BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', :'c', true);
SELECT public.complete_gig_and_release(:'g1') AS r1 \gset
COMMIT;
SELECT tt.ok(:'r1'::jsonb->>'payout' = 'released' AND (:'r1'::jsonb->>'newly_completed')::boolean, '1a: Abschluss meldet released / newly_completed');
SELECT tt.ok((SELECT status FROM public.gigs WHERE id = :'g1') = 'completed', '1b: Auftrag ist abgeschlossen');
SELECT tt.ok((SELECT state FROM public.escrow_transactions WHERE gig_id = :'g1') = 'paid_out', '1c: Zahlung ist freigegeben');
SELECT tt.ok((SELECT tx_count||'/'||gross_cents FROM public.earnings_tracker WHERE helper_id = :'h1' AND year = :'yr') = '1/4000', '1d: Verdienste des Helfers sind gezählt (1 Auftrag, 40,00 EUR)');

-- 2. Zweiter Klick zählt nicht doppelt
BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', :'c', true);
SELECT public.complete_gig_and_release(:'g1') AS r2 \gset
COMMIT;
SELECT tt.ok(:'r2'::jsonb->>'payout' = 'already_released' AND NOT (:'r2'::jsonb->>'newly_completed')::boolean, '2a: Wiederholung meldet already_released');
SELECT tt.ok((SELECT tx_count||'/'||gross_cents FROM public.earnings_tracker WHERE helper_id = :'h1' AND year = :'yr') = '1/4000', '2b: kein Doppelzählen');

-- 3. Berechtigung und Status
BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', :'h1', true);
SELECT tt.raises(format('SELECT public.complete_gig_and_release(%L)', :'g_pend'), 'Nur der Auftraggeber', '3a: der Helfer kann nicht abschließen');
ROLLBACK;
BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', :'other', true);
SELECT tt.raises(format('SELECT public.complete_gig_and_release(%L)', :'g_adm'), 'Nur der Auftraggeber', '3b: Fremde können nicht abschließen');
ROLLBACK;
BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', :'c', true);
SELECT tt.raises(format('SELECT public.complete_gig_and_release(%L)', :'g_pend'), 'Status nicht abgeschlossen werden', '3c: ein noch nicht angenommener Auftrag (pending_helper) lässt sich nicht abschließen');
SELECT tt.raises(format('SELECT public.complete_gig_and_release(%L)', :'g_canc'), 'Status nicht abgeschlossen werden', '3d: ein stornierter Auftrag lässt sich nicht abschließen');
ROLLBACK;
BEGIN; SET LOCAL ROLE anon;
SELECT tt.raises(format('SELECT public.complete_gig_and_release(%L)', :'g_adm'), 'permission denied', '3e: ohne Anmeldung nicht aufrufbar');
ROLLBACK;
SELECT tt.ok((SELECT state FROM public.escrow_transactions WHERE gig_id = :'g_pend') = 'held', '3f: abgelehnte Versuche ändern nichts');

-- 4. Zahlung in Klärung wird nicht freigegeben
BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', :'c', true);
SELECT public.complete_gig_and_release(:'g_disp') AS r4 \gset
COMMIT;
SELECT tt.ok(:'r4'::jsonb->>'payout' = 'disputed' AND (SELECT status FROM public.gigs WHERE id = :'g_disp') = 'completed' AND (SELECT state FROM public.escrow_transactions WHERE gig_id = :'g_disp') = 'disputed', '4: Zahlung in Klärung bleibt gehalten, Auftrag wird abgeschlossen');

-- 5. Reparatur: früher halb abgeschlossen (Status completed, Zahlung nie freigegeben)
BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', :'c', true);
SELECT public.complete_gig_and_release(:'g_half') AS r5 \gset
COMMIT;
SELECT tt.ok(:'r5'::jsonb->>'payout' = 'released' AND NOT (:'r5'::jsonb->>'newly_completed')::boolean, '5a: halb abgeschlossener Auftrag: Zahlung wird nachgeholt');
SELECT tt.ok((SELECT tx_count||'/'||gross_cents FROM public.earnings_tracker WHERE helper_id = :'h1' AND year = :'yr') = '2/7000', '5b: Verdienste um genau diesen Auftrag ergänzt (2 Aufträge, 70,00 EUR)');

-- 6. Ohne Escrow-Eintrag
BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', :'c', true);
SELECT public.complete_gig_and_release(:'g_noesc') AS r6 \gset
COMMIT;
SELECT tt.ok(:'r6'::jsonb->>'payout' = 'none' AND (SELECT status FROM public.gigs WHERE id = :'g_noesc') = 'completed', '6: Auftrag ohne Treuhand-Eintrag wird abgeschlossen, keine Zahlung');

-- 7. Admin darf
BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', :'adm', true);
SELECT public.complete_gig_and_release(:'g_adm') AS r7 \gset
COMMIT;
SELECT tt.ok(:'r7'::jsonb->>'payout' = 'released', '7: Admin kann abschließen');

-- 8. Stornierte Treuhand-Zahlung wird nicht freigegeben
BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', :'c', true);
SELECT public.complete_gig_and_release(:'g_escc') AS r8 \gset
COMMIT;
SELECT tt.ok(:'r8'::jsonb->>'payout' = 'none' AND (SELECT state FROM public.escrow_transactions WHERE gig_id = :'g_escc') = 'cancelled', '8: stornierte Treuhand-Zahlung wird nicht freigegeben');
SELECT tt.ok((SELECT tx_count||'/'||gross_cents FROM public.earnings_tracker WHERE helper_id = :'h1' AND year = :'yr') = '3/7700', '9: Verdienste insgesamt korrekt (3 Aufträge: 40 + 30 + 7 EUR)');

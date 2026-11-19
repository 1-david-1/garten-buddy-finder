-- ============================================================
-- Auftrag abschließen & Zahlung freigeben: eine atomare Funktion
--
-- Vorher lief das in der App als drei getrennte Schritte mit dem Konto des Kunden:
--   1. gigs.status = 'completed'
--   2. escrow_transactions.state = 'paid_out'
--   3. earnings_tracker des HELFERS hochzählen
-- Schritt 3 scheiterte immer an der Zugriffsregel (nur der Helfer selbst darf seine Verdienstzeile schreiben),
-- aber erst NACH den Schritten 1 und 2. Folge: Der erste Klick zeigte einen Fehler, der Auftrag war trotzdem schon
-- abgeschlossen und die Zahlung freigegeben, der zweite Klick "klappte" - und die Verdienste des Helfers wurden nie
-- gezählt. Außerdem konnten zwei schnelle Klicks die Verdienste doppelt zählen.
--
-- Jetzt passiert alles in einer Transaktion:
--   * Nur der Auftraggeber (oder ein Admin) darf abschließen, nur aus den Status assigned / in_progress.
--   * Die Zahlung wird genau einmal freigegeben (bedingtes UPDATE) und die Verdienste atomar hochgezählt.
--   * Wiederholung ist ungefährlich: ein bereits abgeschlossener Auftrag wird nicht noch einmal gezählt; war die
--     Zahlung noch nicht freigegeben, wird sie nachgeholt.
--   * Eine Zahlung in Klärung (disputed) oder eine stornierte Treuhand-Zahlung wird nicht freigegeben.
--   * Das Jahr der Verdienst-Statistik richtet sich nach deutscher Ortszeit.
-- ============================================================

DO $$
BEGIN
  IF to_regclass('public.escrow_transactions') IS NULL OR to_regclass('public.earnings_tracker') IS NULL THEN
    RAISE EXCEPTION 'Tabellen escrow_transactions / earnings_tracker fehlen - bitte zuerst die Basis-Migrationen ausführen.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.complete_gig_and_release(p_gig_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g public.gigs%ROWTYPE;
  e public.escrow_transactions%ROWTYPE;
  v_newly BOOLEAN := false;
  v_payout TEXT := 'none';
  v_state TEXT;
  v_year INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Bitte melde dich an.';
  END IF;

  -- Zeile sperren: zwei gleichzeitige Klicks laufen nacheinander, nicht parallel.
  SELECT * INTO g FROM public.gigs WHERE id = p_gig_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auftrag nicht gefunden.';
  END IF;

  IF g.customer_id <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Nur der Auftraggeber kann den Auftrag abschließen.';
  END IF;

  IF g.status IN ('assigned', 'in_progress') THEN
    UPDATE public.gigs SET status = 'completed' WHERE id = p_gig_id;
    v_newly := true;
  ELSIF g.status = 'completed' THEN
    NULL; -- Wiederholung: nur noch fehlende Zahlung nachholen
  ELSE
    RAISE EXCEPTION 'Dieser Auftrag kann in seinem aktuellen Status nicht abgeschlossen werden. Der Helfer muss ihn zuerst angenommen haben.';
  END IF;

  IF g.assigned_helper_id IS NOT NULL THEN
    UPDATE public.escrow_transactions
       SET state = 'paid_out',
           paid_out_at = now(),
           released_at = COALESCE(released_at, now())
     WHERE gig_id = p_gig_id
       AND state NOT IN ('paid_out', 'disputed', 'cancelled')
    RETURNING * INTO e;

    IF FOUND THEN
      v_year := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Berlin'))::INTEGER;
      INSERT INTO public.earnings_tracker (helper_id, year, tx_count, gross_cents)
      VALUES (e.helper_id, v_year, 1, COALESCE(e.bid_cents, 0))
      ON CONFLICT (helper_id, year) DO UPDATE
        SET tx_count = public.earnings_tracker.tx_count + 1,
            gross_cents = public.earnings_tracker.gross_cents + EXCLUDED.gross_cents;
      v_payout := 'released';
    ELSE
      SELECT state::TEXT INTO v_state FROM public.escrow_transactions WHERE gig_id = p_gig_id;
      v_payout := CASE
        WHEN v_state = 'paid_out' THEN 'already_released'
        WHEN v_state = 'disputed' THEN 'disputed'
        ELSE 'none'
      END;
    END IF;
  END IF;

  RETURN jsonb_build_object('status', 'completed', 'newly_completed', v_newly, 'payout', v_payout);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_gig_and_release(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_gig_and_release(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_gig_and_release(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_gig_and_release(UUID) TO service_role;

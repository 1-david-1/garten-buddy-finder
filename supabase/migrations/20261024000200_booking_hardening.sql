-- ============================================================
-- Buchungen zuverlässig machen
--
--  1. gigs.source_listing_id: aus welchem Angebot stammt die Buchung (vorher suchte die Datenbank das
--     Angebot beim Ablehnen anhand des TITELS - das traf falsche oder gar keine Angebote).
--  2. purchase_with_schedule: prüft jetzt wirklich
--       - Termin liegt in der Zukunft (mind. 2 Stunden),
--       - Helfer ist nicht gesperrt / eingeschränkt / im Urlaub,
--       - Kunde und Helfer haben sich nicht gegenseitig blockiert,
--       - der Helfer hat zu diesem Zeitpunkt keinen anderen Termin (inkl. 30 Min. Anfahrt),
--     und verliert die Kundennachricht nicht mehr, wenn das Angebot keine Beschreibung hat
--     (NULL || Text ergibt in SQL NULL).
--     Das Angebot bleibt buchbar (vorher wurde es nach der ersten Anfrage auf "sold" gesetzt und blieb
--     für alle anderen gesperrt, auch wenn der Helfer nie antwortete).
--  3. respond_to_booking: Ablehnen räumt richtig auf
--       - Buchung über Gebot: Auftrag geht zurück auf "offen", die Verhandlung wird beendet,
--       - Direktbuchung (Angebot / "Helfer finden"): Auftrag wird abgebrochen und NICHT als offener
--         Auftrag für alle veröffentlicht (der Kunde wollte genau diesen Helfer),
--       - der noch nicht bezahlte Zahlungsvorgang wird entfernt.
-- ============================================================

ALTER TABLE public.gigs
  ADD COLUMN IF NOT EXISTS source_listing_id UUID REFERENCES public.service_listings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS gigs_helper_schedule_idx
  ON public.gigs (assigned_helper_id, scheduled_at)
  WHERE status IN ('pending_helper', 'assigned', 'in_progress');

CREATE OR REPLACE FUNCTION public.purchase_with_schedule(
  p_listing_id UUID,
  p_scheduled_at TIMESTAMPTZ,
  p_scheduled_end TIMESTAMPTZ DEFAULT NULL,
  p_message TEXT DEFAULT NULL
) RETURNS public.gigs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing public.service_listings%ROWTYPE;
  v_price INT;
  v_gig public.gigs%ROWTYPE;
  v_customer_fee INT;
  v_helper_fee INT;
  v_duration_minutes INT := 60;
  v_description TEXT;
  v_helper public.profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_listing FROM public.service_listings WHERE id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'listing_not_found';
  END IF;
  IF v_listing.status <> 'active' THEN
    RAISE EXCEPTION 'listing_not_active';
  END IF;
  IF v_listing.helper_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot_purchase_own_listing';
  END IF;
  IF v_listing.listing_type = 'auction' THEN
    RAISE EXCEPTION 'auctions_cannot_be_booked_directly';
  END IF;
  IF v_listing.price_cents IS NULL THEN
    RAISE EXCEPTION 'listing_has_no_price';
  END IF;
  v_price := v_listing.price_cents;

  IF p_scheduled_at IS NULL OR p_scheduled_at < now() + interval '2 hours' THEN
    RAISE EXCEPTION 'scheduled_too_soon';
  END IF;

  IF public.is_restricted(auth.uid(), 'jobs') THEN
    RAISE EXCEPTION 'account_restricted';
  END IF;
  IF public.users_blocked(auth.uid(), v_listing.helper_id) THEN
    RAISE EXCEPTION 'user_blocked';
  END IF;

  SELECT * INTO v_helper FROM public.profiles WHERE id = v_listing.helper_id;
  IF NOT FOUND OR v_helper.suspended_at IS NOT NULL OR public.is_restricted(v_listing.helper_id, 'jobs') THEN
    RAISE EXCEPTION 'helper_not_bookable';
  END IF;
  IF COALESCE(v_helper.vacation_mode, FALSE)
     AND (v_helper.vacation_return_date IS NULL OR p_scheduled_at < v_helper.vacation_return_date::timestamptz) THEN
    RAISE EXCEPTION 'helper_on_vacation';
  END IF;

  IF p_scheduled_end IS NOT NULL THEN
    v_duration_minutes := EXTRACT(EPOCH FROM (p_scheduled_end - p_scheduled_at)) / 60;
    IF v_duration_minutes <= 0 THEN
      v_duration_minutes := 60;
    END IF;
  END IF;

  -- Kein anderer Termin des Helfers zu dieser Zeit (30 Minuten Puffer für die Anfahrt).
  IF EXISTS (
    SELECT 1 FROM public.gigs g
    WHERE g.assigned_helper_id = v_listing.helper_id
      AND g.status IN ('pending_helper', 'assigned', 'in_progress')
      AND g.scheduled_at IS NOT NULL
      AND tstzrange(
            g.scheduled_at - interval '30 minutes',
            g.scheduled_at + make_interval(mins => COALESCE(g.duration_minutes, 60)) + interval '30 minutes'
          ) && tstzrange(p_scheduled_at, p_scheduled_at + make_interval(mins => v_duration_minutes))
  ) THEN
    RAISE EXCEPTION 'helper_not_available';
  END IF;

  -- Vorerst 0% Gebühr - siehe platform_fees_disabled.
  v_customer_fee := 0;
  v_helper_fee := 0;

  v_description := COALESCE(v_listing.description, '');
  IF p_message IS NOT NULL AND trim(p_message) <> '' THEN
    v_description := v_description || E'\n\n---\nNachricht des Kunden:\n' || p_message;
  END IF;

  INSERT INTO public.gigs (
    customer_id, title, description, service_type, budget_cents,
    address, postal_code, scheduled_at, duration_minutes, status,
    assigned_helper_id, allowed_age_groups, source_listing_id
  ) VALUES (
    auth.uid(),
    v_listing.title,
    NULLIF(v_description, ''),
    v_listing.service_type,
    v_price,
    v_listing.location,
    v_listing.postal_code,
    p_scheduled_at,
    v_duration_minutes,
    'pending_helper',
    v_listing.helper_id,
    ARRAY['helper_youth', 'helper_adult', 'helper_pro'],
    v_listing.id
  ) RETURNING * INTO v_gig;

  INSERT INTO public.escrow_transactions (
    gig_id, customer_id, helper_id, bid_cents, customer_fee_cents, helper_fee_cents, state
  ) VALUES (
    v_gig.id, auth.uid(), v_listing.helper_id, v_price, v_customer_fee, v_helper_fee, 'pending'
  );

  -- Das Angebot bleibt buchbar: Doppelbuchungen verhindert die Terminprüfung oben.
  RETURN v_gig;
END;
$$;

GRANT EXECUTE ON FUNCTION public.purchase_with_schedule(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.respond_to_booking(
  p_gig_id UUID,
  p_accept BOOLEAN
) RETURNS public.gigs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gig public.gigs%ROWTYPE;
  v_from_bid BOOLEAN;
BEGIN
  SELECT * INTO v_gig FROM public.gigs WHERE id = p_gig_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'gig_not_found';
  END IF;
  IF v_gig.assigned_helper_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF v_gig.status NOT IN ('pending_helper', 'assigned') THEN
    RAISE EXCEPTION 'gig_not_pending_helper';
  END IF;

  IF p_accept THEN
    IF v_gig.status = 'pending_helper' THEN
      UPDATE public.gigs
        SET status = 'assigned', updated_at = now()
        WHERE id = p_gig_id
        RETURNING * INTO v_gig;
    END IF;
    RETURN v_gig;
  END IF;

  -- Ablehnen
  v_from_bid := EXISTS (
    SELECT 1 FROM public.negotiations n
    WHERE n.gig_id = p_gig_id AND n.helper_id = auth.uid() AND n.status = 'accepted'
  );

  IF v_from_bid THEN
    -- Preis war über ein Gebot vereinbart: Auftrag wieder für andere Helfer öffnen.
    UPDATE public.negotiations
      SET status = 'withdrawn'
      WHERE gig_id = p_gig_id AND helper_id = auth.uid() AND status = 'accepted';
    UPDATE public.gigs
      SET status = 'open', assigned_helper_id = NULL, updated_at = now()
      WHERE id = p_gig_id
      RETURNING * INTO v_gig;
  ELSE
    -- Direktbuchung: Der Kunde wollte genau diesen Helfer, der Auftrag wird nicht öffentlich ausgeschrieben.
    UPDATE public.gigs
      SET status = 'cancelled', updated_at = now()
      WHERE id = p_gig_id
      RETURNING * INTO v_gig;

    -- Angebote, die durch Sofortkauf / angenommenes Preisangebot auf "sold" gingen (und kein
    -- source_listing_id haben), wieder freigeben: GENAU EIN Angebot (das zuletzt geänderte mit gleichem
    -- Titel), nicht mehr alle mit gleichem Titel wie früher.
    IF v_gig.source_listing_id IS NULL THEN
      UPDATE public.service_listings
        SET status = 'active', updated_at = now()
        WHERE id = (
          SELECT l.id FROM public.service_listings l
          WHERE l.helper_id = auth.uid() AND l.title = v_gig.title AND l.status = 'sold'
          ORDER BY l.updated_at DESC
          LIMIT 1
        );
    END IF;
  END IF;

  -- Noch nicht bezahlter Zahlungsvorgang entfällt.
  DELETE FROM public.escrow_transactions WHERE gig_id = p_gig_id AND state = 'pending';

  RETURN v_gig;
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_to_booking(UUID, BOOLEAN) TO authenticated;

-- ------------------------------------------------------------
-- Pro Helfer und Auftrag nur EIN laufendes Gebot.
-- Vorher konnte ein Helfer nach einem Gegenangebot erneut bieten: Es entstanden mehrere offene Gebote,
-- das alte "Gegenangebot" blieb stehen und das neue Gebot tauchte beim Auftraggeber zusätzlich auf.
-- Bestehende Dubletten: nur das neueste laufende Gebot bleibt, ältere gelten als zurückgezogen.
-- ------------------------------------------------------------
UPDATE public.negotiations n
  SET status = 'withdrawn'
  WHERE n.status IN ('pending', 'countered')
    AND EXISTS (
      SELECT 1 FROM public.negotiations m
      WHERE m.gig_id = n.gig_id
        AND m.helper_id = n.helper_id
        AND m.status IN ('pending', 'countered')
        AND (m.created_at > n.created_at OR (m.created_at = n.created_at AND m.id > n.id))
    );

CREATE UNIQUE INDEX IF NOT EXISTS negotiations_one_active_per_helper
  ON public.negotiations (gig_id, helper_id)
  WHERE status IN ('pending', 'countered');

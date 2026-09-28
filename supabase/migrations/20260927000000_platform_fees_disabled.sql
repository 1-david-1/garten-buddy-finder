-- Die App bleibt vorerst 100% kostenlos - kein Zahlungsanbieter
-- angebunden. Bisher rechneten 4 Funktionen trotzdem fest mit 5%
-- Kunden- und 10% Helfer-Gebühr (siehe ROUND(... * 0.05)/(... * 0.10)
-- in 20260801000000_service_listings.sql und
-- 20260826000000_booking_requests.sql), obwohl nirgends echtes Geld
-- bewegt wird. Diese Migration setzt beide Sätze auf 0, ohne die
-- ursprünglichen (bereits angewendeten) Migrationsdateien zu editieren.
--
-- Zum Wiedereinschalten: die vier `v_customer_fee`/`v_helper_fee`
-- Zeilen unten wieder auf `ROUND(... * 0.05)` / `ROUND(... * 0.10)`
-- setzen (siehe Original in den beiden oben genannten Dateien) und
-- src/lib/platform-fees.ts (PLATFORM_FEES_ENABLED) auf true stellen.

CREATE OR REPLACE FUNCTION public.purchase_service_listing(
  p_listing_id UUID,
  p_buy_now BOOLEAN DEFAULT false
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
BEGIN
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

  IF p_buy_now THEN
    IF v_listing.listing_type <> 'auction' OR v_listing.buy_now_price_cents IS NULL THEN
      RAISE EXCEPTION 'buy_now_not_available';
    END IF;
    v_price := v_listing.buy_now_price_cents;
  ELSE
    IF v_listing.listing_type = 'auction' THEN
      RAISE EXCEPTION 'auctions_require_bid_or_buy_now';
    END IF;
    IF v_listing.price_cents IS NULL THEN
      RAISE EXCEPTION 'listing_has_no_price';
    END IF;
    v_price := v_listing.price_cents;
  END IF;

  -- Vorerst 0% Gebühr - siehe Kommentar am Dateianfang.
  v_customer_fee := 0;
  v_helper_fee := 0;

  INSERT INTO public.gigs (
    customer_id, title, description, service_type, budget_cents,
    address, postal_code, scheduled_at, duration_minutes, status,
    assigned_helper_id, allowed_age_groups
  ) VALUES (
    auth.uid(),
    v_listing.title,
    v_listing.description,
    v_listing.service_type,
    v_price,
    v_listing.location,
    v_listing.postal_code,
    NULL,
    60,
    'pending_helper',
    v_listing.helper_id,
    ARRAY['helper_youth', 'helper_adult', 'helper_pro']
  ) RETURNING * INTO v_gig;

  INSERT INTO public.escrow_transactions (
    gig_id, customer_id, helper_id, bid_cents, customer_fee_cents, helper_fee_cents, state
  ) VALUES (
    v_gig.id, auth.uid(), v_listing.helper_id, v_price, v_customer_fee, v_helper_fee, 'pending'
  );

  UPDATE public.service_listings SET status = 'sold' WHERE id = p_listing_id;

  RETURN v_gig;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_auction_listing(
  p_listing_id UUID
) RETURNS TABLE (ended BOOLEAN, winner_id UUID, winning_bid_cents INT, reserve_not_met BOOLEAN, gig_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing public.service_listings%ROWTYPE;
  v_bid public.auction_bids%ROWTYPE;
  v_gig public.gigs%ROWTYPE;
  v_customer_fee INT;
  v_helper_fee INT;
BEGIN
  SELECT * INTO v_listing FROM public.service_listings WHERE id = p_listing_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'listing_not_found';
  END IF;
  IF v_listing.listing_type <> 'auction' THEN
    RAISE EXCEPTION 'not_an_auction';
  END IF;
  IF v_listing.status <> 'active' THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::INT, false, NULL::UUID;
    RETURN;
  END IF;
  IF v_listing.auction_end_time IS NULL OR v_listing.auction_end_time > now() THEN
    RAISE EXCEPTION 'auction_not_ended_yet';
  END IF;

  SELECT * INTO v_bid FROM public.auction_bids
  WHERE listing_id = p_listing_id
  ORDER BY amount_cents DESC, created_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    UPDATE public.service_listings SET status = 'expired' WHERE id = p_listing_id;
    RETURN QUERY SELECT true, NULL::UUID, NULL::INT, false, NULL::UUID;
    RETURN;
  END IF;

  IF v_listing.reserve_price_cents IS NOT NULL AND v_bid.amount_cents < v_listing.reserve_price_cents THEN
    UPDATE public.service_listings SET status = 'expired' WHERE id = p_listing_id;
    RETURN QUERY SELECT true, v_bid.bidder_id, v_bid.amount_cents, true, NULL::UUID;
    RETURN;
  END IF;

  -- Vorerst 0% Gebühr - siehe Kommentar am Dateianfang.
  v_customer_fee := 0;
  v_helper_fee := 0;

  INSERT INTO public.gigs (
    customer_id, title, description, service_type, budget_cents,
    address, postal_code, scheduled_at, duration_minutes, status,
    assigned_helper_id, allowed_age_groups
  ) VALUES (
    v_bid.bidder_id,
    v_listing.title,
    v_listing.description,
    v_listing.service_type,
    v_bid.amount_cents,
    v_listing.location,
    v_listing.postal_code,
    NULL,
    60,
    'pending_helper',
    v_listing.helper_id,
    ARRAY['helper_youth', 'helper_adult', 'helper_pro']
  ) RETURNING * INTO v_gig;

  INSERT INTO public.escrow_transactions (
    gig_id, customer_id, helper_id, bid_cents, customer_fee_cents, helper_fee_cents, state
  ) VALUES (
    v_gig.id, v_bid.bidder_id, v_listing.helper_id, v_bid.amount_cents, v_customer_fee, v_helper_fee, 'pending'
  );

  UPDATE public.service_listings SET status = 'sold' WHERE id = p_listing_id;

  RETURN QUERY SELECT true, v_bid.bidder_id, v_bid.amount_cents, false, v_gig.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_service_offer(
  p_offer_id UUID
) RETURNS public.gigs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer public.offers%ROWTYPE;
  v_listing public.service_listings%ROWTYPE;
  v_gig public.gigs%ROWTYPE;
  v_customer_fee INT;
  v_helper_fee INT;
BEGIN
  SELECT * INTO v_offer FROM public.offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'offer_not_found';
  END IF;
  IF v_offer.status <> 'pending' THEN
    RAISE EXCEPTION 'offer_not_pending';
  END IF;

  SELECT * INTO v_listing FROM public.service_listings WHERE id = v_offer.listing_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'listing_not_found';
  END IF;
  IF v_listing.helper_id <> auth.uid() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF v_listing.status <> 'active' THEN
    RAISE EXCEPTION 'listing_not_active';
  END IF;

  -- Vorerst 0% Gebühr - siehe Kommentar am Dateianfang.
  v_customer_fee := 0;
  v_helper_fee := 0;

  INSERT INTO public.gigs (
    customer_id, title, description, service_type, budget_cents,
    address, postal_code, scheduled_at, duration_minutes, status,
    assigned_helper_id, allowed_age_groups
  ) VALUES (
    v_offer.offerer_id,
    v_listing.title,
    v_listing.description,
    v_listing.service_type,
    v_offer.amount_cents,
    v_listing.location,
    v_listing.postal_code,
    NULL,
    60,
    'pending_helper',
    v_listing.helper_id,
    ARRAY['helper_youth', 'helper_adult', 'helper_pro']
  ) RETURNING * INTO v_gig;

  INSERT INTO public.escrow_transactions (
    gig_id, customer_id, helper_id, bid_cents, customer_fee_cents, helper_fee_cents, state
  ) VALUES (
    v_gig.id, v_offer.offerer_id, v_listing.helper_id, v_offer.amount_cents, v_customer_fee, v_helper_fee, 'pending'
  );

  UPDATE public.offers SET status = 'accepted' WHERE id = p_offer_id;
  UPDATE public.offers SET status = 'rejected'
    WHERE listing_id = v_listing.id AND id <> p_offer_id AND status = 'pending';
  UPDATE public.service_listings SET status = 'sold' WHERE id = v_listing.id;

  RETURN v_gig;
END;
$$;

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
BEGIN
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

  -- Vorerst 0% Gebühr - siehe Kommentar am Dateianfang.
  v_customer_fee := 0;
  v_helper_fee := 0;

  IF p_scheduled_end IS NOT NULL THEN
    v_duration_minutes := EXTRACT(EPOCH FROM (p_scheduled_end - p_scheduled_at)) / 60;
    IF v_duration_minutes <= 0 THEN
      v_duration_minutes := 60;
    END IF;
  END IF;

  v_description := v_listing.description;
  IF p_message IS NOT NULL AND trim(p_message) <> '' THEN
    v_description := v_description || E'\n\n---\nNachricht des Kunden:\n' || p_message;
  END IF;

  INSERT INTO public.gigs (
    customer_id, title, description, service_type, budget_cents,
    address, postal_code, scheduled_at, duration_minutes, status,
    assigned_helper_id, allowed_age_groups
  ) VALUES (
    auth.uid(),
    v_listing.title,
    v_description,
    v_listing.service_type,
    v_price,
    v_listing.location,
    v_listing.postal_code,
    p_scheduled_at,
    v_duration_minutes,
    'pending_helper',
    v_listing.helper_id,
    ARRAY['helper_youth', 'helper_adult', 'helper_pro']
  ) RETURNING * INTO v_gig;

  INSERT INTO public.escrow_transactions (
    gig_id, customer_id, helper_id, bid_cents, customer_fee_cents, helper_fee_cents, state
  ) VALUES (
    v_gig.id, auth.uid(), v_listing.helper_id, v_price, v_customer_fee, v_helper_fee, 'pending'
  );

  UPDATE public.service_listings SET status = 'sold' WHERE id = p_listing_id;

  RETURN v_gig;
END;
$$;

-- Migration: Booking Requests
-- Description: Adds 'pending_helper' status and functions for the booking flow

ALTER TYPE public.gig_status ADD VALUE IF NOT EXISTS 'pending_helper';

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

  v_customer_fee := ROUND(v_price * 0.05);
  v_helper_fee := ROUND(v_price * 0.10);

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
BEGIN
  SELECT * INTO v_gig FROM public.gigs WHERE id = p_gig_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'gig_not_found';
  END IF;

  IF v_gig.assigned_helper_id <> auth.uid() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF v_gig.status <> 'pending_helper' THEN
    RAISE EXCEPTION 'gig_not_pending_helper';
  END IF;

  IF p_accept THEN
    UPDATE public.gigs
    SET status = 'assigned',
        updated_at = now()
    WHERE id = p_gig_id
    RETURNING * INTO v_gig;
  ELSE
    UPDATE public.gigs
    SET status = 'open',
        assigned_helper_id = NULL,
        updated_at = now()
    WHERE id = p_gig_id
    RETURNING * INTO v_gig;

    -- Versuche, das zugehörige Service-Listing wieder auf 'active' zu setzen
    UPDATE public.service_listings 
    SET status = 'active',
        updated_at = now()
    WHERE helper_id = auth.uid()
      AND title = v_gig.title
      AND status = 'sold';
  END IF;

  RETURN v_gig;
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_to_booking(UUID, BOOLEAN) TO authenticated;

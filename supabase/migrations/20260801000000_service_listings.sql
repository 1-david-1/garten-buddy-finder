-- Service-Marktplatz: Helfer können Leistungen als Festpreis-, Auktions- oder
-- Verhandlungs-Angebot einstellen. Kunden können direkt kaufen, bieten, oder
-- ein Angebot machen. Ein erfolgreicher Abschluss erzeugt einen Gig +
-- Escrow-Transaktion über die bestehende Infrastruktur.

CREATE TYPE public.service_listing_status AS ENUM ('draft', 'active', 'sold', 'expired', 'cancelled');
CREATE TYPE public.listing_type AS ENUM ('fixed_price', 'auction', 'negotiable');

CREATE TABLE public.service_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  helper_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  service_type TEXT NOT NULL,
  listing_type public.listing_type NOT NULL DEFAULT 'fixed_price',
  price_cents INTEGER,
  start_price_cents INTEGER,
  current_price_cents INTEGER,
  reserve_price_cents INTEGER,
  buy_now_price_cents INTEGER,
  auction_end_time TIMESTAMPTZ,
  min_bid_increment_cents INTEGER DEFAULT 50,
  status public.service_listing_status NOT NULL DEFAULT 'draft',
  location TEXT,
  postal_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.auction_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.service_listings(id) ON DELETE CASCADE,
  bidder_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.service_listings(id) ON DELETE CASCADE,
  offerer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_service_listings_status ON public.service_listings (status);
CREATE INDEX idx_service_listings_helper_id ON public.service_listings (helper_id);
CREATE INDEX idx_auction_bids_listing_id ON public.auction_bids (listing_id);
CREATE INDEX idx_offers_listing_id ON public.offers (listing_id);

ALTER TABLE public.service_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auction_bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

-- service_listings: jeder sieht aktive Angebote, Helfer sehen zusätzlich ihre eigenen
-- (auch als Entwurf/verkauft/etc.). Nur der Helfer selbst darf sein Angebot anlegen/
-- ändern/löschen.
CREATE POLICY "Anyone can view active listings, owners see all their own"
  ON public.service_listings FOR SELECT
  USING (status = 'active' OR helper_id = auth.uid());

CREATE POLICY "Helpers create their own listings"
  ON public.service_listings FOR INSERT
  WITH CHECK (helper_id = auth.uid());

CREATE POLICY "Helpers update their own listings"
  ON public.service_listings FOR UPDATE
  USING (helper_id = auth.uid());

CREATE POLICY "Helpers delete their own listings"
  ON public.service_listings FOR DELETE
  USING (helper_id = auth.uid());

-- auction_bids: Gebotshistorie ist für alle einsehbar (wie bei eBay). Das Schreiben
-- läuft ausschließlich über die place_auction_bid()-Funktion unten, nicht über
-- direktes Insert durch den Client.
CREATE POLICY "Anyone can view bid history"
  ON public.auction_bids FOR SELECT
  USING (true);

-- offers: sichtbar für den Bietenden selbst und für den Verkäufer des betroffenen
-- Angebots. Anlegen darf jeder für sich selbst. Ändern (Gegenangebot/Ablehnen/
-- Zurückziehen) dürfen sowohl der Bietende als auch der Verkäufer.
CREATE POLICY "View own offers or offers on own listings"
  ON public.offers FOR SELECT
  USING (
    offerer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.service_listings WHERE id = offers.listing_id AND helper_id = auth.uid())
  );

CREATE POLICY "Customers create their own offers"
  ON public.offers FOR INSERT
  WITH CHECK (offerer_id = auth.uid());

CREATE POLICY "Offerers update their own offers"
  ON public.offers FOR UPDATE
  USING (offerer_id = auth.uid());

CREATE POLICY "Sellers update offers on their listings"
  ON public.offers FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.service_listings WHERE id = offers.listing_id AND helper_id = auth.uid()));

-- GRANTs: RLS-Policies wirken nur innerhalb dessen, was per GRANT überhaupt erlaubt
-- ist. Ohne diese Zeilen würde selbst der Eigentümer beim Anlegen/Ändern seines
-- eigenen Angebots ein "permission denied" bekommen.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_listings TO authenticated;
GRANT SELECT ON public.auction_bids TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.offers TO authenticated;

COMMENT ON TABLE public.service_listings IS
  'Leistungsangebote von Helfern im eBay-artigen Marktplatz (Festpreis, Auktion, verhandelbar).';
COMMENT ON TABLE public.auction_bids IS 'Gebote auf Auktions-Angebote.';
COMMENT ON TABLE public.offers IS 'Angebote von Kunden auf verhandelbare Listings.';

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER Funktionen für Vorgänge, bei denen ein Nutzer einen
-- Datensatz im Namen eines *anderen* Nutzers anlegen muss (z.B. der Bieter
-- gewinnt eine Auktion -> ein Gig wird für den Bieter als Kunde angelegt,
-- mit dem Verkäufer als zugewiesenem Helfer). Das ist mit reinen RLS-Policies
-- nicht sicher abbildbar, ohne die Policies gefährlich zu lockern. Jede
-- Funktion validiert alle Geschäftsregeln erneut selbst und leitet den
-- aufrufenden Nutzer ausschließlich aus auth.uid() ab.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.place_auction_bid(
  p_listing_id UUID,
  p_amount_cents INT
) RETURNS public.auction_bids
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing public.service_listings%ROWTYPE;
  v_min_bid INT;
  v_bid public.auction_bids%ROWTYPE;
BEGIN
  SELECT * INTO v_listing FROM public.service_listings WHERE id = p_listing_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'listing_not_found';
  END IF;
  IF v_listing.listing_type <> 'auction' THEN
    RAISE EXCEPTION 'not_an_auction';
  END IF;
  IF v_listing.status <> 'active' THEN
    RAISE EXCEPTION 'auction_not_active';
  END IF;
  IF v_listing.auction_end_time IS NOT NULL AND v_listing.auction_end_time < now() THEN
    RAISE EXCEPTION 'auction_ended';
  END IF;
  IF v_listing.helper_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot_bid_own_listing';
  END IF;

  v_min_bid := COALESCE(v_listing.current_price_cents, v_listing.start_price_cents, 0)
               + COALESCE(v_listing.min_bid_increment_cents, 50);
  IF p_amount_cents < v_min_bid THEN
    RAISE EXCEPTION 'bid_too_low:%', v_min_bid;
  END IF;

  INSERT INTO public.auction_bids (listing_id, bidder_id, amount_cents)
  VALUES (p_listing_id, auth.uid(), p_amount_cents)
  RETURNING * INTO v_bid;

  UPDATE public.service_listings
  SET current_price_cents = p_amount_cents
  WHERE id = p_listing_id;

  RETURN v_bid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.place_auction_bid(UUID, INT) TO authenticated;

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

  v_customer_fee := ROUND(v_price * 0.05);
  v_helper_fee := ROUND(v_price * 0.10);

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

GRANT EXECUTE ON FUNCTION public.purchase_service_listing(UUID, BOOLEAN) TO authenticated;

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

  v_customer_fee := ROUND(v_bid.amount_cents * 0.05);
  v_helper_fee := ROUND(v_bid.amount_cents * 0.10);

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

GRANT EXECUTE ON FUNCTION public.end_auction_listing(UUID) TO authenticated;

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

  v_customer_fee := ROUND(v_offer.amount_cents * 0.05);
  v_helper_fee := ROUND(v_offer.amount_cents * 0.10);

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

GRANT EXECUTE ON FUNCTION public.accept_service_offer(UUID) TO authenticated;

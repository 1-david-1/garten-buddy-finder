-- ============================================================
-- Eltern-Freigabe für Angebote Jugendlicher im Marktplatz
--
-- Alles, was mit Arbeit zu tun hat, muss mit den Eltern abgesprochen sein:
--   * eigenes Angebot einstellen (service_listings)  -> kind = 'listing'
--   * Gebot auf einen Auftrag abgeben (negotiations) -> kind = 'bid'
-- Die Eltern sehen die Angaben im Eltern-Konto und geben jedes Angebot / jedes Gebot einzeln frei.
-- Erst danach wird das Angebot veröffentlicht bzw. das Gebot abgegeben.
-- Die Regeln gelten in der Datenbank (nicht nur in der App); Service-Role und Admins sind ausgenommen.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.youth_offer_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('listing', 'bid')),
  listing_id UUID REFERENCES public.service_listings(id) ON DELETE CASCADE,
  gig_id UUID REFERENCES public.gigs(id) ON DELETE CASCADE,
  -- Gebot: genau das, was die Eltern gesehen haben
  bid_cents INTEGER,
  message TEXT,
  -- Stand der Angaben zum Zeitpunkt der Anfrage (Änderungserkennung)
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'declined', 'expired', 'cancelled')),
  expires_at TIMESTAMPTZ,
  decided_at TIMESTAMPTZ,
  decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (kind = 'listing' AND listing_id IS NOT NULL)
    OR (kind = 'bid' AND gig_id IS NOT NULL AND bid_cents IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS youth_offer_approvals_child_idx
  ON public.youth_offer_approvals (child_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS youth_offer_approvals_listing_idx
  ON public.youth_offer_approvals (listing_id, status) WHERE kind = 'listing';
-- Pro Kind und Auftrag höchstens ein offenes Gebot, pro Angebot höchstens eine offene Anfrage.
CREATE UNIQUE INDEX IF NOT EXISTS youth_offer_approvals_one_pending_bid
  ON public.youth_offer_approvals (child_id, gig_id) WHERE kind = 'bid' AND status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS youth_offer_approvals_one_pending_listing
  ON public.youth_offer_approvals (listing_id) WHERE kind = 'listing' AND status = 'pending';

GRANT SELECT ON public.youth_offer_approvals TO authenticated;
GRANT ALL ON public.youth_offer_approvals TO service_role;
ALTER TABLE public.youth_offer_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Child reads own offer approvals" ON public.youth_offer_approvals
  FOR SELECT TO authenticated USING (auth.uid() = child_id);
CREATE POLICY "Guardian reads offer approvals of linked child" ON public.youth_offer_approvals
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.guardian_links g
      WHERE g.child_id = youth_offer_approvals.child_id
        AND g.guardian_user_id = auth.uid()
        AND g.status = 'active'
    )
  );
CREATE POLICY "Admins read offer approvals" ON public.youth_offer_approvals
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------
-- 1. Angebote (service_listings): Veröffentlichen nur mit Freigabe der Eltern.
--    Wesentliche Änderung => Freigabe erlischt, aktives Angebot geht zurück in den Entwurf.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_youth_listing_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service-Role / direkte DB-Verbindung und Admins sind ausgenommen.
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF NOT public.has_role(NEW.helper_id, 'helper_youth') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND (
       OLD.title IS DISTINCT FROM NEW.title
       OR OLD.description IS DISTINCT FROM NEW.description
       OR OLD.service_type IS DISTINCT FROM NEW.service_type
       OR OLD.listing_type IS DISTINCT FROM NEW.listing_type
       OR OLD.price_cents IS DISTINCT FROM NEW.price_cents
       OR OLD.start_price_cents IS DISTINCT FROM NEW.start_price_cents
       OR OLD.reserve_price_cents IS DISTINCT FROM NEW.reserve_price_cents
       OR OLD.buy_now_price_cents IS DISTINCT FROM NEW.buy_now_price_cents
       OR OLD.auction_end_time IS DISTINCT FROM NEW.auction_end_time
       OR OLD.location IS DISTINCT FROM NEW.location
       OR OLD.postal_code IS DISTINCT FROM NEW.postal_code
       OR OLD.photos IS DISTINCT FROM NEW.photos
     ) THEN
    UPDATE public.youth_offer_approvals
      SET status = 'cancelled', decided_at = now()
      WHERE kind = 'listing' AND listing_id = NEW.id AND status IN ('pending', 'approved');
    IF NEW.status = 'active' THEN
      NEW.status := 'draft';
    END IF;
  END IF;

  IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active') THEN
    IF NOT public.has_guardian_consent(NEW.helper_id) THEN
      RAISE EXCEPTION 'Für Jugendliche ist zuerst die Zustimmung der Eltern zum Konto nötig.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.youth_offer_approvals a
      WHERE a.kind = 'listing'
        AND a.listing_id = NEW.id
        AND a.child_id = NEW.helper_id
        AND a.status = 'approved'
    ) THEN
      RAISE EXCEPTION 'Für Jugendliche ist die Freigabe der Eltern für dieses Angebot nötig.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_youth_listing_approval ON public.service_listings;
CREATE TRIGGER trg_enforce_youth_listing_approval
  BEFORE INSERT OR UPDATE ON public.service_listings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_youth_listing_approval();

-- ------------------------------------------------------------
-- 2. Gebote (negotiations): Jugendliche geben Gebote nur über die Eltern-Freigabe ab.
--    Direktes Anlegen durch das Jugendkonto ist gesperrt; die App legt das Gebot erst nach der
--    Freigabe serverseitig an (Service-Role).
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Helper creates own bid" ON public.negotiations;
CREATE POLICY "Helper creates own bid" ON public.negotiations FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = helper_id
    AND public.is_helper(auth.uid())
    AND NOT public.is_restricted(auth.uid(), 'jobs')
    AND (NOT public.verification_required() OR public.is_verified(auth.uid()))
    AND NOT public.users_blocked(
      auth.uid(),
      (SELECT g.customer_id FROM public.gigs g WHERE g.id = gig_id)
    )
    AND NOT public.has_role(auth.uid(), 'helper_youth')
  );

-- Ein Jugendlicher kann ein freigegebenes Gebot nicht nachträglich selbst ändern (Preis/Text).
CREATE OR REPLACE FUNCTION public.protect_youth_bid_content()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF auth.uid() = NEW.helper_id AND public.has_role(NEW.helper_id, 'helper_youth') AND (
       OLD.bid_cents IS DISTINCT FROM NEW.bid_cents
       OR OLD.message IS DISTINCT FROM NEW.message
     ) THEN
    RAISE EXCEPTION 'Ein Gebot eines Jugendlichen kann nicht geändert werden. Bitte ein neues Gebot mit Freigabe der Eltern abgeben.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_youth_bid_content ON public.negotiations;
CREATE TRIGGER trg_protect_youth_bid_content
  BEFORE UPDATE ON public.negotiations
  FOR EACH ROW EXECUTE FUNCTION public.protect_youth_bid_content();

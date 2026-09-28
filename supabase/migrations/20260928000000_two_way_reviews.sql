-- Zweiseitige Bewertungen: bisher konnte nur der Kunde den Helfer
-- bewerten (die alte UNIQUE(gig_id) erlaubte ohnehin nur eine einzige
-- Bewertung pro Auftrag). Jetzt kann auch der Helfer den Kunden
-- bewerten, über eine zweite Zeile mit anderer "direction".

ALTER TABLE public.reviews
  ADD COLUMN direction TEXT NOT NULL DEFAULT 'customer_to_helper'
    CHECK (direction IN ('customer_to_helper', 'helper_to_customer'));

ALTER TABLE public.reviews DROP CONSTRAINT reviews_gig_id_key;
ALTER TABLE public.reviews ADD CONSTRAINT reviews_gig_id_direction_key UNIQUE (gig_id, direction);

-- Bestehende Insert-Policy um die Richtung ergänzen, damit ein Kunde
-- sich nicht selbst als "helper_to_customer" eintragen kann.
DROP POLICY "Customer reviews own completed gig" ON public.reviews;
CREATE POLICY "Customer reviews own completed gig" ON public.reviews FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = customer_id
    AND direction = 'customer_to_helper'
    AND EXISTS (
      SELECT 1 FROM public.gigs g
      WHERE g.id = gig_id AND g.customer_id = auth.uid() AND g.assigned_helper_id = helper_id AND g.status = 'completed'
    )
  );

CREATE POLICY "Helper reviews own completed gig's customer" ON public.reviews FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = helper_id
    AND direction = 'helper_to_customer'
    AND EXISTS (
      SELECT 1 FROM public.gigs g
      WHERE g.id = gig_id AND g.assigned_helper_id = auth.uid() AND g.customer_id = customer_id AND g.status = 'completed'
    )
  );

-- Bugfix, unabhängig von den zwei Richtungen: es gab nie ein UPDATE-Grant
-- oder eine UPDATE-Policy für reviews. updateReview() in
-- reviews.functions.ts ist dadurch seit jeher mit "permission denied for
-- table reviews" fehlgeschlagen - eine Bewertung ließ sich nie nachträglich
-- bearbeiten, obwohl die UI (my-gigs.tsx) das anbietet.
GRANT UPDATE ON public.reviews TO authenticated;
CREATE POLICY "Author can update own review" ON public.reviews FOR UPDATE TO authenticated
  USING (auth.uid() = customer_id OR auth.uid() = helper_id)
  WITH CHECK (auth.uid() = customer_id OR auth.uid() = helper_id);

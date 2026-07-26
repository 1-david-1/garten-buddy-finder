-- Reviews (customer rates helper 1-5 stars after a completed gig)
CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gig_id UUID NOT NULL REFERENCES public.gigs(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  helper_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (gig_id)
);
GRANT SELECT, INSERT ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Ratings are public within the marketplace (helper trust scores are shown to
-- other customers browsing the directory), same pattern as public.profiles.
CREATE POLICY "Any authenticated user can view reviews" ON public.reviews FOR SELECT TO authenticated USING (true);
CREATE POLICY "Customer reviews own completed gig" ON public.reviews FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = customer_id
    AND EXISTS (
      SELECT 1 FROM public.gigs g
      WHERE g.id = gig_id AND g.customer_id = auth.uid() AND g.assigned_helper_id = helper_id AND g.status = 'completed'
    )
  );

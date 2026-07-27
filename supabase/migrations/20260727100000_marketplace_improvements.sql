-- ============================================================
-- Marketplace Verbesserungen
-- Hinzufügen von hourly_rate_cents und categories zum Profil
-- sowie hilfreiche Indexes für Performance
-- ============================================================

-- Stundenlohn des Helfers (in Cent, optional)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS hourly_rate_cents INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS categories TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS profile_image_url TEXT DEFAULT NULL;

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_gigs_status ON public.gigs (status);
CREATE INDEX IF NOT EXISTS idx_gigs_customer_id ON public.gigs (customer_id);
CREATE INDEX IF NOT EXISTS idx_gigs_postal_code ON public.gigs (postal_code);
CREATE INDEX IF NOT EXISTS idx_gigs_assigned_helper ON public.gigs (assigned_helper_id);
CREATE INDEX IF NOT EXISTS idx_negotiations_gig_id ON public.negotiations (gig_id);
CREATE INDEX IF NOT EXISTS idx_negotiations_helper_id ON public.negotiations (helper_id);
CREATE INDEX IF NOT EXISTS idx_reviews_helper_id ON public.reviews (helper_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles (user_id);

-- Helfer dürfen ihr eigenes Profil öffentlich machen (hourly_rate_cents etc.)
-- Bestehende UPDATE-Policy auf profiles deckt das schon ab.

-- Hilfsfunktion: Gibt alle offenen Gigs zurück die für einen Helfer sichtbar sind
-- (bereits durch RLS abgesichert, aber als Utility-Function trotzdem nützlich)
CREATE OR REPLACE FUNCTION public.get_open_gigs_for_helper(_helper_id UUID)
RETURNS SETOF public.gigs
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT g.*
  FROM public.gigs g
  JOIN public.user_roles ur ON ur.user_id = _helper_id
  WHERE g.status IN ('open', 'negotiating')
    AND ur.role::TEXT = ANY(g.allowed_age_groups)
  ORDER BY g.created_at DESC;
$$;

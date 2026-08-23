
-- Enums
CREATE TYPE public.app_role AS ENUM ('customer', 'helper_youth', 'helper_adult', 'helper_pro');
CREATE TYPE public.gig_status AS ENUM ('draft','open','negotiating','assigned','in_progress','completed','cancelled');
CREATE TYPE public.negotiation_status AS ENUM ('pending','countered','accepted','declined','withdrawn');
CREATE TYPE public.escrow_state AS ENUM ('pending','held','releasing','paid_out','disputed');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  city TEXT,
  postal_code TEXT,
  birthdate DATE,
  language TEXT NOT NULL DEFAULT 'de',
  trust_score INT NOT NULL DEFAULT 50,
  tax_id TEXT,
  guardian_email TEXT,
  business_name TEXT,
  ust_id TEXT,
  verified_at TIMESTAMPTZ,
  available_today BOOLEAN NOT NULL DEFAULT false,
  bio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Any authenticated user can view profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- User roles (separate table)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- has_role security definer
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_helper(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('helper_youth','helper_adult','helper_pro'));
$$;

-- updated_at helper
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- New user trigger to auto-create profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Gigs
CREATE TABLE public.gigs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  service_type TEXT NOT NULL,
  budget_cents INT NOT NULL,
  address TEXT,
  postal_code TEXT,
  scheduled_at TIMESTAMPTZ,
  duration_minutes INT NOT NULL DEFAULT 60,
  status public.gig_status NOT NULL DEFAULT 'open',
  exclusive_until TIMESTAMPTZ,
  assigned_helper_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  allowed_age_groups TEXT[] NOT NULL DEFAULT ARRAY['helper_youth','helper_adult','helper_pro'],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gigs TO authenticated;
GRANT ALL ON public.gigs TO service_role;
ALTER TABLE public.gigs ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_gigs_updated_at BEFORE UPDATE ON public.gigs FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE POLICY "Customer manages own gigs" ON public.gigs FOR ALL TO authenticated
  USING (auth.uid() = customer_id) WITH CHECK (auth.uid() = customer_id);
CREATE POLICY "Helpers can view open gigs" ON public.gigs FOR SELECT TO authenticated
  USING (public.is_helper(auth.uid()) AND status IN ('open','negotiating','assigned','in_progress'));
CREATE POLICY "Assigned helper can view gig" ON public.gigs FOR SELECT TO authenticated
  USING (assigned_helper_id = auth.uid());

-- Favorites (Garden Crew)
CREATE TABLE public.favorites (
  customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  helper_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, helper_id)
);
GRANT SELECT, INSERT, DELETE ON public.favorites TO authenticated;
GRANT ALL ON public.favorites TO service_role;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customer manages own favorites" ON public.favorites FOR ALL TO authenticated
  USING (auth.uid() = customer_id) WITH CHECK (auth.uid() = customer_id);
CREATE POLICY "Helper can see who favorited them" ON public.favorites FOR SELECT TO authenticated
  USING (auth.uid() = helper_id);

-- Negotiations
CREATE TABLE public.negotiations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gig_id UUID NOT NULL REFERENCES public.gigs(id) ON DELETE CASCADE,
  helper_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bid_cents INT NOT NULL,
  counter_bid_cents INT,
  message TEXT,
  status public.negotiation_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.negotiations TO authenticated;
GRANT ALL ON public.negotiations TO service_role;
ALTER TABLE public.negotiations ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_neg_updated_at BEFORE UPDATE ON public.negotiations FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE POLICY "Helper sees own negotiations" ON public.negotiations FOR SELECT TO authenticated
  USING (auth.uid() = helper_id);
CREATE POLICY "Customer sees negotiations on own gigs" ON public.negotiations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.gigs g WHERE g.id = gig_id AND g.customer_id = auth.uid()));
CREATE POLICY "Helper creates own bid" ON public.negotiations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = helper_id AND public.is_helper(auth.uid()));
CREATE POLICY "Helper updates own bid" ON public.negotiations FOR UPDATE TO authenticated
  USING (auth.uid() = helper_id) WITH CHECK (auth.uid() = helper_id);
CREATE POLICY "Customer updates negotiations on own gigs" ON public.negotiations FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.gigs g WHERE g.id = gig_id AND g.customer_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.gigs g WHERE g.id = gig_id AND g.customer_id = auth.uid()));

-- Escrow
CREATE TABLE public.escrow_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gig_id UUID NOT NULL REFERENCES public.gigs(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  helper_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bid_cents INT NOT NULL,
  customer_fee_cents INT NOT NULL,
  helper_fee_cents INT NOT NULL,
  state public.escrow_state NOT NULL DEFAULT 'pending',
  held_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  paid_out_at TIMESTAMPTZ,
  disputed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.escrow_transactions TO authenticated;
GRANT ALL ON public.escrow_transactions TO service_role;
ALTER TABLE public.escrow_transactions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_escrow_updated_at BEFORE UPDATE ON public.escrow_transactions FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE POLICY "Participants read escrow" ON public.escrow_transactions FOR SELECT TO authenticated
  USING (auth.uid() = customer_id OR auth.uid() = helper_id);
CREATE POLICY "Participants insert escrow" ON public.escrow_transactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = customer_id OR auth.uid() = helper_id);
CREATE POLICY "Participants update escrow" ON public.escrow_transactions FOR UPDATE TO authenticated
  USING (auth.uid() = customer_id OR auth.uid() = helper_id)
  WITH CHECK (auth.uid() = customer_id OR auth.uid() = helper_id);

-- Earnings tracker (PStTG)
CREATE TABLE public.earnings_tracker (
  helper_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year INT NOT NULL,
  tx_count INT NOT NULL DEFAULT 0,
  gross_cents INT NOT NULL DEFAULT 0,
  payouts_locked BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (helper_id, year)
);
GRANT SELECT, INSERT, UPDATE ON public.earnings_tracker TO authenticated;
GRANT ALL ON public.earnings_tracker TO service_role;
ALTER TABLE public.earnings_tracker ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_earn_updated_at BEFORE UPDATE ON public.earnings_tracker FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE POLICY "Helper reads own earnings" ON public.earnings_tracker FOR SELECT TO authenticated
  USING (auth.uid() = helper_id);
CREATE POLICY "Helper writes own earnings" ON public.earnings_tracker FOR ALL TO authenticated
  USING (auth.uid() = helper_id) WITH CHECK (auth.uid() = helper_id);

-- Invoices
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escrow_id UUID NOT NULL UNIQUE REFERENCES public.escrow_transactions(id) ON DELETE CASCADE,
  gig_id UUID NOT NULL REFERENCES public.gigs(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  helper_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  labor_cents INT NOT NULL,
  material_cents INT NOT NULL DEFAULT 0,
  total_cents INT NOT NULL,
  invoice_number TEXT NOT NULL UNIQUE,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  para_35a_notice BOOLEAN NOT NULL DEFAULT true
);
GRANT SELECT, INSERT ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants read invoice" ON public.invoices FOR SELECT TO authenticated
  USING (auth.uid() = customer_id OR auth.uid() = helper_id);
CREATE POLICY "Participants insert invoice" ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = customer_id OR auth.uid() = helper_id);

-- profiles has "Any authenticated user can view profiles" (needed so the public
-- helper directory works). That means birthdate, guardian_email (a minor's
-- parent contact), and tax_id (Steuer-ID) were readable by every other signed-in
-- user on the platform. Move them into a table only the owner can read.

CREATE TABLE public.profile_private (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  birthdate DATE,
  guardian_email TEXT,
  tax_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profile_private TO authenticated;
GRANT ALL ON public.profile_private TO service_role;
ALTER TABLE public.profile_private ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads own private profile" ON public.profile_private FOR SELECT TO authenticated
  USING (auth.uid() = id);
CREATE POLICY "Owner inserts own private profile" ON public.profile_private FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);
CREATE POLICY "Owner updates own private profile" ON public.profile_private FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER trg_profile_private_updated_at BEFORE UPDATE ON public.profile_private
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Backfill any existing rows (no-op on a fresh database with no data yet)
INSERT INTO public.profile_private (id, birthdate, guardian_email, tax_id)
SELECT id, birthdate, guardian_email, tax_id FROM public.profiles
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.profiles DROP COLUMN birthdate;
ALTER TABLE public.profiles DROP COLUMN guardian_email;
ALTER TABLE public.profiles DROP COLUMN tax_id;

-- ============================================================
-- Verifizierung (auch für Minderjährige) + Schutz vertrauens-
-- relevanter Profilfelder
--
-- 1. profiles.verification_method: WIE wurde verifiziert?
--      'guardian_consent' = Eltern haben per E-Mail-Link zugestimmt (Jugendliche 13-17)
--      'admin_review'     = manuelle Prüfung durch das GreenMatch-Team (Erwachsene/Profis)
-- 2. verification_requests: offene/erledigte Anfragen. Geschrieben wird
--    ausschließlich serverseitig (Service-Role); Nutzer dürfen nur lesen.
-- 3. SICHERHEITSFIX: Die Policy "Users can update own profile" erlaubte bisher,
--    verified_at und trust_score selbst zu setzen (direkter PostgREST-Call).
--    Ein Trigger schützt diese Felder jetzt für normale Nutzer.
-- 4. Jugendliche Helfer dürfen erst bieten, wenn die Eltern zugestimmt haben.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verification_method TEXT
  CHECK (verification_method IN ('guardian_consent', 'admin_review'));

-- ------------------------------------------------------------
-- Anfragen
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('guardian_consent', 'identity')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'declined', 'expired', 'cancelled')),
  -- Nur für kind = 'guardian_consent': an wen ging die Mail, und wie lautet der
  -- SHA-256-Hash des Links (der Klartext-Token steht nie in der Datenbank).
  guardian_email TEXT,
  token_hash TEXT UNIQUE,
  -- Nur für kind = 'identity': Hinweis des Nutzers an das Team (z.B. Gewerbeschein).
  note TEXT CHECK (note IS NULL OR char_length(note) <= 500),
  expires_at TIMESTAMPTZ,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS verification_requests_user_idx
  ON public.verification_requests (user_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS verification_requests_pending_idx
  ON public.verification_requests (status, kind) WHERE status = 'pending';

GRANT SELECT ON public.verification_requests TO authenticated;
GRANT ALL ON public.verification_requests TO service_role;
ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own verification requests" ON public.verification_requests
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins read all verification requests" ON public.verification_requests
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------
-- Vertrauensfelder vor Selbstmanipulation schützen
-- auth.uid() ist NULL für Service-Role / direkte DB-Verbindung (= vertrauenswürdig).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_profile_trust_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.verified_at := NULL;
    NEW.verification_method := NULL;
    NEW.trust_score := 50;
  ELSE
    NEW.verified_at := OLD.verified_at;
    NEW.verification_method := OLD.verification_method;
    NEW.trust_score := OLD.trust_score;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_trust_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_trust_fields
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_trust_fields();

-- ------------------------------------------------------------
-- Jugendliche: Bieten erst nach Zustimmung der Eltern
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_guardian_consent(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id
      AND verified_at IS NOT NULL
      AND verification_method = 'guardian_consent'
  );
$$;

DROP POLICY IF EXISTS "Helper creates own bid" ON public.negotiations;
CREATE POLICY "Helper creates own bid" ON public.negotiations FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = helper_id
    AND public.is_helper(auth.uid())
    AND (
      NOT public.has_role(auth.uid(), 'helper_youth')
      OR public.has_guardian_consent(auth.uid())
    )
  );

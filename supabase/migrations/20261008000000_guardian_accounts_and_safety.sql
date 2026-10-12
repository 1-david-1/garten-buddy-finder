-- ============================================================
-- Kinderschutz, Teil 2
--
-- 1. guardian_links: Eltern-Zusatzkonto. Jede/r Jugendliche MUSS ein
--    verknüpftes Eltern-Konto haben (Einladung per E-Mail oder per Link).
-- 2. Melden / Blockieren / Sperren:
--      user_reports  - Meldungen (Nutzer, Eltern) für das GreenMatch-Team
--      user_blocks   - Blockierungen (auch durch Eltern für das Kind)
--      profiles.suspended_at - Konto gesperrt (Team)
--      guardian_links.paused_at - Konto des Kindes von den Eltern pausiert
-- 3. Durchsetzung in der Datenbank (greift bei jedem Weg, nicht nur in der App).
-- 4. Datenkorrektur: Eltern-E-Mail des Testkontos -> david@inbox-elevate.de
-- ============================================================

-- ------------------------------------------------------------
-- 1. Eltern-Konten
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.guardian_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  guardian_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- E-Mail, an die die Einladung ging (NULL = Kind hat "ohne E-Mail" gewählt)
  invited_email TEXT,
  -- SHA-256-Hash des Einladungslinks (Klartext steht nie in der Datenbank)
  token_hash TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited', 'active', 'revoked', 'cancelled')),
  -- Gesetzt = Eltern haben das Konto des Kindes pausiert (Sperre)
  paused_at TIMESTAMPTZ,
  last_sent_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pro Kind höchstens eine offene bzw. aktive Verknüpfung.
CREATE UNIQUE INDEX IF NOT EXISTS guardian_links_one_open_per_child
  ON public.guardian_links (child_id) WHERE status IN ('invited', 'active');
CREATE INDEX IF NOT EXISTS guardian_links_guardian_idx
  ON public.guardian_links (guardian_user_id) WHERE status = 'active';

GRANT SELECT ON public.guardian_links TO authenticated;
GRANT ALL ON public.guardian_links TO service_role;
ALTER TABLE public.guardian_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Child reads own guardian link" ON public.guardian_links
  FOR SELECT TO authenticated USING (auth.uid() = child_id);
CREATE POLICY "Guardian reads own links" ON public.guardian_links
  FOR SELECT TO authenticated USING (auth.uid() = guardian_user_id);
CREATE POLICY "Admins read all guardian links" ON public.guardian_links
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------
-- 2. Sperre / Blockierung / Meldungen
-- ------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.is_suspended(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND suspended_at IS NOT NULL);
$$;

CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
GRANT SELECT, INSERT, DELETE ON public.user_blocks TO authenticated;
GRANT ALL ON public.user_blocks TO service_role;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads own blocks" ON public.user_blocks
  FOR SELECT TO authenticated USING (auth.uid() = blocker_id);
CREATE POLICY "Owner creates own blocks" ON public.user_blocks
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = blocker_id);
CREATE POLICY "Owner removes own blocks" ON public.user_blocks
  FOR DELETE TO authenticated USING (auth.uid() = blocker_id);

-- true, wenn einer der beiden den anderen blockiert hat
CREATE OR REPLACE FUNCTION public.users_blocked(_a UUID, _b UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = _a AND blocked_id = _b) OR (blocker_id = _b AND blocked_id = _a)
  );
$$;

CREATE TABLE IF NOT EXISTS public.user_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gig_id UUID REFERENCES public.gigs(id) ON DELETE SET NULL,
  -- Gesetzt, wenn Eltern im Namen ihres Kindes melden
  context_child_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (reason IN (
    'inappropriate_behavior', 'unsafe_conditions', 'harassment', 'fraud', 'rules_violation', 'other'
  )),
  details TEXT CHECK (details IS NULL OR char_length(details) <= 1000),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolution_note TEXT CHECK (resolution_note IS NULL OR char_length(resolution_note) <= 500),
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (reporter_id <> reported_user_id)
);
CREATE INDEX IF NOT EXISTS user_reports_status_idx ON public.user_reports (status, created_at DESC);
GRANT SELECT, INSERT ON public.user_reports TO authenticated;
GRANT ALL ON public.user_reports TO service_role;
ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Reporter creates own report" ON public.user_reports
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "Reporter reads own reports" ON public.user_reports
  FOR SELECT TO authenticated USING (auth.uid() = reporter_id);
CREATE POLICY "Admins read all reports" ON public.user_reports
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------
-- Vertrauensfelder schützen: jetzt auch suspended_at
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
    NEW.suspended_at := NULL;
  ELSE
    NEW.verified_at := OLD.verified_at;
    NEW.verification_method := OLD.verification_method;
    NEW.trust_score := OLD.trust_score;
    NEW.suspended_at := OLD.suspended_at;
  END IF;
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- 3. Durchsetzung
-- ------------------------------------------------------------

-- Jugendliche dürfen nur aktiv sein, wenn: Unterlagen geprüft UND Eltern-Konto
-- verknüpft UND nicht von den Eltern pausiert UND nicht vom Team gesperrt.
CREATE OR REPLACE FUNCTION public.has_guardian_consent(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _user_id
      AND p.verified_at IS NOT NULL
      AND p.verification_method = 'guardian_consent'
      AND p.suspended_at IS NULL
  )
  AND EXISTS (
    SELECT 1 FROM public.guardian_links g
    WHERE g.child_id = _user_id
      AND g.status = 'active'
      AND g.guardian_user_id IS NOT NULL
      AND g.paused_at IS NULL
  );
$$;

-- Gebote: nicht gesperrt, nicht gegenüber einem blockierten Auftraggeber
DROP POLICY IF EXISTS "Helper creates own bid" ON public.negotiations;
CREATE POLICY "Helper creates own bid" ON public.negotiations FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = helper_id
    AND public.is_helper(auth.uid())
    AND NOT public.is_suspended(auth.uid())
    AND NOT public.users_blocked(
      auth.uid(),
      (SELECT g.customer_id FROM public.gigs g WHERE g.id = gig_id)
    )
    AND (
      NOT public.has_role(auth.uid(), 'helper_youth')
      OR public.has_guardian_consent(auth.uid())
    )
  );

-- Aufträge: Zuweisung/Annahme nicht bei Blockierung oder gesperrten Konten
CREATE OR REPLACE FUNCTION public.enforce_gig_safety_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF NEW.assigned_helper_id IS NULL
     OR NEW.status NOT IN ('pending_helper', 'assigned', 'in_progress') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT'
     OR OLD.assigned_helper_id IS DISTINCT FROM NEW.assigned_helper_id
     OR OLD.status IS DISTINCT FROM NEW.status THEN
    IF public.users_blocked(NEW.customer_id, NEW.assigned_helper_id) THEN
      RAISE EXCEPTION 'Dieser Auftrag ist nicht möglich: Einer von euch hat den anderen blockiert.';
    END IF;
    IF public.is_suspended(NEW.assigned_helper_id) THEN
      RAISE EXCEPTION 'Dieses Helfer-Konto ist derzeit gesperrt.';
    END IF;
    IF public.is_suspended(NEW.customer_id) THEN
      RAISE EXCEPTION 'Dein Konto ist derzeit gesperrt.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_gig_safety_rules ON public.gigs;
CREATE TRIGGER trg_enforce_gig_safety_rules
  BEFORE INSERT OR UPDATE ON public.gigs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_gig_safety_rules();

-- Nachrichten: nicht zwischen blockierten oder mit gesperrten Konten
CREATE OR REPLACE FUNCTION public.enforce_conversation_safety_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF public.users_blocked(NEW.participant_a, NEW.participant_b) THEN
    RAISE EXCEPTION 'Nachricht nicht möglich: Einer von euch hat den anderen blockiert.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_conversation_safety_rules ON public.conversations;
CREATE TRIGGER trg_enforce_conversation_safety_rules
  BEFORE INSERT ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_conversation_safety_rules();

CREATE OR REPLACE FUNCTION public.enforce_message_safety_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a UUID;
  v_b UUID;
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  SELECT participant_a, participant_b INTO v_a, v_b
  FROM public.conversations WHERE id = NEW.conversation_id;
  IF public.users_blocked(v_a, v_b) THEN
    RAISE EXCEPTION 'Nachricht nicht möglich: Einer von euch hat den anderen blockiert.';
  END IF;
  IF public.is_suspended(NEW.sender_id) THEN
    RAISE EXCEPTION 'Dein Konto ist derzeit gesperrt.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_message_safety_rules ON public.messages;
CREATE TRIGGER trg_enforce_message_safety_rules
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_message_safety_rules();

-- ------------------------------------------------------------
-- 4. Datenkorrektur Eltern-E-Mail (Testkonto)
-- Freigabe-Anfragen gingen an da***********@gmail.com (13 Zeichen vor dem @).
-- Ab jetzt: david@inbox-elevate.de. Offene Anfragen an die alte Adresse werden
-- verworfen, damit beim nächsten Annehmen eine neue Mail an die neue Adresse geht.
-- ------------------------------------------------------------
UPDATE public.verification_requests
  SET status = 'cancelled', decided_at = now()
  WHERE kind = 'job_approval'
    AND status = 'pending'
    AND lower(guardian_email) LIKE 'da%@gmail.com'
    AND length(split_part(guardian_email, '@', 1)) = 13;

UPDATE public.profile_private
  SET guardian_email = 'david@inbox-elevate.de'
  WHERE lower(guardian_email) LIKE 'da%@gmail.com'
    AND length(split_part(guardian_email, '@', 1)) = 13;

-- ------------------------------------------------------------
-- 5. Jugendschutz: nur leichte, geeignete, ungefährliche Tätigkeiten
-- Für Jugendliche sind Baumpflege, Heckenschnitt, Gartenumgestaltung und
-- Bewässerungsanlagen nicht vermittelbar. Rasenmähen und "Sonstiges" bleiben
-- möglich, werden aber von den Eltern pro Auftrag geprüft.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_youth_activity_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF NEW.assigned_helper_id IS NULL
     OR NEW.status NOT IN ('pending_helper', 'assigned', 'in_progress') THEN
    RETURN NEW;
  END IF;
  IF NOT public.has_role(NEW.assigned_helper_id, 'helper_youth') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT'
     OR OLD.assigned_helper_id IS DISTINCT FROM NEW.assigned_helper_id
     OR OLD.status IS DISTINCT FROM NEW.status
     OR OLD.service_type IS DISTINCT FROM NEW.service_type THEN
    IF NEW.service_type IN ('baumpflege', 'heckenschnitt', 'gartendesign', 'bewässerung') THEN
      RAISE EXCEPTION 'Diese Tätigkeit ist für Jugendliche nicht möglich: Es werden nur leichte, geeignete und ungefährliche Tätigkeiten vermittelt.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_youth_activity_rules ON public.gigs;
CREATE TRIGGER trg_enforce_youth_activity_rules
  BEFORE INSERT OR UPDATE ON public.gigs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_youth_activity_rules();

-- ============================================================
-- Kinderschutz, Runde 2 (baut auf 20261008000000 auf)
--
--  1. Verifizierungspflicht für ALLE Nutzer (Aufträge erstellen/veröffentlichen/annehmen,
--     Nachrichten, Bieten) - zentral abschaltbar über verification_required()
--  2. Eltern-Konto: ausdrückliche Einwilligung, verifiziertes Eltern-Konto, Beenden
--  3. Auftragsfreigabe: Einwilligungsprotokoll (job_consents), neue Freigabe bei Änderung
--  4. Sperrarten (account_restrictions)
--  5. Meldungen: neue Kategorien, Schweregrad, Bearbeitungsprotokoll
--  6. Kontaktdaten-Schutz in Chats mit Jugendlichen
--  7. Datensparsame Prüfergebnisse (verification_results)
--  8. Einwilligungen/Bestätigungen (user_consents, gig_safety_confirmations)
-- ============================================================

-- ------------------------------------------------------------
-- 1. Verifizierungspflicht
-- ------------------------------------------------------------
-- Zentraler Schalter. Zum vorübergehenden Abschalten (z. B. Testumgebung):
--   CREATE OR REPLACE FUNCTION public.verification_required() RETURNS boolean
--   LANGUAGE sql IMMUTABLE AS $$ SELECT false $$;
CREATE OR REPLACE FUNCTION public.verification_required()
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$ SELECT true $$;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS reverification_required_at TIMESTAMPTZ;

-- Vertrauensfelder bleiben für Nutzer unveränderlich (jetzt inkl. reverification_required_at)
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
    NEW.reverification_required_at := NULL;
  ELSE
    NEW.verified_at := OLD.verified_at;
    NEW.verification_method := OLD.verification_method;
    NEW.trust_score := OLD.trust_score;
    NEW.suspended_at := OLD.suspended_at;
    NEW.reverification_required_at := OLD.reverification_required_at;
  END IF;
  RETURN NEW;
END;
$$;

-- "Verifiziert" = Prüfung abgeschlossen, keine erneute Prüfung verlangt, nicht gesperrt.
CREATE OR REPLACE FUNCTION public.is_verified(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id
      AND verified_at IS NOT NULL
      AND reverification_required_at IS NULL
      AND suspended_at IS NULL
  );
$$;

-- ------------------------------------------------------------
-- 4. Sperrarten
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.account_restrictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'review_hold',        -- vorübergehende Sperre während einer Prüfung
    'job_ban',            -- Auftragssperre
    'communication_ban',  -- Kommunikationssperre
    'youth_profile',      -- Sperre des Minderjährigenprofils
    'account',            -- vollständige Kontosperre
    'permanent'           -- dauerhafte Sperre
  )),
  reason TEXT CHECK (reason IS NULL OR char_length(reason) <= 500),
  source TEXT NOT NULL DEFAULT 'team' CHECK (source IN ('team', 'auto')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lifted_at TIMESTAMPTZ,
  lifted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS account_restrictions_active_idx
  ON public.account_restrictions (user_id) WHERE lifted_at IS NULL;
GRANT SELECT ON public.account_restrictions TO authenticated;
GRANT ALL ON public.account_restrictions TO service_role;
ALTER TABLE public.account_restrictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User reads own restrictions" ON public.account_restrictions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins read all restrictions" ON public.account_restrictions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- scope: 'jobs' (erstellen, veröffentlichen, annehmen, bieten) oder 'communication' (Nachrichten, neue Kontakte)
CREATE OR REPLACE FUNCTION public.is_restricted(_user_id UUID, _scope TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND suspended_at IS NOT NULL)
    OR EXISTS (
      SELECT 1 FROM public.account_restrictions r
      WHERE r.user_id = _user_id
        AND r.lifted_at IS NULL
        AND (
          r.kind IN ('account', 'permanent', 'review_hold')
          OR (_scope = 'jobs' AND r.kind IN ('job_ban', 'youth_profile'))
          OR (_scope = 'communication' AND r.kind = 'communication_ban')
        )
    );
$$;

-- Bisherige Sperr-Prüfung berücksichtigt jetzt auch die neuen Sperrarten (Aufträge).
CREATE OR REPLACE FUNCTION public.is_suspended(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.is_restricted(_user_id, 'jobs'); $$;

-- ------------------------------------------------------------
-- 8. Einwilligungen / Bestätigungen
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'customer_child_protection_rules',  -- Auftraggeber: Kinderschutzregeln + verbotene Tätigkeiten
    'helper_safety_info'                -- Helfer: Sicherheitsinformationen abgeschlossen
  )),
  text_version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, text_version)
);
GRANT SELECT, INSERT ON public.user_consents TO authenticated;
GRANT ALL ON public.user_consents TO service_role;
ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads own consents" ON public.user_consents
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owner creates own consents" ON public.user_consents
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Bestätigung "Tätigkeit geeignet, leicht und ungefährlich" je Auftrag (Auftrags-ID + Zeitpunkt)
CREATE TABLE IF NOT EXISTS public.gig_safety_confirmations (
  gig_id UUID NOT NULL REFERENCES public.gigs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text_version TEXT NOT NULL,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (gig_id, user_id)
);
GRANT SELECT, INSERT ON public.gig_safety_confirmations TO authenticated;
GRANT ALL ON public.gig_safety_confirmations TO service_role;
ALTER TABLE public.gig_safety_confirmations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads own gig confirmations" ON public.gig_safety_confirmations
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owner creates own gig confirmations" ON public.gig_safety_confirmations
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.gigs g WHERE g.id = gig_id AND g.customer_id = auth.uid())
  );
CREATE POLICY "Admins read gig confirmations" ON public.gig_safety_confirmations
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------
-- 2. Eltern-Konto: ausdrückliche Einwilligung, Beenden
-- ------------------------------------------------------------
ALTER TABLE public.guardian_links
  ADD COLUMN IF NOT EXISTS consent_given_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consent_text_version TEXT,
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ended_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Jugendliche sind nur aktiv, wenn: Unterlagen geprüft, Sicherheitsinfos bestätigt,
-- Eltern-Konto verknüpft + vom Elternteil bestätigt (Einwilligung) + Eltern-Konto verifiziert,
-- nicht pausiert, nicht gesperrt/eingeschränkt, selbst verifiziert.
CREATE OR REPLACE FUNCTION public.has_guardian_consent(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.is_verified(_user_id)
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = _user_id AND p.verification_method = 'guardian_consent'
    )
    AND NOT public.is_restricted(_user_id, 'jobs')
    AND EXISTS (
      SELECT 1 FROM public.user_consents c
      WHERE c.user_id = _user_id AND c.kind = 'helper_safety_info'
    )
    AND EXISTS (
      SELECT 1 FROM public.guardian_links g
      WHERE g.child_id = _user_id
        AND g.status = 'active'
        AND g.guardian_user_id IS NOT NULL
        AND g.consent_given_at IS NOT NULL
        AND g.paused_at IS NULL
        AND public.is_verified(g.guardian_user_id)
    );
$$;

-- ------------------------------------------------------------
-- 3. Einwilligungsprotokoll je Auftrag
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guardian_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gig_id UUID NOT NULL REFERENCES public.gigs(id) ON DELETE CASCADE,
  request_id UUID REFERENCES public.verification_requests(id) ON DELETE SET NULL,
  result TEXT NOT NULL CHECK (result IN ('approved', 'declined', 'revoked')),
  consent_text_version TEXT NOT NULL,
  -- alle zum Zeitpunkt der Entscheidung angezeigten Auftragsdaten
  job_snapshot JSONB NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_consents_child_idx ON public.job_consents (child_id, decided_at DESC);
GRANT SELECT ON public.job_consents TO authenticated;
GRANT ALL ON public.job_consents TO service_role;
ALTER TABLE public.job_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Guardian reads own job consents" ON public.job_consents
  FOR SELECT TO authenticated USING (auth.uid() = guardian_user_id);
CREATE POLICY "Admins read job consents" ON public.job_consents
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Wesentliche Änderung an einem Auftrag eines Jugendlichen => Freigabe erlischt, neue Freigabe nötig.
-- (Ort, Datum/Beginn, Dauer/Ende, Auftraggeber, Art der Tätigkeit, Vergütung, Beschreibung)
-- Ein laufender Auftrag eines Jugendlichen kann nicht wesentlich geändert werden.
CREATE OR REPLACE FUNCTION public.invalidate_youth_approval_on_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_helper UUID := COALESCE(OLD.assigned_helper_id, NEW.assigned_helper_id);
BEGIN
  IF v_helper IS NULL OR NOT public.has_role(v_helper, 'helper_youth') THEN
    RETURN NEW;
  END IF;

  IF OLD.address IS DISTINCT FROM NEW.address
     OR OLD.postal_code IS DISTINCT FROM NEW.postal_code
     OR OLD.scheduled_at IS DISTINCT FROM NEW.scheduled_at
     OR OLD.duration_minutes IS DISTINCT FROM NEW.duration_minutes
     OR OLD.customer_id IS DISTINCT FROM NEW.customer_id
     OR OLD.service_type IS DISTINCT FROM NEW.service_type
     OR OLD.budget_cents IS DISTINCT FROM NEW.budget_cents
     OR OLD.description IS DISTINCT FROM NEW.description THEN

    IF OLD.status = 'in_progress' AND NEW.status = 'in_progress' THEN
      RAISE EXCEPTION 'Ein laufender Auftrag eines Jugendlichen kann nicht mehr geändert werden. Bitte brich ihn ab und erstelle einen neuen.';
    END IF;

    UPDATE public.verification_requests
      SET status = 'cancelled', decided_at = now()
      WHERE kind = 'job_approval'
        AND gig_id = NEW.id
        AND status IN ('approved', 'pending');

    -- Zurück auf "wartet auf Helfer": ohne neue Freigabe kann der Auftrag nicht starten.
    IF NEW.status = 'assigned' THEN
      NEW.status := 'pending_helper';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invalidate_youth_approval_on_change ON public.gigs;
CREATE TRIGGER trg_invalidate_youth_approval_on_change
  BEFORE UPDATE ON public.gigs
  FOR EACH ROW EXECUTE FUNCTION public.invalidate_youth_approval_on_change();

-- ------------------------------------------------------------
-- 1. (Fortsetzung) Verifizierungspflicht in Aufträgen, Chats, Geboten
-- ------------------------------------------------------------
-- Aufträge: Sperren (Scope jobs) + Blockierungen + Verifizierung
CREATE OR REPLACE FUNCTION public.enforce_gig_safety_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transition BOOLEAN;
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- Erstellen / Veröffentlichen
  IF TG_OP = 'INSERT' OR (NEW.status = 'open' AND OLD.status IS DISTINCT FROM 'open') THEN
    IF public.is_restricted(NEW.customer_id, 'jobs') THEN
      RAISE EXCEPTION 'Dein Konto ist derzeit eingeschränkt. Du kannst keine Aufträge veröffentlichen.';
    END IF;
    IF public.verification_required() AND NOT public.is_verified(NEW.customer_id) THEN
      RAISE EXCEPTION 'Bitte schließe zuerst deine Verifizierung ab, bevor du Aufträge erstellst oder veröffentlichst.';
    END IF;
  END IF;

  IF NEW.assigned_helper_id IS NULL
     OR NEW.status NOT IN ('pending_helper', 'assigned', 'in_progress') THEN
    RETURN NEW;
  END IF;

  v_transition := TG_OP = 'INSERT'
    OR OLD.assigned_helper_id IS DISTINCT FROM NEW.assigned_helper_id
    OR OLD.status IS DISTINCT FROM NEW.status;

  IF v_transition THEN
    IF public.users_blocked(NEW.customer_id, NEW.assigned_helper_id) THEN
      RAISE EXCEPTION 'Dieser Auftrag ist nicht möglich: Einer von euch hat den anderen blockiert.';
    END IF;
    IF public.is_restricted(NEW.assigned_helper_id, 'jobs') THEN
      RAISE EXCEPTION 'Dieses Helfer-Konto ist derzeit eingeschränkt.';
    END IF;
    IF public.is_restricted(NEW.customer_id, 'jobs') THEN
      RAISE EXCEPTION 'Dein Konto ist derzeit eingeschränkt.';
    END IF;
    IF public.verification_required() THEN
      IF NOT public.is_verified(NEW.assigned_helper_id) THEN
        RAISE EXCEPTION 'Der Helfer hat die Verifizierung noch nicht abgeschlossen.';
      END IF;
      IF NOT public.is_verified(NEW.customer_id) THEN
        RAISE EXCEPTION 'Der Auftraggeber hat die Verifizierung noch nicht abgeschlossen.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Gebote
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
    AND (
      NOT public.has_role(auth.uid(), 'helper_youth')
      OR public.has_guardian_consent(auth.uid())
    )
  );

-- Neue Kontakte (Konversationen)
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
  IF public.is_restricted(auth.uid(), 'communication') THEN
    RAISE EXCEPTION 'Dein Konto ist derzeit eingeschränkt. Du kannst keine neuen Kontakte aufnehmen.';
  END IF;
  IF public.verification_required() AND NOT public.is_verified(auth.uid()) THEN
    RAISE EXCEPTION 'Bitte schließe zuerst deine Verifizierung ab, bevor du Nachrichten sendest.';
  END IF;
  -- Keine neuen Kontakte zu Minderjährigen, wenn man selbst eingeschränkt ist (oben) -
  -- und Jugendliche selbst dürfen nur mit aktivem Eltern-Konto Kontakt aufnehmen.
  IF public.has_role(auth.uid(), 'helper_youth') AND NOT public.has_guardian_consent(auth.uid()) THEN
    RAISE EXCEPTION 'Dein Profil ist noch nicht freigeschaltet. Es fehlen Eltern-Konto oder Einwilligung.';
  END IF;
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- 6. Kontaktdaten-Schutz in Chats mit Jugendlichen
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contact_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contact_attempts_user_idx ON public.contact_attempts (user_id, created_at DESC);
GRANT ALL ON public.contact_attempts TO service_role;
ALTER TABLE public.contact_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read contact attempts" ON public.contact_attempts
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Erkennt Telefonnummern, E-Mail-Adressen, Links und Messenger-Hinweise (Datumsangaben wie 12.10.2026 nicht).
-- (Gleiche Muster wie src/lib/contact-detection.ts - beide Stellen gemeinsam pflegen.)
CREATE OR REPLACE FUNCTION public.contains_private_contact(_text TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
AS $$
  SELECT
    _text ~* '[a-z0-9._%+-]+\s*(@|\(at\)|\[at\])\s*[a-z0-9.-]+\s*(\.|\(dot\)|\[dot\])\s*[a-z]{2,}'
    OR _text ~* '(https?://|www\.)\S+'
    OR _text ~ '(\+|\m00)\d[\d\s/()-]{7,}\d'
    OR _text ~ '\m0\d{2,4}[\s/-]?\d{3,}[\s/-]?\d{2,}'
    OR _text ~ '\d{9,}'
    OR _text ~* '\m(whatsapp|whats\s?app|telegram|signal|snapchat|instagram|insta|tiktok|discord|facebook|messenger)\M';
$$;

-- Nachrichten: Blockierung, Sperre, Verifizierung, Kontaktdaten (nur in Chats mit Jugendlichen)
CREATE OR REPLACE FUNCTION public.enforce_message_safety_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a UUID;
  v_b UUID;
  v_youth BOOLEAN;
  v_attempts INT;
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  SELECT participant_a, participant_b INTO v_a, v_b
  FROM public.conversations WHERE id = NEW.conversation_id;

  IF public.users_blocked(v_a, v_b) THEN
    RAISE EXCEPTION 'Nachricht nicht möglich: Einer von euch hat den anderen blockiert.';
  END IF;
  IF public.is_restricted(NEW.sender_id, 'communication') THEN
    RAISE EXCEPTION 'Dein Konto ist derzeit eingeschränkt. Du kannst keine Nachrichten senden.';
  END IF;
  IF public.verification_required() AND NOT public.is_verified(NEW.sender_id) THEN
    RAISE EXCEPTION 'Bitte schließe zuerst deine Verifizierung ab, bevor du Nachrichten sendest.';
  END IF;

  v_youth := public.has_role(v_a, 'helper_youth') OR public.has_role(v_b, 'helper_youth');
  IF v_youth AND public.contains_private_contact(NEW.body) THEN
    -- Der Versuch wird protokolliert, die Nachricht nicht zugestellt.
    INSERT INTO public.contact_attempts (user_id, conversation_id)
    VALUES (NEW.sender_id, NEW.conversation_id);

    SELECT count(*) INTO v_attempts FROM public.contact_attempts
    WHERE user_id = NEW.sender_id AND created_at > now() - interval '24 hours';

    IF v_attempts >= 3 AND NOT EXISTS (
      SELECT 1 FROM public.account_restrictions
      WHERE user_id = NEW.sender_id AND kind = 'communication_ban' AND lifted_at IS NULL
    ) THEN
      INSERT INTO public.account_restrictions (user_id, kind, reason, source)
      VALUES (NEW.sender_id, 'communication_ban',
              'Automatisch: wiederholter Versuch, private Kontaktdaten auszutauschen oder die Plattformkommunikation zu umgehen.',
              'auto');
      INSERT INTO public.user_reports (reporter_id, reported_user_id, reason, severity, details)
      SELECT CASE WHEN NEW.sender_id = v_a THEN v_b ELSE v_a END, NEW.sender_id,
             'off_platform_contact', 'severe',
             'Automatische Meldung: mehrfacher Versuch, in einem Chat mit einer minderjährigen Person private Kontaktdaten auszutauschen.';
    END IF;

    -- Kein RAISE: das würde das Protokoll (Versuche, Sperre, Meldung) zurückrollen.
    -- Die Nachricht wird stattdessen verworfen; die App zeigt eine verständliche Meldung.
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- 5. Meldungen: Kategorien, Schweregrad, Protokoll
-- ------------------------------------------------------------
ALTER TABLE public.user_reports DROP CONSTRAINT IF EXISTS user_reports_reason_check;
ALTER TABLE public.user_reports ADD CONSTRAINT user_reports_reason_check CHECK (reason IN (
  -- Runde 1 (bleiben gültig)
  'inappropriate_behavior', 'unsafe_conditions', 'harassment', 'fraud', 'rules_violation', 'other',
  -- Runde 2
  'inappropriate_message', 'sexualized_contact', 'pressure_or_threat', 'dangerous_activity',
  'forbidden_activity', 'off_platform_contact', 'false_age', 'false_identity',
  'job_changed', 'fraud_suspicion', 'other_safety_risk'
));

ALTER TABLE public.user_reports DROP CONSTRAINT IF EXISTS user_reports_status_check;
ALTER TABLE public.user_reports ADD CONSTRAINT user_reports_status_check
  CHECK (status IN ('open', 'escalated', 'resolved', 'dismissed'));

ALTER TABLE public.user_reports
  ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'normal' CHECK (severity IN ('normal', 'severe')),
  ADD COLUMN IF NOT EXISTS message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attachments TEXT[] NOT NULL DEFAULT '{}';

-- Bearbeitungsprotokoll sicherheitsrelevanter Meldungen
CREATE TABLE IF NOT EXISTS public.user_report_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.user_reports(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  note TEXT CHECK (note IS NULL OR char_length(note) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_report_events_report_idx ON public.user_report_events (report_id, created_at);
GRANT ALL ON public.user_report_events TO service_role;
GRANT SELECT ON public.user_report_events TO authenticated;
ALTER TABLE public.user_report_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read report events" ON public.user_report_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------
-- 7. Datensparsame Prüfergebnisse
-- Nach der Prüfung bleibt nur: Nutzer-ID, Status, geprüfte Rolle, Altersstatus,
-- Prüfdatum, Prüfverfahren, ggf. externe Prüf-ID, Löschdatum des Prüfbelegs.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.verification_results (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('verified', 'rejected', 'reverification_required')),
  checked_role TEXT,
  age_status TEXT CHECK (age_status IN ('minor_13_17', 'adult')),
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  method TEXT NOT NULL,
  external_check_id TEXT,
  document_deleted_at TIMESTAMPTZ
);
GRANT SELECT ON public.verification_results TO authenticated;
GRANT ALL ON public.verification_results TO service_role;
ALTER TABLE public.verification_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads own verification result" ON public.verification_results
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins read verification results" ON public.verification_results
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

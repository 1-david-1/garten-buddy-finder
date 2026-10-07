-- ============================================================
-- Verifizierung Jugendlicher (13-17) über Unterlagen
--
-- Jugendliche reichen ein:
--   * unterschriebene Einverständniserklärung der Eltern
--   * Ausweis der Eltern (Vorder- und Rückseite)
--   * Ausweis des Kindes (Vorder- und Rückseite)
-- Das GreenMatch-Team prüft und verifiziert (profiles.verified_at,
-- verification_method = 'guardian_consent' - der Wert bleibt, damit alle
-- bestehenden Sperren für Jugendliche weiter greifen).
--
-- Datenschutz: Die Dateien liegen in einem PRIVATEN Bucket. Nutzer dürfen
-- nur in ihren eigenen Ordner hochladen - lesen, überschreiben oder löschen
-- können sie nicht. Admins sehen sie ausschließlich über kurzlebige
-- Signed-URLs aus Server-Functions. Nach der Entscheidung werden die
-- Dateien serverseitig gelöscht (siehe DELETE_DOCS_AFTER_REVIEW).
-- ============================================================

ALTER TABLE public.verification_requests
  DROP CONSTRAINT IF EXISTS verification_requests_kind_check;
ALTER TABLE public.verification_requests
  ADD CONSTRAINT verification_requests_kind_check
  CHECK (kind IN ('guardian_consent', 'identity', 'job_approval', 'youth_documents'));

ALTER TABLE public.verification_requests
  ADD COLUMN IF NOT EXISTS documents JSONB;

-- Pro Nutzer höchstens eine offene Unterlagen-Prüfung.
CREATE UNIQUE INDEX IF NOT EXISTS verification_requests_one_pending_youth_docs
  ON public.verification_requests (user_id)
  WHERE kind = 'youth_documents' AND status = 'pending';

-- Alte, noch offene Link-Anfragen für das Konto sind mit dem neuen Ablauf hinfällig.
UPDATE public.verification_requests
  SET status = 'cancelled', decided_at = now()
  WHERE kind = 'guardian_consent' AND status = 'pending';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'verification-docs', 'verification-docs', false, 10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users upload own verification docs" ON storage.objects;
CREATE POLICY "Users upload own verification docs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'verification-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

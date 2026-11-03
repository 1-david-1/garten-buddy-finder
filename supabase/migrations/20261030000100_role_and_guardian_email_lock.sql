-- ============================================================================
-- Härtung: Rollen nur durch den Server, Eltern-E-Mail nicht selbst umleitbar
--
-- Aus der Sicherheitsprüfung (Zip "garten-buddy-finder-sicherheitsfixes"), auf den heutigen Stand angepasst.
-- Bewusst NICHT übernommen: die damalige Neudefinition von enforce_youth_job_rules(), has_guardian_consent()
-- und protect_profile_trust_fields() (sie würde die neueren Jugendschutz-Regeln überschreiben), das Ändern
-- bereits eingespielter Migrationen und is_admin() (der Enum-Wert 'admin' ist inzwischen vorhanden).
--
-- 1. Rollen: Bisher durfte jeder Angemeldete per API Rollen für sich eintragen (nur 'admin' war gesperrt).
--    Wer die Altersprüfung der App umgehen wollte, konnte sich so z. B. als Erwachsener eintragen.
--    Ab jetzt schreibt nur noch der Server (completeOnboarding nutzt dafür den Service-Zugang).
-- 2. Eltern-E-Mail: Ein Kind konnte seine hinterlegte Eltern-Adresse selbst ändern und so Freigabe-Mails
--    auf die eigene Adresse umleiten. Nach der Einreichung der Unterlagen, nach der Verifizierung oder bei
--    verknüpftem Eltern-Konto ist die Adresse für das Kind gesperrt. Server-Funktionen (Service-Zugang)
--    und Admins sind ausgenommen.
-- ============================================================================

DROP POLICY IF EXISTS "Users can insert own role" ON public.user_roles;
REVOKE INSERT ON public.user_roles FROM authenticated;

CREATE OR REPLACE FUNCTION public.protect_guardian_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service-Zugang (auth.uid() ist leer) und Admins dürfen ändern.
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  -- Erstes Setzen ist erlaubt, nur eine Änderung einer vorhandenen Adresse wird geprüft.
  IF OLD.guardian_email IS NULL OR NEW.guardian_email IS NOT DISTINCT FROM OLD.guardian_email THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = OLD.id AND p.verified_at IS NOT NULL)
     OR EXISTS (
       SELECT 1 FROM public.verification_requests v
       WHERE v.user_id = OLD.id AND v.kind = 'youth_documents' AND v.status = 'pending'
     )
     OR EXISTS (
       SELECT 1 FROM public.guardian_links g
       WHERE g.child_id = OLD.id AND g.status = 'active'
     )
  THEN
    RAISE EXCEPTION 'Die E-Mail der Eltern kann nach der Einreichung nicht mehr selbst geändert werden. Bitte wende dich an den Support.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_guardian_email ON public.profile_private;
CREATE TRIGGER trg_protect_guardian_email
  BEFORE UPDATE OF guardian_email ON public.profile_private
  FOR EACH ROW EXECUTE FUNCTION public.protect_guardian_email();

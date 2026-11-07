-- ============================================================
-- 1. Dauerfreigaben der Eltern (weniger Nachfragen)
-- 2. Regeln für neue Aufträge: nur Freiburg, echte Adressstruktur, weniger Spam
-- ============================================================

DO $$
BEGIN
  IF to_regclass('public.gigs') IS NULL OR to_regclass('public.guardian_links') IS NULL THEN
    RAISE EXCEPTION 'Die Tabellen public.gigs und/oder public.guardian_links fehlen in dieser Datenbank. Bitte zuerst supabase/diagnostics/check_database.sql ausführen und die fehlenden Migrationen einspielen.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'has_role'
  ) THEN
    RAISE EXCEPTION 'Die Funktion public.has_role fehlt in dieser Datenbank. Bitte zuerst supabase/diagnostics/check_database.sql ausführen.';
  END IF;
END
$$;

-- ------------------------------------------------------------
-- 1. Dauerfreigaben
-- scope = 'customer': Die Eltern erlauben diesem Auftraggeber dauerhaft, Aufträge für das Kind zu vergeben
-- scope = 'gig':      Die Eltern möchten für diesen einen Auftrag nicht mehr gefragt werden (auch nicht nach einer
--                     Verhandlung)
-- acknowledges_risky: Die Eltern haben dabei Tätigkeiten mit erhöhtem Risiko (Heckenschnitt ...) ausdrücklich
--                     bestätigt. Baumpflege und gefährliche Geräte bleiben immer gesperrt.
-- Geschrieben wird nur serverseitig (Service-Role) nach Prüfung der Verknüpfung Eltern - Kind.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.guardian_standing_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guardian_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('customer', 'gig')),
  customer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  gig_id UUID REFERENCES public.gigs(id) ON DELETE CASCADE,
  acknowledges_risky BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  CHECK (
    (scope = 'customer' AND customer_id IS NOT NULL AND gig_id IS NULL)
    OR (scope = 'gig' AND gig_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS guardian_standing_one_customer
  ON public.guardian_standing_approvals (child_id, customer_id)
  WHERE scope = 'customer' AND revoked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS guardian_standing_one_gig
  ON public.guardian_standing_approvals (child_id, gig_id)
  WHERE scope = 'gig' AND revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS guardian_standing_child_idx
  ON public.guardian_standing_approvals (child_id, revoked_at);

ALTER TABLE public.guardian_standing_approvals ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.guardian_standing_approvals TO authenticated;
GRANT ALL ON public.guardian_standing_approvals TO service_role;

DROP POLICY IF EXISTS "Guardian reads own standing approvals" ON public.guardian_standing_approvals;
CREATE POLICY "Guardian reads own standing approvals" ON public.guardian_standing_approvals
  FOR SELECT TO authenticated
  USING (guardian_user_id = auth.uid());

DROP POLICY IF EXISTS "Admins read standing approvals" ON public.guardian_standing_approvals;
CREATE POLICY "Admins read standing approvals" ON public.guardian_standing_approvals
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------
-- 2. Regeln für neue Aufträge (Datenbank = verbindliche Durchsetzung, die App prüft vorher mit Beispielen)
--    * nur Freiburg im Breisgau (PLZ 79098 bis 79117)
--    * Adresse beginnt mit Straße und Hausnummer, keine Kontaktdaten in Titel, Beschreibung oder Adresse
--    * öffentliche Aufträge: höchstens 3 pro Stunde, 8 pro 24 Stunden, 5 gleichzeitig offene, keine Duplikate
--    Service-Role und Admins sind ausgenommen.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_gig_posting_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_addr TEXT;
  v_hour INTEGER;
  v_day INTEGER;
  v_open INTEGER;
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.postal_code IS NULL OR NEW.postal_code !~ '^79(098|100|102|104|106|108|110|111|112|114|115|117)$' THEN
    RAISE EXCEPTION 'Aufträge können aktuell nur innerhalb von Freiburg im Breisgau veröffentlicht werden (Postleitzahlen 79098 bis 79117).';
  END IF;

  v_addr := btrim(coalesce(NEW.address, ''));
  IF v_addr !~ '^[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß .''’-]{2,59} +[0-9]{1,3} ?[A-Za-z]?' THEN
    RAISE EXCEPTION 'Bitte gib die Adresse mit Straße und Hausnummer an, zum Beispiel „Schwarzwaldstraße 12“.';
  END IF;

  IF public.contains_private_contact(coalesce(NEW.title, '') || ' ' || coalesce(NEW.description, '') || ' ' || v_addr) THEN
    RAISE EXCEPTION 'Bitte keine Telefonnummern, E-Mail-Adressen oder Links in Titel, Beschreibung oder Adresse. Kontakt läuft über den Chat in GreenMatch.';
  END IF;

  IF NEW.status = 'open' THEN
    SELECT count(*) INTO v_hour FROM public.gigs
      WHERE customer_id = NEW.customer_id AND created_at > now() - interval '1 hour';
    IF v_hour >= 3 THEN
      RAISE EXCEPTION 'Du hast in der letzten Stunde schon mehrere Aufträge veröffentlicht. Bitte warte etwas, bevor du den nächsten einstellst.';
    END IF;

    SELECT count(*) INTO v_day FROM public.gigs
      WHERE customer_id = NEW.customer_id AND created_at > now() - interval '24 hours';
    IF v_day >= 8 THEN
      RAISE EXCEPTION 'Du hast heute schon sehr viele Aufträge veröffentlicht. Bitte versuche es morgen erneut.';
    END IF;

    SELECT count(*) INTO v_open FROM public.gigs
      WHERE customer_id = NEW.customer_id AND status = 'open';
    IF v_open >= 5 THEN
      RAISE EXCEPTION 'Du hast schon 5 offene Aufträge. Bitte schließe oder storniere einen, bevor du einen neuen veröffentlichst.';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.gigs g
      WHERE g.customer_id = NEW.customer_id
        AND g.status <> 'cancelled'
        AND g.created_at > now() - interval '14 days'
        AND lower(btrim(g.title)) = lower(btrim(NEW.title))
        AND lower(btrim(coalesce(g.address, ''))) = lower(v_addr)
    ) THEN
      RAISE EXCEPTION 'Diesen Auftrag hast du an dieser Adresse schon veröffentlicht.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_gig_posting_rules ON public.gigs;
CREATE TRIGGER trg_enforce_gig_posting_rules
  BEFORE INSERT ON public.gigs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_gig_posting_rules();

-- ============================================================
-- Adressschutz für Aufträge
--
-- Regel: Die genaue Adresse eines Auftrags (Straße, Hausnummer, PLZ) sehen
--   * der Auftraggeber selbst,
--   * der zugewiesene Helfer - erst NACH der Annahme (Status assigned / in_progress),
--   * Admins.
-- Alle anderen (auch Helfer, die den Auftrag im Marktplatz sehen, und Helfer mit offener
-- Buchungsanfrage) sehen nur die Stadt und den Stadtteil (gigs.district).
--
-- Umsetzung: Die Adresse liegt nicht mehr in public.gigs, sondern in public.gig_locations
-- (eigene RLS). Damit kann sie weder über select("*"), eingebettete Abfragen, RPC-Rückgaben
-- (RETURNS public.gigs) noch über Realtime (gigs ist veröffentlicht) ausgeliefert werden.
--
-- Bestehender Code, der address / postal_code in gigs schreibt (App-Funktionen, RPCs wie
-- purchase_with_schedule), funktioniert unverändert weiter: ein Trigger leitet die Werte in
-- gig_locations um und lässt in gigs NULL zurück. Ein CHECK-Constraint sorgt dafür, dass
-- in gigs nie wieder eine Adresse stehen bleibt, selbst wenn der Trigger fehlen würde.
-- ============================================================

DO $$
BEGIN
  IF to_regclass('public.gigs') IS NULL THEN
    RAISE EXCEPTION 'Tabelle public.gigs fehlt - bitte zuerst die Basis-Migrationen ausführen.';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 1. Öffentliche Ortsangabe: Stadtteil
-- ------------------------------------------------------------
ALTER TABLE public.gigs ADD COLUMN IF NOT EXISTS district TEXT;
ALTER TABLE public.gigs DROP CONSTRAINT IF EXISTS gigs_district_len;
ALTER TABLE public.gigs ADD CONSTRAINT gigs_district_len CHECK (district IS NULL OR char_length(district) <= 40);

-- ------------------------------------------------------------
-- 2. Private Ortsangabe
--    Fremdschlüssel ist DEFERRABLE, weil der Umleit-Trigger (BEFORE INSERT auf gigs) die Zeile
--    schreibt, bevor der Auftrag selbst gespeichert ist. Geprüft wird am Ende der Transaktion.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gig_locations (
  gig_id UUID PRIMARY KEY REFERENCES public.gigs(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  address TEXT,
  postal_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.gig_locations ENABLE ROW LEVEL SECURITY;

-- Nur lesen für angemeldete Nutzer (und nur nach Policy). Schreiben geht ausschließlich über den
-- Umleit-Trigger (SECURITY DEFINER) bzw. die Service-Role - es gibt bewusst keine INSERT/UPDATE/DELETE-Policy.
REVOKE ALL ON public.gig_locations FROM PUBLIC;
REVOKE ALL ON public.gig_locations FROM anon;
REVOKE ALL ON public.gig_locations FROM authenticated;
GRANT SELECT ON public.gig_locations TO authenticated;
GRANT ALL ON public.gig_locations TO service_role;

-- Wer darf die Adresse sehen? Eine Stelle für die Regel - leicht anzupassen.
CREATE OR REPLACE FUNCTION public.can_view_gig_location(p_gig_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.gigs g
      WHERE g.id = p_gig_id
        AND (
          g.customer_id = auth.uid()
          OR (g.assigned_helper_id = auth.uid() AND g.status IN ('assigned', 'in_progress'))
        )
    )
  );
$$;

REVOKE ALL ON FUNCTION public.can_view_gig_location(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_gig_location(UUID) TO authenticated;

DROP POLICY IF EXISTS "Gig location visible to owner, accepted helper and admins" ON public.gig_locations;
CREATE POLICY "Gig location visible to owner, accepted helper and admins" ON public.gig_locations
  FOR SELECT TO authenticated
  USING (public.can_view_gig_location(gig_id));

DROP TRIGGER IF EXISTS trg_gig_locations_updated_at ON public.gig_locations;
CREATE TRIGGER trg_gig_locations_updated_at BEFORE UPDATE ON public.gig_locations
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ------------------------------------------------------------
-- 3. Bestehende Adressen umziehen
--    Die Benutzer-Trigger werden kurz abgeschaltet: Sonst würde der Jugendschutz-Trigger
--    (invalidate_youth_approval_on_change) die Adress-Änderung als wesentliche Änderung werten
--    und bestehende Freigaben der Eltern widerrufen.
-- ------------------------------------------------------------
INSERT INTO public.gig_locations (gig_id, address, postal_code)
SELECT id, address, postal_code
FROM public.gigs
WHERE address IS NOT NULL OR postal_code IS NOT NULL
ON CONFLICT (gig_id) DO NOTHING;

ALTER TABLE public.gigs DISABLE TRIGGER USER;
UPDATE public.gigs SET address = NULL, postal_code = NULL WHERE address IS NOT NULL OR postal_code IS NOT NULL;
ALTER TABLE public.gigs ENABLE TRIGGER USER;

-- ------------------------------------------------------------
-- 4. Umleitung: address / postal_code werden nie in gigs gespeichert
--    Der Name beginnt mit "trg_zz", damit der Trigger NACH den anderen BEFORE-Triggern läuft
--    (z. B. trg_enforce_gig_posting_rules, der die Adresse prüft, und
--    trg_invalidate_youth_approval_on_change, der Adress-Änderungen erkennt).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.divert_gig_location()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.gig_locations (gig_id, address, postal_code)
  VALUES (NEW.id, NEW.address, NEW.postal_code)
  ON CONFLICT (gig_id) DO UPDATE
    SET address = COALESCE(EXCLUDED.address, public.gig_locations.address),
        postal_code = COALESCE(EXCLUDED.postal_code, public.gig_locations.postal_code);
  NEW.address := NULL;
  NEW.postal_code := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_zz_gig_location_divert ON public.gigs;
CREATE TRIGGER trg_zz_gig_location_divert
  BEFORE INSERT OR UPDATE ON public.gigs
  FOR EACH ROW
  WHEN (NEW.address IS NOT NULL OR NEW.postal_code IS NOT NULL)
  EXECUTE FUNCTION public.divert_gig_location();

-- Sicherung: In gigs darf nie eine Adresse oder PLZ stehen.
ALTER TABLE public.gigs DROP CONSTRAINT IF EXISTS gigs_no_plain_location;
ALTER TABLE public.gigs ADD CONSTRAINT gigs_no_plain_location CHECK (address IS NULL AND postal_code IS NULL);

-- ------------------------------------------------------------
-- 5. Duplikat-Prüfung der Veröffentlichungs-Regeln: Adresse jetzt aus gig_locations
--    (sonst gäbe es nie mehr ein Duplikat, weil gigs.address immer NULL ist).
--    Rest der Funktion unverändert (20261104000000_standing_approvals_and_posting_rules.sql).
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
      SELECT 1
      FROM public.gigs g
      JOIN public.gig_locations gl ON gl.gig_id = g.id
      WHERE g.customer_id = NEW.customer_id
        AND g.status <> 'cancelled'
        AND g.created_at > now() - interval '14 days'
        AND lower(btrim(g.title)) = lower(btrim(NEW.title))
        AND lower(btrim(coalesce(gl.address, ''))) = lower(v_addr)
    ) THEN
      RAISE EXCEPTION 'Diesen Auftrag hast du an dieser Adresse schon veröffentlicht.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

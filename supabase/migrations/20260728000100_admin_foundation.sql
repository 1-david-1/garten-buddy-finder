-- ============================================================
-- Admin-Grundlagen (Teil 2 von 2)
--   * admin_audit_log   – Protokoll aller Admin-Aktionen
--   * admin_settings    – Plattform-Einstellungen / Feature-Flags
--   * log_admin_action  – schreibt ins Audit-Log (nur für Admins aufrufbar)
--
-- Alles idempotent: kann gefahrlos mehrfach ausgeführt werden und
-- ändert bereits vorhandene Daten nicht.
-- ============================================================

-- ------------------------------------------------------------
-- Audit-Log
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx
  ON public.admin_audit_log (created_at DESC);

GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read audit log" ON public.admin_audit_log;
CREATE POLICY "Admins read audit log" ON public.admin_audit_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
-- Bewusst KEINE Insert/Update/Delete-Policy: geschrieben wird nur über
-- log_admin_action() (SECURITY DEFINER), damit Einträge nicht nachträglich
-- verändert oder gelöscht werden können.

-- Evtl. vorhandene ältere Varianten entfernen, damit es keine mehrdeutigen
-- Überladungen gibt.
DROP FUNCTION IF EXISTS public.log_admin_action(TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.log_admin_action(TEXT, TEXT, UUID, JSONB);

CREATE OR REPLACE FUNCTION public.log_admin_action(
  _action TEXT,
  _target_type TEXT DEFAULT NULL,
  _target_id UUID DEFAULT NULL,
  _metadata JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), _action, _target_type, _target_id, _metadata);
END;
$$;

REVOKE ALL ON FUNCTION public.log_admin_action(TEXT, TEXT, UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_admin_action(TEXT, TEXT, UUID, JSONB) TO authenticated;

-- ------------------------------------------------------------
-- Einstellungen
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.admin_settings TO authenticated;
GRANT ALL ON public.admin_settings TO service_role;
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read settings" ON public.admin_settings;
CREATE POLICY "Admins read settings" ON public.admin_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins update settings" ON public.admin_settings;
CREATE POLICY "Admins update settings" ON public.admin_settings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_admin_settings_updated_at ON public.admin_settings;
CREATE TRIGGER trg_admin_settings_updated_at
  BEFORE UPDATE ON public.admin_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.admin_settings (key, value, description) VALUES
  ('maintenance_mode', 'false'::jsonb,
   'Wartungsmodus: wenn aktiv, ist die Plattform für normale Nutzer gesperrt.'),
  ('registration_enabled', 'true'::jsonb,
   'Neue Registrierungen erlauben.'),
  ('max_gig_budget_cents', '500000'::jsonb,
   'Maximales Budget pro Auftrag in Cent.'),
  ('platform_fee_customer_pct', '0'::jsonb,
   'Plattformgebühr für Kunden in Prozent (aktuell kostenlos).'),
  ('platform_fee_helper_pct', '0'::jsonb,
   'Plattformgebühr für Helfer in Prozent (aktuell kostenlos).'),
  ('pstg_tx_threshold', '30'::jsonb,
   'PStTG: Anzahl Transaktionen, ab der gemeldet werden muss.'),
  ('pstg_gross_cents_threshold', '200000'::jsonb,
   'PStTG: Bruttoumsatz in Cent, ab dem gemeldet werden muss.'),
  ('notification_email_admin', '[]'::jsonb,
   'E-Mail-Adressen (Liste), die bei dringenden Meldungen benachrichtigt werden.')
ON CONFLICT (key) DO NOTHING;

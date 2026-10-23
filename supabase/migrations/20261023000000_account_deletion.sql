-- ============================================================
-- Kontolöschung: Audit-Log + Admin-DELETE auf profiles
--
-- - account_deletion_log speichert Löschgrund (überlebt den User)
-- - Admins dürfen profiles in Supabase/Dashboard löschen (RLS)
-- - Löschen von auth.users (Service-Role / SQL) cascaded weiterhin
--   auf profiles und abhängige Tabellen
-- ============================================================

CREATE TABLE IF NOT EXISTS public.account_deletion_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deleted_user_id UUID NOT NULL,
  deleted_by UUID,
  initiator TEXT NOT NULL CHECK (initiator IN ('self', 'admin', 'supabase')),
  reason TEXT NOT NULL,
  display_name TEXT,
  email TEXT,
  roles TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.account_deletion_log IS
  'Protokoll gelöschter Konten inkl. Begründung. Bleibt erhalten, wenn auth.users entfernt wird.';

CREATE INDEX IF NOT EXISTS idx_account_deletion_log_created_at
  ON public.account_deletion_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_account_deletion_log_deleted_user
  ON public.account_deletion_log (deleted_user_id);

ALTER TABLE public.account_deletion_log ENABLE ROW LEVEL SECURITY;

-- Nur Admins lesen das Löschprotokoll (Support / DSGVO-Nachweis)
CREATE POLICY "Admins view account deletion log"
  ON public.account_deletion_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Inserts laufen über Service-Role (Server-Functions) oder SECURITY DEFINER
GRANT SELECT ON public.account_deletion_log TO authenticated;
GRANT ALL ON public.account_deletion_log TO service_role;

-- Ohne GRANT schlägt DELETE trotz RLS-Policy fehl (nur SELECT/INSERT/UPDATE waren erlaubt).
GRANT DELETE ON public.profiles TO authenticated;

-- Admins dürfen Profile in der Supabase-Tabelle / per API löschen.
-- Hinweis: Für vollständige Kontolöschung auth.users entfernen (Cascade).
CREATE POLICY "Admins delete any profile"
  ON public.profiles
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Nutzer dürfen ihr eigenes Profil löschen (Self-Service über App
-- nutzt zusätzlich auth.admin.deleteUser; diese Policy deckt direkte Deletes ab).
CREATE POLICY "Users can delete own profile"
  ON public.profiles
  FOR DELETE
  TO authenticated
  USING (auth.uid() = id);

-- Convenience für SQL-Editor: Löschgrund protokollieren, bevor man
-- manuell DELETE FROM auth.users / profiles ausführt.
CREATE OR REPLACE FUNCTION public.log_account_deletion(
  _deleted_user_id UUID,
  _reason TEXT,
  _initiator TEXT DEFAULT 'supabase',
  _deleted_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_name TEXT;
  v_roles TEXT[];
BEGIN
  IF _reason IS NULL OR length(trim(_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;
  IF _initiator NOT IN ('self', 'admin', 'supabase') THEN
    RAISE EXCEPTION 'invalid_initiator';
  END IF;

  SELECT display_name INTO v_name FROM public.profiles WHERE id = _deleted_user_id;
  SELECT coalesce(array_agg(role::text), '{}') INTO v_roles
  FROM public.user_roles WHERE user_id = _deleted_user_id;

  INSERT INTO public.account_deletion_log (
    deleted_user_id, deleted_by, initiator, reason, display_name, roles
  ) VALUES (
    _deleted_user_id,
    coalesce(_deleted_by, auth.uid()),
    _initiator,
    trim(_reason),
    v_name,
    v_roles
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_account_deletion(UUID, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_account_deletion(UUID, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_account_deletion(UUID, TEXT, TEXT, UUID) TO service_role;

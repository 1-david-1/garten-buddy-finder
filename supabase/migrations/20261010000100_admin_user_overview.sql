-- ============================================================
-- Nutzer-Übersicht für den Supabase-Table-Editor
--
-- E-Mail-Adressen liegen in Supabase nur in auth.users (Authentication -> Users),
-- nicht in einer Tabelle des public-Schemas. Diese Ansicht führt E-Mail, Profil,
-- Rollen und Verifizierungsstatus an einer Stelle zusammen, damit du sie in Supabase
-- (Table Editor -> Views -> admin_user_overview) genauso einsehen kannst wie in der
-- Admin-Zentrale.
--
-- Sicherheit: Die Ansicht ist für die App-/API-Rollen (anon, authenticated) gesperrt.
-- Sie ist nur im Supabase-Dashboard (Rolle postgres) und serverseitig (service_role)
-- lesbar. E-Mail-Adressen werden dadurch NICHT für andere Nutzer sichtbar.
-- Bewusst nicht enthalten: Geburtsdatum, Steuer-ID, E-Mail der Eltern.
-- ============================================================

DROP VIEW IF EXISTS public.admin_user_overview;

CREATE VIEW public.admin_user_overview
WITH (security_invoker = true) AS
SELECT
  u.id,
  u.email,
  (u.email_confirmed_at IS NOT NULL) AS email_confirmed,
  u.created_at AS registered_at,
  u.last_sign_in_at,
  p.display_name,
  p.city,
  p.postal_code,
  p.business_name,
  p.ust_id,
  COALESCE(
    (SELECT array_agg(r.role::text ORDER BY r.role::text)
       FROM public.user_roles r
      WHERE r.user_id = u.id),
    ARRAY[]::text[]
  ) AS roles,
  p.verified_at,
  p.verification_method,
  p.trust_score,
  p.suspended_at
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id;

REVOKE ALL ON public.admin_user_overview FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_user_overview TO service_role;

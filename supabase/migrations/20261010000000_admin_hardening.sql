-- ============================================================
-- Absicherung des Admin-Bereichs
--
-- 1. SICHERHEITSFIX: Die Policy "Users can insert own role" erlaubte jedem
--    angemeldeten Nutzer, sich selbst eine beliebige Rolle zu geben - auch
--    'admin'. Ab jetzt ist 'admin' per Client nicht mehr vergebbar. Die Rolle
--    wird nur noch manuell vergeben (siehe ADMIN-SETUP.md).
-- 2. Admin-Lesezugriffe werden idempotent (neu) angelegt. Die Migration
--    20260728120000 konnte ohne 'admin'-Enum-Wert nicht greifen.
--
-- Voraussetzung: 20260728000000_admin_role_enum.sql ist bereits vollständig
-- ausgeführt (neue Enum-Werte sind erst nach dem Commit nutzbar).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Rollen-Eskalation schließen
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert own role" ON public.user_roles;
CREATE POLICY "Users can insert own role" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND role <> 'admin');

-- ------------------------------------------------------------
-- 2. Admin-Lesezugriffe (idempotent)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Admins view all gigs" ON public.gigs;
CREATE POLICY "Admins view all gigs" ON public.gigs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins view all negotiations" ON public.negotiations;
CREATE POLICY "Admins view all negotiations" ON public.negotiations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins view all escrow" ON public.escrow_transactions;
CREATE POLICY "Admins view all escrow" ON public.escrow_transactions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins update escrow" ON public.escrow_transactions;
CREATE POLICY "Admins update escrow" ON public.escrow_transactions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins view all invoices" ON public.invoices;
CREATE POLICY "Admins view all invoices" ON public.invoices FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins view all earnings" ON public.earnings_tracker;
CREATE POLICY "Admins view all earnings" ON public.earnings_tracker FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins view all private profiles" ON public.profile_private;
CREATE POLICY "Admins view all private profiles" ON public.profile_private FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins update any profile" ON public.profiles;
CREATE POLICY "Admins update any profile" ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage user roles" ON public.user_roles;
CREATE POLICY "Admins manage user roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins read all verification requests" ON public.verification_requests;
CREATE POLICY "Admins read all verification requests" ON public.verification_requests
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

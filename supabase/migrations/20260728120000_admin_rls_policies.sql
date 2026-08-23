-- ============================================================
-- Admin Dashboard: RLS-Policies
-- Die vorherige Migration (20260728_admin_dashboard.sql) hat die
-- admin-Rolle sowie admin_audit_log/admin_settings angelegt, aber
-- Admins hatten dadurch noch keinen Lesezugriff auf plattformweite
-- Daten (gigs, negotiations, escrow_transactions, ...) - alle
-- bestehenden Policies sind auf "eigene Zeilen" beschränkt.
-- ============================================================

-- Gigs: Admins sehen alle Aufträge (Support/Moderation)
CREATE POLICY "Admins view all gigs" ON public.gigs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Negotiations: Admins sehen alle Verhandlungen
CREATE POLICY "Admins view all negotiations" ON public.negotiations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Escrow: Admins sehen alle Transaktionen (Umsatz/Gebühren, Streitfälle)
CREATE POLICY "Admins view all escrow" ON public.escrow_transactions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update escrow" ON public.escrow_transactions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Invoices: Admins sehen alle Rechnungen (Buchhaltung/Compliance)
CREATE POLICY "Admins view all invoices" ON public.invoices FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Earnings tracker: Admins sehen alle PStTG-Zähler
CREATE POLICY "Admins view all earnings" ON public.earnings_tracker FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Profile_private: Admins dürfen bei Support-Fällen (z.B. Altersverifikation,
-- Steuer-ID-Prüfung) nachschlagen. Zugriff wird über admin_audit_log protokolliert.
CREATE POLICY "Admins view all private profiles" ON public.profile_private FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Profiles: Admins dürfen z.B. Verifizierungsstatus/Trust-Score pflegen
CREATE POLICY "Admins update any profile" ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- User roles: Admins verwalten Rollen (z.B. Verifizierung zurückziehen, Sperren)
CREATE POLICY "Admins manage user roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

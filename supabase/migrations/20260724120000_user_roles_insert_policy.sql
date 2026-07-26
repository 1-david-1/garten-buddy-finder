-- Bugfix: user_roles hatte nur eine SELECT-Policy, aber keine INSERT-Policy.
-- Dadurch schlug jeder Rollen-Insert beim Onboarding mit
-- "new row violates row-level security policy for table user_roles" fehl.

GRANT INSERT ON public.user_roles TO authenticated;

CREATE POLICY "Users can insert own role" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

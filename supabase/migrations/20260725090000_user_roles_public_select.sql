-- Bugfix / Marketplace-Voraussetzung: Bisher durfte jeder Nutzer nur seine
-- EIGENE Zeile in user_roles sehen (USING (auth.uid() = user_id)). Damit war
-- es unmöglich, eine Liste "alle registrierten Helfer" für Arbeitgeber zu
-- bauen - die Abfrage kam für jeden anderen Nutzer immer leer zurück, ganz
-- gleich wie viele Helfer sich registriert hatten.
--
-- Wer welche öffentliche Rolle hat (Helfer/Kunde), ist von Natur aus
-- öffentliche Marketplace-Information (genau wie "profiles" es schon ist),
-- daher hier dieselbe Public-Read-Policy wie bei profiles.

CREATE POLICY "Any authenticated user can view all roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (true);

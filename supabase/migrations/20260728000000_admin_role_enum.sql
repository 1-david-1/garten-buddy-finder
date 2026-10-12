-- ============================================================
-- Admin-Rolle (Teil 1 von 2)
--
-- Die Rolle 'admin' fehlte im Enum public.app_role. Dadurch konnte keine
-- Admin-Policy (has_role(auth.uid(), 'admin')) angelegt werden und der
-- gesamte Admin-Bereich lief ins Leere.
--
-- WICHTIG: Diese Anweisung muss in einer EIGENEN Ausführung laufen
-- (nicht im selben Skript wie Policies, die 'admin' verwenden). Neue
-- Enum-Werte sind erst nach dem Commit nutzbar.
-- ============================================================

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin';

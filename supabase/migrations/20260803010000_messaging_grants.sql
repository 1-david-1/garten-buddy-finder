-- Die Messaging-Migration hat keine GRANT-Anweisungen für die drei neuen
-- Tabellen gesetzt. In diesem Projekt gibt es keine globale
-- Standardberechtigung (ALTER DEFAULT PRIVILEGES) — jede Tabelle braucht
-- ihren eigenen expliziten GRANT (siehe alle vorherigen Migrationen). Ohne
-- diese hier bekäme jeder Nutzer sofort "permission denied for table
-- conversations", unabhängig davon, was die RLS-Policies erlauben.

GRANT SELECT, INSERT ON public.conversations TO authenticated;
GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.conversation_reads TO authenticated;

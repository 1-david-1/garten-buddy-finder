-- Ohne das hier kommen im Helfer-Dashboard keine Live-Benachrichtigungen
-- (INSERT/UPDATE auf "gigs") an - nur "messages" war bisher für Realtime
-- freigeschaltet (siehe 20260803000000_messaging.sql). Die bestehenden
-- RLS-Policies ("Assigned helper can view gig") sorgen bereits dafür,
-- dass ein Helfer nur Events für ihm zugewiesene Aufträge sieht.
ALTER PUBLICATION supabase_realtime ADD TABLE public.gigs;

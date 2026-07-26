-- Bugfix: der zugewiesene Helfer konnte den Status eines Gigs nicht ändern
-- (z.B. Buchungsanfrage annehmen/ablehnen im Postfach), weil bisher nur der
-- Kunde selbst eine UPDATE-Policy auf "gigs" hatte.

CREATE POLICY "Assigned helper can update gig status" ON public.gigs
  FOR UPDATE TO authenticated
  USING (assigned_helper_id = auth.uid())
  WITH CHECK (assigned_helper_id = auth.uid() OR assigned_helper_id IS NULL);

-- Bugfix: Ein Helfer, der zum ersten Mal auf einen offenen Auftrag bietet,
-- ist noch nicht "assigned_helper_id" — die bestehende Policy "Assigned
-- helper can update gig status" greift daher nicht, und der Statuswechsel
-- open -> negotiating (in createBid) schlägt still fehl (0 betroffene
-- Zeilen, kein Fehler). Der Auftrag bleibt fälschlich auf "open" stehen.
--
-- Diese Policy erlaubt gezielt nur den einen Übergang open -> negotiating,
-- und nur für einen Helfer, der bereits ein eigenes Gebot (negotiations-Zeile)
-- auf genau diesen Auftrag abgegeben hat.

CREATE POLICY "Bidding helper can move gig to negotiating" ON public.gigs
  FOR UPDATE TO authenticated
  USING (
    status = 'open'
    AND EXISTS (
      SELECT 1 FROM public.negotiations
      WHERE negotiations.gig_id = gigs.id
        AND negotiations.helper_id = auth.uid()
    )
  )
  WITH CHECK (status = 'negotiating');

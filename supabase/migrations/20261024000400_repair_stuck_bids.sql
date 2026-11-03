-- ============================================================================
-- Reparatur: hängengebliebene Gebote
--
-- Durch den alten Ablauf konnte ein Gebot auf "accepted" stehen bleiben, obwohl der Auftrag nie
-- zugewiesen wurde (außen "In Verhandlung", innen "Angenommen"). Die neue Verhandlungslogik
-- (finalizeAgreement) stellt das Gebot bei einer Ablehnung selbst zurück. Diese Migration öffnet
-- die bereits hängenden Gebote einmalig wieder, damit der Auftraggeber es erneut versuchen kann.
-- ============================================================================
UPDATE public.negotiations n
SET status = CASE WHEN n.counter_bid_cents IS NOT NULL THEN 'countered'::public.negotiation_status
                  ELSE 'pending'::public.negotiation_status END
FROM public.gigs g
WHERE n.gig_id = g.id
  AND n.status = 'accepted'
  AND g.status = 'negotiating'
  AND g.assigned_helper_id IS NULL;

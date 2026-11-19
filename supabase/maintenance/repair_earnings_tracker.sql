-- ============================================================
-- Einmalige Reparatur: Verdienst-Statistik (earnings_tracker) der Helfer
--
-- Hintergrund: Bis zur Migration 20261117000000_complete_gig_release.sql scheiterte beim Abschluss eines Auftrags
-- das Hochzählen der Verdienste des Helfers an der Zugriffsregel. Der Auftrag war danach abgeschlossen und die
-- Zahlung freigegeben, aber tx_count und gross_cents des Helfers blieben zu niedrig.
--
-- Vorgehen (NICHT automatisch in der Migrationskette, bewusst von Hand):
--   1. Teil A ausführen: zeigt je Helfer und Jahr, was gespeichert ist und was aus den freigegebenen Zahlungen folgt.
--   2. Passt die rechte Seite (soll), Teil B ausführen: setzt tx_count und gross_cents auf die berechneten Werte.
-- Das Jahr richtet sich nach deutscher Ortszeit der Freigabe (paid_out_at). Das Feld payouts_locked bleibt unberührt.
-- ============================================================

-- Teil A: Vergleich (ändert nichts)
WITH soll AS (
  SELECT
    e.helper_id,
    EXTRACT(YEAR FROM (e.paid_out_at AT TIME ZONE 'Europe/Berlin'))::INT AS year,
    count(*)::INT AS tx_count,
    COALESCE(sum(e.bid_cents), 0)::BIGINT AS gross_cents
  FROM public.escrow_transactions e
  WHERE e.state = 'paid_out' AND e.paid_out_at IS NOT NULL
  GROUP BY 1, 2
)
SELECT
  COALESCE(s.helper_id, t.helper_id) AS helper_id,
  COALESCE(s.year, t.year) AS year,
  t.tx_count AS ist_anzahl, s.tx_count AS soll_anzahl,
  t.gross_cents AS ist_cent, s.gross_cents AS soll_cent
FROM soll s
FULL OUTER JOIN public.earnings_tracker t ON t.helper_id = s.helper_id AND t.year = s.year
WHERE t.tx_count IS DISTINCT FROM s.tx_count OR t.gross_cents IS DISTINCT FROM s.gross_cents
ORDER BY 1, 2;

-- Teil B: Korrektur (erst nach Prüfung von Teil A ausführen; in einer Transaktion, damit sich alles zurückrollen lässt)
-- BEGIN;
-- INSERT INTO public.earnings_tracker (helper_id, year, tx_count, gross_cents)
-- SELECT
--   e.helper_id,
--   EXTRACT(YEAR FROM (e.paid_out_at AT TIME ZONE 'Europe/Berlin'))::INT,
--   count(*)::INT,
--   COALESCE(sum(e.bid_cents), 0)::BIGINT
-- FROM public.escrow_transactions e
-- WHERE e.state = 'paid_out' AND e.paid_out_at IS NOT NULL
-- GROUP BY 1, 2
-- ON CONFLICT (helper_id, year) DO UPDATE
--   SET tx_count = EXCLUDED.tx_count, gross_cents = EXCLUDED.gross_cents;
-- COMMIT;

-- Zusatz: Aufträge, die abgeschlossen wurden, deren Zahlung aber nie freigegeben wurde (sollte selten sein).
-- Der Auftraggeber kann sie jetzt selbst über "Zahlung freigeben" abschließen; hier nur zur Übersicht:
SELECT g.id AS gig_id, g.title, g.customer_id, g.assigned_helper_id, e.state AS zahlung
FROM public.gigs g
JOIN public.escrow_transactions e ON e.gig_id = g.id
WHERE g.status = 'completed' AND e.state NOT IN ('paid_out', 'cancelled', 'disputed')
ORDER BY g.updated_at DESC;

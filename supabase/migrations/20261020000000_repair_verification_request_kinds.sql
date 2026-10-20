-- ============================================================
-- Reparatur: Verifizierungsanfragen für Jugendliche
--
-- In einzelnen bereits bereitgestellten Datenbanken war noch die
-- Constraint aus der Migration vom 06.10. aktiv. Dadurch wurde die
-- Einreichung mit kind = 'youth_documents' nach dem Upload abgelehnt.
-- Die Constraint wird hier bewusst erneut vollständig definiert, damit
-- sie auch dann korrekt ist, wenn frühere Migrationen nur teilweise oder
-- in einer älteren Reihenfolge eingespielt wurden.
-- ============================================================

ALTER TABLE public.verification_requests
  DROP CONSTRAINT IF EXISTS verification_requests_kind_check;

ALTER TABLE public.verification_requests
  ADD CONSTRAINT verification_requests_kind_check
  CHECK (kind IN ('guardian_consent', 'identity', 'job_approval', 'youth_documents'));

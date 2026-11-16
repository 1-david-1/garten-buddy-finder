-- ============================================================
-- Wiederkehrende Sperrzeiten für Helfer (z. B. Stundenplan)
--
-- Ein Helfer legt vorab fest, an welchen Wochentagen und zu welchen Uhrzeiten er regelmäßig nicht arbeiten kann
-- (Schule, Ausbildung, feste Termine). In diesen Zeiten ist er im Buchungskalender nicht buchbar.
--
--   * Die Regeln sieht und ändert nur der Helfer selbst (und Admins lesen mit). Kunden bekommen sie NIE direkt:
--     Der Server rechnet sie in konkrete, anonyme Zeitspannen um (ohne Bezeichnung wie "Schule").
--   * Durchgesetzt wird in der Datenbank (Trigger auf gigs), damit auch die Funktion purchase_with_schedule und
--     direkte Aufrufe an der Oberfläche vorbei die Sperrzeiten nicht umgehen können.
--   * Bereits gebuchte Termine bleiben bestehen - die Sperrzeiten wirken nur auf neue Buchungen und auf das
--     Verschieben eines Termins durch den Auftraggeber.
-- ============================================================

DO $$
BEGIN
  IF to_regclass('public.gigs') IS NULL THEN
    RAISE EXCEPTION 'Tabelle public.gigs fehlt - bitte zuerst die Basis-Migrationen ausführen.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.helper_recurring_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  helper_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- ISO-Wochentag: 1 = Montag ... 7 = Sonntag
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  -- Uhrzeiten in deutscher Ortszeit (Europe/Berlin)
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  label TEXT CHECK (label IS NULL OR char_length(label) <= 40),
  -- Optional: Gültigkeitszeitraum (z. B. Schulhalbjahr). NULL = unbegrenzt.
  valid_from DATE,
  valid_until DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT helper_recurring_blocks_time_order CHECK (end_time > start_time),
  CONSTRAINT helper_recurring_blocks_validity CHECK (valid_from IS NULL OR valid_until IS NULL OR valid_until >= valid_from)
);

CREATE INDEX IF NOT EXISTS idx_helper_recurring_blocks_helper ON public.helper_recurring_blocks (helper_id);

ALTER TABLE public.helper_recurring_blocks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.helper_recurring_blocks FROM PUBLIC;
REVOKE ALL ON public.helper_recurring_blocks FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.helper_recurring_blocks TO authenticated;
GRANT ALL ON public.helper_recurring_blocks TO service_role;

DROP POLICY IF EXISTS "Helper reads own recurring blocks" ON public.helper_recurring_blocks;
CREATE POLICY "Helper reads own recurring blocks" ON public.helper_recurring_blocks
  FOR SELECT TO authenticated USING (helper_id = auth.uid());

DROP POLICY IF EXISTS "Admins read recurring blocks" ON public.helper_recurring_blocks;
CREATE POLICY "Admins read recurring blocks" ON public.helper_recurring_blocks
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Helper inserts own recurring blocks" ON public.helper_recurring_blocks;
CREATE POLICY "Helper inserts own recurring blocks" ON public.helper_recurring_blocks
  FOR INSERT TO authenticated WITH CHECK (helper_id = auth.uid());

DROP POLICY IF EXISTS "Helper updates own recurring blocks" ON public.helper_recurring_blocks;
CREATE POLICY "Helper updates own recurring blocks" ON public.helper_recurring_blocks
  FOR UPDATE TO authenticated USING (helper_id = auth.uid()) WITH CHECK (helper_id = auth.uid());

DROP POLICY IF EXISTS "Helper deletes own recurring blocks" ON public.helper_recurring_blocks;
CREATE POLICY "Helper deletes own recurring blocks" ON public.helper_recurring_blocks
  FOR DELETE TO authenticated USING (helper_id = auth.uid());

DROP TRIGGER IF EXISTS trg_helper_recurring_blocks_updated_at ON public.helper_recurring_blocks;
CREATE TRIGGER trg_helper_recurring_blocks_updated_at BEFORE UPDATE ON public.helper_recurring_blocks
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Obergrenze pro Helfer (schützt vor Massen-Einträgen über die offene Schnittstelle).
CREATE OR REPLACE FUNCTION public.limit_helper_recurring_blocks()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT count(*) FROM public.helper_recurring_blocks WHERE helper_id = NEW.helper_id) >= 100 THEN
    RAISE EXCEPTION 'Du kannst höchstens 100 Sperrzeiten anlegen.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_limit_helper_recurring_blocks ON public.helper_recurring_blocks;
CREATE TRIGGER trg_limit_helper_recurring_blocks BEFORE INSERT ON public.helper_recurring_blocks
  FOR EACH ROW EXECUTE FUNCTION public.limit_helper_recurring_blocks();

-- ------------------------------------------------------------
-- Durchsetzung beim Buchen und beim Verschieben
--   * INSERT eines Auftrags, der direkt an einen Helfer geht (Status pending_helper, so legen Buchungen ihn an)
--   * UPDATE von scheduled_at bei einem Auftrag mit zugewiesenem Helfer (Auftraggeber verschiebt den Termin)
-- Nicht betroffen: Gebote auf offene Aufträge (der Helfer wählt dort selbst) und Service-Rolle/Admins.
-- Zeiten werden in deutscher Ortszeit verglichen. Eine Sperrzeit liegt innerhalb eines Tages; reicht ein Termin über
-- Mitternacht, wird der Teil bis 24:00 Uhr am Starttag geprüft.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_helper_recurring_blocks()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_local TIMESTAMP;
  v_end TIMESTAMP;
  v_day DATE;
  v_end_time TIME;
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF NEW.assigned_helper_id IS NULL OR NEW.scheduled_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'pending_helper' THEN
      RETURN NEW;
    END IF;
  ELSE
    IF NEW.scheduled_at IS NOT DISTINCT FROM OLD.scheduled_at
       OR NEW.status NOT IN ('pending_helper', 'assigned') THEN
      RETURN NEW;
    END IF;
  END IF;

  v_local := NEW.scheduled_at AT TIME ZONE 'Europe/Berlin';
  v_end := v_local + make_interval(mins => COALESCE(NEW.duration_minutes, 60));
  v_day := v_local::date;
  v_end_time := CASE WHEN v_end::date > v_day THEN TIME '23:59:59.999999' ELSE v_end::time END;

  IF EXISTS (
    SELECT 1
    FROM public.helper_recurring_blocks b
    WHERE b.helper_id = NEW.assigned_helper_id
      AND b.weekday = EXTRACT(ISODOW FROM v_local)::int
      AND (b.valid_from IS NULL OR v_day >= b.valid_from)
      AND (b.valid_until IS NULL OR v_day <= b.valid_until)
      AND v_local::time < b.end_time
      AND v_end_time > b.start_time
  ) THEN
    RAISE EXCEPTION 'Der Helfer ist zu dieser Zeit nicht verfügbar.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_helper_recurring_blocks ON public.gigs;
CREATE TRIGGER trg_enforce_helper_recurring_blocks
  BEFORE INSERT OR UPDATE OF scheduled_at ON public.gigs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_helper_recurring_blocks();

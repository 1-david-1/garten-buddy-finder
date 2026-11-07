-- ============================================================
-- Reparatur: Benachrichtigungen (notifications) und veraltete Trigger
--
-- Problem im Projekt: Zwei Migrationen legen die Tabelle "notifications" an
--   * 20260926000000_notifications.sql  (alte Form: type, content, is_read, metadata) samt drei Triggern
--     auf "messages" und "gigs", die in diese alte Form schreiben
--   * 20260930000000_notifications.sql  (neue Form, die die App nutzt: category, body, read_at)
-- Die zweite scheitert mit "relation notifications already exists" - dabei bricht die Migrationskette ab, und
-- alle späteren Migrationen (Verifizierung, Eltern-Konto, Jugend-Freigaben, Heckenschnitt) werden nicht
-- eingespielt. Wo beide Formen vermischt wurden, schlagen die alten Trigger bei jeder Chat-Nachricht und jeder
-- Statusänderung eines Auftrags fehl ("column type of relation notifications does not exist").
--
-- Diese Migration ist idempotent und in jedem Zustand der Datenbank gefahrlos ausführbar:
--   1. alte Trigger und Funktionen entfernen (falls vorhanden)
--   2. Tabelle "notifications" anlegen bzw. von der alten auf die neue Form umbauen (Daten bleiben erhalten)
--   3. Policies, Rechte, Index und Realtime wie in 20260930000000_notifications.sql
-- ============================================================

DO $$
BEGIN
  IF to_regclass('public.gigs') IS NULL THEN
    RAISE NOTICE 'Hinweis: Die Tabelle public.gigs fehlt in dieser Datenbank. Die Basis-Migrationen (ab 20260720070048) sind hier nicht eingespielt - bitte zuerst supabase/diagnostics/check_database.sql ausführen.';
  END IF;

  -- 1. Alte Trigger entfernen
  IF to_regclass('public.messages') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trigger_notify_on_new_message ON public.messages';
  END IF;
  IF to_regclass('public.gigs') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trigger_notify_on_gig_status_change ON public.gigs';
    EXECUTE 'DROP TRIGGER IF EXISTS trigger_notify_on_new_booking_request ON public.gigs';
  END IF;
END
$$;

DROP FUNCTION IF EXISTS public.notify_on_new_message();
DROP FUNCTION IF EXISTS public.notify_on_gig_status_change();
DROP FUNCTION IF EXISTS public.notify_on_new_booking_request();

-- 2. Tabelle in der Form, die die App benutzt
DO $$
BEGIN
  IF to_regclass('public.notifications') IS NULL THEN
    CREATE TABLE public.notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      link TEXT,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  ELSE
    -- Umbau der alten Form (type, content, is_read, metadata) in die neue Form
    ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS category TEXT;
    ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS body TEXT;
    ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'type') THEN
      EXECUTE 'UPDATE public.notifications SET category = COALESCE(category, type)';
      EXECUTE 'ALTER TABLE public.notifications DROP COLUMN type';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'content') THEN
      EXECUTE 'UPDATE public.notifications SET body = COALESCE(body, content)';
      EXECUTE 'ALTER TABLE public.notifications DROP COLUMN content';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'is_read') THEN
      EXECUTE 'UPDATE public.notifications SET read_at = COALESCE(read_at, CASE WHEN is_read THEN created_at END)';
      EXECUTE 'ALTER TABLE public.notifications DROP COLUMN is_read';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'metadata') THEN
      EXECUTE 'ALTER TABLE public.notifications DROP COLUMN metadata';
    END IF;

    UPDATE public.notifications SET category = 'system' WHERE category IS NULL;
    ALTER TABLE public.notifications ALTER COLUMN category SET NOT NULL;
  END IF;
END
$$;

-- 3. Index, Rechte, Policies, Realtime
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users read own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users mark own notifications read" ON public.notifications;

CREATE POLICY "Users read own notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users mark own notifications read" ON public.notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
EXCEPTION WHEN undefined_object THEN
  RAISE NOTICE 'Publikation supabase_realtime nicht vorhanden - Realtime für notifications übersprungen.';
END
$$;

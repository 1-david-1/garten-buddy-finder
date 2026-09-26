CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('message', 'gig_status', 'market_offer', 'payment_received', 'booking_request', 'system')),
  title TEXT NOT NULL,
  content TEXT,
  link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_id ON public.notifications (user_id, created_at DESC);
CREATE INDEX idx_notifications_is_read ON public.notifications (user_id, is_read);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notifications"
  ON public.notifications FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Trigger function to add a notification on new message
CREATE OR REPLACE FUNCTION public.notify_on_new_message()
RETURNS trigger AS $$
DECLARE
  v_recipient_id UUID;
  v_sender_name TEXT;
  v_conversation RECORD;
BEGIN
  -- Get conversation details
  SELECT * INTO v_conversation FROM public.conversations WHERE id = NEW.conversation_id;
  
  -- Determine recipient
  IF NEW.sender_id = v_conversation.participant_a THEN
    v_recipient_id := v_conversation.participant_b;
  ELSE
    v_recipient_id := v_conversation.participant_a;
  END IF;

  -- Get sender name
  SELECT display_name INTO v_sender_name FROM public.profiles WHERE id = NEW.sender_id;
  IF v_sender_name IS NULL THEN
    v_sender_name := 'Jemand';
  END IF;

  -- Create notification
  INSERT INTO public.notifications (user_id, type, title, content, link, metadata)
  VALUES (
    v_recipient_id,
    'message',
    'Neue Nachricht von ' || v_sender_name,
    substring(NEW.body from 1 for 100),
    '/messages/' || NEW.conversation_id,
    jsonb_build_object('message_id', NEW.id, 'conversation_id', NEW.conversation_id)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_notify_on_new_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_message();


-- Trigger function to add a notification on gig status change (e.g. from negotiating to assigned)
CREATE OR REPLACE FUNCTION public.notify_on_gig_status_change()
RETURNS trigger AS $$
DECLARE
  v_customer_name TEXT;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    
    -- Notify Customer when helper accepts
    IF NEW.status = 'assigned' THEN
      INSERT INTO public.notifications (user_id, type, title, content, link, metadata)
      VALUES (
        NEW.customer_id,
        'gig_status',
        'Buchungsanfrage bestätigt',
        'Deine Anfrage "' || NEW.title || '" wurde von einem Helfer angenommen.',
        '/gigs/' || NEW.id,
        jsonb_build_object('gig_id', NEW.id, 'status', NEW.status)
      );
    END IF;

    -- Notify Customer when completed
    IF NEW.status = 'completed' THEN
      INSERT INTO public.notifications (user_id, type, title, content, link, metadata)
      VALUES (
        NEW.customer_id,
        'gig_status',
        'Auftrag abgeschlossen',
        'Der Auftrag "' || NEW.title || '" wurde als erledigt markiert.',
        '/gigs/' || NEW.id,
        jsonb_build_object('gig_id', NEW.id, 'status', NEW.status)
      );
    END IF;

  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_notify_on_gig_status_change
  AFTER UPDATE OF status ON public.gigs
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_gig_status_change();


-- Note: For booking requests (when a gig is assigned to a specific helper and status is negotiating)
CREATE OR REPLACE FUNCTION public.notify_on_new_booking_request()
RETURNS trigger AS $$
DECLARE
  v_customer_name TEXT;
BEGIN
  -- We only want to notify if the status becomes negotiating and it has an assigned helper, 
  -- and it wasn't already in this state before.
  IF NEW.status = 'negotiating' AND NEW.assigned_helper_id IS NOT NULL THEN
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.assigned_helper_id IS DISTINCT FROM NEW.assigned_helper_id)) THEN
      
      -- Get customer name
      SELECT display_name INTO v_customer_name FROM public.profiles WHERE id = NEW.customer_id;
      IF v_customer_name IS NULL THEN
        v_customer_name := 'Jemand';
      END IF;

      INSERT INTO public.notifications (user_id, type, title, content, link, metadata)
      VALUES (
        NEW.assigned_helper_id,
        'booking_request',
        'Neue Buchungsanfrage',
        v_customer_name || ' hat dir eine direkte Anfrage für "' || NEW.title || '" gesendet.',
        '/inbox', 
        jsonb_build_object('gig_id', NEW.id)
      );

    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_notify_on_new_booking_request
  AFTER INSERT OR UPDATE OF status, assigned_helper_id ON public.gigs
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_booking_request();

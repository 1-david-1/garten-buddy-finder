-- Storno-Funktion für laufende Aufträge (Kunde und zugewiesener Helfer
-- dürfen stornieren, siehe cancelGig() in gigs.functions.ts). Die
-- bestehenden RLS-Policies auf "gigs" ("Customer manages own gigs",
-- "Assigned helper can update gig status") decken das Setzen von
-- status = 'cancelled' bereits ab, hier kommen nur die zusätzlichen
-- Spalten und der neue Escrow-Status dazu.

ALTER TABLE public.gigs
  ADD COLUMN cancellation_reason TEXT,
  ADD COLUMN cancelled_by UUID REFERENCES auth.users(id),
  ADD COLUMN cancelled_at TIMESTAMPTZ;

ALTER TYPE public.escrow_state ADD VALUE IF NOT EXISTS 'cancelled';

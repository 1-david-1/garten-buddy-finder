-- ============================================================
-- Eltern-Registrierung per E-Mail-Link
--
-- Die Eltern-Mail enthält jetzt einen eigenen, geheimen Registrierungs-Link
-- (/eltern-registrierung/<token>). Dieser Token geht NUR per E-Mail an die Eltern,
-- nie an das Kind (anders als der weiterleitbare Einladungslink). Auf der Seite
-- ist die Eltern-E-Mail bereits eingetragen; es fehlen nur Name und Passwort.
--
-- In der Datenbank steht nur der SHA-256-Hash des Tokens.
-- ============================================================
ALTER TABLE public.guardian_links
  ADD COLUMN IF NOT EXISTS registration_token_hash TEXT UNIQUE;

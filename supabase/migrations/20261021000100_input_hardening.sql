-- ============================================================================
-- Eingabe-Härtung: Bild-only Uploads (Storage) und Schutz vor eingeschleustem Code in Namen
--
-- 1. Storage: Der Bucket "verification-docs" (Ausweise, Jugend-Unterlagen) akzeptiert nur
--    noch Bilder (JPEG, PNG, WebP). PDFs und andere Dateien werden vom Storage-Dienst abgelehnt.
--    Der Bucket "listing-photos" erlaubt bereits ausschließlich diese drei Bildtypen.
-- 2. Profile: Anzeigename, Ort und Firmenname werden beim Speichern von Zeichen befreit, die
--    für HTML-/Skript-Injection gebraucht werden (< > " ` { } \ | ^ ~ ; = [ ]) sowie von
--    Steuerzeichen. Beim Anzeigenamen entfallen zusätzlich : @ / (keine URLs/E-Mail-Adressen).
--    Das ist die zweite Schicht hinter der strengen Prüfung in der Anwendung (src/lib/sanitize.ts)
--    und deckt auch Namen ab, die aus dem E-Mail-Anfang oder von Login-Anbietern stammen.
-- ============================================================================

-- 1. Storage: nur Bilder ------------------------------------------------------
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'],
    file_size_limit    = 10485760
WHERE id = 'verification-docs';

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'],
    file_size_limit    = 5242880
WHERE id = 'listing-photos';

-- 2. Profile: Sonderzeichen entfernen -------------------------------------------
CREATE OR REPLACE FUNCTION public.strip_unsafe_chars(v text, max_len integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT left(
    btrim(
      regexp_replace(
        regexp_replace(v, '[<>"`{}\\|^~;=\[\]]|[[:cntrl:]]', '', 'g'),
        '\s+', ' ', 'g'
      )
    ),
    max_len
  )
$$;

CREATE OR REPLACE FUNCTION public.profiles_sanitize_text()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.display_name IS NOT NULL AND NEW.display_name <> '' THEN
    NEW.display_name := public.strip_unsafe_chars(regexp_replace(NEW.display_name, '[:@/]', '', 'g'), 60);
    IF NEW.display_name = '' THEN
      NEW.display_name := 'Nutzer';
    END IF;
  END IF;
  IF NEW.city IS NOT NULL THEN
    NEW.city := public.strip_unsafe_chars(NEW.city, 80);
  END IF;
  IF NEW.business_name IS NOT NULL THEN
    NEW.business_name := public.strip_unsafe_chars(NEW.business_name, 100);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_sanitize_text ON public.profiles;
CREATE TRIGGER trg_profiles_sanitize_text
  BEFORE INSERT OR UPDATE OF display_name, city, business_name ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_sanitize_text();

-- Bestehende Profile einmalig bereinigen (löst den Trigger aus)
UPDATE public.profiles
SET display_name = display_name
WHERE display_name ~ '[<>"`{}\\|^~;=\[\]:@/]|[[:cntrl:]]'
   OR city ~ '[<>"`{}\\|^~;=\[\]]|[[:cntrl:]]'
   OR business_name ~ '[<>"`{}\\|^~;=\[\]]|[[:cntrl:]]';

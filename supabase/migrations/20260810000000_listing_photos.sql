-- Bild-Upload für Service-Angebote. Pfad-Konvention im Bucket:
-- {helper_id}/{listing_id}/{dateiname} — die Policies unten prüfen den
-- ersten Pfad-Teil (Ordnername) gegen auth.uid(), damit nur der Helfer
-- selbst in seinen eigenen Ordner schreiben kann. Der Bucket ist public,
-- damit Bilder ohne signierte URLs im Marktplatz angezeigt werden können
-- (unproblematisch, da es sich um öffentliche Angebotsfotos handelt, keine
-- privaten Dateien).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'listing-photos',
  'listing-photos',
  true,
  5242880, -- 5 MB pro Datei
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Jeder kann Angebotsfotos ansehen"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'listing-photos');

CREATE POLICY "Helfer laden Fotos in den eigenen Ordner hoch"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'listing-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Helfer löschen eigene Angebotsfotos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'listing-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Bild-URLs am Angebot selbst speichern (bis zu 5 Fotos pro Angebot, in
-- Anzeigereihenfolge).
ALTER TABLE public.service_listings
  ADD COLUMN IF NOT EXISTS photos TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.service_listings.photos IS
  'Öffentliche URLs der Angebotsfotos (Supabase Storage, Bucket "listing-photos"), in Anzeigereihenfolge.';

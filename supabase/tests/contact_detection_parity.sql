-- Prüft die Datenbankfunktion public.contains_private_contact (gleiche Fälle wie
-- src/lib/__tests__/contact-detection.test.ts). Ausführen z. B. mit:
--   psql "$DATABASE_URL" -f supabase/tests/contact_detection_parity.sql
-- Bei Abweichung bricht das Skript mit einer Fehlermeldung ab.
DO $$
DECLARE
  must_match TEXT[] := ARRAY[
    'Ruf mich an: 0176 12345678',
    'Meine Nummer ist +49 151 2345 6789',
    'Schreib mir 030/1234567',
    'mail mir an max.mustermann@example.de',
    'max (at) example (dot) de',
    'Schau auf https://example.com/mein-profil',
    'www.example.de',
    'Lass uns auf WhatsApp schreiben',
    'Hast du Insta oder Snapchat?',
    '01761234567',
    'Schreib mir auf Whats.App',
    'w h a t s a p p',
    '1nstagram',
    'Meine Nummer: null eins sieben sechs eins zwei drei vier fünf',
    'n' || chr(1072) || 'me@example.de',
    '0 1 7 6 1 2 3 4 5 6',
    'Ruf an: 01' || chr(8203) || '76 1234 5678'
  ];
  must_not_match TEXT[] := ARRAY[
    'Ich komme am 12.10.2026 um 14:00 Uhr.',
    'Der Garten ist ca. 120 m² groß, Budget 45 €.',
    'Bis Samstag, 10 bis 12 Uhr, passt das?',
    'Danke, bis dann!',
    'Hausnummer 12, 2. Stock',
    'Wir sind in Stau gestanden',
    'Das Telegramm kam gestern.',
    'Ich habe vier Stunden Zeit.',
    'Eins, zwei, drei – los gehts!',
    'Ich gehe ins Tal.',
    'Der Rasen ist 3 x 4 m groß, 2 Bäume, 5 Beete.'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY must_match LOOP
    IF NOT public.contains_private_contact(t) THEN
      RAISE EXCEPTION 'Sollte erkannt werden, wurde aber nicht: %', t;
    END IF;
  END LOOP;
  FOREACH t IN ARRAY must_not_match LOOP
    IF public.contains_private_contact(t) THEN
      RAISE EXCEPTION 'Sollte NICHT erkannt werden, wurde aber erkannt: %', t;
    END IF;
  END LOOP;
  RAISE NOTICE 'contains_private_contact: alle Fälle ok';
END $$;

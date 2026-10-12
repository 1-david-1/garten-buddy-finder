/**
 * Erkennt private Kontaktdaten in Nachrichten (Telefonnummer, E-Mail, Link, Messenger).
 * Gleiche Muster wie die Datenbankfunktion public.contains_private_contact (Migration
 * 20261009000000) - beide Stellen gemeinsam pflegen. Die Datenbank ist die verbindliche
 * Durchsetzung (nur in Chats mit Jugendlichen); diese Funktion dient der frühen Warnung im UI.
 */
const PATTERNS: RegExp[] = [
  // E-Mail, auch verschleiert: name (at) domain (dot) de
  /[a-z0-9._%+-]+\s*(@|\(at\)|\[at\])\s*[a-z0-9.-]+\s*(\.|\(dot\)|\[dot\])\s*[a-z]{2,}/i,
  // Links
  /(https?:\/\/|www\.)\S+/i,
  // Telefon: internationale Vorwahl
  /(\+|\b00)\d[\d\s/()-]{7,}\d/,
  // Telefon: deutsche Vorwahl (0176 1234567, 030/123456) - Datumsangaben wie 12.10.2026 nicht
  /\b0\d{2,4}[\s/-]?\d{3,}[\s/-]?\d{2,}/,
  // lange Ziffernfolgen
  /\d{9,}/,
  // Messenger / soziale Netzwerke
  /\b(whatsapp|whats\s?app|telegram|signal|snapchat|instagram|insta|tiktok|discord|facebook|messenger)\b/i,
];

export function containsPrivateContact(text: string): boolean {
  return PATTERNS.some((p) => p.test(text));
}

export const CONTACT_WARNING =
  "Bitte gib keine privaten Kontaktdaten weiter (Telefonnummer, E-Mail, Messenger, Links). In Chats mit Jugendlichen werden solche Nachrichten nicht zugestellt, wiederholte Versuche führen zur Sperre der Kommunikation.";

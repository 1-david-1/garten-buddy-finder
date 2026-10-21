/**
 * Erkennt private Kontaktdaten in Nachrichten (Telefonnummer, E-Mail, Link, Messenger).
 * Gleiche Logik wie die Datenbankfunktion public.contains_private_contact (Migration
 * 20261021000000) - beide Stellen gemeinsam pflegen. Die Datenbank ist die verbindliche
 * Durchsetzung (nur in Chats mit Jugendlichen); diese Funktion dient der frühen Warnung im UI.
 *
 * Der Text wird vor der Prüfung normalisiert (Unicode NFKC, unsichtbare Zeichen entfernt,
 * Kleinschreibung, kyrillische/griechische Lookalikes -> lateinisch), damit Tricks wie
 * "nаme@domain.de" (kyrillisches "а"), Vollbreite-Ziffern oder Zero-Width-Zeichen nicht greifen.
 *
 * Bewusst NICHT erkannt: Kontaktdaten, die auf mehrere Nachrichten verteilt werden, und
 * Kontaktdaten in Bildern.
 */

const HOMOGLYPHS: Record<string, string> = {
  "\u0430": "a", // kyrillisch а
  "\u0435": "e", // е
  "\u043e": "o", // о
  "\u0440": "p", // р
  "\u0441": "c", // с
  "\u0443": "y", // у
  "\u0445": "x", // х
  "\u0456": "i", // і
  "\u0458": "j", // ј
  "\u0455": "s", // ѕ
  "\u03bf": "o", // griechisch ο
};

/** Normalisiert Text für die Kontaktprüfung (entspricht public.normalize_contact_text). */
export function normalizeForContactCheck(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, "")
    .toLowerCase()
    .replace(/[\u0430\u0435\u043e\u0440\u0441\u0443\u0445\u0456\u0458\u0455\u03bf]/g, (ch) => HOMOGLYPHS[ch] ?? ch);
}

const PATTERNS: RegExp[] = [
  // E-Mail, auch verschleiert: name (at) domain (dot) de
  /[a-z0-9._%+-]+\s*(@|\(at\)|\[at\])\s*[a-z0-9.-]+\s*(\.|\(dot\)|\[dot\])\s*[a-z]{2,}/,
  // Links
  /(https?:\/\/|www\.)\S+/,
  // Telefon: internationale Vorwahl
  /(\+|\b00)\d[\d\s/()-]{7,}\d/,
  // Telefon: deutsche Vorwahl (0176 1234567, 030/123456) - Datumsangaben wie 12.10.2026 nicht
  /\b0\d{2,4}[\s/-]?\d{3,}[\s/-]?\d{2,}/,
  // lange Ziffernfolgen
  /\d{9,}/,
  // einzelne Ziffern mit Trennzeichen: "0 1 7 6 1 2 3 4 5"
  /(\d[\s.*_-]){8,}\d/,
  // Messenger / soziale Netzwerke, auch mit Leetspeak und Trennzeichen (w h a t s a p p, 1nstagram)
  /(^|[^a-z])(w[\s._*-]?h[\s._*-]?[a4@][\s._*-]?[t7][\s._*-]?[s5$][\s._*-]?[a4@][\s._*-]?p[\s._*-]?p|[t7][\s._*-]?[e3][\s._*-]?l[\s._*-]?[e3][\s._*-]?g[\s._*-]?r[\s._*-]?[a4@][\s._*-]?m|[s5$][\s._*-]?[i1!|][\s._*-]?g[\s._*-]?n[\s._*-]?[a4@][\s._*-]?l|[s5$][\s._*-]?n[\s._*-]?[a4@][\s._*-]?p[\s._*-]?c[\s._*-]?h[\s._*-]?[a4@][\s._*-]?[t7]|[i1!|][\s._*-]?n[\s._*-]?[s5$][\s._*-]?[t7][\s._*-]?[a4@][\s._*-]?g[\s._*-]?r[\s._*-]?[a4@][\s._*-]?m|[i1!|][\s._*-]?n[\s._*-]?[s5$][\s._*-]?[t7][\s._*-]?[a4@]|[t7][\s._*-]?[i1!|][\s._*-]?k[\s._*-]?[t7][\s._*-]?[o0][\s._*-]?k|d[\s._*-]?[i1!|][\s._*-]?[s5$][\s._*-]?c[\s._*-]?[o0][\s._*-]?r[\s._*-]?d|f[\s._*-]?[a4@][\s._*-]?c[\s._*-]?[e3][\s._*-]?b[\s._*-]?[o0][\s._*-]?[o0][\s._*-]?k|m[\s._*-]?[e3][\s._*-]?[s5$][\s._*-]?[s5$][\s._*-]?[e3][\s._*-]?n[\s._*-]?g[\s._*-]?[e3][\s._*-]?r)($|[^a-z])/,
  // ausgeschriebene Ziffern: "null eins sieben sechs ..." (mindestens 6 in Folge)
  /(^|[^a-zäöüß])((?:null|eins|ein|zwei|drei|vier|fünf|fuenf|sechs|sieben|acht|neun|zero|one|two|three|four|five|six|seven|eight|nine|oh)[\s,.\-]+){5,}(?:null|eins|ein|zwei|drei|vier|fünf|fuenf|sechs|sieben|acht|neun|zero|one|two|three|four|five|six|seven|eight|nine|oh)($|[^a-zäöüß])/,
];

export function containsPrivateContact(text: string): boolean {
  const normalized = normalizeForContactCheck(text);
  return PATTERNS.some((p) => p.test(normalized));
}

export const CONTACT_WARNING =
  "Bitte gib keine privaten Kontaktdaten weiter (Telefonnummer, E-Mail, Messenger, Links). In Chats mit Jugendlichen werden solche Nachrichten nicht zugestellt, wiederholte Versuche führen zur Sperre der Kommunikation.";

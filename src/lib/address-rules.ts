// Prüfung von Auftragsadressen: nur Freiburg im Breisgau, und die Adresse muss wie eine echte Adresse aufgebaut
// sein (Straße + Hausnummer + Freiburger PLZ). Es wird NICHT jede Adresse gegen ein Verzeichnis geprüft -
// geprüft wird die Struktur, und bei jedem Problem bekommt man ein konkretes Beispiel.
// Gemeinsam für Browser (sofortiges Feedback) und Server (verbindlich). Die Datenbank prüft PLZ und Aufbau noch einmal
// (20261104000000_standing_approvals_and_posting_rules.sql).

import { containsPrivateContact } from "@/lib/contact-detection";
import { FREIBURG_ONLY_ERROR, isFreiburgCityPostalCode, normalizePostalCode } from "@/lib/freiburg-area";

/** Stadtteile von Freiburg - als Orientierung in den Hinweisen. */
export const FREIBURG_DISTRICTS = [
  "Altstadt",
  "Neuburg",
  "Herdern",
  "Zähringen",
  "Stühlinger",
  "Brühl",
  "Betzenhausen",
  "Mooswald",
  "Haslach",
  "Landwasser",
  "Rieselfeld",
  "Weingarten",
  "Wiehre",
  "Günterstal",
  "Waldsee",
  "Littenweiler",
  "Ebnet",
  "Kappel",
  "Oberau",
  "Lehen",
  "Hochdorf",
  "Tiengen",
  "Opfingen",
  "Munzingen",
  "Waltershofen",
  "St. Georgen",
  "Vauban",
] as const;

/**
 * Bekannte Freiburger Straßen - NUR für Vorschläge und Beispiele. Die Liste ist nicht vollständig und wird nie
 * zum Ablehnen benutzt: Wer eine andere (echte) Straße eingibt, wird nicht gestoppt.
 */
export const FREIBURG_STREET_SUGGESTIONS = [
  "Kaiser-Joseph-Straße",
  "Bertoldstraße",
  "Salzstraße",
  "Gerberau",
  "Münsterplatz",
  "Rathausplatz",
  "Schwarzwaldstraße",
  "Basler Straße",
  "Habsburgerstraße",
  "Günterstalstraße",
  "Merzhauser Straße",
  "Lorettostraße",
  "Wiesentalstraße",
  "Hermann-Herder-Straße",
  "Eschholzstraße",
  "Elsässer Straße",
  "Zähringer Straße",
  "Humboldtstraße",
  "Friedrichstraße",
  "Rempartstraße",
  "Werthmannstraße",
  "Ensisheimer Straße",
  "Sundgauallee",
  "Bissierstraße",
  "Runzstraße",
  "Hindenburgstraße",
  "Berliner Allee",
  "Lehener Straße",
  "Wannerstraße",
  "Dreisamstraße",
  "Sedanstraße",
  "Wentzingerstraße",
  "Talstraße",
  "Tennenbacher Straße",
  "Carl-Kistner-Straße",
  "Engesserstraße",
  "Stefan-Meier-Straße",
  "Fehrenbachallee",
  "Zasiusstraße",
  "Schreiberstraße",
  "Kartäuserstraße",
  "Dreikönigstraße",
  "Vaubanallee",
  "Rieselfeldallee",
  "Haslacher Straße",
  "Munzinger Straße",
  "Lindenmattenstraße",
  "Kappler Straße",
  "Emmendinger Straße",
  "Waldkircher Straße",
] as const;

/** Ein Beispiel, das immer gleich aufgebaut ist, z. B. "Schwarzwaldstraße 12". Nur zur Orientierung. */
export function addressExample(seed = 0): string {
  const n = Math.abs(Math.trunc(seed));
  const street = FREIBURG_STREET_SUGGESTIONS[(n * 7) % FREIBURG_STREET_SUGGESTIONS.length];
  const number = ((n * 13) % 47) + 2;
  const letter = n % 5 === 0 ? "a" : "";
  return `${street} ${number}${letter}`;
}

export function exampleLine(seed = 0): string {
  return `${addressExample(seed)}, 79102 Freiburg`;
}

/** Vorschläge für die Eingabe der Straße (nur Namen, ohne Hausnummer). */
export function suggestStreets(input: string, limit = 6): string[] {
  const q = input.trim().toLowerCase().replace(/\s+\d.*$/, "");
  if (q.length < 2) return [];
  const starts = FREIBURG_STREET_SUGGESTIONS.filter((s) => s.toLowerCase().startsWith(q));
  const contains = FREIBURG_STREET_SUGGESTIONS.filter((s) => !starts.includes(s) && s.toLowerCase().includes(q));
  return [...starts, ...contains].slice(0, limit);
}

export type AddressIssueCode =
  | "empty"
  | "no_number"
  | "bad_street"
  | "placeholder"
  | "pobox"
  | "contact"
  | "other_city"
  | "plz_missing"
  | "plz_not_freiburg"
  | "plz_mismatch";

export interface AddressIssue {
  code: AddressIssueCode;
  message: string;
  /** Konkretes Beispiel, wie es richtig aussieht */
  example?: string;
}

export interface AddressCheck {
  ok: boolean;
  issues: AddressIssue[];
  /** Hinweise, die nicht blockieren (z. B. Schreibweise der Straße prüfen) */
  warnings: string[];
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  /** "Schwarzwaldstraße 12" - einheitliche Schreibweise für Speicherung und Duplikat-Erkennung */
  normalizedAddress: string | null;
}

const PLACEHOLDER = /(muster|teststr|testweg|\btest\b|asdf|qwert|xxx|\babc\b|irgendwo|unbekannt|keine adresse|nach absprache|auf anfrage|\bsiehe\b|folgt|\btbd\b|\bn\/a\b|bitte melden|nachfragen)/i;
const POBOX = /(postfach|packstation|\bc\/o\b|\bpf\s?\d)/i;
const STREET_CHARS = /^[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß .'’\-]*$/;
const COMMON_SUFFIX = /(stra(ß|ss)e|str\.|weg|allee|platz|gasse|ring|ufer|damm|pfad|steig|hof|markt|br(ü|ue)cke|berg|tal|park|graben|rain|winkel|kehre|bogen|au|halde|matte|feld|acker|garten|wald)\.?$/i;
const COMMON_PREFIX = /^(am|an|auf|im|in|zum|zur|bei|unter|über|hinter|vor|alte|alter|altes|neue|neuer|obere|oberer|untere|unterer|große|großer|kleine|kleiner|st\.|sankt)\s/i;
/** Zusätze hinter der Hausnummer, die nicht zur Adresse im engeren Sinn gehören: ", Hinterhaus", ", 2. OG" */
const ANNEX_SEGMENT = /^(?:\d{1,2}\.?\s*)?(hinterhaus|vorderhaus|gartenhaus|seitenfl(ü|ue)gel|erdgeschoss|eg|og|dg|etage|stock|obergeschoss|dachgeschoss|hof|r(ü|ue)ckgeb(ä|ae)ude|keller|souterrain)\b.*$/i;
const HOUSE_NUMBER = /(\d{1,3})\s?([a-zA-Z])?(?:\s?[-–/]\s?(\d{1,3})\s?([a-zA-Z])?)?$/;

/** Schneidet PLZ und Ort ab ("…, 79102 Freiburg") und liefert den Rest. */
export function splitAddress(raw: string): { street: string; postalCode: string | null; city: string | null } {
  let text = raw
    .replace(/\s+/g, " ")
    .split(",")
    .map((seg) => seg.trim())
    .filter((seg) => seg && !ANNEX_SEGMENT.test(seg))
    .join(", ");
  let postalCode: string | null = null;
  let city: string | null = null;
  const plz = text.match(/\b(\d{5})\b\s*([A-Za-zÄÖÜäöüß.\- ]*)$/);
  if (plz && plz.index !== undefined) {
    postalCode = plz[1];
    city = plz[2].trim() || null;
    text = text.slice(0, plz.index).replace(/[,\s]+$/, "");
  } else {
    const cityOnly = text.match(/,\s*([A-Za-zÄÖÜäöüß.\- ]+)$/);
    if (cityOnly && cityOnly.index !== undefined) {
      city = cityOnly[1].trim();
      text = text.slice(0, cityOnly.index).trim();
    }
  }
  return { street: text, postalCode, city };
}

/** Plausibilitätsprüfung eines Straßennamens: Buchstaben, genug Vokale, keine Tastatur-Ketten. */
function looksLikeStreetName(name: string): boolean {
  if (name.length < 3 || name.length > 60 || !STREET_CHARS.test(name)) return false;
  const letters = name.replace(/[^A-Za-zÄÖÜäöüß]/g, "");
  if (letters.length < 3) return false;
  if (/(.)\1{3,}/i.test(letters)) return false;
  const vowels = letters.match(/[aeiouäöüyAEIOUÄÖÜY]/g)?.length ?? 0;
  return vowels / letters.length >= 0.15;
}

/**
 * Prüft Straße + Hausnummer + PLZ. "address" darf PLZ und Ort enthalten; "postalCode" ist das eigene PLZ-Feld
 * (wenn beides angegeben ist, müssen sie übereinstimmen).
 */
export function checkFreiburgAddress(address: string, postalCode?: string | null, seed = 0): AddressCheck {
  const issues: AddressIssue[] = [];
  const warnings: string[] = [];
  const example = addressExample(seed);
  const fail = (code: AddressIssueCode, message: string, withExample = true) =>
    issues.push({ code, message, ...(withExample ? { example } : {}) });

  const raw = (address ?? "").trim();
  const empty = (): AddressCheck => ({ ok: false, issues, warnings, street: null, houseNumber: null, postalCode: null, normalizedAddress: null });
  if (!raw) {
    fail("empty", "Bitte gib die Adresse an, an der die Arbeit stattfindet (Straße und Hausnummer).");
    return empty();
  }

  if (POBOX.test(raw)) {
    fail("pobox", "Ein Postfach oder eine Packstation ist keine Einsatzadresse. Bitte gib die Straße und Hausnummer an, an der gearbeitet wird.");
    return empty();
  }
  if (containsPrivateContact(raw)) {
    fail("contact", "In das Adressfeld gehören keine Telefonnummern, E-Mail-Adressen oder Links. Kontakt läuft über den Chat in GreenMatch.", false);
    return empty();
  }

  const parts = splitAddress(raw);
  const explicitPlz = normalizePostalCode(postalCode ?? null);
  const plz = explicitPlz ?? parts.postalCode;

  // PLZ
  if (!plz) {
    fail("plz_missing", "Bitte gib eine Freiburger Postleitzahl an, zum Beispiel 79102.", false);
  } else if (!isFreiburgCityPostalCode(plz)) {
    fail("plz_not_freiburg", `${FREIBURG_ONLY_ERROR} „${plz}“ gehört nicht dazu.`, false);
  }
  if (explicitPlz && parts.postalCode && explicitPlz !== parts.postalCode) {
    fail("plz_mismatch", `Die Postleitzahl im Adressfeld (${parts.postalCode}) passt nicht zum PLZ-Feld (${explicitPlz}).`, false);
  }
  if (parts.city && !/^freiburg\b/i.test(parts.city)) {
    fail("other_city", `Aufträge sind nur in Freiburg im Breisgau möglich – „${parts.city}“ liegt außerhalb.`, false);
  }

  // Straße + Hausnummer
  const hn = parts.street.match(HOUSE_NUMBER);
  if (!hn || hn.index === undefined) {
    fail("no_number", "Es fehlt die Hausnummer. Bitte gib Straße und Hausnummer an.");
    return { ok: false, issues, warnings, street: parts.street || null, houseNumber: null, postalCode: plz, normalizedAddress: null };
  }
  const streetName = parts.street.slice(0, hn.index).replace(/[\s,]+$/, "").trim();
  const number = parts.street.slice(hn.index).replace(/\s+/g, "").toLowerCase();
  const firstNumber = Number(hn[1]);

  if (!streetName || !looksLikeStreetName(streetName)) {
    fail("bad_street", "Die Straße sieht nicht wie ein echter Straßenname aus. Bitte schreibe sie vollständig aus.");
  } else if (PLACEHOLDER.test(streetName)) {
    fail("placeholder", "Das ist ein Platzhalter und keine echte Adresse. Bitte gib die Straße an, an der gearbeitet wird.");
  } else if (firstNumber < 1) {
    fail("no_number", "Die Hausnummer ist ungültig. Bitte gib Straße und Hausnummer an.");
  } else {
    const known = (FREIBURG_STREET_SUGGESTIONS as readonly string[]).some((s) => s.toLowerCase() === streetName.toLowerCase());
    if (!known && !COMMON_SUFFIX.test(streetName) && !COMMON_PREFIX.test(streetName)) {
      warnings.push("Bitte prüfe die Schreibweise der Straße – sie wurde nicht als übliche Freiburger Straße erkannt.");
    }
    if (firstNumber > 250) warnings.push("Die Hausnummer ist ungewöhnlich hoch – bitte prüfen.");
  }

  const ok = issues.length === 0;
  return {
    ok,
    issues,
    warnings,
    street: streetName || null,
    houseNumber: number || null,
    postalCode: plz,
    normalizedAddress: ok ? `${streetName} ${number}` : null,
  };
}

/** Alle Meldungen eines Prüfergebnisses als lesbarer Text (für Fehlermeldungen vom Server). */
export function describeAddressIssues(check: AddressCheck): string {
  return check.issues
    .map((i) => (i.example ? `${i.message} Beispiel: „${i.example}“.` : i.message))
    .join(" ");
}

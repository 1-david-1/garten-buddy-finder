// Qualitäts- und Spam-Prüfung für Aufträge: wenig Spam, wenig Falschangaben, ohne echte Aufträge zu behindern.
// Gemeinsam für Browser (sofortiges Feedback) und Server (verbindlich).
//
// Geprüft wird die Plausibilität des Inhalts (Titel, Beschreibung, Preis, Termin) - nicht die Wahrheit. Wer
// einen Auftrag veröffentlicht, bestätigt außerdem ausdrücklich, dass die Angaben stimmen.

import { containsPrivateContact } from "@/lib/contact-detection";
import { checkFreiburgAddress, describeAddressIssues, type AddressCheck } from "@/lib/address-rules";

export const GIG_LIMITS = {
  titleMin: 8,
  titleMax: 100,
  descriptionMin: 30,
  descriptionMax: 2000,
  /** Beschreibung muss aus mindestens so vielen Wörtern bestehen */
  descriptionMinWords: 5,
  /** höchstens so viele neue Aufträge pro Stunde / pro 24 Stunden */
  perHour: 3,
  perDay: 8,
  /** höchstens so viele gleichzeitig offene Aufträge */
  maxOpen: 5,
  /** Preisrahmen (Cent) */
  minBudgetCents: 500,
  maxBudgetCents: 500_000,
  /** mehr als so viel pro Stunde ist für Gartenhilfe unrealistisch */
  maxCentsPerHour: 15_000,
  /** Termin höchstens so viele Tage in der Zukunft */
  maxDaysAhead: 365,
  /** Duplikate: gleicher Titel an gleicher Adresse innerhalb dieser Tage */
  duplicateDays: 14,
} as const;

export interface GigPostingInput {
  title: string;
  description: string;
  address: string;
  postalCode?: string | null;
  budgetCents: number;
  durationMinutes: number;
  scheduledAt?: string | null;
}

export interface GigIssue {
  field: "title" | "description" | "address" | "postalCode" | "budget" | "scheduledAt";
  message: string;
  example?: string;
}

const SPAM_PHRASES =
  /(casino|krypto|bitcoin|gewinnspiel|schnell reich|heimarbeit|nebenverdienst|kredit ohne|100\s?%\s?gratis|gratis geld|klick hier|jetzt anmelden|followers|abnehmen|potenz|viagra|escort|erotik|sex\b|wetten\b|investment|dating|massage\b)/i;

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

function letters(s: string): string {
  return s.replace(/[^A-Za-zÄÖÜäöüß]/g, "");
}

/** Text ohne Sinn: Tastatur-Ketten, Wiederholungen, kaum Vokale. */
export function looksLikeGibberish(text: string): boolean {
  const t = norm(text);
  const l = letters(t);
  if (l.length < 3) return true;
  if (/(.)\1{5,}/i.test(t)) return true;
  const vowels = l.match(/[aeiouäöüyAEIOUÄÖÜY]/g)?.length ?? 0;
  if (vowels / l.length < 0.18) return true;
  if (/(asdf|qwert|qwertz|yxcv|hjkl|sdfg|dfgh|jklö)/i.test(l)) return true;
  const words = t.toLowerCase().split(" ").filter((w) => w.length > 2);
  if (words.length >= 6) {
    const unique = new Set(words);
    if (unique.size / words.length < 0.4) return true;
  }
  return false;
}

function mostlyUppercase(text: string): boolean {
  const l = letters(text);
  if (l.length < 12) return false;
  const upper = l.replace(/[^A-ZÄÖÜ]/g, "").length;
  return upper / l.length > 0.7;
}

/** Inhaltsprüfung (ohne Adresse). */
export function checkGigContent(input: Pick<GigPostingInput, "title" | "description" | "budgetCents" | "durationMinutes" | "scheduledAt">, now = new Date()): GigIssue[] {
  const issues: GigIssue[] = [];
  const title = norm(input.title);
  const description = norm(input.description);
  const add = (field: GigIssue["field"], message: string, example?: string) => issues.push({ field, message, ...(example ? { example } : {}) });

  // Titel
  if (title.length < GIG_LIMITS.titleMin) {
    add("title", `Der Titel ist zu kurz (mindestens ${GIG_LIMITS.titleMin} Zeichen).`, "Hecke schneiden im Garten (ca. 8 m)");
  } else if (title.length > GIG_LIMITS.titleMax) {
    add("title", `Der Titel ist zu lang (höchstens ${GIG_LIMITS.titleMax} Zeichen).`);
  } else if (looksLikeGibberish(title)) {
    add("title", "Der Titel ergibt keinen Sinn. Bitte beschreibe kurz, was gemacht werden soll.", "Rasen mähen und Kanten schneiden");
  } else if (mostlyUppercase(title)) {
    add("title", "Bitte nicht nur in Großbuchstaben schreiben.");
  } else if ((title.match(/[!?]/g)?.length ?? 0) > 2) {
    add("title", "Bitte nicht so viele Ausrufe- oder Fragezeichen verwenden.");
  }

  // Beschreibung
  const words = description.split(" ").filter((w) => letters(w).length >= 2);
  if (description.length < GIG_LIMITS.descriptionMin || words.length < GIG_LIMITS.descriptionMinWords) {
    add(
      "description",
      `Bitte beschreibe den Auftrag genauer (mindestens ${GIG_LIMITS.descriptionMin} Zeichen): Was ist zu tun, wie groß ist die Fläche, welches Werkzeug ist vorhanden?`,
      "Der Rasen (ca. 60 m²) soll gemäht und die Beeteinfassung geschnitten werden. Mäher ist vorhanden.",
    );
  } else if (description.length > GIG_LIMITS.descriptionMax) {
    add("description", `Die Beschreibung ist zu lang (höchstens ${GIG_LIMITS.descriptionMax} Zeichen).`);
  } else if (looksLikeGibberish(description)) {
    add("description", "Die Beschreibung ergibt keinen Sinn. Bitte beschreibe den Auftrag in ganzen Sätzen.");
  } else if (mostlyUppercase(description)) {
    add("description", "Bitte nicht nur in Großbuchstaben schreiben.");
  }

  // Kontaktdaten, Links, Spam-Wörter
  const text = `${title} ${description}`;
  if (containsPrivateContact(text) || /https?:|www\.|\b[a-z0-9-]+\.(de|com|net|org|info|ru|biz)\b/i.test(text)) {
    add("description", "Bitte keine Telefonnummern, E-Mail-Adressen oder Links angeben. Kontakt läuft sicher über den Chat in GreenMatch.");
  }
  if (SPAM_PHRASES.test(text)) {
    add("description", "Der Text enthält Begriffe, die nicht zu einem Gartenauftrag passen. Bitte beschreibe nur die Gartenarbeit.");
  }

  // Preis
  if (input.budgetCents < GIG_LIMITS.minBudgetCents) {
    add("budget", `Das Budget ist zu niedrig (mindestens ${GIG_LIMITS.minBudgetCents / 100} €).`);
  } else if (input.budgetCents > GIG_LIMITS.maxBudgetCents) {
    add("budget", `Das Budget ist zu hoch für einen Gartenauftrag (höchstens ${GIG_LIMITS.maxBudgetCents / 100} €).`);
  } else if (input.durationMinutes > 0) {
    const perHour = (input.budgetCents / input.durationMinutes) * 60;
    if (perHour > GIG_LIMITS.maxCentsPerHour) {
      add("budget", `Budget und Dauer passen nicht zusammen (mehr als ${GIG_LIMITS.maxCentsPerHour / 100} € pro Stunde). Bitte prüfe beides.`);
    }
  }

  // Termin
  if (input.scheduledAt) {
    const t = new Date(input.scheduledAt).getTime();
    if (!Number.isFinite(t)) {
      add("scheduledAt", "Der Termin ist ungültig.");
    } else if (t < now.getTime() - 5 * 60 * 1000) {
      add("scheduledAt", "Der Termin liegt in der Vergangenheit.");
    } else if (t > now.getTime() + GIG_LIMITS.maxDaysAhead * 24 * 3600 * 1000) {
      add("scheduledAt", `Der Termin liegt zu weit in der Zukunft (höchstens ${GIG_LIMITS.maxDaysAhead} Tage).`);
    }
  }
  return issues;
}

/** Prüfung einer Direktbuchung: Der Titel kommt vom Angebot, die Notiz ist freiwillig, aber ohne Kontaktdaten/Spam. */
export function checkBookingContent(
  input: { description: string; scheduledAt: string },
  now = new Date(),
): GigIssue[] {
  const issues: GigIssue[] = [];
  const description = norm(input.description);
  if (description) {
    if (containsPrivateContact(description) || /https?:|www\.|\b[a-z0-9-]+\.(de|com|net|org|info|ru|biz)\b/i.test(description)) {
      issues.push({ field: "description", message: "Bitte keine Telefonnummern, E-Mail-Adressen oder Links angeben. Kontakt läuft sicher über den Chat in GreenMatch." });
    } else if (SPAM_PHRASES.test(description) || (description.length >= 12 && looksLikeGibberish(description))) {
      issues.push({ field: "description", message: "Bitte beschreibe nur kurz, was gemacht werden soll." });
    }
  }
  const t = new Date(input.scheduledAt).getTime();
  if (!Number.isFinite(t)) {
    issues.push({ field: "scheduledAt", message: "Der Termin ist ungültig." });
  } else if (t < now.getTime() - 5 * 60 * 1000) {
    issues.push({ field: "scheduledAt", message: "Der Termin liegt in der Vergangenheit." });
  } else if (t > now.getTime() + GIG_LIMITS.maxDaysAhead * 24 * 3600 * 1000) {
    issues.push({ field: "scheduledAt", message: `Der Termin liegt zu weit in der Zukunft (höchstens ${GIG_LIMITS.maxDaysAhead} Tage).` });
  }
  return issues;
}

export interface GigCheckResult {
  ok: boolean;
  issues: GigIssue[];
  warnings: string[];
  address: AddressCheck;
}

/** Vollständige Prüfung eines neuen Auftrags: Inhalt + Adresse in Freiburg. */
export function checkGigPosting(input: GigPostingInput, now = new Date(), seed = 0): GigCheckResult {
  const address = checkFreiburgAddress(input.address, input.postalCode ?? null, seed);
  const issues = checkGigContent(input, now);
  for (const i of address.issues) {
    issues.push({
      field: i.code.startsWith("plz") || i.code === "other_city" ? "postalCode" : "address",
      message: i.message,
      ...(i.example ? { example: i.example } : {}),
    });
  }
  return { ok: issues.length === 0, issues, warnings: address.warnings, address };
}

/** Meldung für Fehler vom Server: alle Probleme in einem Text. */
export function describeGigIssues(result: GigCheckResult): string {
  return result.issues.map((i) => (i.example ? `${i.message} Beispiel: „${i.example}“.` : i.message)).join(" ");
}

/** Einheitlicher Schlüssel für die Duplikat-Erkennung (gleicher Titel + gleiche Adresse). */
export function duplicateKey(title: string, normalizedAddress: string | null, postalCode: string | null): string {
  return [title, normalizedAddress ?? "", postalCode ?? ""].map((s) => norm(s).toLowerCase()).join("|");
}

export { describeAddressIssues };

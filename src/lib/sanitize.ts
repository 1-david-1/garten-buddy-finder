import { z } from "zod";

/**
 * Zentrale Eingabe-Härtung gegen XSS / HTML-Injection.
 * Rein funktional, deshalb auf Client UND Server verwendbar.
 *
 * Grundsätze:
 *  1. Namen sind keine Freitexte: Es gilt eine Positivliste (Buchstaben, Ziffern, wenige Satzzeichen).
 *     Alles andere (< > " ` { } ; : / @ = usw.) wird abgelehnt, nicht "repariert".
 *  2. Jeder Nutzertext, der in HTML (E-Mails) eingesetzt wird, läuft durch escapeHtml().
 *     In React-Komponenten ist das Escaping bereits automatisch, dort darf nie
 *     dangerouslySetInnerHTML mit Nutzerdaten verwendet werden.
 *  3. Die Datenbank hat als zweite Schicht einen Trigger (Migration 20261021000100_input_hardening.sql).
 */

/** HTML-Sonderzeichen maskieren. Für alle Nutzerwerte in HTML-Mails verwenden. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/`/g, "&#96;");
}

/** Steuer-, Format- und Richtungszeichen entfernen (unsichtbare Zeichen, Bidi-Tricks), Unicode normalisieren. */
function normalize(value: string): string {
  return value
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** "evil.com", "www.evil.de": Punkt direkt zwischen zwei Buchstaben/Ziffern sieht nach Domain aus. */
const DOMAIN_LIKE = /[\p{L}\p{N}]\.[\p{L}\p{N}]/u;
const TOO_MANY_MARKS = /\p{M}{4,}/u; // "Zalgo"-Text
const HAS_LETTER = /\p{L}/u;

type Rule = {
  /** Erlaubte Zeichen insgesamt (Positivliste). */
  allowed: RegExp;
  min: number;
  max: number;
  label: string;
  hint: string;
};

const RULES = {
  /** Benutzername / Anzeigename */
  displayName: {
    allowed: /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} ._'’-]*$/u,
    min: 2,
    max: 60,
    label: "Name",
    hint: "Erlaubt sind Buchstaben, Ziffern, Leerzeichen sowie . _ ' und -.",
  },
  /** Firmenname (Profis): zusätzlich & , ( ) / + */
  businessName: {
    allowed: /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} ._'’&,()/+-]*$/u,
    min: 2,
    max: 100,
    label: "Firmenname",
    hint: "Erlaubt sind Buchstaben, Ziffern, Leerzeichen sowie . _ ' & , ( ) / + und -.",
  },
  /** Ort */
  city: {
    allowed: /^[\p{L}\p{M}][\p{L}\p{M}\p{N} .'’()/-]*$/u,
    min: 2,
    max: 80,
    label: "Ort",
    hint: "Erlaubt sind Buchstaben, Leerzeichen sowie . ' ( ) / und -.",
  },
} satisfies Record<string, Rule>;

export type NameKind = keyof typeof RULES;

export type NameCheck = { ok: true; value: string } | { ok: false; error: string };

/** Prüft einen Namen streng gegen die Positivliste und liefert den bereinigten Wert oder eine deutsche Fehlermeldung. */
export function checkName(raw: string, kind: NameKind = "displayName"): NameCheck {
  const rule: Rule = RULES[kind];
  const value = normalize(raw);

  if (value.length < rule.min) return { ok: false, error: `${rule.label}: mindestens ${rule.min} Zeichen.` };
  if (value.length > rule.max) return { ok: false, error: `${rule.label}: höchstens ${rule.max} Zeichen.` };
  if (!rule.allowed.test(value)) return { ok: false, error: `${rule.label}: ungültige Zeichen. ${rule.hint}` };
  if (!HAS_LETTER.test(value)) return { ok: false, error: `${rule.label} muss mindestens einen Buchstaben enthalten.` };
  if (DOMAIN_LIKE.test(value)) {
    return { ok: false, error: `${rule.label}: Web-Adressen und E-Mail-Adressen sind hier nicht erlaubt.` };
  }
  if (TOO_MANY_MARKS.test(value)) return { ok: false, error: `${rule.label}: ungültige Zeichenfolge.` };
  return { ok: true, value };
}

function nameSchema(kind: NameKind) {
  return z.string().transform((raw, ctx) => {
    const r = checkName(raw, kind);
    if (!r.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: r.error });
      return z.NEVER;
    }
    return r.value;
  });
}

export const displayNameSchema = nameSchema("displayName");
export const citySchema = nameSchema("city");

/** Firmenname: leerer String ist erlaubt (Feld leeren). */
export const businessNameSchema = z
  .string()
  .transform((raw, ctx) => {
    if (normalize(raw) === "") return "";
    const r = checkName(raw, "businessName");
    if (!r.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: r.error });
      return z.NEVER;
    }
    return r.value;
  });

/** Ort: leerer String ist erlaubt. */
export const optionalCitySchema = z.string().transform((raw, ctx) => {
  if (normalize(raw) === "") return "";
  const r = checkName(raw, "city");
  if (!r.ok) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: r.error });
    return z.NEVER;
  }
  return r.value;
});

/**
 * Für Namen aus fremden Quellen (z. B. Google-Login, ältere Profile), die nicht abgelehnt,
 * sondern bereinigt werden müssen: unzulässige Zeichen entfernen. Leer -> Fallback.
 */
export function coerceDisplayName(raw: unknown, fallback = "Nutzer"): string {
  const stripped = normalize(String(raw ?? ""))
    .replace(/[^\p{L}\p{M}\p{N} ._'’-]/gu, "")
    .replace(/(\p{L}|\p{N})\.(?=\p{L}|\p{N})/gu, "$1. ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, RULES.displayName.max);
  const checked = checkName(stripped, "displayName");
  return checked.ok ? checked.value : fallback;
}

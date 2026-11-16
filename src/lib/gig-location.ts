/**
 * Adressschutz für Aufträge.
 *
 * Öffentlich (für alle Angemeldeten) sind NUR Stadt und Stadtteil (gigs.district).
 * Die genaue Adresse (Straße, Hausnummer, PLZ) liegt in public.gig_locations und ist per RLS
 * nur sichtbar für den Auftraggeber, den zugewiesenen Helfer nach der Annahme
 * (Status assigned / in_progress) und Admins (Migration 20261115000000_gig_location_privacy.sql).
 *
 * Diese Datei enthält die gemeinsamen Hilfen für Browser und Server.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { FREIBURG_DISTRICTS } from "@/lib/address-rules";

export const GIG_DISTRICTS = FREIBURG_DISTRICTS;
export type GigDistrict = (typeof GIG_DISTRICTS)[number];

export function isGigDistrict(value: unknown): value is GigDistrict {
  return typeof value === "string" && (GIG_DISTRICTS as readonly string[]).includes(value);
}

/** Ortsangabe, die jeder sehen darf: "Wiehre, Freiburg" oder nur "Freiburg". */
export function publicLocationLabel(district: string | null | undefined): string {
  const d = (district ?? "").trim();
  return d ? `${d}, Freiburg` : "Freiburg";
}

/**
 * Spalten von public.gigs, die in Listen und Details ausgeliefert werden dürfen. Bewusst KEIN select("*"):
 * So kann auch eine später hinzugefügte Spalte nicht versehentlich an alle Helfer gehen.
 */
export const GIG_PUBLIC_COLUMNS =
  "id, customer_id, title, description, service_type, budget_cents, district, scheduled_at, duration_minutes, status, exclusive_until, assigned_helper_id, allowed_age_groups, source_listing_id, created_at, updated_at" as const;

/** Status, ab dem der zugewiesene Helfer die genaue Adresse sehen darf (muss zur Datenbank-Funktion passen). */
export const ADDRESS_VISIBLE_STATUSES = ["assigned", "in_progress"] as const;

export const ADDRESS_AFTER_ACCEPTANCE_NOTE =
  "Die genaue Adresse wird erst nach der Annahme des Auftrags angezeigt – und nur dem jeweils anderen.";

export const ADDRESS_IN_TEXT_MESSAGE =
  "Bitte nenne hier noch keine genaue Adresse (Straße mit Hausnummer oder Postleitzahl). Sie wird nach der Annahme des Auftrags automatisch freigegeben – den Stadtteil darfst du nennen.";

// ---------------------------------------------------------------------------
// Adresse im Freitext erkennen (Titel, Beschreibung, Notiz, Gebots-Nachricht, Chat vor der Annahme)
// ---------------------------------------------------------------------------

const STREET_SUFFIX = "(?:stra(?:ß|ss)e|str\\.?|weg|allee|platz|gasse|ufer|damm|pfad|steig|halde)";
const STREET_SEPARATE = "(?:stra(?:ß|ss)e|weg|allee|platz|gasse|ufer|damm|pfad|steig|halde)";
// Zahl direkt hinter dem Straßennamen ist keine Hausnummer, wenn eine Einheit folgt ("Gartenweg 20 m lang").
const NOT_A_UNIT =
  "(?!\\s?(?:m|cm|km|qm|m²|m2|meter|min|minuten|stunden?|std|h|uhr|kg|l|€|euro|%|tage?|wochen?|monate?|jahre?|personen|st(?:ü|ue)ck|x|mal)(?![a-zäöüß]))";
const HOUSE_NUMBER = `\\d{1,3}(?!\\d)${NOT_A_UNIT}(?:[a-z](?![a-zäöüß]))?`;
// "Schwarzwaldstraße 12", "Schwarzwaldstr. 12" (zusammengeschrieben) oder "Eichstetter Weg 7" (getrennt)
const STREET_WITH_NUMBER = new RegExp(
  `(?:[a-zäöüß][a-zäöüß.\\-]*${STREET_SUFFIX}\\.?|[a-zäöüß]{3,}\\s+${STREET_SEPARATE})\\s*${HOUSE_NUMBER}`,
);
const FREIBURG_POSTAL_CODE = /(?<!\d)79\d{3}(?!\d)/;

function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, "")
    .toLowerCase();
}

/** "Schwarzwaldstr. 12" / "Am Mühlbach 3, 79102 Freiburg": sieht der Text nach einer genauen Adresse aus? */
export function containsStreetAddress(text: string): boolean {
  const t = normalizeText(text);
  return STREET_WITH_NUMBER.test(t) || FREIBURG_POSTAL_CODE.test(t);
}

function squashStreet(s: string): string {
  return normalizeText(s)
    .replace(/ß/g, "ss")
    .replace(/str\./g, "strasse")
    .replace(/[\s.\-]/g, "");
}

/** Steht der Straßenname der eigenen Adresse im Text? (auch ohne Hausnummer: "bei uns in der Schwarzwaldstraße") */
export function containsOwnStreet(text: string, street: string | null | undefined): boolean {
  // nur der Straßenname, ohne Hausnummer und Zusätze
  const s = squashStreet((street ?? "").replace(/\s*\d.*$/, ""));
  if (s.length < 5) return false;
  return squashStreet(text).includes(s);
}

// ---------------------------------------------------------------------------
// Laden der geschützten Adresse (RLS entscheidet, wer sie sehen darf)
// ---------------------------------------------------------------------------

export interface GigLocationRow {
  address: string | null;
  postalCode: string | null;
}

/**
 * Lädt die Adressen der angegebenen Aufträge mit dem Client des angemeldeten Nutzers. Die Datenbank liefert
 * nur die Zeilen, die dieser Nutzer sehen darf - für alle anderen fehlt der Eintrag.
 */
export async function fetchGigLocations(
  supabase: SupabaseClient,
  gigIds: (string | null | undefined)[],
): Promise<Map<string, GigLocationRow>> {
  const ids = [...new Set(gigIds.filter((id): id is string => !!id))];
  const result = new Map<string, GigLocationRow>();
  if (ids.length === 0) return result;
  const { data, error } = await supabase.from("gig_locations").select("gig_id, address, postal_code").in("gig_id", ids);
  if (error) throw error;
  for (const row of (data ?? []) as { gig_id: string; address: string | null; postal_code: string | null }[]) {
    result.set(row.gig_id, { address: row.address, postalCode: row.postal_code });
  }
  return result;
}

/**
 * Ergänzt Auftragszeilen um address / postal_code - aber nur, wo der Nutzer sie sehen darf (sonst null).
 * Hilfreich, damit Oberflächen die Felder wie bisher lesen können.
 */
export async function attachGigLocations<T extends { id: string }>(
  supabase: SupabaseClient,
  gigs: T[],
): Promise<(T & { address: string | null; postal_code: string | null })[]> {
  const locations = await fetchGigLocations(
    supabase,
    gigs.map((g) => g.id),
  );
  return gigs.map((g) => {
    const loc = locations.get(g.id);
    return { ...g, address: loc?.address ?? null, postal_code: loc?.postalCode ?? null };
  });
}

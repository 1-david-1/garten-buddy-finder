// Wann muss die gesetzliche Vertretung (Eltern) bei einem Auftrag des Jugendlichen erneut gefragt werden?
//
// Vereinfachung: Gefragt wird bei der ersten Annahme (dem ersten Gebot bzw. der ersten Buchung) und am Ende nur
// dann noch einmal, wenn verhandelt wurde (Preis, Ort, Beschreibung, Tätigkeit oder ein fester Termin
// haben sich gegenüber dem Stand der ersten Freigabe geändert). Nicht bei jedem Zwischenschritt.
// Außerdem können die Eltern pro Auftrag oder pro Auftraggeber dauerhaft erlauben ("Dauerfreigabe").
//
// Reine Logik ohne Datenbank - wird vom Server und von den Tests benutzt.

import { requiresParentAcknowledgement } from "@/lib/hedge-rules";

export type StandingScope = "customer" | "gig";

export interface StandingApproval {
  scope: StandingScope;
  customerId: string | null;
  gigId: string | null;
  /** Die Eltern haben bei dieser Dauerfreigabe auch Tätigkeiten mit erhöhtem Risiko ausdrücklich bestätigt. */
  acknowledgesRisky: boolean;
}

/** Stand, den die Eltern bei der ersten Freigabe (dem Gebot) gesehen haben. */
export interface FirstApproval {
  bidCents: number | null;
  serviceType: string | null;
  location: string | null;
  description: string | null;
  /** lesbarer Termin, z. B. "Termin wird noch abgestimmt · ca. 60 Minuten" */
  when: string | null;
}

/** Endgültig vereinbarter Stand des Auftrags. */
export interface FinalTerms {
  gigId: string;
  customerId: string;
  priceCents: number;
  serviceType: string;
  location: string;
  description: string | null;
  when: string;
}

export type CoverageReason = "standing_customer" | "standing_gig" | "unchanged_since_first_approval";
export type BidCoverageReason = "standing_customer" | "standing_gig" | "already_approved_for_gig";
export type Change = "price" | "activity" | "description" | "location" | "date";

/** Der Wert wurde bei der ersten Freigabe noch nicht festgelegt ("wird noch abgestimmt"). */
export function isUndetermined(value: string | null | undefined): boolean {
  return !value || /noch abgestimmt/i.test(value);
}

const norm = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Was hat sich seit der ersten Freigabe geändert? Nicht als Änderung zählt, wenn Ort oder Termin bei der ersten
 * Freigabe noch offen waren und jetzt festgelegt wurden (die Datenbank erzwingt trotzdem 08:00-18:00 Uhr und
 * höchstens 2 Stunden).
 */
export function negotiatedChanges(first: FirstApproval, final: FinalTerms, opts: { ignorePrice?: boolean } = {}): Change[] {
  const changes: Change[] = [];
  if (!opts.ignorePrice && (first.bidCents == null || first.bidCents !== final.priceCents)) changes.push("price");
  if (first.serviceType && first.serviceType !== final.serviceType) changes.push("activity");
  if (norm(first.description) !== norm(final.description)) changes.push("description");
  if (!isUndetermined(first.location) && norm(first.location) !== norm(final.location)) changes.push("location");
  if (!isUndetermined(first.when) && norm(first.when) !== norm(final.when)) changes.push("date");
  return changes;
}

function standingMatches(standing: StandingApproval, final: Pick<FinalTerms, "gigId" | "customerId" | "serviceType">, first: FirstApproval | null) {
  const target = standing.scope === "customer" ? standing.customerId === final.customerId : standing.gigId === final.gigId;
  if (!target) return false;
  // Tätigkeiten mit erhöhtem Risiko nur, wenn die Eltern sie bei der Dauerfreigabe ausdrücklich eingeschlossen haben.
  if (requiresParentAcknowledgement(final.serviceType) && !standing.acknowledgesRisky) return false;
  // Auftrags-Freigabe: bleibt nur gültig, solange es dieselbe Tätigkeit ist.
  if (standing.scope === "gig" && first?.serviceType && first.serviceType !== final.serviceType) return false;
  return true;
}

/** Endgültige Freigabe: ist sie schon durch eine frühere Entscheidung der Eltern gedeckt? null = Eltern fragen. */
export function coverageReason(input: {
  standing: StandingApproval | null;
  first: FirstApproval | null;
  final: FinalTerms;
}): CoverageReason | null {
  const { standing, first, final } = input;
  if (standing && standingMatches(standing, final, first)) {
    return standing.scope === "customer" ? "standing_customer" : "standing_gig";
  }
  if (first && negotiatedChanges(first, final).length === 0) return "unchanged_since_first_approval";
  return null;
}

/**
 * Neues Gebot (Gegengebot) im selben Auftrag: Ist es durch die erste Freigabe oder eine Dauerfreigabe gedeckt?
 * Der Preis darf sich hier ändern (das ist ja die Verhandlung), die Tätigkeit und der Auftraggeber nicht.
 */
export function bidCoverageReason(input: {
  standing: StandingApproval | null;
  first: FirstApproval | null;
  job: Omit<FinalTerms, "priceCents">;
}): BidCoverageReason | null {
  const { standing, first, job } = input;
  if (standing && standingMatches(standing, job, first)) {
    return standing.scope === "customer" ? "standing_customer" : "standing_gig";
  }
  if (first) {
    const changes = negotiatedChanges(first, { ...job, priceCents: first.bidCents ?? 0 }, { ignorePrice: true });
    if (changes.length === 0) return "already_approved_for_gig";
  }
  return null;
}

/** Kurztexte für Eltern-Mail und Eltern-Konto. */
export const COVERAGE_TEXT: Record<CoverageReason | BidCoverageReason, string> = {
  standing_customer: "Dauerfreigabe: Sie haben diesem Auftraggeber dauerhaft erlaubt, Aufträge für Ihr Kind zu vergeben.",
  standing_gig: "Sie haben für diesen Auftrag festgelegt, dass Sie nicht mehr gefragt werden möchten.",
  unchanged_since_first_approval: "Der Auftrag entspricht dem Stand Ihrer ersten Freigabe (keine Verhandlung, nichts geändert).",
  already_approved_for_gig: "Sie haben diesen Auftrag schon freigegeben; das neue Gebot gehört zur selben Verhandlung.",
};

export const CHANGE_LABEL: Record<Change, string> = {
  price: "Preis",
  activity: "Tätigkeit",
  description: "Beschreibung",
  location: "Ort",
  date: "Termin",
};

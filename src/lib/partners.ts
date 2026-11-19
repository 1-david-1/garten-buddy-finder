/**
 * "Partner" = die Menschen, mit denen man tatsächlich zusammenarbeitet:
 *   - als Helfer sind das deine KUNDEN (Auftraggeber, für die du Aufträge hast),
 *   - als Auftraggeber sind das deine HELFER.
 * Reine Logik ohne Server-Abhängigkeiten, damit sie getestet werden kann; die Server-Funktionen stehen in
 * partners.functions.ts.
 */
import { isActiveStatus, type PaymentState } from "@/lib/gig-status";

export type PartnerRelation = "customers" | "helpers";

export interface PartnerGigRow {
  id: string;
  customer_id: string;
  assigned_helper_id: string | null;
  status: string;
  scheduled_at: string | null;
  budget_cents: number;
  updated_at: string;
}

export interface PartnerEscrowRow {
  gig_id: string;
  state: string;
  bid_cents: number;
}

export interface PartnerSummary {
  id: string;
  name: string;
  city: string | null;
  verified: boolean;
  activeCount: number;
  completedCount: number;
  /** Aufgaben, die jetzt auf dich warten (Helfer: offene Anfragen; Auftraggeber: Zahlungen freizugeben) */
  needsActionCount: number;
  /** Abgeschlossene Aufträge, deren Zahlung noch nicht freigegeben ist (in Cent) */
  awaitingPaymentCents: number;
  /** Nächster anstehender Termin (ISO) */
  nextAppointment: string | null;
  lastActivity: string;
}

/** Ist die Zahlung abgeschlossen oder gar nicht mehr offen? */
export function isPaymentSettled(state: PaymentState | string | null | undefined): boolean {
  return state === "paid_out" || state === "cancelled";
}

/** Zahlung, die der Auftraggeber noch freigeben kann (nicht in Klärung, nicht schon erledigt). */
export function isPaymentReleasable(state: PaymentState | string | null | undefined): boolean {
  return state === "held" || state === "pending" || state === "releasing";
}

export function partnerIdOf(gig: PartnerGigRow, relation: PartnerRelation): string | null {
  return relation === "customers" ? gig.customer_id : gig.assigned_helper_id;
}

export function summarizePartners(
  gigs: PartnerGigRow[],
  escrows: PartnerEscrowRow[],
  relation: PartnerRelation,
  people: Map<string, { name: string; city: string | null; verified: boolean }>,
  now: Date = new Date(),
): PartnerSummary[] {
  const escrowByGig = new Map(escrows.map((e) => [e.gig_id, e]));
  const byPartner = new Map<string, PartnerSummary>();

  for (const gig of gigs) {
    // Nur Aufträge mit zugewiesenem Helfer sind eine Zusammenarbeit
    if (!gig.assigned_helper_id) continue;
    const partnerId = partnerIdOf(gig, relation);
    if (!partnerId) continue;

    let entry = byPartner.get(partnerId);
    if (!entry) {
      const person = people.get(partnerId);
      entry = {
        id: partnerId,
        name: person?.name?.trim() || (relation === "customers" ? "Kunde" : "Helfer"),
        city: person?.city ?? null,
        verified: person?.verified ?? false,
        activeCount: 0,
        completedCount: 0,
        needsActionCount: 0,
        awaitingPaymentCents: 0,
        nextAppointment: null,
        lastActivity: gig.updated_at,
      };
      byPartner.set(partnerId, entry);
    }

    if (gig.updated_at > entry.lastActivity) entry.lastActivity = gig.updated_at;
    const escrow = escrowByGig.get(gig.id);

    if (isActiveStatus(gig.status)) {
      entry.activeCount += 1;
      if (gig.scheduled_at && new Date(gig.scheduled_at).getTime() >= now.getTime()) {
        if (!entry.nextAppointment || gig.scheduled_at < entry.nextAppointment) entry.nextAppointment = gig.scheduled_at;
      }
      // Helfer: Anfrage wartet auf die eigene Zusage
      if (relation === "customers" && gig.status === "pending_helper") entry.needsActionCount += 1;
    }

    if (gig.status === "completed") {
      entry.completedCount += 1;
      if (escrow && escrow.state !== "paid_out" && escrow.state !== "cancelled") {
        entry.awaitingPaymentCents += escrow.bid_cents;
        // Auftraggeber: Zahlung kann jetzt freigegeben werden
        if (relation === "helpers" && isPaymentReleasable(escrow.state)) entry.needsActionCount += 1;
      }
    }
  }

  return [...byPartner.values()].sort((a, b) => {
    if (b.needsActionCount !== a.needsActionCount) return b.needsActionCount - a.needsActionCount;
    if (b.activeCount !== a.activeCount) return b.activeCount - a.activeCount;
    if (a.nextAppointment && b.nextAppointment && a.nextAppointment !== b.nextAppointment) {
      return a.nextAppointment < b.nextAppointment ? -1 : 1;
    }
    if (a.nextAppointment !== b.nextAppointment) return a.nextAppointment ? -1 : 1;
    return b.lastActivity < a.lastActivity ? -1 : b.lastActivity > a.lastActivity ? 1 : 0;
  });
}

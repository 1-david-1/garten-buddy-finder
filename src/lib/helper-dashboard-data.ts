/**
 * Reine Rechenlogik für die Grafiken im Helfer-Dashboard (Verdienst je Monat, offene Auszahlungen,
 * Einsatz-Agenda). Die Darstellung steckt in helper-widgets.tsx und dashboard-visuals.tsx.
 */

import { isPaymentReleasable } from "@/lib/partners";
import { monthKeyOf, monthWindow, type MonthSlot } from "@/lib/month-buckets";
import type { GigLike } from "@/lib/customer-dashboard-data";

/** Die Felder einer Treuhand-Zahlung, die für die Verdienst-Rechnung nötig sind. */
export interface EscrowLike {
  state: string;
  paid_out_at: string | null;
  bid_cents: number;
  helper_fee_cents: number;
}

/** Was beim Helfer ankommt: Gebot abzüglich Plattformgebühr (wie im 7-Tage-Diagramm). */
export const netCentsOf = (e: Pick<EscrowLike, "bid_cents" | "helper_fee_cents">) =>
  e.bid_cents - e.helper_fee_cents;

export interface EarningsMonth extends MonthSlot {
  /** Netto ausgezahlt in diesem Monat (nach Auszahlungsdatum, deutsche Ortszeit). */
  cents: number;
}

/**
 * Verdienst der letzten `months` Monate bis einschließlich dem aktuellen. Gezählt wird, wann das Geld
 * ausgezahlt wurde - nicht, wann der Auftrag war.
 */
export function monthlyEarnings(escrow: EscrowLike[], now: Date = new Date(), months = 6): EarningsMonth[] {
  const slots: EarningsMonth[] = monthWindow(now, Math.max(months - 1, 0), 0).map((s) => ({ ...s, cents: 0 }));
  const byKey = new Map(slots.map((s) => [s.key, s]));
  for (const e of escrow) {
    if (e.state !== "paid_out" || !e.paid_out_at) continue;
    const date = new Date(e.paid_out_at);
    if (Number.isNaN(date.getTime())) continue;
    const slot = byKey.get(monthKeyOf(date));
    if (slot) slot.cents += netCentsOf(e);
  }
  return slots;
}

/** Netto-Betrag, der gesichert ist, aber noch auf die Freigabe durch den Kunden wartet. */
export function pendingPayoutCents(escrow: EscrowLike[]): number {
  return escrow.filter((e) => isPaymentReleasable(e.state)).reduce((sum, e) => sum + netCentsOf(e), 0);
}

/** Wo steht ein Auftrag aus Sicht des Helfers? Gleiche Stufen wie beim Kunden, nur "Ausgezahlt" statt "Bezahlt". */
export const HELPER_JOURNEY_LABELS = ["Angefragt", "Zugesagt", "Läuft", "Erledigt", "Ausgezahlt"] as const;

/** Ein Einsatz in der Agenda des Helfers (bestätigt oder laufend). */
export interface AgendaJob {
  id: string;
  title: string;
  serviceType: string;
  description: string | null;
  budgetCents: number;
  address: string | null;
  district: string | null;
  scheduledAt: string | null;
  status: string;
  customerName: string;
}

/** Übersetzt Einsätze und Anfragen des Helfers in die Form, die die gemeinsame Termin-Logik versteht. */
export function toGigLike<T extends { id: string; title: string; status: string; scheduledAt: string | null; budgetCents: number }>(
  item: T,
): GigLike & { source: T } {
  return {
    id: item.id,
    title: item.title,
    status: item.status,
    scheduled_at: item.scheduledAt,
    budget_cents: item.budgetCents,
    assigned_helper_id: null,
    source: item,
  };
}

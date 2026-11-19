/**
 * Reine Hilfsfunktionen für das Kunden-Dashboard (ohne React, daher testbar):
 * Was wartet auf den Kunden? Was ist der nächste Termin? Wie viele Aufträge
 * sind offen, geplant oder erledigt?
 *
 * Status-Texte kommen aus gig-status.ts (eine Quelle für alle Seiten),
 * "heute"/"morgen" und Termine werden in deutscher Ortszeit bestimmt
 * (berlin-time.ts), nicht in der Zeitzone des Rechners.
 */

import { berlinDateKey, berlinDayFrom } from "@/lib/berlin-time";
import { describeGigStatus, type PaymentState } from "@/lib/gig-status";
import { isPaymentReleasable } from "@/lib/partners";

/** Die Felder eines Auftrags, die das Dashboard braucht (passt zu den Zeilen aus getMyGigs). */
export interface GigLike {
  id: string;
  title: string;
  status: string;
  scheduled_at: string | null;
  assigned_helper_id: string | null;
  budget_cents: number;
  /** Zahlungsstatus der Treuhand (escrow_transactions.state), falls vorhanden. */
  payment_state?: string | null;
  /** Name des gewählten Helfers, falls vorhanden. */
  helper_name?: string | null;
  /** Eingebettete Bewertungen; fehlt das Feld, wird nicht zum Bewerten aufgefordert. */
  reviews?: unknown;
}

export type TaskTarget = "gigs" | "messages";

export interface DashboardTask {
  key: string;
  /** "action" = der Kunde muss etwas tun, "info" = es wird auf jemand anderen gewartet. */
  tone: "action" | "info";
  title: string;
  hint: string;
  cta: string;
  target: TaskTarget;
}

/** Abgeschlossen, aber die Zahlung ist noch nicht freigegeben - das wartet auf den Kunden. */
export const awaitsPaymentRelease = (g: Pick<GigLike, "status" | "payment_state">): boolean =>
  g.status === "completed" && isPaymentReleasable(g.payment_state);

export function deriveCustomerTasks(gigs: GigLike[], unreadMessages: number): DashboardTask[] {
  const tasks: DashboardTask[] = [];

  for (const g of gigs) {
    const info = describeGigStatus(g.status, "customer", {
      paymentState: g.payment_state as PaymentState,
      hasScheduledDate: !!g.scheduled_at,
    });

    if (g.status === "negotiating") {
      tasks.push({
        key: `negotiating-${g.id}`,
        tone: "action",
        title: `„${g.title}“: Preisverhandlung läuft`,
        hint: info.next ?? "Sieh dir die Gebote an und antworte.",
        cta: "Gebote ansehen",
        target: "gigs",
      });
    } else if (g.status === "pending_helper") {
      tasks.push({
        key: g.scheduled_at ? `waiting-${g.id}` : `date-${g.id}`,
        tone: g.scheduled_at ? "info" : "action",
        title: g.scheduled_at
          ? `„${g.title}“: Wartet auf die Zusage des Helfers`
          : `„${g.title}“: Termin fehlt noch`,
        hint: info.next ?? "Der Helfer muss noch zusagen.",
        cta: g.scheduled_at ? "Details" : "Termin vorschlagen",
        target: "gigs",
      });
    } else if (awaitsPaymentRelease(g)) {
      tasks.push({
        key: `pay-${g.id}`,
        tone: "action",
        title: `„${g.title}“: Zahlung freigeben`,
        hint: "Die Arbeit ist erledigt. Gib die Zahlung frei, damit der Helfer sein Geld bekommt.",
        cta: "Zahlung freigeben",
        target: "gigs",
      });
    } else if (
      g.status === "completed" &&
      g.assigned_helper_id &&
      Array.isArray(g.reviews) &&
      g.reviews.length === 0
    ) {
      tasks.push({
        key: `review-${g.id}`,
        tone: "action",
        title: `„${g.title}“ ist erledigt`,
        hint: "Eine kurze Bewertung hilft dem Helfer und anderen Kunden.",
        cta: "Bewerten",
        target: "gigs",
      });
    }
  }

  if (unreadMessages > 0) {
    tasks.push({
      key: "unread-messages",
      tone: "action",
      title: unreadMessages === 1 ? "1 ungelesene Nachricht" : `${unreadMessages} ungelesene Nachrichten`,
      hint: "Antworte zeitnah, dann geht es schneller weiter.",
      cta: "Lesen",
      target: "messages",
    });
  }

  // Aufgaben für den Kunden zuerst (Zahlungen vor allem anderen), Wartendes danach;
  // die Reihenfolge innerhalb bleibt erhalten.
  const actions = tasks.filter((t) => t.tone === "action");
  return [
    ...actions.filter((t) => t.key.startsWith("pay-")),
    ...actions.filter((t) => !t.key.startsWith("pay-")),
    ...tasks.filter((t) => t.tone === "info"),
  ];
}

/**
 * Der nächste Einsatz: laufende Aufträge zuerst, dann bestätigte Aufträge ab heute
 * (deutscher Kalendertag), der früheste Termin vorn.
 */
export function pickNextAppointment<T extends GigLike>(gigs: T[], now: Date = new Date()): T | null {
  const today = berlinDateKey(now);
  const candidates = gigs.filter((g) => {
    if (g.status === "in_progress") return true;
    if (g.status !== "assigned" || !g.scheduled_at) return false;
    return berlinDateKey(new Date(g.scheduled_at)) >= today;
  });
  candidates.sort((a, b) => {
    if ((a.status === "in_progress") !== (b.status === "in_progress")) {
      return a.status === "in_progress" ? -1 : 1;
    }
    const ta = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER;
    const tb = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER;
    return ta - tb;
  });
  return candidates[0] ?? null;
}

/**
 * Zählt Aufträge in drei Gruppen. Ein abgeschlossener Auftrag, dessen Zahlung noch
 * freigegeben werden muss, zählt als "offen" - er wartet ja noch auf den Kunden.
 */
export function countGigGroups(gigs: GigLike[]): { open: number; planned: number; done: number } {
  let open = 0;
  let planned = 0;
  let done = 0;
  for (const g of gigs) {
    if (g.status === "open" || g.status === "negotiating" || g.status === "pending_helper") open++;
    else if (g.status === "assigned" || g.status === "in_progress") planned++;
    else if (g.status === "completed") {
      if (awaitsPaymentRelease(g)) open++;
      else done++;
    }
  }
  return { open, planned, done };
}

/** "Heute", "Morgen", "In 3 Tagen" (nach deutschem Kalendertag) - leer, wenn weiter weg oder vergangen. */
export function relativeDay(iso: string, now: Date = new Date()): string {
  const key = berlinDateKey(new Date(iso));
  for (let n = 0; n < 14; n++) {
    if (berlinDayFrom(now, n).key !== key) continue;
    if (n === 0) return "Heute";
    if (n === 1) return "Morgen";
    return `In ${n} Tagen`;
  }
  return "";
}

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
import { monthKeyOf, monthWindow, type MonthSlot } from "@/lib/month-buckets";
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
  /** Art der Arbeit (z. B. "rasenmähen") - für die Verteilung nach Leistung. */
  service_type?: string | null;
  /** Erstellt am - Ersatz für den Monat, solange noch kein Termin feststeht. */
  created_at?: string | null;
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

/** Laufende Aufträge zuerst, dann bestätigte ab heute (deutscher Kalendertag), der früheste Termin vorn. */
function appointmentCandidates<T extends GigLike>(gigs: T[], now: Date): T[] {
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
  return candidates;
}

/** Der nächste Einsatz: laufende Aufträge zuerst, dann bestätigte Aufträge ab heute, der früheste vorn. */
export function pickNextAppointment<T extends GigLike>(gigs: T[], now: Date = new Date()): T | null {
  return appointmentCandidates(gigs, now)[0] ?? null;
}

/** Die bestätigten Termine nach dem nächsten Einsatz (nur mit Datum), der früheste vorn. */
export function upcomingAppointments<T extends GigLike>(gigs: T[], now: Date = new Date(), limit = 2): T[] {
  return appointmentCandidates(gigs, now)
    .slice(1)
    .filter((g) => g.scheduled_at)
    .slice(0, limit);
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

/* ------------------------------------------------------------------ *
 * Grafiken: Auftragsfortschritt, Budget, Leistungen, Kalender
 * (reine Funktionen - die Darstellung steckt in dashboard-visuals.tsx)
 * ------------------------------------------------------------------ */

export const JOURNEY_STEPS = [
  { key: "requested", label: "Angefragt" },
  { key: "confirmed", label: "Bestätigt" },
  { key: "running", label: "Läuft" },
  { key: "done", label: "Erledigt" },
  { key: "paid", label: "Bezahlt" },
] as const;

export interface GigJourney {
  /** Index des letzten erreichten Schritts in JOURNEY_STEPS. */
  reached: number;
  /** Es ist nichts mehr zu tun - der Auftrag ist rund. */
  finished: boolean;
}

/**
 * Wo steht ein Auftrag auf dem Weg von der Anfrage bis zur Zahlung? Stornierte Aufträge und Entwürfe
 * haben keinen Weg (null). Ein abgeschlossener Auftrag ohne offene Zahlung ist fertig, auch wenn es
 * keine Treuhand-Zahlung gab - dann bleibt "Bezahlt" einfach unerreicht, statt etwas zu behaupten.
 */
export function gigJourney(g: Pick<GigLike, "status" | "payment_state">): GigJourney | null {
  switch (g.status) {
    case "open":
    case "negotiating":
    case "pending_helper":
      return { reached: 0, finished: false };
    case "assigned":
      return { reached: 1, finished: false };
    case "in_progress":
      return { reached: 2, finished: false };
    case "completed":
      if (g.payment_state === "paid_out") return { reached: 4, finished: true };
      if (!g.payment_state || g.payment_state === "cancelled") return { reached: 3, finished: true };
      return { reached: 3, finished: false };
    default:
      return null;
  }
}

export type BudgetKind = "paid" | "planned";

/**
 * Zählt das Budget eines Auftrags als "bezahlt" (Zahlung freigegeben) oder "geplant" (bestätigt, läuft oder
 * Zahlung gesichert, aber noch nicht freigegeben). Anfragen, Verhandlungen, Stornierungen und
 * abgeschlossene Aufträge ohne Zahlungsvorgang zählen nicht - dort ist kein Geld im Spiel.
 */
export function budgetKind(g: Pick<GigLike, "status" | "payment_state">): BudgetKind | null {
  if (g.status === "assigned" || g.status === "in_progress") return "planned";
  if (g.status === "completed") {
    if (g.payment_state === "paid_out") return "paid";
    if (!g.payment_state || g.payment_state === "cancelled") return null;
    return "planned";
  }
  return null;
}

export function sumBudget(gigs: GigLike[]): { paidCents: number; plannedCents: number } {
  let paidCents = 0;
  let plannedCents = 0;
  for (const g of gigs) {
    const kind = budgetKind(g);
    if (kind === "paid") paidCents += g.budget_cents;
    else if (kind === "planned") plannedCents += g.budget_cents;
  }
  return { paidCents, plannedCents };
}

export interface BudgetMonth extends MonthSlot {
  paidCents: number;
  plannedCents: number;
}

/**
 * Budget je Monat: standardmäßig drei Monate zurück bis zwei Monate voraus, damit auch bestätigte Termine
 * der nächsten Wochen sichtbar sind. Der Monat ergibt sich aus dem Termin (sonst dem Erstellungsdatum),
 * gerechnet in deutscher Ortszeit.
 */
export function monthlyBudget(
  gigs: GigLike[],
  now: Date = new Date(),
  monthsBack = 3,
  monthsAhead = 2,
): BudgetMonth[] {
  const months: BudgetMonth[] = monthWindow(now, monthsBack, monthsAhead).map((slot) => ({
    ...slot,
    paidCents: 0,
    plannedCents: 0,
  }));
  const byKey = new Map(months.map((m) => [m.key, m]));

  for (const g of gigs) {
    const kind = budgetKind(g);
    const when = g.scheduled_at ?? g.created_at;
    if (!kind || !when) continue;
    const date = new Date(when);
    if (Number.isNaN(date.getTime())) continue;
    const bucket = byKey.get(monthKeyOf(date));
    if (!bucket) continue;
    if (kind === "paid") bucket.paidCents += g.budget_cents;
    else bucket.plannedCents += g.budget_cents;
  }
  return months;
}

/** Sammelposten in der Leistungs-Verteilung, wenn es mehr Leistungen gibt als dargestellt werden. */
export const OTHER_SERVICE = "__other";

export interface ServiceShare {
  value: string;
  count: number;
  /** Anteil an allen Aufträgen, 0 bis 1. */
  share: number;
}

/**
 * Wofür bucht der Kunde Helfer? Zählt Aufträge nach Leistung (ohne Stornierte und Entwürfe), die häufigste
 * zuerst. Mehr als `max` Leistungen werden zu einem Sammelposten zusammengefasst - außer es wäre nur eine
 * einzige, dann steht sie mit Namen da.
 */
export function serviceBreakdown(gigs: GigLike[], max = 4): ServiceShare[] {
  const counts = new Map<string, number>();
  let total = 0;
  for (const g of gigs) {
    if (g.status === "cancelled" || g.status === "draft") continue;
    const key = g.service_type || "sonstiges";
    counts.set(key, (counts.get(key) ?? 0) + 1);
    total++;
  }
  if (total === 0) return [];

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "de"));
  const keep = sorted.length <= max + 1 ? sorted.length : max;
  const rows: ServiceShare[] = sorted
    .slice(0, keep)
    .map(([value, count]) => ({ value, count, share: count / total }));
  const rest = sorted.slice(keep).reduce((n, [, c]) => n + c, 0);
  if (rest > 0) rows.push({ value: OTHER_SERVICE, count: rest, share: rest / total });
  return rows;
}

export interface CalendarDay {
  /** "YYYY-MM-DD" */
  key: string;
  day: number;
  month: number;
  /** 1 = Montag ... 7 = Sonntag */
  isoWeekday: number;
  today: boolean;
  past: boolean;
  /** Bestätigte oder laufende Termine an diesem Tag. */
  confirmed: number;
  /** Angefragte Termine, auf die der Helfer noch nicht zugesagt hat. */
  requested: number;
}

/**
 * Mini-Kalender: die aktuelle und die nächste Woche (Montag bis Sonntag, deutsche Ortszeit) mit den Tagen,
 * an denen ein Termin ansteht.
 */
export function appointmentCalendar(gigs: GigLike[], now: Date = new Date(), weeks = 2): CalendarDay[] {
  const today = berlinDayFrom(now, 0);
  const confirmed = new Map<string, number>();
  const requested = new Map<string, number>();
  for (const g of gigs) {
    if (!g.scheduled_at) continue;
    const date = new Date(g.scheduled_at);
    if (Number.isNaN(date.getTime())) continue;
    const key = berlinDateKey(date);
    if (g.status === "assigned" || g.status === "in_progress") {
      confirmed.set(key, (confirmed.get(key) ?? 0) + 1);
    } else if (g.status === "pending_helper") {
      requested.set(key, (requested.get(key) ?? 0) + 1);
    }
  }

  const mondayOffset = -(today.isoWeekday - 1);
  const days: CalendarDay[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = berlinDayFrom(now, mondayOffset + i);
    days.push({
      key: d.key,
      day: d.day,
      month: d.month,
      isoWeekday: d.isoWeekday,
      today: d.key === today.key,
      past: d.key < today.key,
      confirmed: confirmed.get(d.key) ?? 0,
      requested: requested.get(d.key) ?? 0,
    });
  }
  return days;
}

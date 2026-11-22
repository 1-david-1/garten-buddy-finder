/**
 * Monatsfenster für Diagramme: Monate werden in deutscher Ortszeit gezählt, nicht in UTC,
 * damit eine Zahlung um 0:30 Uhr am 1. noch in den neuen Monat fällt.
 * Gemeinsam genutzt vom Kunden- und vom Helfer-Dashboard.
 */

import { berlinParts } from "@/lib/berlin-time";

export const MONTH_SHORT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"] as const;

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM" - der Monat ist 1 bis 12. */
export const monthKey = (year: number, month: number) => `${year}-${pad2(month)}`;

/** Der Monat eines Zeitpunkts in deutscher Ortszeit als "YYYY-MM". */
export function monthKeyOf(date: Date): string {
  const p = berlinParts(date);
  return monthKey(p.year, p.month);
}

export interface MonthSlot {
  /** "YYYY-MM" */
  key: string;
  /** "Nov" */
  label: string;
  /** "Nov 2026" - für Tooltip und Textalternative. */
  title: string;
  /** Der aktuelle Monat (deutsche Ortszeit). */
  current: boolean;
}

/** Aufeinanderfolgende Monate: `monthsBack` vor dem aktuellen bis `monthsAhead` danach. */
export function monthWindow(now: Date = new Date(), monthsBack = 3, monthsAhead = 2): MonthSlot[] {
  const t = berlinParts(now);
  const slots: MonthSlot[] = [];
  for (let i = -monthsBack; i <= monthsAhead; i++) {
    const d = new Date(Date.UTC(t.year, t.month - 1 + i, 1));
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth();
    slots.push({
      key: monthKey(year, month + 1),
      label: MONTH_SHORT[month],
      title: `${MONTH_SHORT[month]} ${year}`,
      current: i === 0,
    });
  }
  return slots;
}

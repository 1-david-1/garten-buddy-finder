/**
 * Wiederkehrende Sperrzeiten eines Helfers (z. B. Stundenplan).
 *
 * Der Helfer trägt wöchentlich wiederkehrende Zeiten ein, in denen er nicht arbeiten kann. Für den Buchungskalender
 * rechnet der SERVER die Regeln in konkrete Zeitspannen um (expandRecurringBlocks). Kunden bekommen nur diese
 * anonymen Zeitspannen - nie die Regeln, Bezeichnungen (z. B. "Schule") oder Gültigkeitszeiträume.
 *
 * Alle Uhrzeiten gelten in deutscher Ortszeit (Europe/Berlin), unabhängig davon, in welcher Zeitzone der Code läuft
 * (der Server läuft in UTC). Die Datenbank prüft dieselbe Regel noch einmal (Migration
 * 20261116000000_helper_recurring_blocks.sql).
 */

import { BERLIN_TIME_ZONE, berlinDateKey, berlinParts, berlinWallTimeToDate, type BerlinParts } from "@/lib/berlin-time";

// Die Zeitzonen-Hilfen liegen in berlin-time.ts; hier weiter erreichbar, weil bestehender Code sie von hier importiert.
export const BLOCK_TIME_ZONE = BERLIN_TIME_ZONE;
export { berlinDateKey, berlinParts, berlinWallTimeToDate };
export type { BerlinParts };

export interface RecurringBlockRule {
  /** ISO-Wochentag: 1 = Montag ... 7 = Sonntag */
  weekday: number;
  /** "HH:MM", deutsche Ortszeit */
  startTime: string;
  endTime: string;
  label?: string | null;
  /** "YYYY-MM-DD" oder leer = unbegrenzt */
  validFrom?: string | null;
  validUntil?: string | null;
}

export interface BlockedInterval {
  /** ISO-Zeitstempel */
  start: string;
  end: string;
}

function parseTime(value: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 24 || minute > 59) return null;
  return { hour, minute };
}

function timeToMinutes(value: string): number {
  const t = parseTime(value);
  return t ? t.hour * 60 + t.minute : 0;
}

// ---------------------------------------------------------------------------
// Regeln -> konkrete Zeitspannen (für den Buchungskalender)
// ---------------------------------------------------------------------------

/**
 * Rechnet die wöchentlichen Regeln in konkrete Zeitspannen ab dem Tag vor `from` für `days` Tage um.
 * Die Zeitspannen tragen keine Bezeichnung.
 */
export function expandRecurringBlocks(rules: RecurringBlockRule[], from: Date, days: number): BlockedInterval[] {
  if (rules.length === 0) return [];
  const start = berlinParts(from);
  const out: BlockedInterval[] = [];
  for (let i = -1; i <= days; i++) {
    // Kalenderrechnung über UTC, damit Sommer-/Winterzeit keine Rolle spielt
    const cal = new Date(Date.UTC(start.year, start.month - 1, start.day + i));
    const y = cal.getUTCFullYear();
    const m = cal.getUTCMonth() + 1;
    const d = cal.getUTCDate();
    const isoWeekday = cal.getUTCDay() === 0 ? 7 : cal.getUTCDay();
    const key = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    for (const rule of rules) {
      if (rule.weekday !== isoWeekday) continue;
      if (rule.validFrom && key < rule.validFrom.slice(0, 10)) continue;
      if (rule.validUntil && key > rule.validUntil.slice(0, 10)) continue;
      const s = parseTime(rule.startTime);
      const e = parseTime(rule.endTime);
      if (!s || !e) continue;
      const startDate = berlinWallTimeToDate(y, m, d, s.hour, s.minute);
      const endDate = berlinWallTimeToDate(y, m, d, e.hour, e.minute);
      if (endDate.getTime() <= startDate.getTime()) continue;
      out.push({ start: startDate.toISOString(), end: endDate.toISOString() });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Wochenraster (Oberfläche): Montag bis Samstag, Stundenzellen 08-18 Uhr
// ---------------------------------------------------------------------------

export const GRID_FIRST_HOUR = 8;
export const GRID_LAST_HOUR = 18; // exklusiv: letzte Zelle ist 17:00-18:00
export const GRID_HOURS: number[] = Array.from({ length: GRID_LAST_HOUR - GRID_FIRST_HOUR }, (_, i) => GRID_FIRST_HOUR + i);
export const GRID_WEEKDAYS: { iso: number; short: string; long: string }[] = [
  { iso: 1, short: "Mo", long: "Montag" },
  { iso: 2, short: "Di", long: "Dienstag" },
  { iso: 3, short: "Mi", long: "Mittwoch" },
  { iso: 4, short: "Do", long: "Donnerstag" },
  { iso: 5, short: "Fr", long: "Freitag" },
  { iso: 6, short: "Sa", long: "Samstag" },
];

/** grid[Tagesindex 0..5][Stundenindex] = gesperrt? */
export type BlockGrid = boolean[][];

export function emptyGrid(): BlockGrid {
  return GRID_WEEKDAYS.map(() => GRID_HOURS.map(() => false));
}

/** Zelle ist gesperrt, sobald eine Regel sie überlappt (auch bei krummen Uhrzeiten aus der Datenbank). */
export function rulesToGrid(rules: RecurringBlockRule[]): BlockGrid {
  const grid = emptyGrid();
  for (const rule of rules) {
    const dayIdx = GRID_WEEKDAYS.findIndex((d) => d.iso === rule.weekday);
    if (dayIdx < 0) continue;
    const s = timeToMinutes(rule.startTime);
    const e = timeToMinutes(rule.endTime);
    GRID_HOURS.forEach((hour, hourIdx) => {
      const cellStart = hour * 60;
      const cellEnd = cellStart + 60;
      if (s < cellEnd && cellStart < e) grid[dayIdx][hourIdx] = true;
    });
  }
  return grid;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Fasst zusammenhängende gesperrte Stunden zu Zeitbereichen zusammen. */
export function gridToRules(
  grid: BlockGrid,
  options: { label?: string | null; validFrom?: string | null; validUntil?: string | null } = {},
): RecurringBlockRule[] {
  const rules: RecurringBlockRule[] = [];
  const label = options.label?.trim() ? options.label.trim() : null;
  GRID_WEEKDAYS.forEach((day, dayIdx) => {
    let runStart: number | null = null;
    const flush = (endHour: number) => {
      if (runStart === null) return;
      rules.push({
        weekday: day.iso,
        startTime: `${pad(runStart)}:00`,
        endTime: `${pad(endHour)}:00`,
        label,
        validFrom: options.validFrom || null,
        validUntil: options.validUntil || null,
      });
      runStart = null;
    };
    GRID_HOURS.forEach((hour, hourIdx) => {
      if (grid[dayIdx]?.[hourIdx]) {
        if (runStart === null) runStart = hour;
      } else {
        flush(hour);
      }
    });
    flush(GRID_LAST_HOUR);
  });
  return rules;
}

export function countBlockedHours(grid: BlockGrid): number {
  return grid.reduce((sum, day) => sum + day.filter(Boolean).length, 0);
}

/**
 * Datum und Uhrzeit in deutscher Ortszeit (Europe/Berlin) - unabhängig von der Zeitzone des Rechners.
 *
 * Warum: Der Server läuft in UTC, die Nutzer sitzen in Deutschland. Wer "heute", "Sonntag" oder "09:00 Uhr" mit den
 * Methoden des Date-Objekts (getHours, getDay, toISOString ...) bestimmt, bekommt auf dem Server eine andere Antwort als
 * im Browser: Termine wurden fälschlich abgelehnt, und zwischen Mitternacht und 2 Uhr galt noch der Vortag als "heute".
 * Alles, was Tage, Wochentage oder Uhrzeiten von Terminen auswertet oder anzeigt, nutzt deshalb diese Datei.
 */

export const BERLIN_TIME_ZONE = "Europe/Berlin";

let partsFormatter: Intl.DateTimeFormat | null = null;
function formatter(): Intl.DateTimeFormat {
  partsFormatter ??= new Intl.DateTimeFormat("en-GB", {
    timeZone: BERLIN_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  });
  return partsFormatter;
}

const WEEKDAY_ISO: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export interface BerlinParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 1 = Montag ... 7 = Sonntag */
  isoWeekday: number;
}

/** Kalenderdatum, Uhrzeit und Wochentag eines Zeitpunkts in deutscher Ortszeit. */
export function berlinParts(date: Date): BerlinParts {
  const parts: Record<string, string> = {};
  for (const p of formatter().formatToParts(date)) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    isoWeekday: WEEKDAY_ISO[parts.weekday] ?? 1,
  };
}

function offsetMsAt(utcMs: number): number {
  const p = berlinParts(new Date(utcMs));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - utcMs;
}

/** Der Zeitpunkt, an dem die Wanduhr in Deutschland das angegebene Datum und die Uhrzeit zeigt. */
export function berlinWallTimeToDate(year: number, month: number, day: number, hour: number, minute: number): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - offsetMsAt(guess);
  const second = guess - offsetMsAt(first);
  return new Date(second);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** "YYYY-MM-DD" des Tages in Deutschland (z. B. für Datumsfelder und Tagesvergleiche). */
export function berlinDateKey(date: Date): string {
  const p = berlinParts(date);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

export interface BerlinDay {
  year: number;
  month: number;
  day: number;
  /** 1 = Montag ... 7 = Sonntag */
  isoWeekday: number;
  /** "YYYY-MM-DD" */
  key: string;
}

/** Der Kalendertag in Deutschland, `offsetDays` Tage nach (oder vor) dem Tag von `now`. */
export function berlinDayFrom(now: Date, offsetDays = 0): BerlinDay {
  const t = berlinParts(now);
  const cal = new Date(Date.UTC(t.year, t.month - 1, t.day + offsetDays));
  const year = cal.getUTCFullYear();
  const month = cal.getUTCMonth() + 1;
  const day = cal.getUTCDate();
  return { year, month, day, isoWeekday: cal.getUTCDay() === 0 ? 7 : cal.getUTCDay(), key: `${year}-${pad2(month)}-${pad2(day)}` };
}

// ---------------------------------------------------------------------------
// Anzeige (deutsches Format, deutsche Ortszeit - auch auf dem Server)
// ---------------------------------------------------------------------------

const formatters = new Map<string, Intl.DateTimeFormat>();
function display(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options);
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("de-DE", { timeZone: BERLIN_TIME_ZONE, ...options });
    formatters.set(key, f);
  }
  return f;
}

/** "17.11.2026" */
export function formatBerlinDate(value: Date | string | number): string {
  return display({ day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

/** "09:00" */
export function formatBerlinTime(value: Date | string | number): string {
  return display({ hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

/** "17.11.2026, 09:00" */
export function formatBerlinDateTime(value: Date | string | number): string {
  return display({ day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

/** "YYYY-MM-DDTHH:mm" in deutscher Ortszeit - z. B. als frühester Wert eines datetime-local-Feldes. */
export function berlinDateTimeLocalValue(date: Date): string {
  const p = berlinParts(date);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}`;
}

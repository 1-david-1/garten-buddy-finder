// Gemeinsame Regeln für Buchungs-Zeitfenster (Browser UND Server nutzen dieselbe Logik).
// Die Verfügbarkeit stammt aus echten Daten des Helfers: bestehende Aufträge, Urlaubsmodus,
// Jugendschutz (08-18 Uhr, höchstens 2 Stunden pro Tag). Es werden nur Zeitspannen übertragen,
// keine Auftragsdetails.

export interface BusyInterval {
  /** ISO-Zeitstempel */
  start: string;
  end: string;
}

export interface BookableService {
  listingId: string;
  title: string;
  serviceType: string;
  priceCents: number;
}

export interface HelperBookingInfo {
  helperId: string;
  helperName: string;
  isYouth: boolean;
  /** Kann überhaupt gebucht werden? Wenn nicht: reason erklärt warum. */
  bookable: boolean;
  reason: string | null;
  /** Urlaubsmodus mit Rückkehrdatum (YYYY-MM-DD): davor keine Termine */
  unavailableUntil: string | null;
  busy: BusyInterval[];
  services: BookableService[];
}

export const SLOT_TIMES = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00"] as const;
export const SLOT_MINUTES = 60;
/** Frühester buchbarer Zeitpunkt: so viele Stunden ab jetzt */
export const MIN_LEAD_HOURS = 2;
/** Pufferzeit vor/nach einem bestehenden Auftrag (Anfahrt) */
export const TRAVEL_BUFFER_MINUTES = 30;
export const YOUTH_MAX_MINUTES_PER_DAY = 120;

export const BOOKING_WINDOW_DAYS = 28;

/** Lokales Datum als YYYY-MM-DD (NICHT toISOString: das verschiebt den Tag um die Zeitzone). */
export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Ist der Zeitraum frei (inkl. Pufferzeit) und im erlaubten Rahmen? Gibt einen Grund zurück, wenn nicht. */
export function slotProblem(
  info: Pick<HelperBookingInfo, "busy" | "isYouth" | "unavailableUntil">,
  start: Date,
  minutes: number = SLOT_MINUTES,
  now: Date = new Date(),
): string | null {
  const s = start.getTime();
  const e = s + minutes * 60_000;

  if (s < now.getTime() + MIN_LEAD_HOURS * 3_600_000) {
    return `Termine sind frühestens ${MIN_LEAD_HOURS} Stunden im Voraus buchbar.`;
  }
  if (info.unavailableUntil && localDateKey(start) < info.unavailableUntil) {
    return "Der Helfer ist zu diesem Zeitpunkt nicht verfügbar (Urlaub).";
  }
  const hour = start.getHours() + start.getMinutes() / 60;
  const endHour = hour + minutes / 60;
  if (start.getDay() === 0) return "Sonntags sind keine Termine möglich.";
  if (info.isYouth && (hour < 8 || endHour > 18)) {
    return "Jugendliche Helfer arbeiten nur zwischen 08:00 und 18:00 Uhr.";
  }

  const buffer = TRAVEL_BUFFER_MINUTES * 60_000;
  let sameDayMinutes = 0;
  const dayKey = localDateKey(start);
  for (const b of info.busy) {
    const bs = new Date(b.start).getTime();
    const be = new Date(b.end).getTime();
    if (overlaps(s, e, bs - buffer, be + buffer)) {
      return "Zu diesem Zeitpunkt hat der Helfer schon einen anderen Termin.";
    }
    if (localDateKey(new Date(bs)) === dayKey) sameDayMinutes += Math.round((be - bs) / 60_000);
  }
  if (info.isYouth && sameDayMinutes + minutes > YOUTH_MAX_MINUTES_PER_DAY) {
    return "Jugendliche Helfer dürfen höchstens 2 Stunden pro Tag arbeiten.";
  }
  return null;
}

export interface DaySchedule {
  date: string;
  dayName: string;
  dayNumber: number;
  slots: { time: string; available: boolean }[];
  hasAvailability: boolean;
}

const WEEKDAY_NAMES = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/** Sechs Tage ab (heute + dayOffset) mit echten freien/belegten Zeitfenstern. */
export function buildSchedule(
  info: Pick<HelperBookingInfo, "busy" | "isYouth" | "unavailableUntil">,
  dayOffset: number,
  now: Date = new Date(),
): DaySchedule[] {
  const days: DaySchedule[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset + i);
    const isToday = dayOffset + i === 0;
    const slots = SLOT_TIMES.map((time) => {
      const [hh, mm] = time.split(":").map(Number);
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, 0, 0);
      return { time, available: slotProblem(info, start, SLOT_MINUTES, now) === null };
    });
    days.push({
      date: localDateKey(d),
      dayName: isToday ? "Heute" : WEEKDAY_NAMES[d.getDay()],
      dayNumber: d.getDate(),
      hasAvailability: slots.some((s) => s.available),
      slots,
    });
  }
  return days;
}

import { describe, it, expect } from "vitest";
import { buildSchedule, localDateKey, slotProblem } from "@/lib/booking-slots";

const now = new Date(2026, 9, 24, 8, 0); // Samstag, 24.10.2026 08:00 (lokal)
const at = (day: number, hour: number) => new Date(2026, 9, day, hour, 0);
const busy = [{ start: at(26, 10).toISOString(), end: at(26, 11).toISOString() }];
const adult = { busy, isYouth: false, unavailableUntil: null };

describe("booking-slots", () => {
  it("bildet das lokale Datum ohne Zeitzonen-Verschiebung", () => {
    expect(localDateKey(new Date(2026, 9, 25, 0, 0))).toBe("2026-10-25");
  });

  it("sperrt Sonntage, belegte Zeiten, Anfahrtspuffer und zu kurzfristige Termine", () => {
    expect(slotProblem(adult, at(25, 10), 60, now)).not.toBeNull();
    expect(slotProblem(adult, at(26, 10), 60, now)).not.toBeNull();
    expect(slotProblem(adult, at(26, 11), 60, now)).not.toBeNull();
    expect(slotProblem(adult, at(26, 13), 60, now)).toBeNull();
    expect(slotProblem(adult, at(24, 9), 60, now)).not.toBeNull();
  });

  it("wendet die Jugendschutz-Regeln an (08-18 Uhr, höchstens 2 Stunden pro Tag)", () => {
    const youth = { ...adult, isYouth: true };
    expect(slotProblem(youth, at(26, 19), 60, now)).not.toBeNull();
    const busyTwoHours = [{ start: at(27, 9).toISOString(), end: at(27, 11).toISOString() }];
    expect(slotProblem({ busy: busyTwoHours, isYouth: true, unavailableUntil: null }, at(27, 15), 60, now)).not.toBeNull();
  });

  it("berücksichtigt den Urlaub bis zum Rückkehrdatum", () => {
    expect(slotProblem({ ...adult, unavailableUntil: "2026-10-30" }, at(28, 10), 60, now)).not.toBeNull();
    expect(slotProblem({ ...adult, unavailableUntil: "2026-10-30" }, at(30, 13), 60, now)).toBeNull();
  });

  it("baut einen Wochenplan mit echten Daten", () => {
    const week = buildSchedule(adult, 0, now);
    expect(week).toHaveLength(6);
    expect(week[0].date).toBe("2026-10-24");
    expect(week[2].slots.find((s) => s.time === "10:00")?.available).toBe(false);
  });
});

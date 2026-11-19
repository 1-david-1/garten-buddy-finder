import { describe, it, expect } from "vitest";
import { buildSchedule, localDateKey, slotProblem } from "@/lib/booking-slots";
import { berlinWallTimeToDate } from "@/lib/berlin-time";

const now = berlinWallTimeToDate(2026, 10, 24, 8, 0); // Samstag, 24.10.2026 08:00 (deutsche Zeit)
const at = (day: number, hour: number) => berlinWallTimeToDate(2026, 10, day, hour, 0);
const busy = [{ start: at(26, 10).toISOString(), end: at(26, 11).toISOString() }];
const adult = { busy, isYouth: false, unavailableUntil: null };

describe("booking-slots", () => {
  it("bildet das lokale Datum ohne Zeitzonen-Verschiebung", () => {
    expect(localDateKey(berlinWallTimeToDate(2026, 10, 25, 0, 0))).toBe("2026-10-25");
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

  describe("deutsche Ortszeit, egal wo der Code läuft (Server = UTC)", () => {
    it("ein jugendlicher Helfer ist im Sommer um 09:00 Uhr buchbar (früher auf dem Server abgelehnt: 07:00 UTC)", () => {
      const summerNow = berlinWallTimeToDate(2026, 7, 12, 8, 0);
      const youth = { busy: [], isYouth: true, unavailableUntil: null };
      expect(slotProblem(youth, berlinWallTimeToDate(2026, 7, 14, 9, 0), 60, summerNow)).toBeNull();
      expect(slotProblem(youth, berlinWallTimeToDate(2026, 7, 14, 17, 30), 60, summerNow)).not.toBeNull(); // endet nach 18:00
    });

    it("kurz nach Mitternacht in Deutschland ist schon der neue Tag \"heute\"", () => {
      const justAfterMidnight = new Date("2026-11-16T23:30:00Z"); // 00:30 am 17.11. in Deutschland
      const week = buildSchedule({ busy: [], isYouth: false, unavailableUntil: null }, 0, justAfterMidnight);
      expect(week[0].date).toBe("2026-11-17");
      expect(week[0].dayName).toBe("Heute");
      expect(week[0].dayNumber).toBe(17);
      expect(localDateKey(justAfterMidnight)).toBe("2026-11-17");
    });

    it("Sonntag zählt nach deutscher Uhr, nicht nach UTC", () => {
      const nowSat = berlinWallTimeToDate(2026, 11, 14, 8, 0);
      const info = { busy: [], isYouth: false, unavailableUntil: null };
      expect(slotProblem(info, berlinWallTimeToDate(2026, 11, 15, 0, 30), 60, nowSat)).toMatch(/Sonntag/); // Sa 23:30 UTC
      expect(slotProblem(info, berlinWallTimeToDate(2026, 11, 14, 23, 0), 30, nowSat)).toBeNull(); // Sa 22:00 UTC
    });

    it("die Tage der Wochenansicht sind lückenlos, auch über die Zeitumstellung (25.10.2026)", () => {
      const nowBefore = berlinWallTimeToDate(2026, 10, 23, 8, 0);
      const week = buildSchedule({ busy: [], isYouth: false, unavailableUntil: null }, 0, nowBefore);
      expect(week.map((d) => d.date)).toEqual(["2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28"]);
      expect(week.map((d) => d.dayName)).toEqual(["Heute", "Sa", "So", "Mo", "Di", "Mi"]);
    });
  });
});

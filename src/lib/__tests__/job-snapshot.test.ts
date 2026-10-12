import { describe, expect, it } from "vitest";
import { changedJobFields, jobEnd, requiresNewApproval, type JobSnapshot } from "../job-snapshot";

const base: JobSnapshot = {
  location: "Musterstraße 1, 79098 Freiburg",
  scheduledAt: "2026-10-15T14:00:00.000Z",
  durationMinutes: 90,
  customerId: "c-1",
  activity: "laub",
  description: "Laub zusammenrechen",
  priceCents: 2000,
};

describe("Neue Elternfreigabe bei wesentlicher Änderung des Auftrags", () => {
  it("keine Änderung -> keine neue Freigabe", () => {
    expect(requiresNewApproval(base, { ...base })).toBe(false);
  });

  it.each<[string, Partial<JobSnapshot>, keyof JobSnapshot]>([
    ["Ort", { location: "Andere Straße 5, 79100 Freiburg" }, "location"],
    ["Uhrzeit/Datum", { scheduledAt: "2026-10-15T15:00:00.000Z" }, "scheduledAt"],
    ["Dauer", { durationMinutes: 120 }, "durationMinutes"],
    ["Auftraggeber", { customerId: "c-2" }, "customerId"],
    ["Art der Tätigkeit", { activity: "rasenmähen" }, "activity"],
    ["Beschreibung", { description: "Laub und Äste entfernen" }, "description"],
    ["Vergütung", { priceCents: 3500 }, "priceCents"],
  ])("Änderung: %s -> neue Freigabe nötig", (_label, change, field) => {
    const after = { ...base, ...change };
    expect(requiresNewApproval(base, after)).toBe(true);
    expect(changedJobFields(base, after)).toEqual([field]);
  });

  it("berechnet das Ende aus Beginn und Dauer", () => {
    expect(jobEnd(base.scheduledAt!, 90).toISOString()).toBe("2026-10-15T15:30:00.000Z");
  });
});

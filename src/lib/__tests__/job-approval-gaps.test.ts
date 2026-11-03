import { describe, expect, it } from "vitest";
import { guardianHintForCustomer, missingApprovalDetails } from "../job-approval-gaps";

describe("missingApprovalDetails", () => {
  it("meldet fehlenden Termin und Ort", () => {
    expect(missingApprovalDetails({ scheduledAt: null, hasLocation: false })).toEqual(["Termin", "Ort"]);
    expect(missingApprovalDetails({ scheduledAt: null, hasLocation: true })).toEqual(["Termin"]);
    expect(missingApprovalDetails({ scheduledAt: "2026-11-02T14:00:00Z", hasLocation: false })).toEqual(["Ort"]);
  });
  it("meldet nichts, wenn alles feststeht", () => {
    expect(missingApprovalDetails({ scheduledAt: "2026-11-02T14:00:00Z", hasLocation: true })).toEqual([]);
  });
});

describe("guardianHintForCustomer", () => {
  it("liefert für jeden Code einen verständlichen Hinweis an den Auftraggeber", () => {
    for (const code of ["requested", "details_missing", "already_pending", "blocked"] as const) {
      const hint = guardianHintForCustomer(code);
      expect(hint.code).toBe(code);
      expect(hint.message.length).toBeGreaterThan(20);
      expect(hint.message).toContain("Helfer");
    }
  });
});

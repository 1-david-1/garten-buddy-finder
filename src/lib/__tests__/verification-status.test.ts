import { describe, expect, it } from "vitest";
import {
  deriveVerificationStatus,
  VERIFICATION_STATUS_LABEL,
  VERIFIED_BADGES,
} from "../verification-status";

const none = { verifiedAt: null, hasPendingRequest: false, lastRequestDeclined: false };

describe("Verifizierungsstatus", () => {
  it("Nicht begonnen", () => expect(deriveVerificationStatus(none)).toBe("not_started"));
  it("In Prüfung", () =>
    expect(deriveVerificationStatus({ ...none, hasPendingRequest: true })).toBe("in_review"));
  it("Abgelehnt", () =>
    expect(deriveVerificationStatus({ ...none, lastRequestDeclined: true })).toBe("rejected"));
  it("Verifiziert", () =>
    expect(deriveVerificationStatus({ ...none, verifiedAt: "2026-10-01" })).toBe("verified"));
  it("Erneute Prüfung erforderlich", () =>
    expect(
      deriveVerificationStatus({ ...none, verifiedAt: "2026-10-01", reverificationRequiredAt: "2026-10-05" }),
    ).toBe("reverification_required"));
  it("Gesperrt hat Vorrang vor Verifiziert", () =>
    expect(deriveVerificationStatus({ ...none, verifiedAt: "2026-10-01", suspendedAt: "2026-10-06" })).toBe(
      "suspended",
    ));

  it("Kennzeichnungen enthalten keine Sicherheits-/Zuverlässigkeitsversprechen", () => {
    const text = [...VERIFIED_BADGES, ...Object.values(VERIFICATION_STATUS_LABEL)].join(" ").toLowerCase();
    expect(text).not.toMatch(/sicher|vertrauenswürdig|garantiert|zuverlässig/);
  });
});

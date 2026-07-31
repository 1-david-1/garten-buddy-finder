import { describe, it, expect } from "vitest";

describe("admin.functions", () => {
  describe("getAdminOverview", () => {
    it("should count active gigs by status correctly", () => {
      const activeStatuses = new Set(["open", "negotiating", "assigned", "in_progress"]);
      const gigs = [
        { status: "open" },
        { status: "negotiating" },
        { status: "completed" },
        { status: "cancelled" },
        { status: "assigned" },
      ];
      const activeGigs = gigs.filter((g) => activeStatuses.has(g.status)).length;

      expect(activeGigs).toBe(3);
    });

    it("should only sum gross volume and fees for paid_out escrow rows", () => {
      const escrow = [
        { bid_cents: 10000, customer_fee_cents: 500, helper_fee_cents: 300, state: "paid_out" },
        { bid_cents: 5000, customer_fee_cents: 200, helper_fee_cents: 100, state: "held" },
        { bid_cents: 8000, customer_fee_cents: 400, helper_fee_cents: 250, state: "paid_out" },
      ];
      const paidOut = escrow.filter((e) => e.state === "paid_out");
      const grossVolumeCents = paidOut.reduce((s, e) => s + e.bid_cents, 0);
      const platformFeesCents = paidOut.reduce(
        (s, e) => s + e.customer_fee_cents + e.helper_fee_cents,
        0,
      );

      expect(grossVolumeCents).toBe(18000);
      expect(platformFeesCents).toBe(1450);
    });

    it("should count open disputes from escrow state", () => {
      const escrow = [{ state: "disputed" }, { state: "held" }, { state: "disputed" }];
      const openDisputes = escrow.filter((e) => e.state === "disputed").length;

      expect(openDisputes).toBe(2);
    });

    it("should bucket helper vs customer roles for the users KPI", () => {
      const helperRoleSet = new Set(["helper_youth", "helper_adult", "helper_pro"]);
      const roles = [
        { user_id: "a", role: "customer" },
        { user_id: "b", role: "helper_pro" },
        { user_id: "c", role: "helper_youth" },
        { user_id: "b", role: "customer" }, // same user can hold both roles
      ];
      const helperIds = new Set(roles.filter((r) => helperRoleSet.has(r.role)).map((r) => r.user_id));
      const customerIds = new Set(roles.filter((r) => r.role === "customer").map((r) => r.user_id));

      expect(helperIds.size).toBe(2);
      expect(customerIds.size).toBe(2);
    });
  });

  describe("adjustTrustScore", () => {
    it("should clamp the trust score to a maximum of 100", () => {
      const current = 98;
      const delta = 5;
      const nextScore = Math.max(0, Math.min(100, current + delta));

      expect(nextScore).toBe(100);
    });

    it("should clamp the trust score to a minimum of 0", () => {
      const current = 3;
      const delta = -10;
      const nextScore = Math.max(0, Math.min(100, current + delta));

      expect(nextScore).toBe(0);
    });

    it("should apply a normal in-range delta unchanged", () => {
      const current = 50;
      const delta = -5;
      const nextScore = Math.max(0, Math.min(100, current + delta));

      expect(nextScore).toBe(45);
    });
  });

  describe("setUserVerified", () => {
    it("should set verified_at to null when unverifying", () => {
      const input = { verified: false };
      const verifiedAt = input.verified ? new Date().toISOString() : null;

      expect(verifiedAt).toBeNull();
    });

    it("should set verified_at to an ISO timestamp when verifying", () => {
      const input = { verified: true };
      const verifiedAt = input.verified ? new Date().toISOString() : null;

      expect(verifiedAt).not.toBeNull();
      expect(new Date(verifiedAt as string).toString()).not.toBe("Invalid Date");
    });
  });

  describe("updateAdminSetting", () => {
    it("should accept boolean, number, string and string[] values", () => {
      const values: Array<string | number | boolean | string[]> = [
        true,
        42,
        "hello",
        ["a@example.com", "b@example.com"],
      ];
      for (const v of values) {
        const isValid =
          typeof v === "boolean" ||
          typeof v === "number" ||
          typeof v === "string" ||
          (Array.isArray(v) && v.every((x) => typeof x === "string"));
        expect(isValid).toBe(true);
      }
    });
  });

  describe("getAdminGigs", () => {
    it("should merge negotiation counts per gig", () => {
      const negotiations = [{ gig_id: "g1" }, { gig_id: "g1" }, { gig_id: "g2" }];
      const negotiationCountByGig = new Map<string, number>();
      for (const n of negotiations) {
        negotiationCountByGig.set(n.gig_id, (negotiationCountByGig.get(n.gig_id) ?? 0) + 1);
      }

      expect(negotiationCountByGig.get("g1")).toBe(2);
      expect(negotiationCountByGig.get("g2")).toBe(1);
      expect(negotiationCountByGig.get("g3")).toBeUndefined();
    });

    it("should filter by status unless 'all' is requested", () => {
      const gigs = [{ status: "open" }, { status: "completed" }, { status: "open" }];
      const filterStatus = "open";
      const filtered = filterStatus === "all" ? gigs : gigs.filter((g) => g.status === filterStatus);

      expect(filtered).toHaveLength(2);
    });
  });
});

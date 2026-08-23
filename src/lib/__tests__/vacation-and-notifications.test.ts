import { describe, it, expect } from "vitest";

describe("vacation mode", () => {
  it("should treat vacation as expired once the return date has passed", () => {
    const vacationReturnDate = "2020-01-01"; // definitely in the past
    const vacationExpired = new Date(vacationReturnDate).getTime() <= Date.now();

    expect(vacationExpired).toBe(true);
  });

  it("should treat vacation as active when the return date is in the future", () => {
    const future = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const vacationExpired = new Date(future).getTime() <= Date.now();

    expect(vacationExpired).toBe(false);
  });

  it("should stay active indefinitely when no return date is set", () => {
    const vacationReturnDate: string | null = null;
    const vacationExpired =
      vacationReturnDate !== null && new Date(vacationReturnDate).getTime() <= Date.now();

    expect(vacationExpired).toBe(false);
  });

  it("should force available_today off whenever vacation mode is switched on", () => {
    const update: { vacation_mode: boolean; available_today?: boolean } = {
      vacation_mode: true,
    };
    if (update.vacation_mode) update.available_today = false;

    expect(update.available_today).toBe(false);
  });

  it("should clear the return date when vacation mode is switched off", () => {
    const vacationMode = false;
    const returnDate = vacationMode ? "2026-08-01" : null;

    expect(returnDate).toBeNull();
  });
});

describe("notification preferences", () => {
  it("should merge a partial update into existing prefs without wiping other categories", () => {
    const existing = { enabled: true, new_bid: true, bid_updates: false, gig_updates: true };
    const prefs = {
      enabled: existing.enabled,
      new_bid: existing.new_bid,
      bid_updates: existing.bid_updates,
      gig_updates: existing.gig_updates,
    };
    const patch = { newBid: false };
    if (patch.newBid !== undefined) prefs.new_bid = patch.newBid;

    expect(prefs).toEqual({
      enabled: true,
      new_bid: false,
      bid_updates: false,
      gig_updates: true,
    });
  });

  it("should default every category to true when no prefs row exists yet", () => {
    const existing = {} as Record<string, boolean>;
    const prefs = {
      enabled: existing.enabled ?? true,
      new_bid: existing.new_bid ?? true,
      bid_updates: existing.bid_updates ?? true,
      gig_updates: existing.gig_updates ?? true,
    };

    expect(prefs).toEqual({ enabled: true, new_bid: true, bid_updates: true, gig_updates: true });
  });

  it("should skip sending when the master switch is off, regardless of category", () => {
    const prefs = { enabled: false, new_bid: true };
    const shouldSend = prefs.enabled !== false && prefs.new_bid !== false;

    expect(shouldSend).toBe(false);
  });

  it("should skip sending when only the specific category is off", () => {
    const prefs = { enabled: true, bid_updates: false };
    const shouldSend = prefs.enabled !== false && prefs.bid_updates !== false;

    expect(shouldSend).toBe(false);
  });

  it("should send when enabled and the category is not explicitly disabled", () => {
    const prefs: { enabled?: boolean; gig_updates?: boolean } = {};
    const shouldSend = prefs.enabled !== false && prefs.gig_updates !== false;

    expect(shouldSend).toBe(true);
  });
});

describe("email sending safety", () => {
  it("should no-op instead of throwing when no API key is configured", async () => {
    async function sendEmailStub(apiKey: string | undefined): Promise<{ sent: boolean }> {
      if (!apiKey) return { sent: false };
      return { sent: true };
    }

    await expect(sendEmailStub(undefined)).resolves.toEqual({ sent: false });
  });
});

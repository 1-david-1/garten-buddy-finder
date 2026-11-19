import { describe, expect, it } from "vitest";
import {
  awaitsPaymentRelease,
  countGigGroups,
  deriveCustomerTasks,
  pickNextAppointment,
  relativeDay,
  type GigLike,
} from "../customer-dashboard-data";

const gig = (over: Partial<GigLike> & { id: string }): GigLike => ({
  title: `Auftrag ${over.id}`,
  status: "open",
  scheduled_at: null,
  assigned_helper_id: null,
  budget_cents: 5000,
  ...over,
});

describe("Kunden-Dashboard: Aufgaben", () => {
  it("leitet Aufgaben aus Auftragsstatus und Zahlung ab; Zahlungen zuerst, Wartendes zuletzt", () => {
    const tasks = deriveCustomerTasks(
      [
        gig({ id: "1", status: "pending_helper", scheduled_at: "2026-12-01T10:00:00Z" }),
        gig({ id: "2", status: "negotiating" }),
        gig({ id: "3", status: "pending_helper" }),
        gig({ id: "4", status: "completed", assigned_helper_id: "h", reviews: [] }),
        gig({ id: "5", status: "completed", assigned_helper_id: "h", reviews: [{ id: "r" }] }),
        gig({ id: "6", status: "completed", assigned_helper_id: "h" }),
        gig({ id: "7", status: "open" }),
        gig({ id: "8", status: "completed", assigned_helper_id: "h", payment_state: "held", reviews: [] }),
      ],
      2,
    );
    expect(tasks.map((t) => t.key)).toEqual([
      "pay-8",
      "negotiating-2",
      "date-3",
      "review-4",
      "unread-messages",
      "waiting-1",
    ]);
    const pay = tasks[0];
    expect(pay.cta).toBe("Zahlung freigeben");
    expect(tasks[4].title).toBe("2 ungelesene Nachrichten");
    expect(tasks[4].target).toBe("messages");
    expect(tasks[5].tone).toBe("info");
  });

  it("fragt nach der Zahlung nur, solange sie wirklich freigegeben werden kann", () => {
    const done = (payment_state: string | null) =>
      gig({ id: "x", status: "completed", assigned_helper_id: "h", payment_state, reviews: [{ id: "r" }] });
    expect(awaitsPaymentRelease(done("held"))).toBe(true);
    expect(awaitsPaymentRelease(done("pending"))).toBe(true);
    expect(awaitsPaymentRelease(done("releasing"))).toBe(true);
    expect(awaitsPaymentRelease(done("paid_out"))).toBe(false);
    expect(awaitsPaymentRelease(done("disputed"))).toBe(false);
    expect(awaitsPaymentRelease(done("cancelled"))).toBe(false);
    expect(awaitsPaymentRelease(done(null))).toBe(false);
    expect(deriveCustomerTasks([done("paid_out")], 0)).toEqual([]);
    expect(deriveCustomerTasks([done("disputed")], 0)).toEqual([]);
  });

  it("meldet keine Aufgaben, wenn nichts ansteht", () => {
    expect(deriveCustomerTasks([gig({ id: "1" })], 0)).toEqual([]);
    expect(deriveCustomerTasks([], 1)[0].title).toBe("1 ungelesene Nachricht");
  });
});

describe("Kunden-Dashboard: nächster Termin (deutsche Ortszeit)", () => {
  // 18.11.2026, 12:00 Uhr in Deutschland (Winterzeit = UTC+1)
  const now = new Date("2026-11-18T11:00:00Z");

  it("nimmt den frühesten bestätigten Termin ab heute", () => {
    const next = pickNextAppointment(
      [
        gig({ id: "past", status: "assigned", scheduled_at: "2026-11-10T08:00:00Z" }),
        gig({ id: "later", status: "assigned", scheduled_at: "2026-11-25T08:00:00Z" }),
        gig({ id: "soon", status: "assigned", scheduled_at: "2026-11-19T08:00:00Z" }),
        gig({ id: "open", status: "open", scheduled_at: "2026-11-18T14:00:00Z" }),
      ],
      now,
    );
    expect(next?.id).toBe("soon");
  });

  it("zählt einen Termin von heute früh noch zu heute", () => {
    const next = pickNextAppointment(
      [gig({ id: "morning", status: "assigned", scheduled_at: "2026-11-18T07:00:00Z" })],
      now,
    );
    expect(next?.id).toBe("morning");
  });

  it("zeigt laufende Aufträge zuerst und kennt den Fall ohne Termin", () => {
    const running = gig({ id: "run", status: "in_progress" });
    const planned = gig({ id: "plan", status: "assigned", scheduled_at: "2026-11-19T08:00:00Z" });
    expect(pickNextAppointment([planned, running], now)?.id).toBe("run");
    expect(pickNextAppointment([gig({ id: "x" })], now)).toBeNull();
    expect(pickNextAppointment([], now)).toBeNull();
  });
});

describe("Kunden-Dashboard: Zähler und Datum", () => {
  it("zählt offene, geplante und erledigte Aufträge; unbezahlte erledigte zählen als offen", () => {
    expect(
      countGigGroups([
        gig({ id: "1", status: "open" }),
        gig({ id: "2", status: "negotiating" }),
        gig({ id: "3", status: "pending_helper" }),
        gig({ id: "4", status: "assigned" }),
        gig({ id: "5", status: "in_progress" }),
        gig({ id: "6", status: "completed", payment_state: "paid_out" }),
        gig({ id: "7", status: "cancelled" }),
        gig({ id: "8", status: "draft" }),
        gig({ id: "9", status: "completed", payment_state: "held" }),
      ]),
    ).toEqual({ open: 4, planned: 2, done: 1 });
  });

  it("beschreibt Tage relativ - nach deutschem Kalendertag, nicht nach UTC", () => {
    // 18.11.2026, 23:30 Uhr in Deutschland (= 22:30 UTC)
    const now = new Date("2026-11-18T22:30:00Z");
    expect(relativeDay("2026-11-18T06:00:00Z", now)).toBe("Heute");
    // 23:30 UTC ist in Deutschland schon 00:30 am 19.11. - in UTC wäre es noch "heute"
    expect(relativeDay("2026-11-18T23:30:00Z", now)).toBe("Morgen");
    expect(relativeDay("2026-11-22T06:00:00Z", now)).toBe("In 4 Tagen");
    expect(relativeDay("2026-12-20T06:00:00Z", now)).toBe("");
    expect(relativeDay("2026-11-10T06:00:00Z", now)).toBe("");
  });
});

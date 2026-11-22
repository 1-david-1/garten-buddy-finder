import { describe, expect, it } from "vitest";
import {
  HELPER_JOURNEY_LABELS,
  monthlyEarnings,
  netCentsOf,
  pendingPayoutCents,
  toGigLike,
  type EscrowLike,
} from "../helper-dashboard-data";
import { appointmentCalendar, gigJourney, pickNextAppointment, upcomingAppointments } from "../customer-dashboard-data";
import { monthKeyOf, monthWindow } from "../month-buckets";

const escrow = (over: Partial<EscrowLike>): EscrowLike => ({
  state: "paid_out",
  paid_out_at: "2026-11-10T09:00:00Z",
  bid_cents: 5000,
  helper_fee_cents: 500,
  ...over,
});

describe("Monatsfenster", () => {
  const now = new Date("2026-11-18T10:00:00Z");

  it("liefert aufeinanderfolgende Monate und markiert den aktuellen", () => {
    const w = monthWindow(now, 2, 1);
    expect(w.map((m) => m.key)).toEqual(["2026-09", "2026-10", "2026-11", "2026-12"]);
    expect(w.filter((m) => m.current).map((m) => m.key)).toEqual(["2026-11"]);
    expect(w[2].title).toBe("Nov 2026");
  });

  it("rechnet über den Jahreswechsel", () => {
    const w = monthWindow(new Date("2027-01-15T10:00:00Z"), 2, 1);
    expect(w.map((m) => m.key)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
  });

  it("ordnet Zeitpunkte nach deutscher Ortszeit einem Monat zu", () => {
    // 23:30 UTC am 30.11. ist in Deutschland schon der 1.12.
    expect(monthKeyOf(new Date("2026-11-30T23:30:00Z"))).toBe("2026-12");
    expect(monthKeyOf(new Date("2026-11-30T22:30:00Z"))).toBe("2026-11");
  });
});

describe("Helfer-Dashboard: Verdienst", () => {
  const now = new Date("2026-11-18T10:00:00Z");

  it("zählt Netto (Gebot minus Gebühr)", () => {
    expect(netCentsOf({ bid_cents: 5000, helper_fee_cents: 500 })).toBe(4500);
  });

  it("verteilt ausgezahltes Geld auf die letzten sechs Monate nach Auszahlungsdatum", () => {
    const months = monthlyEarnings(
      [
        escrow({ paid_out_at: "2026-11-10T09:00:00Z" }), // Nov: 4500
        escrow({ paid_out_at: "2026-11-02T09:00:00Z", bid_cents: 10000, helper_fee_cents: 1000 }), // Nov: +9000
        escrow({ paid_out_at: "2026-09-20T09:00:00Z" }), // Sep: 4500
        escrow({ paid_out_at: "2026-11-30T23:30:00Z" }), // Berlin: 1.12. -> außerhalb (Zukunft)
        escrow({ paid_out_at: "2026-04-01T09:00:00Z" }), // zu alt
        escrow({ state: "held", paid_out_at: null }), // noch nicht ausgezahlt
        escrow({ state: "paid_out", paid_out_at: null }), // kaputter Datensatz
        escrow({ paid_out_at: "kein-datum" }),
      ],
      now,
    );
    expect(months.map((m) => m.key)).toEqual(["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
    expect(months.map((m) => m.label)).toEqual(["Jun", "Jul", "Aug", "Sep", "Okt", "Nov"]);
    expect(months.map((m) => m.cents)).toEqual([0, 0, 0, 4500, 0, 13500]);
    expect(months.filter((m) => m.current).map((m) => m.key)).toEqual(["2026-11"]);
  });

  it("fasst gesichertes, aber noch nicht freigegebenes Geld zusammen", () => {
    expect(
      pendingPayoutCents([
        escrow({ state: "held", paid_out_at: null }),
        escrow({ state: "pending", paid_out_at: null, bid_cents: 2000, helper_fee_cents: 200 }),
        escrow({ state: "releasing", paid_out_at: null }),
        escrow({ state: "paid_out" }),
        escrow({ state: "disputed", paid_out_at: null }),
        escrow({ state: "cancelled", paid_out_at: null }),
      ]),
    ).toBe(4500 + 1800 + 4500);
    expect(pendingPayoutCents([])).toBe(0);
  });
});

describe("Helfer-Dashboard: Einsätze und Anfragen", () => {
  const now = new Date("2026-11-18T10:00:00Z"); // Mittwoch

  const job = (id: string, status: string, scheduledAt: string | null) =>
    toGigLike({ id, title: `Auftrag ${id}`, status, scheduledAt, budgetCents: 4000 });

  it("hat dieselben fünf Stufen wie beim Kunden, nur mit Helfer-Wörtern", () => {
    expect(HELPER_JOURNEY_LABELS).toHaveLength(5);
    expect(HELPER_JOURNEY_LABELS[1]).toBe("Zugesagt");
    expect(HELPER_JOURNEY_LABELS[4]).toBe("Ausgezahlt");
    // Wartet das Geld noch auf die Freigabe, ist der Auftrag erledigt, aber nicht fertig
    expect(gigJourney({ status: "completed", payment_state: "held" })).toEqual({ reached: 3, finished: false });
    expect(gigJourney({ status: "pending_helper" })).toEqual({ reached: 0, finished: false });
  });

  it("findet den nächsten Einsatz, die folgenden und trägt Anfragen in den Kalender ein", () => {
    const items = [
      job("far", "assigned", "2026-11-30T08:00:00Z"),
      job("next", "assigned", "2026-11-19T08:00:00Z"),
      job("mid", "assigned", "2026-11-24T08:00:00Z"),
      job("ask", "pending_helper", "2026-11-20T08:00:00Z"),
    ];
    expect(pickNextAppointment(items, now)?.source.id).toBe("next");
    expect(upcomingAppointments(items, now, 2).map((g) => g.source.id)).toEqual(["mid", "far"]);

    const days = appointmentCalendar(items, now);
    const at = (key: string) => days.find((d) => d.key === key)!;
    expect(at("2026-11-19")).toMatchObject({ confirmed: 1, requested: 0 });
    expect(at("2026-11-20")).toMatchObject({ confirmed: 0, requested: 1 });
    expect(at("2026-11-24")).toMatchObject({ confirmed: 1, requested: 0 });
    expect(days.reduce((n, d) => n + d.confirmed + d.requested, 0)).toBe(3); // "far" liegt außerhalb der zwei Wochen
  });

  it("behält das Original-Element erreichbar", () => {
    const original = { id: "x", title: "T", status: "assigned", scheduledAt: "2026-11-19T08:00:00Z", budgetCents: 100, customerName: "Anna" };
    expect(toGigLike(original).source).toBe(original);
  });
});

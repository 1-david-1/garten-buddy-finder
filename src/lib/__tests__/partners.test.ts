import { describe, expect, it } from "vitest";
import { isPaymentReleasable, isPaymentSettled, summarizePartners, type PartnerGigRow } from "@/lib/partners";
import { describeGigStatus, describePayment } from "@/lib/gig-status";

const now = new Date("2026-11-17T10:00:00Z");
const gig = (over: Partial<PartnerGigRow> & { id: string }): PartnerGigRow => ({
  customer_id: "c1",
  assigned_helper_id: "h1",
  status: "assigned",
  scheduled_at: null,
  budget_cents: 4000,
  updated_at: "2026-11-10T10:00:00Z",
  ...over,
});
const people = new Map([
  ["c1", { name: "Familie Berger", city: "Freiburg", verified: true }],
  ["c2", { name: "Herr Maier", city: "Gundelfingen", verified: false }],
  ["h1", { name: "Lena", city: "Freiburg", verified: true }],
  ["h2", { name: "Jonas", city: "Freiburg", verified: true }],
]);

describe("Partner-Zusammenfassung", () => {
  it("Helfer sieht seine Kunden, gruppiert nach Auftraggeber", () => {
    const rows = [
      gig({ id: "g1", customer_id: "c1", status: "assigned", scheduled_at: "2026-11-20T09:00:00Z" }),
      gig({ id: "g2", customer_id: "c1", status: "completed" }),
      gig({ id: "g3", customer_id: "c2", status: "pending_helper", scheduled_at: "2026-11-19T09:00:00Z" }),
    ];
    const res = summarizePartners(rows, [{ gig_id: "g2", state: "held", bid_cents: 3000 }], "customers", people, now);
    expect(res.map((p) => p.id)).toEqual(["c2", "c1"]); // c2 hat eine offene Anfrage -> zuerst
    const c1 = res.find((p) => p.id === "c1")!;
    expect(c1).toMatchObject({ name: "Familie Berger", activeCount: 1, completedCount: 1, awaitingPaymentCents: 3000, nextAppointment: "2026-11-20T09:00:00Z" });
    expect(res[0].needsActionCount).toBe(1); // Anfrage wartet auf meine Zusage
    expect(c1.needsActionCount).toBe(0); // als Helfer kann ich die Zahlung nicht selbst freigeben
  });

  it("Auftraggeber sieht seine Helfer; offene Zahlungen zählen als Aufgabe", () => {
    const rows = [
      gig({ id: "g1", assigned_helper_id: "h1", status: "completed" }),
      gig({ id: "g2", assigned_helper_id: "h2", status: "completed" }),
      gig({ id: "g3", assigned_helper_id: "h2", status: "open" }),
    ];
    const escrows = [
      { gig_id: "g1", state: "paid_out", bid_cents: 4000 },
      { gig_id: "g2", state: "held", bid_cents: 5000 },
    ];
    const res = summarizePartners(rows, escrows, "helpers", people, now);
    expect(res.map((p) => p.id)).toEqual(["h2", "h1"]);
    expect(res[0]).toMatchObject({ id: "h2", needsActionCount: 1, awaitingPaymentCents: 5000, completedCount: 1 });
    expect(res[1]).toMatchObject({ id: "h1", needsActionCount: 0, awaitingPaymentCents: 0 });
  });

  it("Aufträge ohne zugewiesenen Helfer sind keine Zusammenarbeit", () => {
    expect(summarizePartners([gig({ id: "g1", assigned_helper_id: null, status: "open" })], [], "helpers", people, now)).toEqual([]);
  });

  it("vergangene Termine zählen nicht als nächster Termin; Zahlung in Klärung ist keine Aufgabe", () => {
    const rows = [
      gig({ id: "g1", status: "assigned", scheduled_at: "2026-11-01T09:00:00Z" }),
      gig({ id: "g2", status: "completed" }),
    ];
    const res = summarizePartners(rows, [{ gig_id: "g2", state: "disputed", bid_cents: 2000 }], "helpers", people, now);
    expect(res[0].nextAppointment).toBeNull();
    expect(res[0].needsActionCount).toBe(0);
    expect(res[0].awaitingPaymentCents).toBe(2000);
  });

  it("unbekannte Profile bekommen einen neutralen Namen", () => {
    const res = summarizePartners([gig({ id: "g1" })], [], "customers", new Map(), now);
    expect(res[0].name).toBe("Kunde");
  });

  it("Zahlungs-Hilfen", () => {
    expect(isPaymentReleasable("held")).toBe(true);
    expect(isPaymentReleasable("disputed")).toBe(false);
    expect(isPaymentReleasable("paid_out")).toBe(false);
    expect(isPaymentSettled("paid_out")).toBe(true);
    expect(isPaymentSettled("held")).toBe(false);
  });
});

describe("Status-Texte (einheitlich für alle Seiten)", () => {
  it("pending_helper heißt für Kunde und Helfer das Passende", () => {
    expect(describeGigStatus("pending_helper", "customer").label).toBe("Wartet auf Zusage des Helfers");
    const helper = describeGigStatus("pending_helper", "helper");
    expect(helper.label).toBe("Anfrage – wartet auf deine Zusage");
    expect(helper.needsAction).toBe(true);
    expect(helper.next).toMatch(/Adresse siehst du nach deiner Zusage/);
  });
  it("abgeschlossener Auftrag: Kunde muss Zahlung freigeben, Helfer wartet", () => {
    const c = describeGigStatus("completed", "customer", { paymentState: "held" });
    expect(c.needsAction).toBe(true);
    expect(c.next).toMatch(/Gib sie jetzt frei/);
    const h = describeGigStatus("completed", "helper", { paymentState: "held" });
    expect(h.needsAction).toBe(false);
    expect(h.next).toMatch(/Warte auf die Freigabe/);
    expect(describeGigStatus("completed", "customer", { paymentState: "paid_out" }).needsAction).toBe(false);
    expect(describeGigStatus("completed", "customer", { paymentState: "disputed" }).needsAction).toBe(false);
  });
  it("Zahlungsstatus-Texte", () => {
    expect(describePayment("paid_out", "helper")?.label).toBe("Bezahlt");
    expect(describePayment("paid_out", "customer")?.label).toBe("Zahlung freigegeben");
    expect(describePayment(null, "customer")).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import {
  bidCoverageReason,
  coverageReason,
  negotiatedChanges,
  type FinalTerms,
  type FirstApproval,
  type StandingApproval,
} from "@/lib/approval-coverage";

const first: FirstApproval = {
  bidCents: 3000,
  serviceType: "laub",
  location: "Schwarzwaldstraße 12, 79102 Freiburg",
  description: "Laub im Garten zusammenrechen",
  when: "Termin wird noch abgestimmt · ca. 60 Minuten",
};
const final: FinalTerms = {
  gigId: "g1",
  customerId: "c1",
  priceCents: 3000,
  serviceType: "laub",
  location: "Schwarzwaldstraße 12, 79102 Freiburg",
  description: "Laub im Garten zusammenrechen",
  when: "Samstag, 14. November 2026 um 10:00 Uhr · ca. 60 Minuten",
};
const standingCustomer = (acknowledgesRisky = false): StandingApproval => ({ scope: "customer", customerId: "c1", gigId: null, acknowledgesRisky });
const standingGig: StandingApproval = { scope: "gig", customerId: null, gigId: "g1", acknowledgesRisky: false };

describe("endgültige Freigabe", () => {
  it("ohne Verhandlung wird die Freigabe aus dem ersten Schritt übernommen (Termin neu festgelegt zählt nicht)", () => {
    expect(negotiatedChanges(first, final)).toEqual([]);
    expect(coverageReason({ standing: null, first, final })).toBe("unchanged_since_first_approval");
  });

  it("nach Verhandlung (anderer Preis, Ort, Beschreibung, Tätigkeit) fragen wir die Eltern erneut", () => {
    expect(coverageReason({ standing: null, first, final: { ...final, priceCents: 2500 } })).toBeNull();
    expect(negotiatedChanges(first, { ...final, location: "Basler Straße 3, 79100 Freiburg" })).toEqual(["location"]);
    expect(negotiatedChanges(first, { ...final, description: "Laub und Hecke" })).toEqual(["description"]);
    expect(negotiatedChanges(first, { ...final, serviceType: "heckenschnitt" })).toEqual(["activity"]);
  });

  it("ein bei der ersten Freigabe schon fester Termin, der sich ändert, zählt als Änderung", () => {
    const withDate = { ...first, when: "Freitag, 13. November 2026 um 15:00 Uhr · ca. 60 Minuten" };
    expect(negotiatedChanges(withDate, final)).toEqual(["date"]);
  });

  it("ohne erste Freigabe (z. B. Direktbuchung) wird gefragt", () => {
    expect(coverageReason({ standing: null, first: null, final })).toBeNull();
  });

  it("Dauerfreigabe für den Auftraggeber oder den Auftrag deckt auch Verhandlungen ab", () => {
    const changed = { ...final, priceCents: 1500, description: "Mehr Arbeit" };
    expect(coverageReason({ standing: standingCustomer(), first, final: changed })).toBe("standing_customer");
    expect(coverageReason({ standing: standingGig, first, final: changed })).toBe("standing_gig");
    expect(coverageReason({ standing: standingCustomer(), first: null, final })).toBe("standing_customer");
  });

  it("Dauerfreigabe gilt nicht für einen anderen Auftraggeber oder Auftrag", () => {
    expect(coverageReason({ standing: standingCustomer(), first: null, final: { ...final, customerId: "c2" } })).toBeNull();
    expect(coverageReason({ standing: standingGig, first: null, final: { ...final, gigId: "g2" } })).toBeNull();
  });

  it("Auftrags-Freigabe verfällt, wenn die Tätigkeit gewechselt wird", () => {
    expect(coverageReason({ standing: standingGig, first, final: { ...final, serviceType: "gartendesign" } })).toBeNull();
  });

  it("Tätigkeiten mit erhöhtem Risiko brauchen die ausdrückliche Bestätigung in der Dauerfreigabe", () => {
    const hedge = { ...final, serviceType: "heckenschnitt" };
    expect(coverageReason({ standing: standingCustomer(false), first: null, final: hedge })).toBeNull();
    expect(coverageReason({ standing: standingCustomer(true), first: null, final: hedge })).toBe("standing_customer");
  });
});

describe("neues Gebot im selben Auftrag", () => {
  const job = { gigId: "g1", customerId: "c1", serviceType: "laub", location: final.location, description: final.description, when: final.when };

  it("ein Gegengebot braucht keine neue Freigabe, wenn der erste Schritt freigegeben war", () => {
    expect(bidCoverageReason({ standing: null, first, job })).toBe("already_approved_for_gig");
  });

  it("ohne erste Freigabe oder bei anderer Tätigkeit wird gefragt", () => {
    expect(bidCoverageReason({ standing: null, first: null, job })).toBeNull();
    expect(bidCoverageReason({ standing: null, first, job: { ...job, serviceType: "heckenschnitt" } })).toBeNull();
  });

  it("Dauerfreigabe gilt schon für das erste Gebot", () => {
    expect(bidCoverageReason({ standing: standingCustomer(), first: null, job })).toBe("standing_customer");
  });
});

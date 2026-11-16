import { describe, expect, it } from "vitest";
import {
  ADDRESS_VISIBLE_STATUSES,
  containsOwnStreet,
  containsStreetAddress,
  isGigDistrict,
  publicLocationLabel,
} from "@/lib/gig-location";
import { checkBookingContent, checkGigContent, checkGigPosting } from "@/lib/gig-quality";

describe("Adresse im Freitext erkennen", () => {
  it.each([
    "Ich wohne in der Schwarzwaldstraße 12",
    "Schwarzwaldstr. 12 bitte klingeln",
    "kommt zur Schwarzwaldstrasse 5a",
    "Am Mühlbach: Hauptstraße 3, 79102 Freiburg",
    "Treffpunkt Kaiser-Joseph-Straße 211",
    "bitte nach 79117 fahren",
    "Eichstetter Weg 7",
    "Rotteckring: Wallstraße 14",
  ])("erkennt: %s", (text) => {
    expect(containsStreetAddress(text)).toBe(true);
  });

  it.each([
    "Der Rasen (ca. 60 m²) soll gemäht werden. Mäher ist vorhanden.",
    "Die Hecke am Gartenweg 20 m lang schneiden",
    "Ich komme gern in Herdern oder Wiehre vorbei",
    "Termin am 12.10.2026 um 10 Uhr, ca. 3 Stunden",
    "Der Umweg 5 Minuten ist kein Problem",
    "Heckenschnitt, 2 Stunden, 40 Euro",
    "Beet an der Straße vor dem Haus jäten",
  ])("erkennt nicht (kein Fehlalarm): %s", (text) => {
    expect(containsStreetAddress(text)).toBe(false);
  });

  it("auch getarnte Schreibweisen (Vollbreite-Ziffern, Zero-Width-Zeichen)", () => {
    expect(containsStreetAddress("Schwarzwald\u200Bstraße １２")).toBe(true);
  });

  it("erkennt den Straßennamen der eigenen Adresse, auch ohne Hausnummer", () => {
    expect(containsOwnStreet("bei uns in der Schwarzwaldstrasse im Garten", "Schwarzwaldstraße 12")).toBe(true);
    expect(containsOwnStreet("Schwarzwald-Str. ist gut erreichbar", "Schwarzwaldstraße 12")).toBe(true);
    expect(containsOwnStreet("Garten im Grünen", "Schwarzwaldstraße 12")).toBe(false);
    expect(containsOwnStreet("irgendwas", "")).toBe(false);
  });
});

describe("öffentliche Ortsangabe", () => {
  it("zeigt nur Stadtteil und Stadt", () => {
    expect(publicLocationLabel("Wiehre")).toBe("Wiehre, Freiburg");
    expect(publicLocationLabel(null)).toBe("Freiburg");
    expect(publicLocationLabel("  ")).toBe("Freiburg");
  });
  it("nur bekannte Stadtteile sind erlaubt", () => {
    expect(isGigDistrict("Wiehre")).toBe(true);
    expect(isGigDistrict("Schwarzwaldstraße 12")).toBe(false);
    expect(isGigDistrict(undefined)).toBe(false);
  });
  it("die Adresse wird nur nach der Annahme sichtbar (zur Datenbank-Regel passend)", () => {
    expect([...ADDRESS_VISIBLE_STATUSES]).toEqual(["assigned", "in_progress"]);
  });
});

describe("Adressschutz in der Auftragsprüfung", () => {
  const base = {
    title: "Rasen mähen und Kanten schneiden",
    description: "Der Rasen (ca. 60 m²) soll gemäht und die Beeteinfassung geschnitten werden. Mäher ist vorhanden.",
    budgetCents: 4000,
    durationMinutes: 120,
  };
  it("Titel/Beschreibung ohne Adresse sind in Ordnung", () => {
    expect(checkGigContent(base).filter((i) => i.field === "description")).toEqual([]);
  });
  it("Beschreibung mit Straße und Hausnummer wird abgelehnt", () => {
    const issues = checkGigContent({ ...base, description: base.description + " Wir wohnen in der Hauptstraße 5." });
    expect(issues.some((i) => i.field === "description" && /Adresse/.test(i.message))).toBe(true);
  });
  it("Beschreibung mit dem Straßennamen der eigenen Adresse wird abgelehnt", () => {
    const res = checkGigPosting({
      ...base,
      description: base.description + " Garten liegt direkt an der Schwarzwaldstraße.",
      address: "Schwarzwaldstraße 12",
      postalCode: "79102",
    });
    expect(res.issues.some((i) => i.field === "description" && /Adresse/.test(i.message))).toBe(true);
  });
  it("Buchungsnotiz mit Adresse wird abgelehnt, mit Stadtteil nicht", () => {
    const when = new Date(Date.now() + 3 * 86400_000).toISOString();
    expect(checkBookingContent({ description: "Bitte Kanten schneiden, Hauptstraße 5", scheduledAt: when })).toHaveLength(1);
    expect(checkBookingContent({ description: "Bitte Kanten schneiden, Garten in der Wiehre", scheduledAt: when })).toHaveLength(0);
  });
});

import { describe, it, expect } from "vitest";
import { checkGigContent, checkGigPosting, duplicateKey, looksLikeGibberish } from "@/lib/gig-quality";

const now = new Date("2026-11-05T10:00:00Z");
const good = {
  title: "Hecke schneiden im Garten",
  description: "Die Hecke (ca. 8 m lang, 1,2 m hoch) soll zurückgeschnitten werden. Akku-Heckenschere ist vorhanden.",
  address: "Schwarzwaldstraße 12",
  postalCode: "79102",
  budgetCents: 4000,
  durationMinutes: 120,
  scheduledAt: "2026-11-20T10:00:00Z",
};

describe("Auftrags-Prüfung", () => {
  it("lässt einen normalen Auftrag durch", () => {
    const r = checkGigPosting(good, now);
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("lehnt zu kurze oder sinnlose Texte ab", () => {
    expect(checkGigContent({ ...good, title: "Hilfe" }, now).some((i) => i.field === "title")).toBe(true);
    expect(checkGigContent({ ...good, title: "asdfghjkl asdfghjkl" }, now).some((i) => i.field === "title")).toBe(true);
    expect(checkGigContent({ ...good, description: "bitte kommen" }, now).some((i) => i.field === "description")).toBe(true);
    expect(looksLikeGibberish("aaaaaaaaaa")).toBe(true);
    expect(looksLikeGibberish("Rasen mähen und Kanten schneiden")).toBe(false);
  });

  it("lehnt Kontaktdaten, Links und Spam-Begriffe ab", () => {
    expect(checkGigContent({ ...good, description: good.description + " Ruf mich an unter 0761 123456789" }, now).length).toBeGreaterThan(0);
    expect(checkGigContent({ ...good, description: good.description + " Mehr auf www.beispiel.de" }, now).length).toBeGreaterThan(0);
    expect(checkGigContent({ ...good, description: good.description + " Schreib mir an max@web.de" }, now).length).toBeGreaterThan(0);
    expect(checkGigContent({ ...good, description: "Verdiene schnell reich mit Bitcoin und Heimarbeit im Garten" }, now).length).toBeGreaterThan(0);
  });

  it("prüft Preis und Termin auf Plausibilität", () => {
    expect(checkGigContent({ ...good, budgetCents: 100 }, now).some((i) => i.field === "budget")).toBe(true);
    expect(checkGigContent({ ...good, budgetCents: 900_000 }, now).some((i) => i.field === "budget")).toBe(true);
    expect(checkGigContent({ ...good, budgetCents: 100_000, durationMinutes: 60 }, now).some((i) => i.field === "budget")).toBe(true);
    expect(checkGigContent({ ...good, scheduledAt: "2026-10-01T10:00:00Z" }, now).some((i) => i.field === "scheduledAt")).toBe(true);
    expect(checkGigContent({ ...good, scheduledAt: "2028-10-01T10:00:00Z" }, now).some((i) => i.field === "scheduledAt")).toBe(true);
  });

  it("lehnt Adressen außerhalb von Freiburg und ohne Hausnummer ab, mit Beispiel", () => {
    const outside = checkGigPosting({ ...good, postalCode: "79211" }, now);
    expect(outside.ok).toBe(false);
    expect(outside.issues.some((i) => i.field === "postalCode")).toBe(true);
    const noNumber = checkGigPosting({ ...good, address: "Schwarzwaldstraße" }, now);
    expect(noNumber.issues.find((i) => i.field === "address")?.example).toBeTruthy();
  });

  it("Duplikat-Schlüssel ignoriert Groß-/Kleinschreibung und Leerzeichen", () => {
    expect(duplicateKey("Hecke  schneiden", "Schwarzwaldstraße 12", "79102")).toBe(duplicateKey("hecke schneiden", "schwarzwaldstraße 12", "79102"));
  });
});

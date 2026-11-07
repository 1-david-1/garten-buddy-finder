import { describe, it, expect } from "vitest";
import {
  addressExample,
  checkFreiburgAddress,
  describeAddressIssues,
  splitAddress,
  suggestStreets,
} from "@/lib/address-rules";
import { isFreiburgCityPostalCode } from "@/lib/freiburg-area";

describe("Freiburger Postleitzahlen", () => {
  it("nur die Stadt, nicht das Umland", () => {
    expect(isFreiburgCityPostalCode("79102")).toBe(true);
    expect(isFreiburgCityPostalCode("79117")).toBe(true);
    expect(isFreiburgCityPostalCode("79249")).toBe(false); // Merzhausen
    expect(isFreiburgCityPostalCode("79211")).toBe(false); // Denzlingen
    expect(isFreiburgCityPostalCode("80331")).toBe(false);
    expect(isFreiburgCityPostalCode(null)).toBe(false);
  });
});

describe("Adressprüfung", () => {
  it("akzeptiert echte Adressformen", () => {
    for (const [addr, plz] of [
      ["Schwarzwaldstraße 12", "79102"],
      ["Habsburgerstraße 5a", "79104"],
      ["Am Mühlbach 3", "79112"],
      ["Kaiser-Joseph-Straße 150", "79098"],
      ["St. Georgener Straße 7-9", "79111"],
      ["Lorettostraße 20, 79100 Freiburg", null],
      ["Basler Straße 8, 79100 Freiburg im Breisgau", null],
      ["Wonnhalde 14, 2. OG", "79100"],
    ] as const) {
      const r = checkFreiburgAddress(addr, plz);
      expect(r.issues, addr).toEqual([]);
      expect(r.ok, addr).toBe(true);
    }
  });

  it("liefert Straße und Hausnummer in einheitlicher Schreibweise", () => {
    const r = checkFreiburgAddress("Schwarzwaldstraße  12 A", "79102");
    expect(r.street).toBe("Schwarzwaldstraße");
    expect(r.houseNumber).toBe("12a");
    expect(r.normalizedAddress).toBe("Schwarzwaldstraße 12a");
  });

  it("lehnt Adressen außerhalb von Freiburg ab", () => {
    expect(checkFreiburgAddress("Hauptstraße 5", "79249").issues.map((i) => i.code)).toContain("plz_not_freiburg");
    expect(checkFreiburgAddress("Hauptstraße 5, 77652 Offenburg").issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(["plz_not_freiburg", "other_city"]),
    );
    expect(checkFreiburgAddress("Hauptstraße 5, Offenburg", "79102").issues.map((i) => i.code)).toContain("other_city");
  });

  it("verlangt Hausnummer und PLZ und nennt ein Beispiel", () => {
    const noNumber = checkFreiburgAddress("Schwarzwaldstraße", "79102");
    expect(noNumber.issues[0].code).toBe("no_number");
    expect(noNumber.issues[0].example).toMatch(/\d/);
    expect(checkFreiburgAddress("Schwarzwaldstraße 12").issues.map((i) => i.code)).toContain("plz_missing");
    expect(describeAddressIssues(noNumber)).toContain("Beispiel");
  });

  it("erkennt Platzhalter, Unsinn, Postfächer und Kontaktdaten", () => {
    expect(checkFreiburgAddress("Musterstraße 1", "79102").ok).toBe(false);
    expect(checkFreiburgAddress("Teststraße 1", "79102").ok).toBe(false);
    expect(checkFreiburgAddress("asdfgh 12", "79102").ok).toBe(false);
    expect(checkFreiburgAddress("xxxxxx 5", "79102").ok).toBe(false);
    expect(checkFreiburgAddress("Postfach 12", "79102").issues[0].code).toBe("pobox");
    expect(checkFreiburgAddress("Packstation 123", "79102").issues[0].code).toBe("pobox");
    expect(checkFreiburgAddress("meine.mail@web.de 5", "79102").issues[0].code).toBe("contact");
    expect(checkFreiburgAddress("", "79102").issues[0].code).toBe("empty");
    expect(checkFreiburgAddress("Schwarzwaldstraße 0", "79102").ok).toBe(false);
  });

  it("PLZ im Adressfeld und PLZ-Feld müssen zusammenpassen", () => {
    expect(checkFreiburgAddress("Schwarzwaldstraße 12, 79104 Freiburg", "79102").issues.map((i) => i.code)).toContain("plz_mismatch");
  });

  it("unbekannte, aber plausible Straßen werden nicht blockiert, nur mit Hinweis", () => {
    const r = checkFreiburgAddress("Wonnhalde 14", "79100");
    expect(r.ok).toBe(true);
    const odd = checkFreiburgAddress("Blumenviertel 3", "79100");
    expect(odd.ok).toBe(true);
    expect(odd.warnings.length).toBe(1);
  });

  it("splitAddress trennt PLZ und Ort ab", () => {
    expect(splitAddress("Schwarzwaldstraße 12, 79102 Freiburg")).toEqual({ street: "Schwarzwaldstraße 12", postalCode: "79102", city: "Freiburg" });
    expect(splitAddress("Schwarzwaldstraße 12")).toEqual({ street: "Schwarzwaldstraße 12", postalCode: null, city: null });
  });
});

describe("Beispiele und Vorschläge", () => {
  it("liefert immer ein Beispiel mit Hausnummer", () => {
    for (let seed = 0; seed < 30; seed++) expect(addressExample(seed)).toMatch(/^.+ \d{1,2}[a-z]?$/);
  });

  it("schlägt Straßen zum Anfang der Eingabe vor", () => {
    expect(suggestStreets("schwarz")).toContain("Schwarzwaldstraße");
    expect(suggestStreets("Habs 12")).toContain("Habsburgerstraße");
    expect(suggestStreets("a")).toEqual([]);
  });
});

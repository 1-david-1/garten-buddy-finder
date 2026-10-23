import { describe, expect, it } from "vitest";
import {
  assertCustomerInFreiburgArea,
  distanceFromFreiburgKm,
  isWithinFreiburgArea,
  normalizePostalCode,
} from "@/lib/freiburg-area";

describe("freiburg-area", () => {
  it("normalizes postal codes to 5 digits", () => {
    expect(normalizePostalCode("79100")).toBe("79100");
    expect(normalizePostalCode(" 79 100 ")).toBe("79100");
    expect(normalizePostalCode("7910")).toBeNull();
    expect(normalizePostalCode(null)).toBeNull();
  });

  it("accepts Freiburg and nearby PLZ within 10 km", () => {
    expect(isWithinFreiburgArea("79100")).toBe(true);
    expect(isWithinFreiburgArea("79249")).toBe(true); // Merzhausen
    expect(isWithinFreiburgArea("79194")).toBe(true); // Gundelfingen
  });

  it("rejects distant PLZ", () => {
    expect(isWithinFreiburgArea("10115")).toBe(false); // Berlin
    expect(isWithinFreiburgArea("80331")).toBe(false); // München
    expect(isWithinFreiburgArea("99999")).toBe(false);
  });

  it("computes a small distance for Freiburg center PLZ", () => {
    const km = distanceFromFreiburgKm("79100");
    expect(km).not.toBeNull();
    expect(km!).toBeLessThan(2);
  });

  it("assertCustomerInFreiburgArea throws outside the area", () => {
    expect(() => assertCustomerInFreiburgArea("10115")).toThrow(/Freiburg/);
    expect(assertCustomerInFreiburgArea("79100")).toBe("79100");
  });
});

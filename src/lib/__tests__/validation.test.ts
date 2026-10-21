import { describe, expect, it } from "vitest";
import {
  centsSchema,
  gigInputSchema,
  negotiationInputSchema,
  parseInput,
  reviewInputSchema,
} from "../validation";

const uuid = "5b0f4d4e-1c2a-4a47-9d3e-0b6f6a1f2c3d";

describe("Eingabevalidierung für Server-Functions", () => {
  it("lehnt negative und zu große Beträge ab", () => {
    expect(centsSchema.safeParse(-5).success).toBe(false);
    expect(centsSchema.safeParse(0).success).toBe(false);
    expect(centsSchema.safeParse(1.5).success).toBe(false);
    expect(centsSchema.safeParse(Number.NaN).success).toBe(false);
    expect(centsSchema.safeParse(999_999_999).success).toBe(false);
    expect(centsSchema.safeParse(4500).success).toBe(true);
  });

  it("verlangt für Gebote eine gültige Auftrags-ID", () => {
    expect(negotiationInputSchema.safeParse({ gigId: "kein-uuid", bidCents: 1000 }).success).toBe(false);
    expect(negotiationInputSchema.safeParse({ gigId: uuid, bidCents: -1 }).success).toBe(false);
    expect(negotiationInputSchema.safeParse({ gigId: uuid, bidCents: 1000, message: "Hallo" }).success).toBe(true);
  });

  it("begrenzt Textlängen bei Aufträgen", () => {
    const base = {
      title: "Rasen mähen",
      description: "Bitte vorderen Rasen mähen.",
      serviceType: "sonstiges",
      budgetCents: 4000,
      address: "Musterstraße 1",
      postalCode: "79098",
      scheduledAt: null,
      durationMinutes: 60,
      allowedAgeGroups: ["helper_adult"],
      safetyConfirmed: true,
    };
    expect(gigInputSchema.safeParse(base).success).toBe(true);
    expect(gigInputSchema.safeParse({ ...base, description: "x".repeat(5001) }).success).toBe(false);
    expect(gigInputSchema.safeParse({ ...base, postalCode: "ab" }).success).toBe(false);
    expect(gigInputSchema.safeParse({ ...base, durationMinutes: 5000 }).success).toBe(false);
    expect(gigInputSchema.safeParse({ ...base, allowedAgeGroups: [] }).success).toBe(false);
  });

  it("erlaubt nur Bewertungen von 1 bis 5", () => {
    expect(reviewInputSchema.safeParse({ gigId: uuid, rating: 0 }).success).toBe(false);
    expect(reviewInputSchema.safeParse({ gigId: uuid, rating: 6 }).success).toBe(false);
    expect(reviewInputSchema.safeParse({ gigId: uuid, rating: 5 }).success).toBe(true);
  });

  it("wirft bei ungültigen Eingaben eine verständliche Meldung", () => {
    expect(() => parseInput(centsSchema, "abc")).toThrow("Ungültige Eingabe");
  });
});

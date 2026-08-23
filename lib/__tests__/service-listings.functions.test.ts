import { describe, expect, it } from "vitest";
import {
  validateListingInput,
  postalCodeProximity,
  type ServiceListingInput,
} from "../service-listings.functions";

const BASE: ServiceListingInput = {
  title: "Rasenmähen",
  description: "",
  serviceType: "rasenmähen",
  listingType: "fixed_price",
  priceCents: 2500,
  startPriceCents: null,
  reservePriceCents: null,
  buyNowPriceCents: null,
  auctionEndTime: null,
  minBidIncrementCents: 50,
  location: "",
  postalCode: "",
  photos: [],
};

describe("validateListingInput", () => {
  it("accepts a valid fixed-price listing", () => {
    expect(validateListingInput(BASE)).toBeNull();
  });

  it("requires a title", () => {
    expect(validateListingInput({ ...BASE, title: "  " })).toMatch(/Titel/);
  });

  it("requires a service type", () => {
    expect(validateListingInput({ ...BASE, serviceType: "" })).toMatch(
      /Leistungsart/,
    );
  });

  it("requires a positive price for fixed_price listings", () => {
    expect(validateListingInput({ ...BASE, priceCents: 0 })).toMatch(/Preis/);
    expect(validateListingInput({ ...BASE, priceCents: null })).toMatch(
      /Preis/,
    );
  });

  it("requires a positive price for negotiable listings", () => {
    expect(
      validateListingInput({
        ...BASE,
        listingType: "negotiable",
        priceCents: null,
      }),
    ).toMatch(/Preis/);
  });

  it("requires a start price for auctions", () => {
    const input: ServiceListingInput = {
      ...BASE,
      listingType: "auction",
      priceCents: null,
      startPriceCents: null,
      auctionEndTime: new Date(Date.now() + 86400000).toISOString(),
    };
    expect(validateListingInput(input)).toMatch(/Startpreis/);
  });

  it("requires an end time in the future for auctions", () => {
    const input: ServiceListingInput = {
      ...BASE,
      listingType: "auction",
      priceCents: null,
      startPriceCents: 1000,
      auctionEndTime: new Date(Date.now() - 1000).toISOString(),
    };
    expect(validateListingInput(input)).toMatch(/Zukunft/);
  });

  it("rejects a reserve price below the start price", () => {
    const input: ServiceListingInput = {
      ...BASE,
      listingType: "auction",
      priceCents: null,
      startPriceCents: 1000,
      reservePriceCents: 500,
      auctionEndTime: new Date(Date.now() + 86400000).toISOString(),
    };
    expect(validateListingInput(input)).toMatch(/Mindestpreis/);
  });

  it("rejects a buy-now price at or below the start price", () => {
    const input: ServiceListingInput = {
      ...BASE,
      listingType: "auction",
      priceCents: null,
      startPriceCents: 1000,
      buyNowPriceCents: 1000,
      auctionEndTime: new Date(Date.now() + 86400000).toISOString(),
    };
    expect(validateListingInput(input)).toMatch(/Sofortkauf/);
  });

  it("accepts a fully valid auction", () => {
    const input: ServiceListingInput = {
      ...BASE,
      listingType: "auction",
      priceCents: null,
      startPriceCents: 1000,
      reservePriceCents: 1500,
      buyNowPriceCents: 5000,
      auctionEndTime: new Date(Date.now() + 86400000).toISOString(),
    };
    expect(validateListingInput(input)).toBeNull();
  });
});

describe("postalCodeProximity", () => {
  it("returns 5 for identical postal codes", () => {
    expect(postalCodeProximity("79098", "79098")).toBe(5);
  });

  it("returns the count of matching leading digits", () => {
    expect(postalCodeProximity("79098", "79111")).toBe(2);
    expect(postalCodeProximity("79098", "79087")).toBe(3);
    expect(postalCodeProximity("79098", "10115")).toBe(0);
  });

  it("returns 0 when either postal code is missing", () => {
    expect(postalCodeProximity(null, "79098")).toBe(0);
    expect(postalCodeProximity("79098", null)).toBe(0);
    expect(postalCodeProximity(null, null)).toBe(0);
  });

  it("stops counting at the first differing digit even if later digits match", () => {
    expect(postalCodeProximity("12345", "19345")).toBe(1);
  });
});

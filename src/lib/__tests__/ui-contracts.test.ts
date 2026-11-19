import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Verträge zwischen Server-Funktionen und den Seiten, die ihre Daten lesen. Auslöser: getHelperGigs lieferte rohe
// Datenbank-Felder (budget_cents), die Seite las budgetCents - Beträge und Termine blieben leer.
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");

describe("Helfer-Aufträge: Server und Seite sprechen dieselbe Sprache", () => {
  const server = read("src/lib/helper-dashboard.functions.ts");
  const fn = server.slice(server.indexOf("export const getHelperGigs"));
  const page = read("src/routes/_authenticated/gigs.tsx");

  it("liefert jedes Feld, das die Seite für einen Auftrag liest", () => {
    const used = [...new Set([...page.matchAll(/\bgig\.([a-zA-Z_]+)/g)].map((m) => m[1]))];
    expect(used.length).toBeGreaterThan(4);
    for (const key of used) expect(fn, `Feld "${key}" fehlt in getHelperGigs`).toMatch(new RegExp(`\\b${key}:`));
  });

  it("die Seite liest keine rohen Datenbank-Felder", () => {
    expect(page).not.toMatch(/\bgig\.(budget_cents|scheduled_at|customer_id|assigned_helper_id)\b/);
  });
});

describe("Deutsche Ortszeit statt Server-Zeit", () => {
  it("Booking-Regeln nutzen keine Rechner-Zeit mehr", () => {
    const slots = read("src/lib/booking-slots.ts");
    expect(slots).not.toMatch(/\.(getHours|getDay|getMinutes|getFullYear|getMonth|getDate)\(\)/);
  });
  it("das Jahr der Verdienst-Statistik richtet sich nach Deutschland (App und Datenbank gleich)", () => {
    expect(read("src/lib/helper-dashboard.functions.ts")).toContain("berlinParts(new Date()).year");
    expect(read("supabase/migrations/20261117000000_complete_gig_release.sql")).toContain("AT TIME ZONE 'Europe/Berlin'");
  });
  it("Datumsfelder nehmen den deutschen Tag, nicht den UTC-Tag", () => {
    expect(read("src/routes/_authenticated/create-gig.tsx")).not.toMatch(/toISOString\(\)\.split\("T"\)/);
  });
});

describe("Auszahlung läuft über die atomare Datenbank-Funktion", () => {
  it("completeGig ruft complete_gig_and_release auf und schreibt nicht mehr selbst in earnings_tracker", () => {
    const gigs = read("src/lib/gigs.functions.ts");
    const fn = gigs.slice(gigs.indexOf("export const completeGig"), gigs.indexOf("const CANCELLABLE_STATUSES"));
    expect(fn).toContain('rpc("complete_gig_and_release"');
    expect(fn).not.toContain("earnings_tracker");
    expect(fn).not.toContain('"escrow_transactions"');
  });
});

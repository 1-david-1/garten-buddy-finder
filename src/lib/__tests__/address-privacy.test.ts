import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { describe, expect, it } from "vitest";

// Wächter für den Adressschutz (Migration 20261115000000_gig_location_privacy.sql):
// Die genaue Adresse liegt nur in gig_locations. Diese Tests verhindern, dass sie später versehentlich wieder
// an Helfer ausgeliefert wird (select("*") auf gigs, address-Spalte in gigs-Abfragen, Realtime ...).

const root = process.cwd();
const migration = readFileSync(resolve(root, "supabase/migrations/20261115000000_gig_location_privacy.sql"), "utf-8");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
const sources = walk(resolve(root, "src")).filter((f) => !f.endsWith("integrations/supabase/types.ts"));

describe("Adressschutz: Datenbank", () => {
  it("Adresse liegt in gig_locations mit RLS, nur SELECT für angemeldete Nutzer", () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS public\.gig_locations/);
    expect(migration).toMatch(/ALTER TABLE public\.gig_locations ENABLE ROW LEVEL SECURITY/);
    expect(migration).toMatch(/GRANT SELECT ON public\.gig_locations TO authenticated/);
    expect(migration).not.toMatch(/GRANT (ALL|INSERT|UPDATE|DELETE)[^;]*ON public\.gig_locations TO authenticated/);
    expect(migration).not.toMatch(/GRANT[^;]*gig_locations TO anon/);
    expect(migration).not.toMatch(/CREATE POLICY[^;]*gig_locations[^;]*FOR (INSERT|UPDATE|DELETE|ALL)/);
  });

  it("Sichtbarkeit: Auftraggeber, zugewiesener Helfer erst nach Annahme, Admin", () => {
    const fn = migration.slice(migration.indexOf("FUNCTION public.can_view_gig_location"), migration.indexOf("DROP POLICY IF EXISTS \"Gig location"));
    expect(fn).toContain("has_role(auth.uid(), 'admin')");
    expect(fn).toContain("g.customer_id = auth.uid()");
    expect(fn).toContain("g.assigned_helper_id = auth.uid() AND g.status IN ('assigned', 'in_progress')");
    expect(fn).not.toMatch(/'open'|'pending_helper'|'negotiating'/);
  });

  it("in gigs bleibt nie eine Adresse: Umleit-Trigger läuft zuletzt, CHECK als Sicherung", () => {
    expect(migration).toContain("CREATE TRIGGER trg_zz_gig_location_divert");
    expect(migration).toMatch(/CHECK \(address IS NULL AND postal_code IS NULL\)/);
    // Trigger-Namen auf gigs, die die Adresse noch brauchen, müssen alphabetisch VOR trg_zz stehen
    for (const name of ["trg_enforce_gig_posting_rules", "trg_invalidate_youth_approval_on_change"]) {
      expect(name < "trg_zz_gig_location_divert").toBe(true);
    }
  });

  it("gig_locations ist nicht in der Realtime-Veröffentlichung", () => {
    const dir = resolve(root, "supabase/migrations");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql"))) {
      const sql = readFileSync(resolve(dir, f), "utf-8").replace(/--[^\n]*/g, "");
      expect(sql).not.toMatch(/supabase_realtime[^;]*gig_locations/i);
    }
  });
});

describe("Adressschutz: Code", () => {
  it("kein select(\"*\") direkt auf gigs", () => {
    const offenders: string[] = [];
    for (const f of sources) {
      const code = readFileSync(f, "utf-8");
      const re = /\.from\(["']gigs["']\)\s*\.select\(\s*["'`]\*/g;
      if (re.test(code)) offenders.push(f.replace(root + "/", ""));
    }
    expect(offenders).toEqual([]);
  });

  it("keine gigs-Abfrage im Code wählt address oder postal_code aus", () => {
    const offenders: string[] = [];
    for (const f of sources) {
      const code = readFileSync(f, "utf-8");
      const re = /\.from\(["']gigs["']\)\s*\.select\(\s*(["'`])([\s\S]*?)\1/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(code))) {
        if (/\b(address|postal_code)\b/.test(m[2])) offenders.push(f.replace(root + "/", ""));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("öffentliche Spaltenliste enthält weder Adresse noch PLZ", async () => {
    const { GIG_PUBLIC_COLUMNS } = await import("@/lib/gig-location");
    expect(GIG_PUBLIC_COLUMNS).not.toMatch(/address|postal_code/);
    expect(GIG_PUBLIC_COLUMNS).toContain("district");
  });

  it("Marktplatz liefert dem Helfer keine PLZ des Auftraggebers", () => {
    const code = readFileSync(resolve(root, "src/lib/gigs.functions.ts"), "utf-8");
    expect(code).not.toMatch(/postal_code:\s*profile\.postalCode/);
  });
});

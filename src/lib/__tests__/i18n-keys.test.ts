import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { dicts } from "../i18n";

/**
 * Verhindert, dass auf der Website rohe Textschlüssel (z. B. "lp.ways.title") statt Texten erscheinen:
 * Jeder im Code benutzte Schlüssel muss in Deutsch UND Englisch vorhanden sein.
 */

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

// Schlüssel, die der Code aus Schleifen zusammensetzt (z. B. t(`lp.faq.${n}.q`))
const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const combos = (prefix: string, mids: (string | number)[], sufs: string[]) =>
  mids.flatMap((m) => sufs.map((s) => `${prefix}${m}${s}`));

const DYNAMIC = [
  ...combos("lp.hero.chip.", range(3), [""]),
  ...combos("lp.paths.customer.", range(3), ["", ".body"]),
  ...combos("lp.paths.helper.", range(3), ["", ".body"]),
  ...combos("lp.check.", range(3), [".title", ".body"]),
  ...combos("lp.ways.badge.", ["fixed", "auction", "negotiable"], [""]),
  ...combos("lp.status.", ["live", "soon"], [""]),
  ...combos("lp.free.", ["cost", "pay"], [".title", ".body"]),
  ...combos("lp.levels.", ["youth", "adult", "pro"], [".title", ".body", ".check"]),
  ...combos("lp.safety.", range(6), [".title", ".body"]),
  ...combos("lp.trust.", ["verify", "youth", "chat", "reviews", "calendar", "escrow", "invoice"], [".title", ".body"]),
  ...combos("lp.faq.", range(11), [".q", ".a"]),
  ...combos("onboarding.role.", ["customer", "helper_youth", "helper_adult", "helper_pro"], ["", ".desc"]),
  // alle Auftrags-Status (gig_status)
  ...combos("status.", ["draft", "open", "negotiating", "assigned", "in_progress", "completed", "cancelled", "pending_helper"], [""]),
];

function staticKeys(): string[] {
  const keys = new Set<string>();
  for (const f of walk(resolve(process.cwd(), "src"))) {
    if (!/\.tsx?$/.test(f) || f.endsWith("i18n.tsx") || f.includes("__tests__")) continue;
    const src = readFileSync(f, "utf-8");
    for (const m of src.matchAll(/\bt\(\s*["']([\w.\-]+)["']/g)) keys.add(m[1]);
  }
  return [...keys];
}

describe("Texte (i18n)", () => {
  it("Deutsch und Englisch haben dieselben Schlüssel", () => {
    const de = Object.keys(dicts.de).sort();
    const en = Object.keys(dicts.en).sort();
    expect(de.filter((k) => !(k in dicts.en))).toEqual([]);
    expect(en.filter((k) => !(k in dicts.de))).toEqual([]);
  });

  it("jeder im Code benutzte Schlüssel hat einen deutschen und englischen Text", () => {
    const wanted = [...new Set([...staticKeys(), ...DYNAMIC])];
    expect(wanted.length).toBeGreaterThan(200);
    expect(wanted.filter((k) => !dicts.de[k])).toEqual([]);
    expect(wanted.filter((k) => !dicts.en[k])).toEqual([]);
  });

  it("Zwei-Wege- und Kostenlos-Bereich der Startseite sind vollständig", () => {
    for (const k of ["lp.ways.title", "lp.ways.sub", "lp.ways.post.title", "lp.ways.post.body", "lp.ways.book.title", "lp.ways.book.body", "lp.free.cost.title", "lp.free.cost.body", "lp.free.pay.title", "lp.free.pay.body"]) {
      expect(dicts.de[k], k).toBeTruthy();
      expect(dicts.en[k], k).toBeTruthy();
    }
  });
});

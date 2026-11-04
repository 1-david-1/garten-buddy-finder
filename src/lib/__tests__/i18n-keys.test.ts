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
  ...combos("lp.paths.", ["customer", "helper"], [".title", ".cta"]),
  ...combos("lp.paths.customer.", range(3), ["", ".body"]),
  ...combos("lp.paths.helper.", range(3), ["", ".body"]),
  ...combos("lp.market.", ["fixed", "auction", "negotiable"], [".label", ".title", ".how", ".price", ".note"]),
  ...combos("lp.market.more.", ["photos", "favorites", "chat", "date", "reviews"], [".title", ".body"]),
  ...combos("lp.levels.", ["youth", "adult", "pro"], [".title", ".body", ".check"]),
  ...combos("lp.check.", range(3), [".title", ".body"]),
  ...combos("lp.safety.", range(6), [".title", ".body"]),
  ...combos("lp.next.", ["escrow", "invoice"], [".title", ".body"]),
  ...combos("lp.faq.", range(12), [".q", ".a"]),
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

  it("Marktplatz- und Geld-Bereich der Startseite sind vollständig", () => {
    for (const k of ["lp.market.title", "lp.market.sub", "lp.market.example", "lp.market.post.title", "lp.market.post.body", "lp.market.more.title", "lp.free.title", "lp.free.sub", "lp.free.sticker", "lp.free.next", "lp.levels.title", "lp.paths.title.mark", "lp.safety.title.mark", "lp.safety.note"]) {
      expect(dicts.de[k], k).toBeTruthy();
      expect(dicts.en[k], k).toBeTruthy();
    }
  });

  it("hervorgehobene Wörter kommen im jeweiligen Titel vor (sonst fehlt die Unterstreichung)", () => {
    for (const lang of ["de", "en"] as const) {
      expect(dicts[lang]["lp.paths.title"]).toContain(dicts[lang]["lp.paths.title.mark"]);
      expect(dicts[lang]["lp.safety.title"]).toContain(dicts[lang]["lp.safety.title.mark"]);
    }
  });
});

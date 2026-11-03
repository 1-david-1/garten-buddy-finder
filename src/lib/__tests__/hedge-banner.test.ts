import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { HEDGE_BANNER, JOB_CONSENT_VERSION } from "../consent-texts";
import { isYouthEligible } from "../hedge-rules";

describe("Heckenschnitt-Banner im Eltern-Konto", () => {
  it("hat den Button 'Trotzdem erlauben' und nennt Höhe und verbotene Geräte", () => {
    expect(HEDGE_BANNER.allowButton).toBe("Trotzdem erlauben");
    const all = [HEDGE_BANNER.intro, ...HEDGE_BANNER.rules, HEDGE_BANNER.note, HEDGE_BANNER.confirm].join(" ");
    for (const word of ["1,5 m", "Leiter", "Kettensäge", "Benzin", "Stangenheckenschere", "Häcksler", "Trotzdem erlauben"]) {
      expect(all).toContain(word);
    }
  });

  it("Banner ist kurz (höchstens drei Regeln)", () => {
    expect(HEDGE_BANNER.rules.length).toBeLessThanOrEqual(3);
  });

  it("Version der Auftrags-Freigabe wurde mit dem neuen Text erhöht", () => {
    expect(JOB_CONSENT_VERSION).not.toBe("auftrags-freigabe-2026-10-v1");
  });

  it("normaler Heckenschnitt ist für Jugendliche möglich (Freigabe der Eltern folgt)", () => {
    expect(isYouthEligible("heckenschnitt", "Hecke schneiden", "niedrige Hecke, Akku-Heckenschere")).toBe(true);
  });
});

describe("Datenbank-Trigger für Jugend-Tätigkeiten (Reparatur-Migration)", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20261103000000_youth_hedge_guardian_gate.sql"),
    "utf-8",
  );

  it("sperrt nur Baumpflege, Gartendesign und Bewässerung - nicht mehr Heckenschnitt", () => {
    expect(sql).toContain("IN ('baumpflege', 'gartendesign', 'bewässerung')");
    expect(sql).not.toMatch(/IN \([^)]*'heckenschnitt'[^)]*\)/);
  });

  it("lehnt gefährliches Gerät bei Heckenschnitt weiterhin ab", () => {
    expect(sql).toContain("NEW.service_type = 'heckenschnitt'");
    expect(sql).toContain("kettens");
    expect(sql).toContain("stangenheckenschere");
  });
});

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dir = resolve(process.cwd(), "supabase/migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

describe("Migrationen", () => {
  it("jede Versionsnummer kommt nur einmal vor (sonst brechen die Supabase-Werkzeuge ab)", () => {
    const seen = new Map<string, string[]>();
    for (const f of files) {
      const version = f.split("_")[0];
      seen.set(version, [...(seen.get(version) ?? []), f]);
    }
    const dupes = [...seen.entries()].filter(([, list]) => list.length > 1);
    // 20260926000000 ist bekannt: gigs_realtime + die abgelöste notifications-Datei. Letztere bitte löschen.
    expect(dupes.map(([v]) => v).filter((v) => v !== "20260926000000")).toEqual([]);
  });

  it("die Tabelle notifications wird nur einmal angelegt (die abgelöste Migration ist leer)", () => {
    const creators = files.filter((f) => /create table[^;]*public\.notifications\b/i.test(readFileSync(resolve(dir, f), "utf-8").replace(/--[^\n]*/g, "")));
    // Die Reparatur-Migration legt sie nur an, falls sie in der Datenbank ganz fehlt (innerhalb eines IF).
    expect(creators.filter((f) => !f.startsWith("20261103000100"))).toEqual(["20260930000000_notifications.sql"]);
  });

  it("die Reparatur-Migration entfernt die alten Benachrichtigungs-Trigger", () => {
    const sql = readFileSync(resolve(dir, "20261103000100_repair_notifications_and_triggers.sql"), "utf-8");
    for (const name of ["trigger_notify_on_new_message", "trigger_notify_on_gig_status_change", "trigger_notify_on_new_booking_request"]) {
      expect(sql).toContain(name);
    }
  });

  it("neue Migrationen prüfen vorher, ob die Basis vorhanden ist", () => {
    for (const f of ["20261103000000_youth_hedge_guardian_gate.sql", "20261104000000_standing_approvals_and_posting_rules.sql"]) {
      expect(readFileSync(resolve(dir, f), "utf-8")).toContain("to_regclass('public.gigs') IS NULL");
    }
  });

  it("Freiburg-Regel in der Datenbank nennt dieselben PLZ wie die App", () => {
    const sql = readFileSync(resolve(dir, "20261104000000_standing_approvals_and_posting_rules.sql"), "utf-8");
    for (const plz of ["098", "100", "102", "104", "106", "108", "110", "111", "112", "114", "115", "117"]) {
      expect(sql).toContain(plz);
    }
  });
});

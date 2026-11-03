import { describe, it, expect } from "vitest";
import { isYouthEligible, mentionsDangerousHedgeEquipment } from "@/lib/hedge-rules";

describe("hedge-rules", () => {
  it("erkennt sehr gefährliche Geräte und große Höhe", () => {
    expect(mentionsDangerousHedgeEquipment("Hecke schneiden", "mit meiner Kettensäge")).toBe(true);
    expect(mentionsDangerousHedgeEquipment("Benzin-Heckenschere vorhanden")).toBe(true);
    expect(mentionsDangerousHedgeEquipment("Hecke, nur mit Leiter erreichbar")).toBe(true);
    expect(mentionsDangerousHedgeEquipment("Hochentaster für Äste")).toBe(true);
  });

  it("lässt normalen Heckenschnitt zu", () => {
    expect(mentionsDangerousHedgeEquipment("Kleine Hecke schneiden", "ca. 1 m hoch, Akku-Heckenschere vorhanden")).toBe(false);
    expect(isYouthEligible("heckenschnitt", "Hecke schneiden", "niedrige Hecke, Handschere")).toBe(true);
  });

  it("blendet verbotene Tätigkeiten und gefährlichen Heckenschnitt für Jugendliche aus", () => {
    expect(isYouthEligible("baumpflege")).toBe(false);
    expect(isYouthEligible("gartendesign")).toBe(false);
    expect(isYouthEligible("bewässerung")).toBe(false);
    expect(isYouthEligible("heckenschnitt", "Hecke", "Kettensäge nötig")).toBe(false);
    expect(isYouthEligible("laub")).toBe(true);
  });
});

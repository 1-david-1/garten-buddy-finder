import { describe, it, expect } from "vitest";
import {
  isYouthEligible,
  mentionsDangerousEquipment,
  mentionsDangerousHedgeEquipment,
  requiresParentAcknowledgement,
} from "@/lib/hedge-rules";

describe("hedge-rules", () => {
  it("erkennt sehr gefährliche Geräte und große Höhe", () => {
    expect(mentionsDangerousEquipment("Hecke schneiden", "mit meiner Kettensäge")).toBe(true);
    expect(mentionsDangerousEquipment("Benzin-Heckenschere vorhanden")).toBe(true);
    expect(mentionsDangerousEquipment("Hecke, nur mit Leiter erreichbar")).toBe(true);
    expect(mentionsDangerousEquipment("Hochentaster für Äste")).toBe(true);
    expect(mentionsDangerousEquipment("Beet anlegen, Minibagger vorhanden")).toBe(true);
    expect(mentionsDangerousHedgeEquipment("Kettensäge")).toBe(true);
  });

  it("lässt normale Arbeiten zu", () => {
    expect(mentionsDangerousEquipment("Kleine Hecke schneiden", "ca. 1 m hoch, Akku-Heckenschere vorhanden")).toBe(false);
    expect(isYouthEligible("heckenschnitt", "Hecke schneiden", "niedrige Hecke, Handschere")).toBe(true);
    expect(isYouthEligible("laub")).toBe(true);
  });

  it("Tätigkeiten mit erhöhtem Risiko sind mit Bestätigung der Eltern möglich", () => {
    for (const t of ["heckenschnitt", "gartendesign", "bewässerung"]) {
      expect(requiresParentAcknowledgement(t)).toBe(true);
      expect(isYouthEligible(t, "Beet und Schlauch", "von Hand")).toBe(true);
    }
    expect(requiresParentAcknowledgement("laub")).toBe(false);
    expect(requiresParentAcknowledgement(null)).toBe(false);
  });

  it("Baumpflege und gefährliche Geräte bleiben auch mit Zustimmung der Eltern gesperrt", () => {
    expect(isYouthEligible("baumpflege")).toBe(false);
    expect(isYouthEligible("heckenschnitt", "Hecke", "Kettensäge nötig")).toBe(false);
    expect(isYouthEligible("gartendesign", "Umgestaltung", "mit Bagger")).toBe(false);
    expect(isYouthEligible("bewässerung", "Anlage", "Graben mit Rüttelplatte")).toBe(false);
  });
});

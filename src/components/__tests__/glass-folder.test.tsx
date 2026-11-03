import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import GlassFolder, { GLASS_FOLDER_DE, fanSlot, hashString, hexToRgb, rng } from "../ui/glass-folder";

describe("GlassFolder (Server-Rendering)", () => {
  it("zeigt Beschriftung, deutsche Texte und die Dateien des Elternteils (controlledFiles)", () => {
    const html = renderToString(
      <GlassFolder
        label="Ausweis"
        meta="Foto bereit"
        strings={GLASS_FOLDER_DE}
        controlledFiles={[{ name: "Ausweis (geschwärzt)", meta: "1,2 MB", image: "blob:test" }]}
        onAddRequest={() => undefined}
        appear={false}
      />,
    );
    expect(html).toContain("Ausweis");
    expect(html).toContain("Foto bereit");
    expect(html).toContain("Ausweis (geschwärzt)");
    expect(html).toContain("Ausweis öffnen, 1 Datei");
    expect(html).toContain("Foto zu Ausweis hinzufügen");
  });

  it("rendert einen leeren Ordner ohne Dateien", () => {
    const html = renderToString(<GlassFolder label="Unterlagen" controlledFiles={[]} strings={GLASS_FOLDER_DE} />);
    expect(html).toContain("Unterlagen öffnen, 0 Dateien");
  });
});

describe("Hilfsfunktionen", () => {
  it("fanSlot, hexToRgb, hashString und rng sind stabil", () => {
    expect(fanSlot(0, 1)).toBe(0);
    expect(fanSlot(0, 3)).toBe(-1);
    expect(fanSlot(2, 3)).toBe(1);
    expect(hexToRgb("#04301e")).toEqual([4, 48, 30]);
    expect(hexToRgb("zzz")).toEqual([128, 128, 128]);
    expect(hashString("a")).toBe(hashString("a"));
    const a = rng(5);
    const b = rng(5);
    expect(a()).toBe(b());
  });
});

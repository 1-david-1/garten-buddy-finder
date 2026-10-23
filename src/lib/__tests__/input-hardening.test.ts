import { describe, expect, it } from "vitest";
import { businessNameSchema, checkName, coerceDisplayName, displayNameSchema, escapeHtml } from "../sanitize";
import { sniffImageType } from "../image-upload";

describe("Benutzername (Positivliste)", () => {
  it("akzeptiert normale Namen inkl. Umlaute, Bindestrich und Apostroph", () => {
    for (const ok of ["Max Mustermann", "Anna-Lena Müller", "Jörg Ößwein", "O'Brien", "Dr. Müller", "Max2008", "Ömer Çelik"]) {
      expect(checkName(ok).ok, ok).toBe(true);
    }
  });

  it("lehnt eingeschleusten Code ab", () => {
    const attacks = [
      "<script>alert(1)</script>",
      '"><img src=x onerror=alert(1)>',
      "javascript:alert(1)",
      "Max<b>fett</b>",
      "{{constructor.constructor('alert(1)')()}}",
      "`${process.env.SECRET}`",
      "a;DROP TABLE profiles;--",
      "Max&#x3C;script",
      "name\u202Egnp.exe", // Bidi-Umschaltung
    ];
    for (const a of attacks) expect(checkName(a).ok, a).toBe(false);
  });

  it("lehnt Web- und E-Mail-Adressen als Namen ab", () => {
    for (const a of ["www.evil.com", "evil.de", "max@evil.com", "https://evil.com", "Max evil.com"]) {
      expect(checkName(a).ok, a).toBe(false);
    }
  });

  it("verlangt Mindestlänge, Buchstaben und Höchstlänge", () => {
    expect(checkName("A").ok).toBe(false);
    expect(checkName("1234").ok).toBe(false);
    expect(checkName("a".repeat(61)).ok).toBe(false);
  });

  it("entfernt unsichtbare Zeichen und doppelte Leerzeichen", () => {
    const r = checkName("  Max\u200B   Mustermann ");
    expect(r).toEqual({ ok: true, value: "Max Mustermann" });
  });

  it("zod-Schema liefert bereinigten Wert oder Fehler", () => {
    expect(displayNameSchema.parse(" Max  Muster ")).toBe("Max Muster");
    expect(() => displayNameSchema.parse("<b>x</b>")).toThrow();
  });

  it("Firmenname erlaubt & und Klammern, aber kein HTML; leer ist erlaubt", () => {
    expect(businessNameSchema.parse("Gärtnerei Müller & Söhne (Freiburg)")).toBe("Gärtnerei Müller & Söhne (Freiburg)");
    expect(businessNameSchema.parse("")).toBe("");
    expect(() => businessNameSchema.parse("Firma <script>")).toThrow();
  });

  it("coerceDisplayName bereinigt fremde Namen statt sie abzulehnen", () => {
    expect(coerceDisplayName("<script>alert(1)</script>Max")).toBe("scriptalert1scriptMax");
    expect(coerceDisplayName("<<>>")).toBe("Nutzer");
    expect(coerceDisplayName(null)).toBe("Nutzer");
    expect(checkName(coerceDisplayName("evil.com/<x>")).ok).toBe(true);
  });
});

describe("escapeHtml", () => {
  it("maskiert alle HTML-Sonderzeichen", () => {
    expect(escapeHtml(`<img src="x" onerror='a'>&\``)).toBe(
      "&lt;img src=&quot;x&quot; onerror=&#39;a&#39;&gt;&amp;&#96;",
    );
  });
  it("behandelt null/undefined", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });
});

describe("Bild-Erkennung per Magic Bytes", () => {
  const bytes = (...b: number[]) => new Uint8Array(b);
  it("erkennt JPEG, PNG und WebP", () => {
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0))).toBe("image/jpeg");
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe("image/png");
    expect(
      sniffImageType(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50)),
    ).toBe("image/webp");
  });
  it("lehnt PDF, SVG, HTML, EXE und GIF ab", () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    expect(sniffImageType(enc("%PDF-1.7\n"))).toBeNull();
    expect(sniffImageType(enc("<svg xmlns='http://www.w3.org/2000/svg'>"))).toBeNull();
    expect(sniffImageType(enc("<html><script>"))).toBeNull();
    expect(sniffImageType(bytes(0x4d, 0x5a, 0x90, 0x00))).toBeNull(); // Windows-EXE "MZ"
    expect(sniffImageType(enc("GIF89a"))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });
});

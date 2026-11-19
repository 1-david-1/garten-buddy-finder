import { describe, expect, it } from "vitest";
import { isUsableServiceKey } from "../service-key";

describe("isUsableServiceKey", () => {
  it("lehnt leere Werte ab", () => {
    expect(isUsableServiceKey(undefined)).toBe(false);
    expect(isUsableServiceKey(null)).toBe(false);
    expect(isUsableServiceKey("")).toBe(false);
    expect(isUsableServiceKey("   ")).toBe(false);
  });

  it("lehnt bekannte Platzhalter ab", () => {
    expect(isUsableServiceKey("placeholder-service-key")).toBe(false);
    expect(isUsableServiceKey("sb_secret_your_secret_here")).toBe(false);
    expect(isUsableServiceKey("sb_secret_xxxxxxxxxxxxxxxxxxxx")).toBe(false);
    expect(isUsableServiceKey("<service-role-key-einfuegen>")).toBe(false);
  });

  it("lehnt zu kurze Werte ab", () => {
    expect(isUsableServiceKey("sb_secret_abc")).toBe(false);
  });

  it("akzeptiert Schlüssel im neuen und im alten Format", () => {
    expect(isUsableServiceKey("sb_secret_Ab3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY")).toBe(true);
    expect(isUsableServiceKey("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJl")).toBe(true);
  });

  it("lehnt einen echten Schlüssel nicht wegen zufälliger Zeichenfolgen ab", () => {
    expect(isUsableServiceKey("sb_secret_xxAb3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1")).toBe(true);
  });
});

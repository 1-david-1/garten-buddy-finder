import { describe, expect, it } from "vitest";
import { containsPrivateContact } from "../contact-detection";

describe("Kontaktdaten-Erkennung (Versuch, Kontaktdaten außerhalb der Plattform auszutauschen)", () => {
  it.each([
    "Ruf mich an: 0176 12345678",
    "Meine Nummer ist +49 151 2345 6789",
    "Schreib mir 030/1234567",
    "mail mir an max.mustermann@example.de",
    "max (at) example (dot) de",
    "Schau auf https://example.com/mein-profil",
    "www.example.de",
    "Lass uns auf WhatsApp schreiben",
    "Hast du Insta oder Snapchat?",
    "01761234567",
  ])("erkennt: %s", (text) => {
    expect(containsPrivateContact(text)).toBe(true);
  });

  it.each([
    "Ich komme am 12.10.2026 um 14:00 Uhr.",
    "Der Garten ist ca. 120 m² groß, Budget 45 €.",
    "Bis Samstag, 10 bis 12 Uhr, passt das?",
    "Danke, bis dann!",
    "Hausnummer 12, 2. Stock",
  ])("erkennt NICHT: %s", (text) => {
    expect(containsPrivateContact(text)).toBe(false);
  });
});

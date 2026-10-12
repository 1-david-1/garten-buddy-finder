import { describe, expect, it } from "vitest";
import {
  CUSTOMER_RULES_VERSION,
  GIG_SAFETY_TEXT,
  GIG_SAFETY_VERSION,
  GUARDIAN_CONSENT_VERSION,
  ID_REDACTION_CONFIRMATION,
  JOB_CONSENT_VERSION,
  NO_PARENT_EMAIL_OPTION,
} from "../consent-texts";

describe("Einwilligungstexte", () => {
  it("jede Einwilligung hat eine Version (wird mit jeder Zustimmung gespeichert)", () => {
    for (const v of [GUARDIAN_CONSENT_VERSION, JOB_CONSENT_VERSION, GIG_SAFETY_VERSION, CUSTOMER_RULES_VERSION]) {
      expect(v.length).toBeGreaterThan(5);
    }
  });

  it("Bestätigung des Auftraggebers nennt die verbotenen Tätigkeiten", () => {
    for (const word of ["gefährlichen Maschinen", "Chemikalien", "Pflanzenschutzmittel", "großer Höhe", "schweren Lasten"]) {
      expect(GIG_SAFETY_TEXT).toContain(word);
    }
  });

  it("Schwärzungs-Bestätigung und Alternativ-Option haben den vorgegebenen Wortlaut", () => {
    expect(ID_REDACTION_CONFIRMATION).toBe(
      "Ich bestätige, dass ich nicht benötigte Angaben dauerhaft geschwärzt habe und dass nur die für die Identitäts- und Altersprüfung erforderlichen Angaben sichtbar sind.",
    );
    expect(NO_PARENT_EMAIL_OPTION).toBe(
      "Ich kann oder möchte die E-Mail-Adresse meiner gesetzlichen Vertretung nicht eingeben.",
    );
  });
});

/**
 * Texte und Versionen der Einwilligungen/Bestätigungen.
 * Die Version wird bei jeder Zustimmung mitgespeichert. Wird ein Text geändert, MUSS die
 * Versionsnummer erhöht werden, damit nachvollziehbar bleibt, wem welcher Text gezeigt wurde.
 * Alle Texte müssen vor dem öffentlichen Start anwaltlich geprüft werden.
 */

/** Einwilligung der Eltern zur Nutzung der Plattform durch das Kind */
export const GUARDIAN_CONSENT_VERSION = "eltern-einwilligung-2026-10-v1";
export const GUARDIAN_CONSENT_TEXT =
  "Ich bin gesetzliche Vertretung der minderjährigen Person und willige in die Nutzung von GreenMatch für leichte, geeignete und ungefährliche Gartenarbeiten ein. Ich weiß, dass ich jeden einzelnen Auftrag gesondert freigeben muss und dass eine allgemeine Zustimmung für künftige Aufträge nicht ausreicht. Ich kann die Einwilligung und einzelne Freigaben jederzeit widerrufen, soweit der Auftrag noch nicht begonnen hat.";

/** Zustimmung zu einem einzelnen Auftrag (Eltern) */
export const JOB_CONSENT_VERSION = "auftrags-freigabe-2026-10-v1";

/** Bestätigung des Auftraggebers vor JEDER Veröffentlichung eines Auftrags */
export const GIG_SAFETY_VERSION = "auftrag-geeignet-2026-10-v1";
export const GIG_SAFETY_TEXT =
  "Ich bestätige, dass die angebotene Tätigkeit für die angegebene Altersgruppe geeignet, leicht und ungefährlich ist. Ich werde keine gefährlichen Maschinen, Chemikalien, Pflanzenschutzmittel, Arbeiten in großer Höhe, schweren Lasten oder sonstigen verbotenen Tätigkeiten verlangen.";

/** Auftraggeber: Kinderschutzregeln und verbotene Tätigkeiten (einmalig, je Version) */
export const CUSTOMER_RULES_VERSION = "auftraggeber-regeln-2026-10-v1";
export const CUSTOMER_RULES_TEXT =
  "Ich habe die Kinderschutzregeln gelesen und akzeptiere sie, auch die Liste der verbotenen Tätigkeiten: gefährliche Maschinen, Chemikalien, Pflanzenschutzmittel, schwere Lasten, große Höhe, Baustellen, Gewässer und sonstige erhebliche Risiken. Minderjährige dürfen nur ab dem vollendeten 13. Lebensjahr, höchstens zwei Stunden täglich, nur zwischen 08:00 und 18:00 Uhr und nicht während des Schulunterrichts beschäftigt werden.";

/** Helfer: Sicherheitsinformationen */
export const HELPER_SAFETY_VERSION = "helfer-sicherheit-2026-10-v1";
export const HELPER_SAFETY_POINTS = [
  "Bei akuter Gefahr rufst du sofort den Notruf 112.",
  "Du kannst jeden Auftrag jederzeit sofort abbrechen, wenn du dich unsicher fühlst. Das hat keine negativen Folgen für deine Bewertung.",
  "Tausche keine privaten Kontaktdaten (Telefonnummer, E-Mail, Messenger) aus – schreibe nur über die Plattform.",
  "Melde unangemessene Nachrichten, Druck, gefährliche oder verbotene Tätigkeiten sofort über die Plattform.",
  "Du darfst nicht mit gefährlichen Maschinen, Chemikalien, Pflanzenschutzmitteln, schweren Lasten oder in großer Höhe arbeiten.",
  "Sprich bei Unsicherheit mit deinen Eltern. Sie sehen alle Auftragsdaten in ihrem Eltern-Konto.",
] as const;

/** Bestätigung vor dem Ausweis-Upload */
export const ID_REDACTION_CONFIRMATION =
  "Ich bestätige, dass ich nicht benötigte Angaben dauerhaft geschwärzt habe und dass nur die für die Identitäts- und Altersprüfung erforderlichen Angaben sichtbar sind.";

/** Auswahltext, wenn die E-Mail der Eltern nicht eingegeben wird */
export const NO_PARENT_EMAIL_OPTION =
  "Ich kann oder möchte die E-Mail-Adresse meiner gesetzlichen Vertretung nicht eingeben.";

/** Erkennbare Risiken je Tätigkeit - für die Eltern-Mail und die Freigabeseite */
export const ACTIVITY_RISK_NOTES: Record<string, string> = {
  rasenmähen:
    "Rasenmäher sind Maschinen mit scharfen, schnell drehenden Teilen. Bitte prüfen, ob die Tätigkeit für das Alter geeignet ist (z. B. nur Handmäher, nur ebene Flächen).",
  unkraut: "Gebückte Haltung, ggf. Dornen oder Stechpflanzen. Keine Unkrautvernichtungsmittel.",
  blumenbeete: "Geringes Risiko. Handschuhe empfohlen; keine Düngemittel oder Pflanzenschutzmittel handhaben.",
  laub: "Geringes Risiko. Keine Laubbläser oder Häcksler; rutschiges Laub beachten.",
  sonstiges:
    "Art und Risiko hängen von der Beschreibung ab. Bitte besonders sorgfältig prüfen, ob die Tätigkeit leicht und ungefährlich ist.",
};
export const GENERAL_RISK_NOTE =
  "Allgemein: Sonne und Hitze (ausreichend trinken), Verletzungen durch Werkzeug, unbekannte Personen und Orte.";

export const FORBIDDEN_ACTIVITIES_NOTE =
  "Verboten für Jugendliche sind insbesondere Arbeiten mit gefährlichen Maschinen, Chemikalien, Pflanzenschutzmitteln, schweren Lasten, in großer Höhe, auf Baustellen, an Gewässern und sonstige Tätigkeiten mit erheblichen Risiken.";

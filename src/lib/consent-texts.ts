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
// v2 (2026-11): Info-Banner mit "Trotzdem erlauben" bei Tätigkeiten mit erhöhtem Risiko, Dauerfreigaben (ACTIVITY_BANNERS)
export const JOB_CONSENT_VERSION = "auftrags-freigabe-2026-11-v2";

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

/**
 * Einwilligung in die Verarbeitung der Ausweiskopie (Erwachsene, Profis, Auftraggeber).
 * Die Version wird bei der Einreichung in verification_requests.documents.consent gespeichert.
 * Bei Textänderung die Version erhöhen.
 */
export const ID_CONSENT_VERSION = "ausweis-einwilligung-2026-10-v1";
export const ID_CONSENT_TEXT =
  "Ich willige ein, dass GreenMatch die von mir hochgeladene Ausweiskopie einmalig zur Prüfung meiner Identität und meines Alters verarbeitet. Die Kopie wird nach der Prüfung gelöscht, gespeichert bleiben nur Ergebnis, Prüfdatum und Prüfverfahren. Ich kann meine Einwilligung jederzeit mit Wirkung für die Zukunft widerrufen. Hinweise dazu stehen in der";

/** Auswahltext, wenn die E-Mail der Eltern nicht eingegeben wird */
export const NO_PARENT_EMAIL_OPTION =
  "Ich kann oder möchte die E-Mail-Adresse meiner gesetzlichen Vertretung nicht eingeben.";

/** Erkennbare Risiken je Tätigkeit - für die Eltern-Mail und die Freigabeseite */
export const ACTIVITY_RISK_NOTES: Record<string, string> = {
  rasenmähen:
    "Rasenmäher sind Maschinen mit scharfen, schnell drehenden Teilen und grundsätzlich erst ab 15 Jahren vorgesehen. Für jüngere oder vollzeitschulpflichtige Jugendliche kann die Tätigkeit wegen der Unfallgefahr unzulässig sein. Bitte nur nach Absprache mit den Erziehungsberechtigten freigeben und genau prüfen, ob sie für das Alter geeignet ist.",
  heckenschnitt:
    "Heckenschnitt ist für Jugendliche nur mit Ihrer Zustimmung möglich und nur, wenn die Hecke niedrig ist (ohne Leiter erreichbar, ca. bis 1,5 m) und kein sehr gefährliches Gerät genutzt wird. Nicht erlaubt sind Motor- oder Kettensägen, Benzin- oder Stangenheckenscheren und Häcksler. Handschere oder eine leichte Akku-/Elektro-Heckenschere sind möglich; Handschuhe und Schutzbrille werden empfohlen. Heckenscheren haben scharfe, schnell bewegte Schneiden und sind grundsätzlich erst ab 15 Jahren vorgesehen. Für jüngere oder vollzeitschulpflichtige Jugendliche kann die Tätigkeit wegen der Unfallgefahr unzulässig sein.",
  gartendesign:
    "Gartenumgestaltung kann Graben, Heben und den Einsatz von Werkzeug umfassen. Für Jugendliche ist nur leichte Handarbeit möglich (planen, Beete anlegen, pflanzen, Mulch verteilen) - ohne schwere Lasten und ohne Maschinen wie Bagger, Rüttelplatte oder Motorhacke. Die Tätigkeit kann für jüngere Jugendliche unzulässig sein.",
  bewässerung:
    "Bewässerungsanlagen bedeuten Graben, Rohre und Pumpen. Für Jugendliche ist nur einfache Handarbeit möglich (gießen, Schläuche oder Tropfschläuche auslegen) - ohne Elektro- und Druckanlagen und ohne Maschinen. Die Tätigkeit kann für jüngere Jugendliche unzulässig sein.",
  unkraut: "Gebückte Haltung, ggf. Dornen oder Stechpflanzen. Keine Unkrautvernichtungsmittel.",
  blumenbeete: "Geringes Risiko. Handschuhe empfohlen; keine Düngemittel oder Pflanzenschutzmittel handhaben.",
  laub: "Geringes Risiko. Keine Laubbläser oder Häcksler; rutschiges Laub beachten.",
  sonstiges:
    "Art und Risiko hängen von der Beschreibung ab. Bitte besonders sorgfältig prüfen, ob die Tätigkeit leicht und ungefährlich ist.",
};
/** Bedingungen für Heckenschnitt durch Jugendliche - die Eltern bestätigen sie bei der Freigabe ausdrücklich */
export const HEDGE_YOUTH_CONDITIONS =
  "Die Hecke ist niedrig (ohne Leiter erreichbar, ca. bis 1,5 m), und es wird kein sehr gefährliches Gerät genutzt (keine Motor-/Kettensäge, keine Benzin- oder Stangenheckenschere, kein Häcksler). Handschere oder leichte Akku-/Elektro-Heckenschere sind in Ordnung.";

/**
 * Kurzer Info-Banner im Eltern-Konto, wenn ein Jugendlicher Heckenschnitt machen möchte.
 * Der Klick auf "Trotzdem erlauben" gilt als ausdrückliche Bestätigung der Bedingungen und wird im
 * Einwilligungsprotokoll mitgespeichert. Bei Textänderung JOB_CONSENT_VERSION erhöhen.
 */
export const HEDGE_BANNER = {
  title: "Heckenschnitt: Verletzungsgefahr – bitte kurz prüfen",
  intro: "Heckenscheren haben scharfe, schnell bewegte Schneiden. Für Jugendliche gilt deshalb:",
  rules: [
    "Nur niedrige Hecken (ohne Leiter erreichbar, ca. bis 1,5 m)",
    "Nur Handschere oder leichte Akku-/Elektro-Heckenschere",
    "Nie Motor-/Kettensäge, Benzin- oder Stangenheckenschere, Häcksler",
  ],
  note: "Unter 15 Jahren kann Heckenschnitt unzulässig sein, Ihre Zustimmung ersetzt keine gesetzliche Vorgabe. Höhe und Gerät können wir vor Ort nicht prüfen – bitte klären Sie beides vorab mit dem Auftraggeber.",
  confirm: "Mit „Trotzdem erlauben“ bestätigen Sie, dass diese Bedingungen für genau diesen Auftrag gelten.",
  needsCheckHint: "Setzen Sie zuerst oben den Haken zur Prüfung, dann ist „Trotzdem erlauben“ aktiv.",
  allowButton: "Trotzdem erlauben",
  declineButton: "Nicht erlauben",
} as const;

interface ActivityBanner {
  title: string;
  intro: string;
  rules: readonly string[];
  note: string;
  confirm: string;
  needsCheckHint: string;
  allowButton: string;
  declineButton: string;
}

const SHARED_BANNER_TEXT = {
  confirm: "Mit „Trotzdem erlauben“ bestätigen Sie, dass diese Bedingungen für den Auftrag gelten.",
  needsCheckHint: HEDGE_BANNER.needsCheckHint,
  allowButton: HEDGE_BANNER.allowButton,
  declineButton: HEDGE_BANNER.declineButton,
} as const;

/** Info-Banner je Tätigkeit mit erhöhtem Risiko. Baumpflege und gefährliche Geräte gibt es hier nicht: Sie bleiben immer gesperrt. */
export const ACTIVITY_BANNERS: Record<"heckenschnitt" | "gartendesign" | "bewässerung", ActivityBanner> = {
  heckenschnitt: HEDGE_BANNER,
  gartendesign: {
    title: "Gartenumgestaltung: schwere Arbeit – bitte kurz prüfen",
    intro: "Umgestalten heißt oft graben, heben und Werkzeug benutzen. Für Jugendliche gilt deshalb:",
    rules: [
      "Nur leichte Handarbeit: planen, Beete anlegen, pflanzen, Mulch verteilen",
      "Keine schweren Lasten (z. B. Steine oder Erdsäcke über ca. 10 kg)",
      "Nie Bagger, Rüttelplatte, Motorhacke oder andere Maschinen",
    ],
    note: "Unter 15 Jahren kann diese Tätigkeit unzulässig sein, Ihre Zustimmung ersetzt keine gesetzliche Vorgabe. Umfang und Geräte können wir vor Ort nicht prüfen – bitte klären Sie beides vorab mit dem Auftraggeber.",
    ...SHARED_BANNER_TEXT,
  },
  bewässerung: {
    title: "Bewässerung: Wasser und Technik – bitte kurz prüfen",
    intro: "Bewässerungsanlagen bedeuten Graben, Rohre und Pumpen. Für Jugendliche gilt deshalb:",
    rules: [
      "Nur einfache Handarbeit: gießen, Schläuche oder Tropfschläuche auslegen",
      "Keine Elektro- oder Druckanlagen, keine Pumpen am Stromnetz",
      "Nie Graben mit Maschinen (Bagger, Motorhacke)",
    ],
    note: "Unter 15 Jahren kann diese Tätigkeit unzulässig sein, Ihre Zustimmung ersetzt keine gesetzliche Vorgabe. Umfang und Geräte können wir vor Ort nicht prüfen – bitte klären Sie beides vorab mit dem Auftraggeber.",
    ...SHARED_BANNER_TEXT,
  },
};

/** Bedingungen als ein Satz für die Eltern-Mail */
export function activityConditionsText(serviceType: string): string {
  if (serviceType === "heckenschnitt") return HEDGE_YOUTH_CONDITIONS;
  const b = (ACTIVITY_BANNERS as Record<string, ActivityBanner>)[serviceType];
  return b ? `${b.rules.join("; ")}.` : "";
}

/** Auswahl "Wie soll es weitergehen?" bei der Freigabe */
export const REMEMBER_OPTIONS = {
  none: { label: "Nur dieses Mal fragen", hint: "Sie werden beim ersten Schritt und – falls verhandelt wird – am Ende gefragt." },
  gig: { label: "Für diesen Auftrag nicht mehr fragen", hint: "Auch nach einer Verhandlung (anderer Preis, Termin ...) müssen Sie nicht erneut bestätigen." },
  customer: { label: "Für diesen Auftraggeber immer erlauben", hint: "Alle künftigen Aufträge dieses Auftraggebers werden automatisch freigegeben. Sie werden per E-Mail informiert und können es jederzeit widerrufen." },
} as const;

export const REMEMBER_RISKY_NOTE =
  "Gilt auch für Tätigkeiten mit erhöhtem Risiko (z. B. Heckenschnitt) unter den oben genannten Bedingungen. Baumpflege und gefährliche Geräte bleiben immer ausgeschlossen.";

export const GENERAL_RISK_NOTE =
  "Allgemein: Sonne und Hitze (ausreichend trinken), Verletzungen durch Werkzeug, unbekannte Personen und Orte.";

export const FORBIDDEN_ACTIVITIES_NOTE =
  "Verboten für Jugendliche sind insbesondere Arbeiten mit gefährlichen Maschinen, Chemikalien, Pflanzenschutzmitteln, schweren Lasten, in großer Höhe, auf Baustellen, an Gewässern und sonstige Tätigkeiten mit erheblichen Risiken.";

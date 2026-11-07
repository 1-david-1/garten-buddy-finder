// Regeln für Tätigkeiten mit erhöhtem Risiko bei Jugendlichen (gemeinsam für Browser und Server).
//
// Drei Stufen:
//  1. Normale Tätigkeiten: Freigabe der Eltern wie bei jedem Auftrag.
//  2. Tätigkeiten mit erhöhtem Risiko (Heckenschnitt, Gartenumgestaltung, Bewässerung): möglich, wenn die Eltern
//     die Bedingungen ausdrücklich bestätigen ("Trotzdem erlauben"). Das gilt dann dauerhaft: Die Eltern können
//     es für einen Auftrag oder für einen Auftraggeber ein für alle Mal erlauben.
//  3. Nie vermittelt, auch nicht mit Zustimmung der Eltern: Baumpflege (Klettern, Sägen, Höhe) und alles, was auf
//     ein sehr gefährliches Gerät oder große Höhe hinweist (Motor-/Kettensäge, Leiter, Gerüst, Bagger ...).
//     Die Zustimmung der Eltern ersetzt keine gesetzlichen Vorgaben zum Schutz Jugendlicher.
// Die Datenbank prüft dieselben Stichwörter (20261103000000_youth_hedge_guardian_gate.sql).

const DANGEROUS_EQUIPMENT_PATTERN =
  /(kettens(ä|ae|a)ge|motors(ä|ae|a)ge|baums(ä|ae|a)ge|h(ä|ae|a)cksler|hochentaster|stangenheckenschere|stangenschere|teleskop|benzin|\bleiter\b|ger(ü|ue|u)st|hubarbeitsb(ü|ue)hne|\bsteiger\b|bagger|r(ü|ue|u)ttelplatte|motorhacke|trennschleifer|winkelschleifer)/i;

/** Weist der Text auf ein sehr gefährliches Gerät oder zu große Höhe hin? */
export function mentionsDangerousEquipment(...texts: (string | null | undefined)[]): boolean {
  return DANGEROUS_EQUIPMENT_PATTERN.test(texts.filter(Boolean).join(" "));
}

/** Alter Name (Heckenschnitt), bleibt für bestehenden Code erhalten. */
export const mentionsDangerousHedgeEquipment = mentionsDangerousEquipment;

/** Tätigkeiten, die Jugendlichen nie vermittelt werden (auch nicht mit Zustimmung der Eltern). */
export const YOUTH_BLOCKED_SERVICE_TYPES = ["baumpflege"] as const;

/** Tätigkeiten mit erhöhtem Risiko: Die Eltern müssen die Bedingungen ausdrücklich bestätigen. */
export const PARENT_ACK_SERVICE_TYPES = ["heckenschnitt", "gartendesign", "bewässerung"] as const;
export type ParentAckServiceType = (typeof PARENT_ACK_SERVICE_TYPES)[number];

/** Müssen die Eltern bei dieser Tätigkeit ausdrücklich "Trotzdem erlauben" bestätigen? */
export function requiresParentAcknowledgement(serviceType: string | null | undefined): serviceType is ParentAckServiceType {
  return !!serviceType && (PARENT_ACK_SERVICE_TYPES as readonly string[]).includes(serviceType);
}

/**
 * Darf dieser Auftrag Jugendlichen angezeigt werden? Nein bei verbotenen Tätigkeiten und bei Tätigkeiten mit
 * erhöhtem Risiko, die auf ein sehr gefährliches Gerät / große Höhe hinweisen.
 */
export function isYouthEligible(serviceType: string, ...texts: (string | null | undefined)[]): boolean {
  if ((YOUTH_BLOCKED_SERVICE_TYPES as readonly string[]).includes(serviceType)) return false;
  if (requiresParentAcknowledgement(serviceType) && mentionsDangerousEquipment(...texts)) return false;
  return true;
}

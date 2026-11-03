// Regeln für Heckenschnitt durch Jugendliche (gemeinsam für Browser und Server).
// Heckenschnitt ist mit Zustimmung der Eltern möglich, aber nur bei niedriger Hecke und ohne sehr gefährliches
// Gerät. Die Datenbank prüft dieselben Stichwörter (20261024000300_youth_hedge_trimming.sql).

const DANGEROUS_HEDGE_PATTERN =
  /(kettens(ä|ae|a)ge|motors(ä|ae|a)ge|baums(ä|ae|a)ge|h(ä|ae|a)cksler|hochentaster|stangenheckenschere|stangenschere|teleskop|benzin|\bleiter\b|ger(ü|ue|u)st|hubarbeitsb(ü|ue)hne|\bsteiger\b)/i;

/** Weist der Text auf ein sehr gefährliches Gerät oder zu große Höhe hin? */
export function mentionsDangerousHedgeEquipment(...texts: (string | null | undefined)[]): boolean {
  return DANGEROUS_HEDGE_PATTERN.test(texts.filter(Boolean).join(" "));
}

/** Tätigkeiten, die Jugendlichen nie vermittelt werden. */
export const YOUTH_BLOCKED_SERVICE_TYPES = ["baumpflege", "gartendesign", "bewässerung"] as const;

/**
 * Darf dieser Auftrag Jugendlichen angezeigt werden? Nein bei verbotenen Tätigkeiten und bei Heckenschnitt, der
 * auf ein sehr gefährliches Gerät / große Höhe hinweist.
 */
export function isYouthEligible(serviceType: string, ...texts: (string | null | undefined)[]): boolean {
  if ((YOUTH_BLOCKED_SERVICE_TYPES as readonly string[]).includes(serviceType)) return false;
  if (serviceType === "heckenschnitt" && mentionsDangerousHedgeEquipment(...texts)) return false;
  return true;
}

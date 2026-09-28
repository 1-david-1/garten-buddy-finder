/**
 * Zentrale Stelle für die Plattformgebühren-Sätze.
 *
 * Die App bleibt vorerst 100% kostenlos - kein Zahlungsanbieter angebunden,
 * also darf auch nirgends eine Gebühr angezeigt oder berechnet werden.
 * Vorher standen 0.05/0.10 an 7 verschiedenen Stellen hart einprogrammiert
 * (dieser Datei, 4 SQL-Funktionen, marketplace.tsx) - das hier ist jetzt die
 * einzige Stelle für die TypeScript-Seite.
 *
 * Zum Wiedereinschalten: hier die beiden Werte ändern (und die passende
 * Migration für die SQL-Funktionen, siehe
 * supabase/migrations/20260927000000_platform_fees_disabled.sql).
 * Sauberer wäre langfristig ein admin_settings-Eintrag, den ein Admin zur
 * Laufzeit umschalten kann - das hängt aber am kaputten Admin-Bereich
 * (fehlende admin_settings-Tabelle/'admin'-Rolle), der separat repariert
 * werden muss.
 */
export const PLATFORM_FEES_ENABLED = false;

export const PLATFORM_FEE_CUSTOMER_RATE = PLATFORM_FEES_ENABLED ? 0.05 : 0;
export const PLATFORM_FEE_HELPER_RATE = PLATFORM_FEES_ENABLED ? 0.1 : 0;

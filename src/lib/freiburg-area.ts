/**
 * Pilotgebiet Freiburg: Auftraggeber (Kunden) dürfen nur in Freiburg
 * und unmittelbarer Umgebung (ca. ≤ 10 km) registrieren.
 *
 * Ohne externes Geocoding: PLZ-Zentroide der Region + Haversine zum
 * Freiburger Zentrum. Stadtname allein reicht nicht – PLZ ist Pflicht.
 */

export const FREIBURG_CENTER = { lat: 47.999, lng: 7.8421 } as const;
export const MAX_CUSTOMER_DISTANCE_KM = 10;

/** Ungefähre Zentroide für PLZ in/um Freiburg (≤ ~10 km). */
const PLZ_COORDS: Record<string, { lat: number; lng: number }> = {
  // Freiburg i. Br.
  "79098": { lat: 47.995, lng: 7.852 },
  "79100": { lat: 47.999, lng: 7.842 },
  "79102": { lat: 47.989, lng: 7.835 },
  "79104": { lat: 48.005, lng: 7.855 },
  "79106": { lat: 48.015, lng: 7.845 },
  "79108": { lat: 48.028, lng: 7.83 },
  "79110": { lat: 47.978, lng: 7.828 },
  "79111": { lat: 47.985, lng: 7.812 },
  "79112": { lat: 47.97, lng: 7.8 },
  "79114": { lat: 47.968, lng: 7.845 },
  "79115": { lat: 47.96, lng: 7.86 },
  "79117": { lat: 47.975, lng: 7.88 },
  // Umgebung ≤ ~10 km
  "79194": { lat: 48.045, lng: 7.865 }, // Gundelfingen
  "79199": { lat: 47.965, lng: 7.955 }, // Kirchzarten
  "79211": { lat: 48.068, lng: 7.883 }, // Denzlingen
  "79224": { lat: 48.033, lng: 7.767 }, // Umkirch
  "79227": { lat: 47.958, lng: 7.755 }, // Schallstadt
  "79232": { lat: 48.058, lng: 7.78 }, // March
  "79249": { lat: 47.966, lng: 7.828 }, // Merzhausen
  "79252": { lat: 47.983, lng: 7.963 }, // Stegen
  "79279": { lat: 48.07, lng: 7.85 }, // Vörstetten
  "79280": { lat: 47.95, lng: 7.833 }, // Au
  "79285": { lat: 47.958, lng: 7.738 }, // Ebringen
  "79288": { lat: 48.048, lng: 7.725 }, // Gottenheim
  "79289": { lat: 47.933, lng: 7.858 }, // Horben
};

export const FREIBURG_AREA_ERROR =
  "Als Auftraggeber ist aktuell nur Freiburg und Umgebung (max. 10 km) möglich. Bitte eine passende PLZ angeben.";

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** Normalisierte 5-stellige PLZ oder null. */
export function normalizePostalCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits.length === 5 ? digits : null;
}

export function distanceFromFreiburgKm(postalCode: string): number | null {
  const coords = PLZ_COORDS[postalCode];
  if (!coords) return null;
  return haversineKm(FREIBURG_CENTER, coords);
}

/**
 * Prüft, ob eine PLZ im Pilotgebiet liegt (bekannt + ≤ 10 km vom Zentrum).
 * Unbekannte PLZ werden abgelehnt.
 */
export function isWithinFreiburgArea(postalCode: string | null | undefined): boolean {
  const plz = normalizePostalCode(postalCode);
  if (!plz) return false;
  const km = distanceFromFreiburgKm(plz);
  return km !== null && km <= MAX_CUSTOMER_DISTANCE_KM;
}

/** Wirft mit deutscher Meldung, wenn außerhalb des Pilotgebiets. */
export function assertCustomerInFreiburgArea(
  postalCode: string | null | undefined,
): string {
  const plz = normalizePostalCode(postalCode);
  if (!plz) {
    throw new Error("Bitte eine gültige PLZ (5 Ziffern) in Freiburg oder Umgebung angeben.");
  }
  if (!isWithinFreiburgArea(plz)) {
    throw new Error(FREIBURG_AREA_ERROR);
  }
  return plz;
}

export function listAllowedCustomerPostalCodes(): string[] {
  return Object.keys(PLZ_COORDS)
    .filter((plz) => {
      const km = distanceFromFreiburgKm(plz);
      return km !== null && km <= MAX_CUSTOMER_DISTANCE_KM;
    })
    .sort();
}

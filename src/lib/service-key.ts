/**
 * Prüft, ob ein SUPABASE_SERVICE_ROLE_KEY nach einem echten Schlüssel aussieht.
 * Erkennt leere Werte und die bekannten Platzhalter (.env.example, Fallback im Admin-Client).
 * Bewusst eng gefasst: Ein echter Schlüssel darf nie fälschlich abgelehnt werden.
 */
const PLACEHOLDER_PATTERNS = [
  /^placeholder/i,
  /^sb_secret_x+$/i, // "sb_secret_xxxxxxxx"
  /your[_-]?(secret|key|service)/i, // "sb_secret_your_secret_here"
  /^<.*>$/,
];

export function isUsableServiceKey(value: string | undefined | null): boolean {
  if (!value) return false;
  const v = value.trim();
  if (v.length < 20) return false;
  return !PLACEHOLDER_PATTERNS.some((re) => re.test(v));
}

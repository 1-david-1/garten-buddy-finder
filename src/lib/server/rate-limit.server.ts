// Server-only: Rate-Limiting über die Datenbankfunktion public.check_rate_limit (Service-Role).
// Nur aus Server-Function-Handlern importieren (per dynamischem `await import(...)`).
//
// Verhalten bei Ausfall: "fail open" - fehlt die Funktion (Migration noch nicht eingespielt) oder
// ist die Datenbank kurz nicht erreichbar, wird NICHT blockiert, sondern nur geloggt. Ein
// Rate-Limit darf die App nie komplett lahmlegen.
import { getRequest } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export class RateLimitError extends Error {
  constructor(message = "Zu viele Anfragen. Bitte versuche es in ein paar Minuten erneut.") {
    super(message);
    this.name = "RateLimitError";
  }
}

/** IP des Aufrufers. Auf Cloudflare Workers setzt Cloudflare cf-connecting-ip selbst (nicht fälschbar). */
export function getClientIp(): string | null {
  try {
    const request = getRequest();
    const ip = request?.headers.get("cf-connecting-ip")?.trim();
    return ip || null;
  } catch {
    return null;
  }
}

async function shortHash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest).slice(0, 8))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface RateLimitInput {
  /** Name der Aktion, z. B. "send_message" */
  action: string;
  /** Schlüssel, z. B. die Nutzer-ID oder ein Hash der IP */
  key: string;
  max: number;
  windowSeconds: number;
  message?: string;
}

/** Wirft RateLimitError, wenn das Limit überschritten ist. */
export async function enforceRateLimit(input: RateLimitInput): Promise<void> {
  const allowed = await checkRateLimit(input);
  if (!allowed) throw new RateLimitError(input.message);
}

/** Wie enforceRateLimit, liefert aber true/false statt zu werfen (z. B. für "E-Mail nur alle 5 Minuten"). */
export async function checkRateLimit({ action, key, max, windowSeconds }: RateLimitInput): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin.rpc("check_rate_limit", {
      _bucket: `${action}:${key}`,
      _max: max,
      _window_seconds: windowSeconds,
    });
    if (error) throw error;
    return data !== false;
  } catch (err) {
    console.error("[rate-limit] Prüfung nicht möglich, Anfrage wird durchgelassen:", (err as Error)?.message);
    return true;
  }
}

/** Limit pro angemeldetem Nutzer. */
export function enforceUserRateLimit(userId: string, action: string, max: number, windowSeconds: number, message?: string) {
  return enforceRateLimit({ action, key: userId, max, windowSeconds, message });
}

/** Limit pro IP für öffentliche Endpunkte (ohne Anmeldung). Ohne erkennbare IP (lokale Entwicklung) kein Limit. */
export async function enforceIpRateLimit(action: string, max: number, windowSeconds: number) {
  const ip = getClientIp();
  if (!ip) return;
  await enforceRateLimit({ action, key: await shortHash(ip), max, windowSeconds });
}

import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Security-Header (Audit M5/N1)
// ---------------------------------------------------------------------------

/** Ursprung der Supabase-Instanz für die Content-Security-Policy (connect-src). */
function supabaseOrigins(): string[] {
  const raw =
    (typeof process !== "undefined"
      ? process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
      : undefined) ?? "";
  try {
    const url = new URL(raw);
    const ws = url.protocol === "https:" ? "wss:" : "ws:";
    return [url.origin, `${ws}//${url.host}`];
  } catch {
    // Fallback: gehostetes Supabase (*.supabase.co)
    return ["https://*.supabase.co", "wss://*.supabase.co"];
  }
}

function buildCsp(): string {
  const connect = ["'self'", ...supabaseOrigins()].join(" ");
  return [
    "default-src 'self'",
    // TanStack Start (SSR) setzt Inline-Skripte für die Hydration ein -> 'unsafe-inline' nötig.
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    // Bilder: eigene, Datenschutz-Uploads (Supabase Storage) und https-Quellen für Inserate-Fotos.
    "img-src 'self' data: blob: https:",
    `connect-src ${connect}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/**
 * Setzt die Standard-Sicherheitsheader. Setzt CSP_MODE=report-only in der Umgebung, wird die CSP
 * nur gemeldet statt erzwungen (zum vorsichtigen Einführen, falls etwas blockiert wird).
 */
function withSecurityHeaders(response: Response): Response {
  if (response.status === 101) return response; // WebSocket-Upgrade nicht anfassen
  const headers = new Headers(response.headers);
  const reportOnly = typeof process !== "undefined" && process.env.CSP_MODE === "report-only";
  headers.set(reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy", buildCsp());
  headers.set("Strict-Transport-Security", "max-age=31536000");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  if (!headers.has("Referrer-Policy")) headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return withSecurityHeaders(await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      // Nur serverseitig loggen: Details (Pfade, Stacktrace) gehören nicht zum Client.
      console.error(error);
      return withSecurityHeaders(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    }
  },
};

import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

/**
 * Datenbankfehler (Postgres/PostgREST) enthalten Tabellen-, Spalten- und Constraint-Namen und
 * sollen nicht zum Browser durchgereicht werden (Audit N2). Ausgenommen sind bewusst formulierte
 * Fehlermeldungen aus Datenbank-Triggern (RAISE EXCEPTION, SQLSTATE P0001), die verständliche
 * Hinweise für Nutzer enthalten (z. B. Jugendschutz-Regeln). Alle anderen Fehler laufen
 * unverändert durch.
 */
function isRawDatabaseError(error: unknown): boolean {
  if (error == null || typeof error !== "object") return false;
  const e = error as { code?: unknown; details?: unknown; hint?: unknown };
  if (typeof e.code !== "string") return false;
  if (e.code === "P0001") return false;
  return "details" in e || "hint" in e;
}

const sanitizeDatabaseErrors = createMiddleware({ type: "function" }).server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (isRawDatabaseError(error)) {
      console.error("[server-fn] Datenbankfehler:", error);
      throw new Error("Das hat leider nicht geklappt. Bitte versuche es erneut.");
    }
    throw error;
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth, sanitizeDatabaseErrors],
  requestMiddleware: [errorMiddleware],
}));

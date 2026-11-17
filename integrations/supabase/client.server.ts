// Ursprünglich automatisch generiert (Lovable). Bewusst angepasst: Ohne gültigen Service-Key bricht der
// Admin-Client im Betrieb mit einer klaren Fehlermeldung ab, statt still auf den anon-Schlüssel zu wechseln.
// Server-side Supabase client with service role key - bypasses RLS.
// Use this for admin operations in server functions and server routes only.
// For user-authenticated queries (with RLS), use the auth middleware instead.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { isUsableServiceKey } from "@/lib/service-key";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    // New Supabase API keys are opaque strings, not bearer JWTs.
    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

function createSupabaseAdminClient() {
  const SUPABASE_URL =
    (typeof process !== "undefined"
      ? process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
      : undefined) ||
    import.meta.env.VITE_SUPABASE_URL ||
    "https://placeholder-project.supabase.co";
  const configuredServiceKey =
    typeof process !== "undefined" ? process.env.SUPABASE_SERVICE_ROLE_KEY : undefined;
  const hasServiceKey = isUsableServiceKey(configuredServiceKey);

  if (!hasServiceKey) {
    const problem =
      "SUPABASE_SERVICE_ROLE_KEY fehlt oder ist noch ein Platzhalter (siehe .env.example).";
    // Im Betrieb nicht still mit dem öffentlichen Schlüssel weiterlaufen: Admin-Funktionen wie
    // Eltern-Einladung, Ausweisprüfung und Rate-Limit würden sonst mit irreführenden Fehlern scheitern.
    if (import.meta.env.PROD) {
      throw new Error(`server_misconfigured: ${problem}`);
    }
    console.warn(
      `[Supabase Admin] ${problem} Entwicklungsmodus: Es wird der öffentliche Schlüssel verwendet, Admin-Funktionen schlagen dann fehl.`,
    );
  }

  if (SUPABASE_URL === "https://placeholder-project.supabase.co") {
    console.warn("[Supabase Admin] SUPABASE_URL fehlt. Es wird eine Platzhalter-Adresse verwendet.");
  }

  const SUPABASE_SERVICE_ROLE_KEY =
    (hasServiceKey
      ? configuredServiceKey
      : typeof process !== "undefined"
        ? process.env.VITE_SUPABASE_PUBLISHABLE_KEY
        : undefined) || "placeholder-service-key";

  return createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: {
      fetch: createSupabaseFetch(SUPABASE_SERVICE_ROLE_KEY),
    },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

let _supabaseAdmin: ReturnType<typeof createSupabaseAdminClient> | undefined;

// Server-side Supabase client with service role - bypasses RLS
// SECURITY: Only use this for trusted server-side operations, never expose to client code
// Load inside server handlers: const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
// Top-level import is safe only in other .server.ts modules - route files and *.functions.ts ship to the client bundle.
export const supabaseAdmin = new Proxy({} as ReturnType<typeof createSupabaseAdminClient>, {
  get(_, prop, receiver) {
    if (!_supabaseAdmin) _supabaseAdmin = createSupabaseAdminClient();
    return Reflect.get(_supabaseAdmin, prop, receiver);
  },
});

// Server-only: prüft, dass der Admin-Client wirklich mit dem Service-Role-Schlüssel arbeitet.
//
// Hintergrund: client.server.ts fällt STILL auf den öffentlichen (anon) Schlüssel zurück, wenn
// SUPABASE_SERVICE_ROLE_KEY in der Laufzeitumgebung fehlt. Dann liefern alle Admin-Abfragen
// (z. B. Rollen, Storage, verification_requests) leere Ergebnisse oder Fehler - und Funktionen
// wie "Eltern einladen" oder "Ausweis einreichen" scheitern mit irreführenden Meldungen
// ("nur für Jugendliche möglich"). Diese Prüfung macht die Ursache sichtbar.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

let verified = false;

export class ServerMisconfiguredError extends Error {
  constructor() {
    super(
      "server_misconfigured: Der Server hat keinen Service-Role-Schlüssel (SUPABASE_SERVICE_ROLE_KEY fehlt oder ist ungültig).",
    );
  }
}

export async function assertServiceRole(): Promise<void> {
  if (verified) return;
  try {
    // Admin-Endpunkt: funktioniert nur mit dem Service-Role-Schlüssel.
    const { error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) throw error;
    verified = true;
  } catch (e) {
    console.error("[service-role] Admin-Zugriff nicht möglich:", (e as Error)?.message);
    throw new ServerMisconfiguredError();
  }
}

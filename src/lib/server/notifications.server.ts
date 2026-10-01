// Server-only: Orchestrierung von E-Mail- und In-App-Benachrichtigungen.
// Nur aus Server-Function-Handlern importieren (idealerweise per dynamischem
// `await import(...)`), niemals aus Routen/Komponenten - dieses Modul importiert
// den Service-Role-Client aus client.server.ts.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEmail } from "@/lib/server/email.server";

export type NotificationCategory =
  "new_bid" | "bid_updates" | "gig_updates" | "messages";

interface NotificationPrefs {
  enabled?: boolean;
  new_bid?: boolean;
  bid_updates?: boolean;
  gig_updates?: boolean;
  messages?: boolean;
}

interface InAppNotification {
  title: string;
  body?: string;
  /** Relativer Pfad, z.B. "/messages/abc-123" */
  link?: string;
}

interface NotifyUserInput {
  userId: string;
  category: NotificationCategory;
  subject: string;
  html: string;
  /**
   * Wenn gesetzt, wird zusätzlich zur E-Mail ein Eintrag in der Glocke
   * (notifications-Tabelle) angelegt - unabhängig von den
   * E-Mail-Präferenzen des Nutzers ("keine E-Mails" soll nicht
   * automatisch "keine Glocke" bedeuten).
   */
  inApp?: InAppNotification;
}

/**
 * Benachrichtigt einen Nutzer best-effort per E-Mail (sofern die jeweilige
 * Kategorie nicht abbestellt ist, siehe notification_prefs auf profiles)
 * und optional zusätzlich per In-App-Benachrichtigung (Glocke). Wirft
 * absichtlich nie einen Fehler - eine Benachrichtigung darf niemals die
 * eigentliche Aktion (Gebot, Zusage, Nachricht, ...) zum Scheitern bringen.
 *
 * Nutzt den Service-Role-Client, weil E-Mail-Adressen in auth.users liegen
 * und nicht über den RLS-Client des aufrufenden Nutzers erreichbar sind;
 * für "notifications" ist das zugleich der einzige Weg, Zeilen anzulegen -
 * authenticated hat dort bewusst kein INSERT-Recht.
 */
export async function notifyUserByEmail({
  userId,
  category,
  subject,
  html,
  inApp,
}: NotifyUserInput): Promise<void> {
  try {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("notification_prefs")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw profileError;

    const prefs = (profile?.notification_prefs ?? {}) as NotificationPrefs;
    const emailAllowed = prefs.enabled !== false && prefs[category] !== false;

    if (emailAllowed) {
      const { data: userRes, error: userError } =
        await supabaseAdmin.auth.admin.getUserById(userId);
      if (userError || !userRes?.user?.email) {
        if (userError) {
          console.error(
            "[notifications] Konnte Nutzer-E-Mail nicht laden:",
            userError,
          );
        }
      } else {
        await sendEmail({ to: userRes.user.email, subject, html });
      }
    }
  } catch (err) {
    console.error(
      "[notifications] Konnte Benachrichtigung nicht versenden:",
      err,
    );
  }

  if (inApp) {
    try {
      const { error } = await supabaseAdmin.from("notifications").insert({
        user_id: userId,
        category,
        title: inApp.title,
        body: inApp.body ?? null,
        link: inApp.link ?? null,
      });
      if (error) throw error;
    } catch (err) {
      console.error(
        "[notifications] Konnte In-App-Benachrichtigung nicht anlegen:",
        err,
      );
    }
  }
}

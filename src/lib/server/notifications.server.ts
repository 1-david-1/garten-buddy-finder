// Server-only: Orchestrierung von E-Mail-Benachrichtigungen.
// Nur aus Server-Function-Handlern importieren (idealerweise per dynamischem
// `await import(...)`), niemals aus Routen/Komponenten - dieses Modul importiert
// den Service-Role-Client aus client.server.ts.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEmail } from "@/lib/server/email.server";

export type NotificationCategory = "new_bid" | "bid_updates" | "gig_updates";

interface NotificationPrefs {
  enabled?: boolean;
  new_bid?: boolean;
  bid_updates?: boolean;
  gig_updates?: boolean;
}

interface NotifyEmailInput {
  userId: string;
  category: NotificationCategory;
  subject: string;
  html: string;
}

/**
 * Sendet best-effort eine Benachrichtigungs-E-Mail an einen Nutzer, sofern
 * dieser die jeweilige Kategorie nicht abbestellt hat (notification_prefs
 * auf profiles). Wirft absichtlich nie einen Fehler - siehe email.server.ts.
 *
 * Nutzt den Service-Role-Client, weil E-Mail-Adressen in auth.users liegen
 * und nicht über den RLS-Client des aufrufenden Nutzers erreichbar sind.
 */
export async function notifyUserByEmail({
  userId,
  category,
  subject,
  html,
}: NotifyEmailInput): Promise<void> {
  try {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("notification_prefs")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw profileError;

    const prefs = (profile?.notification_prefs ?? {}) as NotificationPrefs;
    if (prefs.enabled === false) return;
    if (prefs[category] === false) return;

    const { data: userRes, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (userError || !userRes?.user?.email) {
      if (userError) console.error("[notifications] Konnte Nutzer-E-Mail nicht laden:", userError);
      return;
    }

    await sendEmail({ to: userRes.user.email, subject, html });
  } catch (err) {
    console.error("[notifications] Konnte Benachrichtigung nicht versenden:", err);
  }
}

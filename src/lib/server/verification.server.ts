// Server-only: Eltern-Zustimmung für jugendliche Helfer (13-17).
// Nur aus Server-Function-Handlern importieren (per dynamischem `await import(...)`),
// niemals aus Routen/Komponenten - dieses Modul nutzt den Service-Role-Client.
//
// Ablauf:
//   1. Jugendliche/r gibt im Onboarding die E-Mail der Eltern an.
//   2. issueGuardianConsent() erzeugt einen zufälligen Token, speichert NUR dessen
//      SHA-256-Hash und mailt den Link /eltern-zustimmung/<token> an die Eltern.
//   3. Die Eltern öffnen den Link (ohne Konto), sehen die Regeln und stimmen zu oder
//      lehnen ab (decideGuardianConsent). Bei Zustimmung wird das Profil verifiziert.
//   4. Der Link bleibt gültig, um die Zustimmung später zu widerrufen.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { emailTemplate, sendEmail } from "@/lib/server/email.server";
import { notifyUserByEmail } from "@/lib/server/notifications.server";

export const CONSENT_VALID_DAYS = 7;
const RESEND_COOLDOWN_MS = 10 * 60 * 1000;

export class VerificationError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function newToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Erzeugt eine neue Zustimmungs-Anfrage und mailt den Link an die Eltern.
 * Frühere offene Anfragen werden ungültig. Wirft VerificationError mit Code:
 * not_youth | already_consented | guardian_email_missing | recently_sent
 */
export async function issueGuardianConsent(userId: string): Promise<{ emailMasked: string }> {
  const [{ data: roles }, { data: profile }, { data: priv }] = await Promise.all([
    supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
    supabaseAdmin
      .from("profiles")
      .select("display_name, verified_at, verification_method")
      .eq("id", userId)
      .maybeSingle(),
    supabaseAdmin.from("profile_private").select("guardian_email").eq("id", userId).maybeSingle(),
  ]);

  if (!(roles ?? []).some((r) => r.role === "helper_youth")) throw new VerificationError("not_youth");
  if (profile?.verified_at && profile.verification_method === "guardian_consent") {
    throw new VerificationError("already_consented");
  }
  const guardianEmail = priv?.guardian_email?.trim();
  if (!guardianEmail) throw new VerificationError("guardian_email_missing");

  const { data: latest } = await supabaseAdmin
    .from("verification_requests")
    .select("created_at")
    .eq("user_id", userId)
    .eq("kind", "guardian_consent")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest && Date.now() - new Date(latest.created_at).getTime() < RESEND_COOLDOWN_MS) {
    throw new VerificationError("recently_sent");
  }

  await supabaseAdmin
    .from("verification_requests")
    .update({ status: "cancelled", decided_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("kind", "guardian_consent")
    .eq("status", "pending");

  const token = newToken();
  const { error } = await supabaseAdmin.from("verification_requests").insert({
    user_id: userId,
    kind: "guardian_consent",
    status: "pending",
    guardian_email: guardianEmail,
    token_hash: await sha256Hex(token),
    expires_at: new Date(Date.now() + CONSENT_VALID_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  });
  if (error) throw error;

  const childName = escapeHtml(profile?.display_name?.trim() || "Ihr Kind");
  await sendEmail({
    to: guardianEmail,
    subject: `Bitte um Zustimmung: ${profile?.display_name?.trim() || "Ihr Kind"} möchte bei GreenMatch Gartenhilfe anbieten`,
    html: emailTemplate({
      heading: "Zustimmung der Eltern",
      bodyLines: [
        `<strong>${childName}</strong> hat sich bei GreenMatch, einer Nachbarschafts-Plattform für Gartenhilfe, als Helfer/in (13–17 Jahre) angemeldet und Ihre E-Mail-Adresse als Kontakt der Eltern bzw. Erziehungsberechtigten angegeben.`,
        `Bevor ${childName} Aufträge annehmen kann, brauchen wir Ihre Zustimmung. Auf der nächsten Seite sehen Sie genau, welche Regeln gelten. Sie können Ihre Zustimmung später jederzeit über denselben Link widerrufen.`,
        `Der Link ist ${CONSENT_VALID_DAYS} Tage gültig. Wenn Sie diese Nachricht nicht erwartet haben, ignorieren Sie sie einfach – ohne Ihre Zustimmung wird nichts freigeschaltet.`,
      ],
      ctaLabel: "Anfrage ansehen",
      ctaPath: `/eltern-zustimmung/${token}`,
    }),
  });

  return { emailMasked: maskEmail(guardianEmail) };
}

export type ConsentLookup =
  | { state: "invalid" }
  | {
      state: "pending" | "approved" | "declined" | "expired";
      childName: string;
      expiresAt: string | null;
    };

async function findByToken(token: string) {
  const { data } = await supabaseAdmin
    .from("verification_requests")
    .select("id, user_id, status, expires_at")
    .eq("kind", "guardian_consent")
    .eq("token_hash", await sha256Hex(token))
    .maybeSingle();
  return data;
}

export async function lookupGuardianConsent(token: string): Promise<ConsentLookup> {
  const request = await findByToken(token);
  if (!request) return { state: "invalid" };

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("display_name")
    .eq("id", request.user_id)
    .maybeSingle();

  let state: "pending" | "approved" | "declined" | "expired";
  if (request.status === "approved") state = "approved";
  else if (request.status === "declined") state = "declined";
  else if (request.status === "cancelled") return { state: "invalid" }; // durch neuere Anfrage ersetzt
  else if (request.expires_at && new Date(request.expires_at) < new Date()) state = "expired";
  else if (request.status === "expired") state = "expired";
  else state = "pending";

  return {
    state,
    childName: profile?.display_name?.trim() || "Ihr Kind",
    expiresAt: request.expires_at,
  };
}

/**
 * approve: nur bei offener, nicht abgelaufener Anfrage.
 * decline: nur bei offener Anfrage.
 * revoke:  nur bei bereits erteilter Zustimmung (Link bleibt dafür dauerhaft gültig).
 */
export async function decideGuardianConsent(
  token: string,
  decision: "approve" | "decline" | "revoke",
): Promise<{ state: "approved" | "declined" }> {
  const request = await findByToken(token);
  if (!request) throw new VerificationError("invalid_token");

  const now = new Date();
  const nowIso = now.toISOString();

  if (decision === "revoke") {
    if (request.status !== "approved") throw new VerificationError("not_approved");
    await supabaseAdmin
      .from("verification_requests")
      .update({ status: "declined", decided_at: nowIso })
      .eq("id", request.id);
    await supabaseAdmin
      .from("profiles")
      .update({ verified_at: null, verification_method: null })
      .eq("id", request.user_id)
      .eq("verification_method", "guardian_consent");
    await notifyChild(request.user_id, false);
    return { state: "declined" };
  }

  if (request.status !== "pending") throw new VerificationError("already_decided");
  if (request.expires_at && new Date(request.expires_at) < now) {
    await supabaseAdmin
      .from("verification_requests")
      .update({ status: "expired", decided_at: nowIso })
      .eq("id", request.id);
    throw new VerificationError("expired");
  }

  if (decision === "decline") {
    await supabaseAdmin
      .from("verification_requests")
      .update({ status: "declined", decided_at: nowIso })
      .eq("id", request.id);
    await notifyChild(request.user_id, false);
    return { state: "declined" };
  }

  await supabaseAdmin
    .from("verification_requests")
    .update({ status: "approved", decided_at: nowIso })
    .eq("id", request.id);
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ verified_at: nowIso, verification_method: "guardian_consent" })
    .eq("id", request.user_id);
  if (error) throw error;
  await notifyChild(request.user_id, true);
  return { state: "approved" };
}

async function notifyChild(userId: string, approved: boolean) {
  await notifyUserByEmail({
    userId,
    category: "gig_updates",
    subject: approved ? "Deine Eltern haben zugestimmt" : "Die Zustimmung deiner Eltern fehlt",
    html: emailTemplate({
      heading: approved ? "Du bist freigeschaltet" : "Zustimmung nicht erteilt",
      bodyLines: [
        approved
          ? "Deine Eltern haben zugestimmt. Du kannst jetzt auf Aufträge bieten und Angebote einstellen."
          : "Deine Eltern haben die Zustimmung nicht erteilt oder widerrufen. Bis dahin kannst du keine Gebote abgeben. Sprich am besten kurz mit ihnen und fordere die Zustimmung dann erneut an.",
      ],
      ctaLabel: "Zum Dashboard",
      ctaPath: "/dashboard",
    }),
    inApp: {
      title: approved ? "Eltern-Zustimmung erteilt" : "Eltern-Zustimmung fehlt",
      body: approved
        ? "Du bist freigeschaltet und kannst jetzt bieten."
        : "Ohne Zustimmung kannst du keine Gebote abgeben.",
      link: "/profile",
    },
  });
}

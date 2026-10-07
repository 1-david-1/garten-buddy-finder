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
export async function issueGuardianConsent(_userId: string): Promise<{ emailMasked: string }> {
  // Der Link-Weg für die Konto-Zustimmung ist ersetzt: Jugendliche reichen jetzt
  // Einverständniserklärung + Ausweise ein (siehe youth-verification.functions.ts).
  throw new VerificationError("flow_changed");
}

export type ConsentLookup =
  | { state: "invalid" }
  | {
      state: "pending" | "approved" | "declined" | "expired";
      childName: string;
      expiresAt: string | null;
    };

async function findByToken(token: string, kind: "guardian_consent" | "job_approval" = "guardian_consent") {
  const { data } = await supabaseAdmin
    .from("verification_requests")
    .select("id, user_id, status, expires_at, gig_id")
    .eq("kind", kind)
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
  if (decision === "approve") throw new VerificationError("flow_changed"); // Verifizierung nur noch über Unterlagen
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


// ===========================================================================
// Freigabe pro Auftrag: Für JEDEN Auftrag eines jugendlichen Helfers fragen wir
// die Eltern einzeln. Ohne Freigabe lässt die Datenbank das Annehmen nicht zu
// (Trigger enforce_youth_job_rules).
// ===========================================================================

export const JOB_APPROVAL_VALID_DAYS = 3;

/** Wird mit einer Nutzer-lesbaren deutschen Meldung geworfen (wird in der App als Hinweis angezeigt). */
export class JobApprovalRequired extends Error {}

function formatEuro(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function formatWhen(scheduledAt: string | null, durationMinutes: number): string {
  if (!scheduledAt) return `Termin wird noch abgestimmt · ca. ${durationMinutes} Minuten`;
  const d = new Date(scheduledAt).toLocaleString("de-DE", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  });
  return `${d} Uhr · ca. ${durationMinutes} Minuten`;
}

/**
 * Stellt sicher, dass ein jugendlicher Helfer einen Auftrag annehmen darf.
 * - Kein Jugendlicher: nichts zu tun.
 * - Freigabe liegt vor: nichts zu tun.
 * - Sonst: Mail an die Eltern (falls noch nicht geschehen) und JobApprovalRequired werfen.
 */
export async function ensureJobApproval(userId: string, gigId: string): Promise<void> {
  const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  if (!(roles ?? []).some((r) => r.role === "helper_youth")) return;

  const [{ data: profile }, { data: priv }, { data: gig }] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("display_name, verified_at, verification_method")
      .eq("id", userId)
      .maybeSingle(),
    supabaseAdmin.from("profile_private").select("guardian_email").eq("id", userId).maybeSingle(),
    supabaseAdmin
      .from("gigs")
      .select("id, title, service_type, scheduled_at, duration_minutes, budget_cents, postal_code, customer_id, assigned_helper_id")
      .eq("id", gigId)
      .maybeSingle(),
  ]);

  if (!gig || gig.assigned_helper_id !== userId) throw new JobApprovalRequired("Auftrag nicht gefunden.");
  if (!profile?.verified_at || profile.verification_method !== "guardian_consent") {
    throw new JobApprovalRequired(
      "Zuerst musst du dich verifizieren (Profil → Verifizierung).",
    );
  }

  const { data: existing } = await supabaseAdmin
    .from("verification_requests")
    .select("status, expires_at, guardian_email")
    .eq("kind", "job_approval")
    .eq("gig_id", gigId)
    .eq("user_id", userId)
    .in("status", ["approved", "pending"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.status === "approved") return;
  if (existing?.status === "pending" && existing.expires_at && new Date(existing.expires_at) > new Date()) {
    throw new JobApprovalRequired(
      `Deine Eltern wurden schon gefragt${existing.guardian_email ? ` (Mail an ${maskEmail(existing.guardian_email)})` : ""}. Sobald sie diesen Auftrag freigeben, kannst du ihn annehmen.`,
    );
  }

  const guardianEmail = priv?.guardian_email?.trim();
  if (!guardianEmail) {
    throw new JobApprovalRequired("Es ist keine E-Mail-Adresse deiner Eltern hinterlegt.");
  }

  await supabaseAdmin
    .from("verification_requests")
    .update({ status: "cancelled", decided_at: new Date().toISOString() })
    .eq("kind", "job_approval")
    .eq("gig_id", gigId)
    .eq("user_id", userId)
    .eq("status", "pending");

  const token = newToken();
  const { error } = await supabaseAdmin.from("verification_requests").insert({
    user_id: userId,
    gig_id: gigId,
    kind: "job_approval",
    status: "pending",
    guardian_email: guardianEmail,
    token_hash: await sha256Hex(token),
    expires_at: new Date(Date.now() + JOB_APPROVAL_VALID_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  });
  if (error) throw error;

  const { data: customer } = await supabaseAdmin
    .from("profiles")
    .select("display_name, verified_at")
    .eq("id", gig.customer_id)
    .maybeSingle();

  const child = escapeHtml(profile.display_name?.trim() || "Ihr Kind");
  await sendEmail({
    to: guardianEmail,
    subject: `Freigabe nötig: ${profile.display_name?.trim() || "Ihr Kind"} möchte einen Gartenauftrag annehmen`,
    html: emailTemplate({
      heading: "Freigabe für einen Auftrag",
      bodyLines: [
        `<strong>${child}</strong> möchte bei GreenMatch einen Gartenauftrag annehmen. Wir fragen Sie bei <strong>jedem einzelnen Auftrag</strong> – ohne Ihre Freigabe kann ${child} ihn nicht annehmen.`,
        `<strong>Auftrag:</strong> ${escapeHtml(gig.title)} (${escapeHtml(gig.service_type)})<br/><strong>Wann:</strong> ${escapeHtml(formatWhen(gig.scheduled_at, gig.duration_minutes))}<br/><strong>Wo:</strong> PLZ ${escapeHtml(gig.postal_code ?? "wird noch abgestimmt")}<br/><strong>Auftraggeber:</strong> ${escapeHtml(customer?.display_name?.trim() || "—")}${customer?.verified_at ? " (verifiziert)" : " (noch nicht verifiziert)"}<br/><strong>Vereinbarter Preis:</strong> ${formatEuro(gig.budget_cents)}`,
        `Der Link ist ${JOB_APPROVAL_VALID_DAYS} Tage gültig. Wenn Sie nichts tun, passiert nichts.`,
      ],
      ctaLabel: "Auftrag ansehen und entscheiden",
      ctaPath: `/auftrag-freigabe/${token}`,
    }),
  });

  throw new JobApprovalRequired(
    `Wir haben deine Eltern per E-Mail um Freigabe für diesen Auftrag gebeten (${maskEmail(guardianEmail)}). Sobald sie zustimmen, kannst du ihn annehmen.`,
  );
}

export type JobApprovalLookup =
  | { state: "invalid" }
  | {
      state: "pending" | "approved" | "declined" | "expired";
      childName: string;
      expiresAt: string | null;
      job: {
        title: string;
        serviceType: string;
        when: string;
        postalCode: string | null;
        priceCents: number;
        customerName: string;
        customerVerified: boolean;
      };
    };

export async function lookupJobApproval(token: string): Promise<JobApprovalLookup> {
  const request = await findByToken(token, "job_approval");
  if (!request || !request.gig_id) return { state: "invalid" };
  if (request.status === "cancelled") return { state: "invalid" };

  const { data: gig } = await supabaseAdmin
    .from("gigs")
    .select("title, service_type, scheduled_at, duration_minutes, budget_cents, postal_code, customer_id")
    .eq("id", request.gig_id)
    .maybeSingle();
  if (!gig) return { state: "invalid" };

  const [{ data: child }, { data: customer }] = await Promise.all([
    supabaseAdmin.from("profiles").select("display_name").eq("id", request.user_id).maybeSingle(),
    supabaseAdmin.from("profiles").select("display_name, verified_at").eq("id", gig.customer_id).maybeSingle(),
  ]);

  let state: "pending" | "approved" | "declined" | "expired";
  if (request.status === "approved") state = "approved";
  else if (request.status === "declined") state = "declined";
  else if (request.status === "expired" || (request.expires_at && new Date(request.expires_at) < new Date())) state = "expired";
  else state = "pending";

  return {
    state,
    childName: child?.display_name?.trim() || "Ihr Kind",
    expiresAt: request.expires_at,
    job: {
      title: gig.title,
      serviceType: gig.service_type,
      when: formatWhen(gig.scheduled_at, gig.duration_minutes),
      postalCode: gig.postal_code,
      priceCents: gig.budget_cents,
      customerName: customer?.display_name?.trim() || "—",
      customerVerified: Boolean(customer?.verified_at),
    },
  };
}

/**
 * approve: nur bei offener, nicht abgelaufener Anfrage.
 * decline: nur bei offener Anfrage.
 * revoke:  zieht eine erteilte Freigabe zurück, solange der Auftrag noch nicht läuft
 *          (angenommene Aufträge gehen zurück auf "wartet auf Helfer").
 */
export async function decideJobApproval(
  token: string,
  decision: "approve" | "decline" | "revoke",
): Promise<{ state: "approved" | "declined" }> {
  const request = await findByToken(token, "job_approval");
  if (!request || !request.gig_id) throw new VerificationError("invalid_token");

  const now = new Date();
  const nowIso = now.toISOString();
  const { data: gig } = await supabaseAdmin
    .from("gigs")
    .select("id, title, status, customer_id")
    .eq("id", request.gig_id)
    .maybeSingle();

  if (decision === "revoke") {
    if (request.status !== "approved") throw new VerificationError("not_approved");
    if (gig?.status === "in_progress" || gig?.status === "completed") {
      throw new VerificationError("job_already_started");
    }
    await supabaseAdmin
      .from("verification_requests")
      .update({ status: "declined", decided_at: nowIso })
      .eq("id", request.id);
    if (gig?.status === "assigned") {
      await supabaseAdmin.from("gigs").update({ status: "pending_helper" }).eq("id", gig.id);
    }
    await notifyHelperAboutJob(request.user_id, gig?.title ?? "Auftrag", false);
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

  const approved = decision === "approve";
  await supabaseAdmin
    .from("verification_requests")
    .update({ status: approved ? "approved" : "declined", decided_at: nowIso })
    .eq("id", request.id);
  await notifyHelperAboutJob(request.user_id, gig?.title ?? "Auftrag", approved);
  return { state: approved ? "approved" : "declined" };
}

async function notifyHelperAboutJob(userId: string, jobTitle: string, approved: boolean) {
  await notifyUserByEmail({
    userId,
    category: "gig_updates",
    subject: approved
      ? `Freigabe erteilt: ${jobTitle}`
      : `Keine Freigabe der Eltern: ${jobTitle}`,
    html: emailTemplate({
      heading: approved ? "Deine Eltern haben den Auftrag freigegeben" : "Keine Freigabe",
      bodyLines: [
        approved
          ? `Für „${escapeHtml(jobTitle)}“ liegt die Freigabe vor. Du kannst den Auftrag jetzt annehmen.`
          : `Deine Eltern haben „${escapeHtml(jobTitle)}“ nicht freigegeben oder die Freigabe zurückgezogen. Du kannst den Auftrag deshalb nicht annehmen.`,
      ],
      ctaLabel: "Zu meinen Aufträgen",
      ctaPath: "/gigs",
    }),
    inApp: {
      title: approved ? "Freigabe der Eltern erteilt" : "Keine Freigabe der Eltern",
      body: jobTitle,
      link: "/gigs",
    },
  });
}

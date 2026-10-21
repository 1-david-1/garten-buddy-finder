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
import { emailTemplate, escapeHtml, getSiteUrl, sendEmail } from "@/lib/server/email.server";
import { notifyUserByEmail } from "@/lib/server/notifications.server";
import { SERVICE_TYPES } from "@/lib/service-types";
import {
  ACTIVITY_RISK_NOTES,
  FORBIDDEN_ACTIVITIES_NOTE,
  GENERAL_RISK_NOTE,
  JOB_CONSENT_VERSION,
} from "@/lib/consent-texts";
import { jobEnd, requiresNewApproval, type JobSnapshot } from "@/lib/job-snapshot";

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

// escapeHtml lebt in email.server.ts; hier nur re-exportiert, damit bestehende Importe weiter funktionieren.
export { escapeHtml };

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function newToken(): string {
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
//
// Entschieden wird ausschließlich im Eltern-Konto (angemeldet, mit dem Kind
// verknüpft) - nicht mehr über einen öffentlichen Link. Sonst könnte ein Kind,
// das den Link nur "weiterleitet", sich selbst freigeben.
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

function timeLabels(scheduledAt: string | null, durationMinutes: number) {
  const hours = Math.floor(durationMinutes / 60);
  const mins = durationMinutes % 60;
  const durationLabel = `${hours > 0 ? `${hours} Std.` : ""}${hours > 0 && mins > 0 ? " " : ""}${mins > 0 ? `${mins} Min.` : ""}`.trim();
  if (!scheduledAt) {
    return { dateLabel: "wird noch abgestimmt", startLabel: "—", endLabel: "—", durationLabel };
  }
  const tz = { timeZone: "Europe/Berlin" } as const;
  const start = new Date(scheduledAt);
  const end = jobEnd(scheduledAt, durationMinutes);
  return {
    dateLabel: start.toLocaleDateString("de-DE", { dateStyle: "full", ...tz }),
    startLabel: `${start.toLocaleTimeString("de-DE", { timeStyle: "short", ...tz })} Uhr`,
    endLabel: `${end.toLocaleTimeString("de-DE", { timeStyle: "short", ...tz })} Uhr`,
    durationLabel,
  };
}

/** Stand der wesentlichen Auftragsdaten - Grundlage für "neue Freigabe nötig". */
export function toSnapshot(job: JobDetails): JobSnapshot {
  return {
    location: job.location,
    scheduledAt: job.scheduledAt,
    durationMinutes: job.durationMinutes,
    customerId: job.customerId,
    activity: job.serviceType,
    description: job.description,
    priceCents: job.priceCents,
  };
}

function serviceLabel(value: string): string {
  return SERVICE_TYPES.find((s) => s.value === value)?.label ?? value;
}

/** Alle Angaben zur Beschäftigung, die Eltern für ihre Entscheidung brauchen. */
export interface JobDetails {
  gigId: string;
  title: string;
  /** Art der Tätigkeit (z. B. "Rasenmähen") */
  activity: string;
  /** technischer Wert der Tätigkeit (z. B. "rasenmähen") */
  serviceType: string;
  /** Datum, Beginn, Ende, Dauer - lesbar */
  dateLabel: string;
  startLabel: string;
  endLabel: string;
  durationLabel: string;
  /** erkennbare Risiken der Tätigkeit */
  risks: string;
  customerId: string;
  description: string | null;
  /** Zeit, lesbar */
  when: string;
  scheduledAt: string | null;
  durationMinutes: number;
  /** Ort, lesbar (Adresse, PLZ, Stadt) */
  location: string;
  hasLocation: boolean;
  customerName: string;
  customerVerified: boolean;
  priceCents: number;
  gigStatus: string;
}

export async function loadJobDetails(gigId: string): Promise<(JobDetails & { customerId: string }) | null> {
  const { data: gig } = await supabaseAdmin
    .from("gigs")
    .select(
      "id, title, description, service_type, scheduled_at, duration_minutes, budget_cents, postal_code, address, status, customer_id",
    )
    .eq("id", gigId)
    .maybeSingle();
  if (!gig) return null;

  const { data: customer } = await supabaseAdmin
    .from("profiles")
    .select("display_name, verified_at, city")
    .eq("id", gig.customer_id)
    .maybeSingle();

  const cityLine = [gig.postal_code, customer?.city].filter((v) => !!v && String(v).trim()).join(" ");
  const locationParts = [gig.address?.trim(), cityLine].filter((v): v is string => !!v);

  return {
    gigId: gig.id,
    customerId: gig.customer_id,
    title: gig.title,
    activity: serviceLabel(gig.service_type),
    serviceType: gig.service_type,
    ...timeLabels(gig.scheduled_at, gig.duration_minutes),
    risks: [ACTIVITY_RISK_NOTES[gig.service_type], GENERAL_RISK_NOTE].filter(Boolean).join(" "),
    description: gig.description?.trim() || null,
    when: formatWhen(gig.scheduled_at, gig.duration_minutes),
    scheduledAt: gig.scheduled_at,
    durationMinutes: gig.duration_minutes,
    location: locationParts.length > 0 ? locationParts.join(", ") : "wird noch abgestimmt",
    hasLocation: locationParts.length > 0,
    customerName: customer?.display_name?.trim() || "—",
    customerVerified: Boolean(customer?.verified_at),
    priceCents: gig.budget_cents,
    gigStatus: gig.status,
  };
}

/** E-Mail-Empfänger für Eltern-Mails: Eltern-Konto (Login-Adresse) und die vom Kind angegebene Adresse. */
async function guardianRecipients(
  guardianUserId: string | null,
  statedEmail: string | null | undefined,
): Promise<string[]> {
  const list: string[] = [];
  if (guardianUserId) {
    const { data } = await supabaseAdmin.auth.admin.getUserById(guardianUserId);
    if (data?.user?.email) list.push(data.user.email.trim());
  }
  if (statedEmail?.trim()) list.push(statedEmail.trim());
  const seen = new Set<string>();
  return list.filter((e) => {
    const key = e.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

  const [{ data: profile }, { data: priv }, { data: gig }, { data: link }] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("display_name, verified_at, verification_method, suspended_at")
      .eq("id", userId)
      .maybeSingle(),
    supabaseAdmin.from("profile_private").select("guardian_email").eq("id", userId).maybeSingle(),
    supabaseAdmin.from("gigs").select("id, assigned_helper_id").eq("id", gigId).maybeSingle(),
    supabaseAdmin
      .from("guardian_links")
      .select("guardian_user_id, status, paused_at")
      .eq("child_id", userId)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  if (!gig || gig.assigned_helper_id !== userId) throw new JobApprovalRequired("Auftrag nicht gefunden.");
  if (profile?.suspended_at) {
    throw new JobApprovalRequired("Dein Konto ist derzeit gesperrt. Bitte wende dich an das GreenMatch-Team.");
  }
  if (!profile?.verified_at || profile.verification_method !== "guardian_consent") {
    throw new JobApprovalRequired("Zuerst musst du dich verifizieren (Profil → Verifizierung).");
  }
  if (!link?.guardian_user_id) {
    throw new JobApprovalRequired(
      "Dir fehlt noch ein Eltern-Konto. Deine Eltern müssen es anlegen (Profil → Verifizierung), bevor du Aufträge annehmen kannst.",
    );
  }
  if (link.paused_at) {
    throw new JobApprovalRequired("Deine Eltern haben dein Konto pausiert. Bitte sprich mit ihnen.");
  }

  const details = await loadJobDetails(gigId);
  if (!details) throw new JobApprovalRequired("Auftrag nicht gefunden.");

  const { data: existing } = await supabaseAdmin
    .from("verification_requests")
    .select("status, expires_at")
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
      "Deine Eltern wurden schon gefragt. Sobald sie diesen Auftrag in ihrem Eltern-Konto freigeben, kannst du ihn annehmen.",
    );
  }

  // Alle Angaben müssen feststehen, damit die Eltern wirklich informiert entscheiden.
  if (!details.scheduledAt) {
    throw new JobApprovalRequired(
      "Für die Freigabe deiner Eltern muss der Termin (Datum und Uhrzeit) feststehen. Bitte klärt ihn mit dem Auftraggeber.",
    );
  }
  if (!details.hasLocation) {
    throw new JobApprovalRequired(
      "Für die Freigabe deiner Eltern muss der Ort (Adresse oder PLZ) feststehen. Bitte klärt ihn mit dem Auftraggeber.",
    );
  }

  const recipients = await guardianRecipients(link.guardian_user_id, priv?.guardian_email);
  if (recipients.length === 0) {
    throw new JobApprovalRequired("Es ist keine E-Mail-Adresse deiner Eltern hinterlegt.");
  }

  await supabaseAdmin
    .from("verification_requests")
    .update({ status: "cancelled", decided_at: new Date().toISOString() })
    .eq("kind", "job_approval")
    .eq("gig_id", gigId)
    .eq("user_id", userId)
    .eq("status", "pending");

  const { data: created, error } = await supabaseAdmin
    .from("verification_requests")
    .insert({
      user_id: userId,
      gig_id: gigId,
      kind: "job_approval",
      status: "pending",
      guardian_email: recipients[0],
      expires_at: new Date(Date.now() + JOB_APPROVAL_VALID_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      // Stand der Auftragsdaten zum Zeitpunkt der Anfrage (für die Änderungserkennung)
      documents: { snapshot: toSnapshot(details), consentVersion: JOB_CONSENT_VERSION },
    })
    .select("id")
    .single();
  if (error || !created) throw error ?? new Error("insert_failed");

  const childName = profile.display_name?.trim() || "Ihr Kind";
  const e = escapeHtml;
  const child = e(childName);
  const approveUrl = `${getSiteUrl()}/eltern?request=${created.id}&aktion=freigeben`;
  const declineUrl = `${getSiteUrl()}/eltern?request=${created.id}&aktion=ablehnen`;
  const reportUrl = `${getSiteUrl()}/eltern?request=${created.id}&aktion=melden`;
  const verificationText = details.customerVerified
    ? "Identität geprüft ✓"
    : "nicht verifiziert";

  const html = emailTemplate({
    badge: "Jugendschutz & Auftragsfreigabe",
    heading: `Zustimmung zu einem Gartenauftrag für ${childName} erforderlich`,
    greeting: "Liebe Erziehungsberechtigte,",
    previewText: `Auftragsfreigabe für ${childName}: ${details.activity} (${details.dateLabel})`,
    bodyLines: [
      `Für <strong>${child}</strong> liegt folgende Auftragsanfrage vor. Als Erziehungsberechtigte/r bitten wir Sie, die Angaben gemeinsam mit ${child} zu prüfen:`,
    ],
    infoTable: [
      { label: "Tätigkeit", value: `${e(details.activity)} – ${e(details.title)}${details.description ? ` (${e(details.description)})` : ""}` },
      { label: "Auftraggeber", value: `${e(details.customerName)} (${e(verificationText)})` },
      { label: "Ort", value: e(details.location) },
      { label: "Termin & Zeit", value: `${e(details.dateLabel)}, ${e(details.startLabel)} – ${e(details.endLabel)} (ca. ${e(details.durationLabel)})` },
      { label: "Vergütung", value: details.priceCents > 0 ? formatEuro(details.priceCents) : "nicht angegeben" },
      { label: "Besondere Risiken", value: e(details.risks) },
      { label: "Verbotene Tätigkeiten", value: e(FORBIDDEN_ACTIVITIES_NOTE) },
    ],
    ctaLabel: "Auftrag im Eltern-Konto freigeben",
    ctaUrl: approveUrl,
    secondaryCta: {
      label: "Auftrag ablehnen",
      url: declineUrl,
      variant: "danger",
    },
    footer: `Der Auftrag wird nur angenommen, wenn Sie ihn ausdrücklich freigeben (Gültig für ${JOB_APPROVAL_VALID_DAYS} Tage). Etwas stimmt nicht? <a href="${reportUrl}" style="color:#059669;text-decoration:none;">Auftrag melden</a>.`,
  });
  const subject = `Zustimmung zu einem Gartenauftrag für ${childName} erforderlich`;
  await Promise.all(recipients.map((to) => sendEmail({ to, subject, html })));

  throw new JobApprovalRequired(
    `Wir haben deine Eltern per E-Mail um Freigabe für diesen Auftrag gebeten (${recipients.map(maskEmail).join(", ")}). Sobald sie im Eltern-Konto zustimmen, kannst du ihn annehmen.`,
  );
}

// ---------------------------------------------------------------------------
// Alter öffentlicher Token-Link (nur noch lesend: Details ansehen)
// ---------------------------------------------------------------------------

export type JobApprovalLookup =
  | { state: "invalid" }
  | {
      state: "pending" | "approved" | "declined" | "expired";
      childName: string;
      expiresAt: string | null;
      job: JobDetails;
    };

export async function lookupJobApproval(token: string): Promise<JobApprovalLookup> {
  const request = await findByToken(token, "job_approval");
  if (!request || !request.gig_id) return { state: "invalid" };
  if (request.status === "cancelled") return { state: "invalid" };

  const [job, { data: child }] = await Promise.all([
    loadJobDetails(request.gig_id),
    supabaseAdmin.from("profiles").select("display_name").eq("id", request.user_id).maybeSingle(),
  ]);
  if (!job) return { state: "invalid" };

  let state: "pending" | "approved" | "declined" | "expired";
  if (request.status === "approved") state = "approved";
  else if (request.status === "declined") state = "declined";
  else if (request.status === "expired" || (request.expires_at && new Date(request.expires_at) < new Date())) state = "expired";
  else state = "pending";

  return {
    state,
    childName: child?.display_name?.trim() || "Ihr Kind",
    expiresAt: request.expires_at,
    job,
  };
}

/** Entscheidungen über einen öffentlichen Link sind nicht mehr möglich - nur im Eltern-Konto. */
export async function decideJobApproval(
  _token: string,
  _decision: "approve" | "decline" | "revoke",
): Promise<{ state: "approved" | "declined" }> {
  throw new VerificationError("login_required");
}

/**
 * Entscheidung der Eltern im Eltern-Konto.
 * approve: nur bei offener, nicht abgelaufener Anfrage.
 * decline: nur bei offener Anfrage.
 * revoke:  zieht eine erteilte Freigabe zurück, solange der Auftrag noch nicht läuft
 *          (angenommene Aufträge gehen zurück auf "wartet auf Helfer").
 */
export async function decideJobApprovalAsGuardian(
  guardianUserId: string,
  requestId: string,
  decision: "approve" | "decline" | "revoke",
): Promise<{ state: "approved" | "declined" }> {
  const { data: request } = await supabaseAdmin
    .from("verification_requests")
    .select("id, user_id, status, expires_at, gig_id, documents")
    .eq("id", requestId)
    .eq("kind", "job_approval")
    .maybeSingle();
  if (!request || !request.gig_id) throw new VerificationError("invalid_request");

  // Nur das verknüpfte Eltern-Konto dieses Kindes darf entscheiden.
  const { data: link } = await supabaseAdmin
    .from("guardian_links")
    .select("id")
    .eq("child_id", request.user_id)
    .eq("guardian_user_id", guardianUserId)
    .eq("status", "active")
    .maybeSingle();
  if (!link) throw new VerificationError("forbidden");

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
    await recordJobConsent(guardianUserId, request, "revoked");
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

  // Haben sich wesentliche Auftragsdaten seit der Anfrage geändert, gilt die Zustimmung nicht:
  // neue Anfrage nötig (die Eltern haben die geänderten Daten nicht gesehen).
  if (approved) {
    const before = (request.documents as { snapshot?: JobSnapshot } | null)?.snapshot;
    const current = await loadJobDetails(request.gig_id);
    if (!current || (before && requiresNewApproval(before, toSnapshot(current)))) {
      await supabaseAdmin
        .from("verification_requests")
        .update({ status: "cancelled", decided_at: nowIso })
        .eq("id", request.id);
      throw new VerificationError("job_changed");
    }
  }

  await supabaseAdmin
    .from("verification_requests")
    .update({ status: approved ? "approved" : "declined", decided_at: nowIso })
    .eq("id", request.id);
  await recordJobConsent(guardianUserId, request, approved ? "approved" : "declined");
  await notifyHelperAboutJob(request.user_id, gig?.title ?? "Auftrag", approved);
  return { state: approved ? "approved" : "declined" };
}

/** Einwilligungsprotokoll: wer hat wann welchem Stand des Auftrags zugestimmt oder ihn abgelehnt. */
async function recordJobConsent(
  guardianUserId: string,
  request: { id: string; user_id: string; gig_id: string | null },
  result: "approved" | "declined" | "revoked",
) {
  if (!request.gig_id) return;
  const job = await loadJobDetails(request.gig_id);
  await supabaseAdmin.from("job_consents").insert({
    guardian_user_id: guardianUserId,
    child_id: request.user_id,
    gig_id: request.gig_id,
    request_id: request.id,
    result,
    consent_text_version: JOB_CONSENT_VERSION,
    job_snapshot: (job ?? {}) as never,
  });
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

// Server-only: Eltern-Zusatzkonto für jugendliche Helfer (13-17).
// Nur aus Server-Function-Handlern importieren (per dynamischem `await import(...)`),
// niemals aus Routen/Komponenten - dieses Modul nutzt den Service-Role-Client.
//
// Ablauf:
//   1. Jugendliche/r gibt im Verifizierungsschritt die E-Mail der Eltern ein
//      (createGuardianInvite) - ODER wählt "ohne E-Mail" und bekommt einen Link,
//      den er den Eltern selbst weitergibt (WhatsApp, Ausdruck, ...).
//   2. Die Eltern legen ein Eltern-Konto an (oder melden sich an) und öffnen den
//      Link -> acceptGuardianInvite verknüpft das Konto mit dem Kind.
//   3. Erst mit aktiver Verknüpfung kann das Team das Kind verifizieren und das Kind
//      Aufträge annehmen (has_guardian_consent in der Datenbank).
//   4. Im Eltern-Konto sehen die Eltern Konto- und Auftragsdaten, geben Aufträge frei
//      und können das Konto pausieren, melden und blockieren.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { coerceDisplayName } from "@/lib/sanitize";
import { assertServiceRole } from "@/lib/server/service-role.server";
import { emailTemplate, getSiteUrl, sendEmail } from "@/lib/server/email.server";
import { notifyUserByEmail } from "@/lib/server/notifications.server";
import { GUARDIAN_CONSENT_VERSION } from "@/lib/consent-texts";
import { deriveVerificationStatus, type VerificationStatus } from "@/lib/verification-status";
import {
  escapeHtml,
  loadJobDetails,
  maskEmail,
  newToken,
  sha256Hex,
  VerificationError,
  type JobDetails,
} from "@/lib/server/verification.server";

export const INVITE_VALID_DAYS = 14;
const RESEND_COOLDOWN_MS = 10 * 60 * 1000;

async function assertYouth(userId: string) {
  const { data: roles, error } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw error;
  if (!(roles ?? []).some((r) => r.role === "helper_youth")) throw new VerificationError("not_youth");
}

/**
 * Erzeugt eine neue Einladung für das Eltern-Konto. Eine frühere offene Einladung wird
 * ungültig. Mit E-Mail: Mail an die Eltern (Einverständniserklärung + Link zum Eltern-Konto).
 * Ohne E-Mail (email = null): kein Versand, der Link wird zurückgegeben, damit das Kind ihn
 * selbst weitergeben kann.
 */
export async function createGuardianInvite(
  childId: string,
  email: string | null,
): Promise<{
  /** Link zum Weitergeben (ohne Anmeldung; legt kein Konto an) */
  link: string;
  emailMasked: string | null;
  /** false, wenn der E-Mail-Versand nicht eingerichtet ist oder fehlgeschlagen ist */
  emailSent: boolean;
  /** Technische Ursache, wenn emailSent === false (für Toast / Admin) */
  emailError: string | null;
  /** Veraltet: Das Eltern-Konto wird jetzt erst auf der Registrierungsseite angelegt (immer false). */
  accountCreated: boolean;
}> {
  await assertServiceRole();
  await assertYouth(childId);

  const { data: open } = await supabaseAdmin
    .from("guardian_links")
    .select("id, status, last_sent_at, invited_email")
    .eq("child_id", childId)
    .in("status", ["invited", "active"])
    .maybeSingle();

  if (open?.status === "active") throw new VerificationError("already_linked");
  if (
    email &&
    open?.invited_email?.toLowerCase() === email.toLowerCase() &&
    open.last_sent_at &&
    Date.now() - new Date(open.last_sent_at).getTime() < RESEND_COOLDOWN_MS
  ) {
    throw new VerificationError("recently_sent");
  }

  if (open) {
    await supabaseAdmin.from("guardian_links").update({ status: "cancelled" }).eq("id", open.id);
  }

  const token = newToken();
  // Eigener Registrierungs-Token: geht NUR per E-Mail an die Eltern (nie an das Kind). Der weiterleitbare
  // Einladungslink (token) bleibt davon getrennt.
  const registrationToken = email ? newToken() : null;
  const { error } = await supabaseAdmin.from("guardian_links").insert({
    child_id: childId,
    status: "invited",
    invited_email: email,
    token_hash: await sha256Hex(token),
    registration_token_hash: registrationToken ? await sha256Hex(registrationToken) : null,
    last_sent_at: email ? new Date().toISOString() : null,
  });
  if (error) throw error;

  // Die E-Mail der Eltern gehört zum Kind-Profil (dorthin gehen auch Auftragsfreigaben).
  await supabaseAdmin
    .from("profile_private")
    .upsert({ id: childId, guardian_email: email }, { onConflict: "id" });

  const link = `${getSiteUrl()}/eltern-einladung/${token}`;
  let emailSent = false;
  let emailError: string | null = null;

  if (email) {
    const { data: child } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("id", childId)
      .maybeSingle();
    const childName = child?.display_name?.trim() || "Ihr Kind";
    const name = escapeHtml(childName);
    const siteUrl = getSiteUrl();

    // Die Eltern bekommen einen Link auf eine eigene Registrierungsseite: Ihre E-Mail-Adresse ist dort schon
    // eingetragen, sie legen nur noch Namen und Passwort fest. Das Konto entsteht erst dort (nicht schon beim
    // Einladen), damit keine halbfertigen Konten ohne Passwort herumliegen.
    const registerUrl = `${siteUrl}/eltern-registrierung/${registrationToken}`;

    const sendResult = await sendEmail({
      to: email,
      subject: `${childName} möchte bei GreenMatch Gartenhilfe anbieten – Ihre Zustimmung wird benötigt`,
      html: emailTemplate({
        badge: "Kinderschutz & Registrierung",
        heading: "Einverständnis und Eltern-Konto für GreenMatch",
        greeting: "Liebe Erziehungsberechtigte,",
        previewText: `${childName} möchte bei GreenMatch helfen – bitte Eltern-Konto anlegen (nur Passwort festlegen).`,
        bodyLines: [
          `<strong>${name}</strong> möchte über GreenMatch leichte Gartenarbeiten in der Nachbarschaft anbieten. Das ist für Jugendliche ab 13 Jahren nur mit Ihrer Zustimmung möglich.`,
          "Über den Button unten gelangen Sie auf eine eigene Seite für Eltern. Ihre E-Mail-Adresse ist dort bereits eingetragen – Sie müssen nur noch Ihren Namen und ein Passwort festlegen. Das Eltern-Konto ist kostenlos.",
          "<strong>Ihre nächsten Schritte:</strong><br/>1. Eltern-Konto anlegen (Button unten, nur Passwort festlegen).<br/>2. Einverständniserklärung ausdrucken, unterschreiben und zusammen mit den Ausweisen von Ihnen und Ihrem Kind hochladen lassen.<br/>3. Unser Team prüft die Unterlagen – danach kann Ihr Kind Aufträge annehmen.",
          "<strong>Warum ein Eltern-Konto Pflicht ist:</strong> Sie sehen Ort, Zeit, Auftraggeber und Art der Tätigkeit, geben jeden Auftrag einzeln frei und können das Konto jederzeit pausieren sowie Personen melden oder blockieren.",
          "Jugendschutz: höchstens 2 Stunden pro Tag, nur zwischen 08:00 und 18:00 Uhr, nicht während des Schulunterrichts, nur leichte und ungefährliche Tätigkeiten.",
          `Einverständniserklärung zum Ausdrucken: <a href="${siteUrl}/einverstaendniserklaerung" style="color:#15803d;font-weight:600;">${siteUrl}/einverstaendniserklaerung</a>`,
          `Falls der Button nicht funktioniert, nutzen Sie diesen Link: <a href="${escapeHtml(registerUrl)}" style="color:#15803d;word-break:break-all;">${escapeHtml(registerUrl)}</a>`,
          `Der Link ist ${INVITE_VALID_DAYS} Tage gültig. Wenn Sie nicht zustimmen möchten, ignorieren Sie diese E-Mail einfach.`,
        ],
        infoTable: [
          { label: "Kind", value: name },
          { label: "Plattform", value: "GreenMatch – Gartenhilfe in der Nachbarschaft" },
          { label: "Gültigkeit", value: `${INVITE_VALID_DAYS} Tage` },
        ],
        trustNotice:
          "🛡️ <strong>Sicherer Nachbarschaftsservice:</strong> Alle Aufträge werden auf Jugendschutz geprüft. Ohne Ihre Freigabe kann kein Auftrag angenommen werden.",
        ctaLabel: "Eltern-Konto anlegen",
        ctaUrl: registerUrl,
        footer:
          "Sie erhalten diese E-Mail, weil Ihr Kind Ihre Adresse bei GreenMatch angegeben hat. Wenn Sie das nicht erwartet haben, können Sie sie ignorieren.",
      }),
    });
    emailSent = sendResult.ok;
    emailError = sendResult.ok ? null : sendResult.error;
  }

  return {
    link,
    emailMasked: email ? maskEmail(email) : null,
    emailSent,
    emailError,
    accountCreated: false,
  };
}

export type InviteLookup =
  | { state: "invalid" }
  | { state: "expired" | "open"; childName: string };

export async function lookupGuardianInvite(token: string): Promise<InviteLookup> {
  const { data: link } = await supabaseAdmin
    .from("guardian_links")
    .select("child_id, status, created_at, last_sent_at")
    .eq("token_hash", await sha256Hex(token))
    .eq("status", "invited")
    .maybeSingle();
  if (!link) return { state: "invalid" };

  const { data: child } = await supabaseAdmin
    .from("profiles")
    .select("display_name")
    .eq("id", link.child_id)
    .maybeSingle();
  const sent = new Date(link.last_sent_at ?? link.created_at).getTime();
  const expired = Date.now() - sent > INVITE_VALID_DAYS * 24 * 60 * 60 * 1000;
  return { state: expired ? "expired" : "open", childName: child?.display_name?.trim() || "Ihr Kind" };
}

const INVITE_VALID_MS = INVITE_VALID_DAYS * 24 * 60 * 60 * 1000;

interface OpenLink {
  id: string;
  child_id: string;
  invited_email: string | null;
  created_at: string;
  last_sent_at: string | null;
}

function isExpired(link: Pick<OpenLink, "created_at" | "last_sent_at">): boolean {
  return Date.now() - new Date(link.last_sent_at ?? link.created_at).getTime() > INVITE_VALID_MS;
}

/** Offene Einladung zum Registrierungs-Token (aus der Eltern-Mail) oder null. */
async function findLinkByRegistrationToken(token: string): Promise<OpenLink | null> {
  const { data } = await supabaseAdmin
    .from("guardian_links")
    .select("id, child_id, invited_email, created_at, last_sent_at")
    .eq("registration_token_hash", await sha256Hex(token))
    .eq("status", "invited")
    .maybeSingle();
  return (data as OpenLink | null) ?? null;
}

/** Verknüpft das angemeldete Konto als Eltern-Konto mit dem Kind. */
export async function acceptGuardianInvite(
  guardianUserId: string,
  token: string,
): Promise<{ childName: string }> {
  await assertServiceRole();
  const { data: link } = await supabaseAdmin
    .from("guardian_links")
    .select("id, child_id, invited_email, created_at, last_sent_at")
    .eq("token_hash", await sha256Hex(token))
    .eq("status", "invited")
    .maybeSingle();
  if (!link) throw new VerificationError("invalid_token");
  return completeGuardianLink(link as OpenLink, guardianUserId);
}

/**
 * Gemeinsamer Abschluss: prüft das Eltern-Konto und aktiviert die Verknüpfung.
 * Wird vom weiterleitbaren Einladungslink UND von der Registrierungsseite (E-Mail-Link) genutzt.
 */
async function completeGuardianLink(
  link: OpenLink,
  guardianUserId: string,
): Promise<{ childName: string }> {
  if (isExpired(link)) throw new VerificationError("expired");
  if (link.child_id === guardianUserId) throw new VerificationError("own_account");

  // Ein Jugendlichen-Konto kann kein Eltern-Konto sein.
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", guardianUserId);
  if ((roles ?? []).some((r) => r.role === "helper_youth")) throw new VerificationError("guardian_is_youth");

  const { data: auth } = await supabaseAdmin.auth.admin.getUserById(guardianUserId);
  if (!auth?.user?.email_confirmed_at) throw new VerificationError("email_not_confirmed");

  // Das Profil wird bei der Registrierung mit dem E-Mail-Anfang als Name angelegt. Für den
  // Abgleich mit dem Ausweis (Team) übernehmen wir den angegebenen vollen Namen.
  // Der Name stammt aus nutzergesteuerten Metadaten: nur bereinigt übernehmen (XSS-Schutz).
  const fullName = coerceDisplayName(auth.user.user_metadata?.full_name, "");
  if (fullName) {
    const { data: gp } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("id", guardianUserId)
      .maybeSingle();
    const emailStart = (auth.user.email ?? "").split("@")[0];
    if (gp && gp.display_name === emailStart) {
      await supabaseAdmin.from("profiles").update({ display_name: fullName }).eq("id", guardianUserId);
    }
  }

  const nowIso = new Date().toISOString();
  const { data: updated, error } = await supabaseAdmin
    .from("guardian_links")
    .update({
      status: "active",
      guardian_user_id: guardianUserId,
      accepted_at: nowIso,
      token_hash: null, // Einladung ist einmalig
      registration_token_hash: null,
    })
    .eq("id", link.id)
    .eq("status", "invited")
    .select("id");
  if (error) throw error;
  if (!updated || updated.length === 0) throw new VerificationError("invalid_token");

  const { data: child } = await supabaseAdmin
    .from("profiles")
    .select("display_name")
    .eq("id", link.child_id)
    .maybeSingle();

  await notifyUserByEmail({
    userId: link.child_id,
    category: "gig_updates",
    subject: "Dein Eltern-Konto ist verknüpft",
    html: emailTemplate({
      heading: "Eltern-Konto verknüpft",
      bodyLines: [
        "Deine Eltern haben ihr Eltern-Konto mit deinem Konto verknüpft. Fehlen nur noch die Unterlagen (Einverständniserklärung und Ausweise), falls du sie noch nicht eingereicht hast.",
      ],
      ctaLabel: "Zur Verifizierung",
      ctaPath: "/profile",
    }),
    inApp: {
      title: "Eltern-Konto verknüpft",
      body: "Reiche jetzt die Unterlagen ein, falls noch nicht geschehen.",
      link: "/profile",
    },
  });

  return { childName: child?.display_name?.trim() || "Ihr Kind" };
}

// ---------------------------------------------------------------------------
// Eltern-Registrierung per E-Mail-Link (/eltern-registrierung/<token>)
// ---------------------------------------------------------------------------

export type RegistrationLookup =
  | { state: "invalid" }
  | { state: "expired"; childName: string }
  | { state: "open"; childName: string; email: string };

/**
 * Daten für die Registrierungsseite. Der Token wurde ausschließlich an die Eltern-E-Mail gesendet; wer ihn
 * kennt, hat die Mail erhalten - deshalb darf die Adresse hier vollständig angezeigt (vorausgefüllt) werden.
 */
export async function lookupGuardianRegistration(token: string): Promise<RegistrationLookup> {
  const link = await findLinkByRegistrationToken(token);
  if (!link || !link.invited_email) return { state: "invalid" };
  const { data: child } = await supabaseAdmin
    .from("profiles")
    .select("display_name")
    .eq("id", link.child_id)
    .maybeSingle();
  const childName = child?.display_name?.trim() || "Ihr Kind";
  if (isExpired(link)) return { state: "expired", childName };
  return { state: "open", childName, email: link.invited_email };
}

/**
 * Legt das Eltern-Konto mit der eingeladenen E-Mail-Adresse an und verknüpft es sofort mit dem Kind.
 * Die E-Mail-Adresse gilt als bestätigt, weil der Token nur per E-Mail an diese Adresse ging.
 * Die Adresse kommt aus der Einladung - sie wird NICHT vom Browser übernommen.
 */
export async function registerGuardianFromEmailLink(input: {
  token: string;
  fullName: string;
  password: string;
}): Promise<{ email: string; childName: string }> {
  await assertServiceRole();
  const link = await findLinkByRegistrationToken(input.token);
  if (!link || !link.invited_email) throw new VerificationError("invalid_token");
  if (isExpired(link)) throw new VerificationError("expired");
  const email = link.invited_email.trim().toLowerCase();

  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName, signup_role: "guardian" },
  });
  if (error || !created?.user) {
    const code = (error as { code?: string } | null)?.code ?? "";
    const msg = (error?.message ?? "").toLowerCase();
    if (code === "email_exists" || msg.includes("already") || msg.includes("registered")) {
      throw new VerificationError("account_exists");
    }
    if (code === "weak_password" || msg.includes("password")) {
      throw new VerificationError("weak_password");
    }
    console.error("[Eltern-Registrierung] Konto konnte nicht angelegt werden:", error?.message);
    throw new VerificationError("register_failed");
  }

  try {
    const res = await completeGuardianLink(link, created.user.id);
    return { email, childName: res.childName };
  } catch (e) {
    // Konto existiert, Verknüpfung nicht: nicht stillschweigend scheitern, die Eltern können sich anmelden
    // und über denselben Link (Anmelden-Variante) verknüpfen. Ein verwaistes Konto wird NICHT gelöscht,
    // weil die Eltern das Passwort bereits vergeben haben.
    console.error("[Eltern-Registrierung] Verknüpfung nach Kontoanlage fehlgeschlagen:", (e as Error)?.message);
    throw e;
  }
}

/**
 * Für Eltern, die mit dieser E-Mail-Adresse schon ein Konto haben: nach der Anmeldung auf der
 * Registrierungsseite wird das angemeldete Konto verknüpft. Die E-Mail-Adresse des Kontos muss zur
 * eingeladenen Adresse passen.
 */
export async function acceptGuardianByRegistrationToken(
  guardianUserId: string,
  token: string,
): Promise<{ childName: string }> {
  await assertServiceRole();
  const link = await findLinkByRegistrationToken(token);
  if (!link || !link.invited_email) throw new VerificationError("invalid_token");
  const { data: auth } = await supabaseAdmin.auth.admin.getUserById(guardianUserId);
  if ((auth?.user?.email ?? "").trim().toLowerCase() !== link.invited_email.trim().toLowerCase()) {
    throw new VerificationError("email_mismatch");
  }
  return completeGuardianLink(link, guardianUserId);
}

// ---------------------------------------------------------------------------
// Eltern-Konto: Überblick
// ---------------------------------------------------------------------------

export interface GuardianApprovalItem {
  requestId: string;
  status: "pending" | "approved" | "declined" | "expired";
  createdAt: string;
  expiresAt: string | null;
  job: JobDetails & { customerId: string };
}

export interface GuardianChildOverview {
  childId: string;
  childName: string;
  verifiedAt: string | null;
  suspended: boolean;
  paused: boolean;
  /** Eltern haben die Einwilligung zur Nutzung ausdrücklich abgegeben */
  consentGiven: boolean;
  linkedSince: string | null;
  approvals: GuardianApprovalItem[];
  blockedUserIds: string[];
}

export async function getGuardianOverview(
  guardianUserId: string,
): Promise<{ children: GuardianChildOverview[]; verification: GuardianVerification }> {
  const verification = await getGuardianVerification(guardianUserId);
  const { data: links } = await supabaseAdmin
    .from("guardian_links")
    .select("child_id, paused_at, accepted_at, consent_given_at")
    .eq("guardian_user_id", guardianUserId)
    .eq("status", "active");

  const children: GuardianChildOverview[] = [];
  for (const link of links ?? []) {
    const [{ data: profile }, { data: requests }, { data: blocks }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("display_name, verified_at, suspended_at")
        .eq("id", link.child_id)
        .maybeSingle(),
      supabaseAdmin
        .from("verification_requests")
        .select("id, status, created_at, expires_at, gig_id")
        .eq("user_id", link.child_id)
        .eq("kind", "job_approval")
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(25),
      supabaseAdmin.from("user_blocks").select("blocked_id").eq("blocker_id", link.child_id),
    ]);

    const approvals: GuardianApprovalItem[] = [];
    for (const r of requests ?? []) {
      if (!r.gig_id) continue;
      const job = await loadJobDetails(r.gig_id);
      if (!job) continue;
      const status: GuardianApprovalItem["status"] =
        r.status === "pending" && r.expires_at && new Date(r.expires_at) < new Date()
          ? "expired"
          : (r.status as GuardianApprovalItem["status"]);
      approvals.push({
        requestId: r.id,
        status,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
        job,
      });
    }

    children.push({
      childId: link.child_id,
      childName: profile?.display_name?.trim() || "Kind",
      verifiedAt: profile?.verified_at ?? null,
      suspended: Boolean(profile?.suspended_at),
      paused: Boolean(link.paused_at),
      consentGiven: Boolean(link.consent_given_at),
      linkedSince: link.accepted_at,
      approvals,
      blockedUserIds: (blocks ?? []).map((b) => b.blocked_id),
    });
  }
  return { children, verification };
}

/** Prüft, dass guardianUserId das aktive Eltern-Konto von childId ist. */
export async function assertIsGuardianOf(guardianUserId: string, childId: string) {
  const { data } = await supabaseAdmin
    .from("guardian_links")
    .select("id")
    .eq("child_id", childId)
    .eq("guardian_user_id", guardianUserId)
    .eq("status", "active")
    .maybeSingle();
  if (!data) throw new VerificationError("forbidden");
}

/** Eltern pausieren / reaktivieren das Konto des Kindes (Sperre durch die Eltern). */
export async function setChildPaused(guardianUserId: string, childId: string, paused: boolean) {
  await assertIsGuardianOf(guardianUserId, childId);
  const { error } = await supabaseAdmin
    .from("guardian_links")
    .update({ paused_at: paused ? new Date().toISOString() : null })
    .eq("child_id", childId)
    .eq("guardian_user_id", guardianUserId)
    .eq("status", "active");
  if (error) throw error;

  await notifyUserByEmail({
    userId: childId,
    category: "gig_updates",
    subject: paused ? "Deine Eltern haben dein Konto pausiert" : "Dein Konto ist wieder aktiv",
    html: emailTemplate({
      heading: paused ? "Konto pausiert" : "Konto wieder aktiv",
      bodyLines: [
        paused
          ? "Deine Eltern haben dein Konto pausiert. Du kannst vorerst keine Gebote abgeben und keine Aufträge annehmen. Sprich am besten kurz mit ihnen."
          : "Deine Eltern haben dein Konto wieder freigeschaltet. Für jeden Auftrag fragen wir sie weiterhin einzeln.",
      ],
      ctaLabel: "Zum Dashboard",
      ctaPath: "/dashboard",
    }),
    inApp: {
      title: paused ? "Konto pausiert" : "Konto wieder aktiv",
      body: paused ? "Deine Eltern haben dein Konto pausiert." : "Du kannst wieder bieten.",
      link: "/dashboard",
    },
  });
}

/**
 * Eltern-E-Mail ändern: speichert die neue Adresse und verwirft offene Auftragsfreigaben an die
 * alte Adresse (beim nächsten Annehmen geht die Anfrage an die neue). Ist die Einladung noch
 * offen, geht sie an die neue Adresse.
 */
export async function changeGuardianEmail(childId: string, email: string): Promise<void> {
  await assertServiceRole();
  await assertYouth(childId);
  const { error } = await supabaseAdmin
    .from("profile_private")
    .upsert({ id: childId, guardian_email: email }, { onConflict: "id" });
  if (error) throw error;

  await supabaseAdmin
    .from("verification_requests")
    .update({ status: "cancelled", decided_at: new Date().toISOString() })
    .eq("kind", "job_approval")
    .eq("user_id", childId)
    .eq("status", "pending");

  const { data: open } = await supabaseAdmin
    .from("guardian_links")
    .select("status")
    .eq("child_id", childId)
    .eq("status", "invited")
    .maybeSingle();
  if (open) await createGuardianInvite(childId, email);
}

// ---------------------------------------------------------------------------
// Verifizierung des Eltern-Kontos, Einwilligung, Verknüpfung beenden
// ---------------------------------------------------------------------------

export interface GuardianVerification {
  status: VerificationStatus;
  rejectedReason: string | null;
}

/** Status der Identitäts- und Altersprüfung des Eltern-Kontos selbst. */
export async function getGuardianVerification(guardianUserId: string): Promise<GuardianVerification> {
  const [{ data: profile }, { data: requests }] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("verified_at, reverification_required_at, suspended_at")
      .eq("id", guardianUserId)
      .maybeSingle(),
    supabaseAdmin
      .from("verification_requests")
      .select("status, note")
      .eq("user_id", guardianUserId)
      .eq("kind", "identity")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  const last = requests?.[0];
  return {
    status: deriveVerificationStatus({
      verifiedAt: profile?.verified_at ?? null,
      reverificationRequiredAt: profile?.reverification_required_at ?? null,
      suspendedAt: profile?.suspended_at ?? null,
      hasPendingRequest: last?.status === "pending",
      lastRequestDeclined: last?.status === "declined",
    }),
    rejectedReason: last?.status === "declined" ? (last.note ?? null) : null,
  };
}

/**
 * Ausdrückliche Einwilligung der Eltern zur Nutzung der Plattform durch das Kind.
 * Nur mit verifiziertem Eltern-Konto. Erst danach kann das Kind aktiv werden.
 */
export async function confirmGuardianConsent(guardianUserId: string, childId: string) {
  await assertIsGuardianOf(guardianUserId, childId);
  const { data: verified } = await supabaseAdmin.rpc("is_verified", { _user_id: guardianUserId });
  if (!verified) throw new VerificationError("guardian_not_verified");

  const { error } = await supabaseAdmin
    .from("guardian_links")
    .update({
      consent_given_at: new Date().toISOString(),
      consent_text_version: GUARDIAN_CONSENT_VERSION,
    })
    .eq("child_id", childId)
    .eq("guardian_user_id", guardianUserId)
    .eq("status", "active")
    .is("consent_given_at", null);
  if (error) throw error;

  await notifyUserByEmail({
    userId: childId,
    category: "gig_updates",
    subject: "Deine Eltern haben zugestimmt",
    html: emailTemplate({
      heading: "Einwilligung deiner Eltern liegt vor",
      bodyLines: [
        "Deine Eltern haben der Nutzung von GreenMatch zugestimmt. Für jeden einzelnen Auftrag fragen wir sie weiterhin gesondert.",
      ],
      ctaLabel: "Zum Profil",
      ctaPath: "/profile",
    }),
    inApp: { title: "Einwilligung deiner Eltern liegt vor", link: "/profile" },
  });
}

/**
 * Eltern beenden die Verknüpfung. Das Kind ist damit automatisch für neue Aufträge gesperrt
 * (has_guardian_consent wird falsch). Offene und erteilte Freigaben erlöschen; noch nicht
 * begonnene Aufträge gehen zurück auf "wartet auf Helfer".
 */
export async function endGuardianLink(guardianUserId: string, childId: string) {
  await assertIsGuardianOf(guardianUserId, childId);
  const nowIso = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from("guardian_links")
    .update({ status: "revoked", ended_at: nowIso, ended_by: guardianUserId })
    .eq("child_id", childId)
    .eq("guardian_user_id", guardianUserId)
    .eq("status", "active");
  if (error) throw error;

  await cancelOpenApprovals(childId);

  await notifyUserByEmail({
    userId: childId,
    category: "gig_updates",
    subject: "Die Verknüpfung mit deinem Eltern-Konto wurde beendet",
    html: emailTemplate({
      heading: "Eltern-Konto getrennt",
      bodyLines: [
        "Deine Eltern haben die Verknüpfung beendet. Du kannst keine neuen Aufträge annehmen, bis ein Eltern-Konto wieder verknüpft ist und zugestimmt hat. Offene Freigaben sind erloschen.",
      ],
      ctaLabel: "Zur Verifizierung",
      ctaPath: "/profile",
    }),
    inApp: { title: "Eltern-Konto getrennt", body: "Neue Aufträge sind gesperrt.", link: "/profile" },
  });
}

/**
 * Lässt alle offenen und erteilten Auftragsfreigaben eines Kindes erlöschen. Noch nicht begonnene
 * Aufträge gehen zurück auf "wartet auf Helfer" - ohne neue Freigabe kann nichts starten.
 */
export async function cancelOpenApprovals(childId: string) {
  const nowIso = new Date().toISOString();
  const { data: open } = await supabaseAdmin
    .from("verification_requests")
    .select("id, gig_id, status")
    .eq("user_id", childId)
    .eq("kind", "job_approval")
    .in("status", ["pending", "approved"]);
  for (const r of open ?? []) {
    await supabaseAdmin
      .from("verification_requests")
      .update({ status: "cancelled", decided_at: nowIso })
      .eq("id", r.id);
    if (r.status === "approved" && r.gig_id) {
      await supabaseAdmin
        .from("gigs")
        .update({ status: "pending_helper" })
        .eq("id", r.gig_id)
        .eq("status", "assigned");
    }
  }
}

/**
 * Pausiert Jugendliche automatisch (z. B. nach einer schweren Meldung) und informiert die Eltern.
 * Gibt die IDs der pausierten Kinder zurück.
 */
export async function pauseChildrenAndNotifyGuardians(childIds: string[], reasonText: string): Promise<string[]> {
  const paused: string[] = [];
  for (const childId of childIds) {
    const { data: link } = await supabaseAdmin
      .from("guardian_links")
      .select("guardian_user_id")
      .eq("child_id", childId)
      .eq("status", "active")
      .maybeSingle();
    if (!link) continue;
    await supabaseAdmin
      .from("guardian_links")
      .update({ paused_at: new Date().toISOString() })
      .eq("child_id", childId)
      .eq("status", "active");
    paused.push(childId);
    await cancelOpenApprovals(childId);

    const [{ data: child }, recipients] = await Promise.all([
      supabaseAdmin.from("profiles").select("display_name").eq("id", childId).maybeSingle(),
      link.guardian_user_id
        ? supabaseAdmin.auth.admin.getUserById(link.guardian_user_id).then((r) => (r.data?.user?.email ? [r.data.user.email] : []))
        : Promise.resolve([] as string[]),
    ]);
    const name = child?.display_name?.trim() || "Ihr Kind";
    await Promise.all(
      recipients.map((to) =>
        sendEmail({
          to,
          subject: `Sicherheitsmeldung: Das Konto von ${name} wurde vorsorglich pausiert`,
          html: emailTemplate({
            heading: "Sicherheitsmeldung",
            bodyLines: [
              `Zu einem Auftrag oder Kontakt von <strong>${escapeHtml(name)}</strong> liegt eine Sicherheitsmeldung vor: ${escapeHtml(reasonText)}`,
              "Wir haben das Konto vorsorglich pausiert, neue Aufträge sind nicht möglich. Unser Team prüft die Meldung. Sie können die Pause im Eltern-Konto nach Rücksprache mit Ihrem Kind aufheben.",
              "Bei akuter Gefahr: Notruf 112.",
            ],
            ctaLabel: "Zum Eltern-Konto",
            ctaPath: "/eltern",
            footer: "Sie erhalten diese E-Mail, weil Ihr Kind bei GreenMatch mit Ihrem Eltern-Konto verknüpft ist.",
          }),
        }),
      ),
    );
  }
  return paused;
}

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
import { emailTemplate, sendEmail, SITE_URL } from "@/lib/server/email.server";
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
  const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
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
): Promise<{ link: string; emailMasked: string | null }> {
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
  const { error } = await supabaseAdmin.from("guardian_links").insert({
    child_id: childId,
    status: "invited",
    invited_email: email,
    token_hash: await sha256Hex(token),
    last_sent_at: email ? new Date().toISOString() : null,
  });
  if (error) throw error;

  // Die E-Mail der Eltern gehört zum Kind-Profil (dorthin gehen auch Auftragsfreigaben).
  await supabaseAdmin
    .from("profile_private")
    .upsert({ id: childId, guardian_email: email }, { onConflict: "id" });

  const link = `${SITE_URL}/eltern-einladung/${token}`;

  if (email) {
    const { data: child } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("id", childId)
      .maybeSingle();
    const childName = child?.display_name?.trim() || "Ihr Kind";
    const name = escapeHtml(childName);
    await sendEmail({
      to: email,
      subject: `${childName} möchte bei GreenMatch Gartenhilfe anbieten – Ihre Zustimmung wird benötigt`,
      html: emailTemplate({
        heading: "Einverständniserklärung und Eltern-Konto",
        bodyLines: [
          `<strong>${name}</strong> möchte bei GreenMatch leichte Gartenarbeiten für Nachbarn übernehmen. Das ist ab 13 Jahren nur mit Ihrer Zustimmung möglich.`,
          "<strong>Was jetzt zu tun ist:</strong><br/>1. Eltern-Konto anlegen (kostenlos) – über den Button unten.<br/>2. Einverständniserklärung ausdrucken, unterschreiben und gemeinsam mit den Ausweisen von Ihnen und Ihrem Kind hochladen lassen.<br/>3. Danach prüft unser Team die Unterlagen.",
          "<strong>Ihr Eltern-Konto ist Pflicht</strong> – es dient der Sicherheit Ihres Kindes: Dort sehen Sie alle Auftragsdaten (Ort, Zeit, Auftraggeber, Art der Tätigkeit), geben jeden einzelnen Auftrag frei und können das Konto jederzeit pausieren sowie Auftraggeber melden oder blockieren.",
          "Für Jugendliche gelten höchstens 2 Stunden pro Tag, nur zwischen 08:00 und 18:00 Uhr, nicht während des Schulunterrichts und nur leichte, ungefährliche Tätigkeiten.",
          `Die Einverständniserklärung zum Ausdrucken: <a href="${SITE_URL}/einverstaendniserklaerung">${SITE_URL}/einverstaendniserklaerung</a>`,
          `Der Link ist ${INVITE_VALID_DAYS} Tage gültig. Wenn Sie nicht zustimmen möchten, ignorieren Sie diese E-Mail einfach.`,
        ],
        ctaLabel: "Eltern-Konto anlegen",
        ctaPath: `/eltern-einladung/${token}`,
        footer:
          "Sie erhalten diese E-Mail, weil Ihr Kind Ihre Adresse bei GreenMatch angegeben hat. Wenn Sie das nicht erwartet haben, können Sie sie ignorieren.",
      }),
    });
  }

  return { link, emailMasked: email ? maskEmail(email) : null };
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

/** Verknüpft das angemeldete Konto als Eltern-Konto mit dem Kind. */
export async function acceptGuardianInvite(
  guardianUserId: string,
  token: string,
): Promise<{ childName: string }> {
  const { data: link } = await supabaseAdmin
    .from("guardian_links")
    .select("id, child_id, created_at, last_sent_at")
    .eq("token_hash", await sha256Hex(token))
    .eq("status", "invited")
    .maybeSingle();
  if (!link) throw new VerificationError("invalid_token");

  const sent = new Date(link.last_sent_at ?? link.created_at).getTime();
  if (Date.now() - sent > INVITE_VALID_DAYS * 24 * 60 * 60 * 1000) throw new VerificationError("expired");
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
  const fullName = (auth.user.user_metadata?.full_name as string | undefined)?.trim();
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
  const { error } = await supabaseAdmin
    .from("guardian_links")
    .update({
      status: "active",
      guardian_user_id: guardianUserId,
      accepted_at: nowIso,
      token_hash: null, // Einladung ist einmalig
    })
    .eq("id", link.id)
    .eq("status", "invited");
  if (error) throw error;

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

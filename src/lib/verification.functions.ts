import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CUSTOMER_RULES_VERSION, HELPER_SAFETY_VERSION } from "@/lib/consent-texts";
import { deriveVerificationStatus, type VerificationStatus } from "@/lib/verification-status";

/**
 * Verifizierung in GreenMatch - ein Button, je nach Alter ein anderer Weg:
 *
 *  - Jugendliche (13-17): Eltern-Zusatzkonto (Pflicht) + Einverständniserklärung und
 *    Ausweise von Eltern und Kind, geprüft durch das Team ("youth_documents").
 *  - Erwachsene / Profis / Kunden: Prüfung durch das GreenMatch-Team ("identity").
 *    Bei Profis z.B. anhand von Gewerbeanmeldung und USt-IdNr.
 *
 * Ergebnis ist in beiden Fällen profiles.verified_at (+ verification_method).
 */

export type VerificationKind = "youth" | "adult" | "pro" | "customer";
export type RequestState = "none" | "pending" | "approved" | "declined" | "expired";

export interface MyVerification {
  kind: VerificationKind | null;
  verifiedAt: string | null;
  method: "guardian_consent" | "admin_review" | null;
  emailConfirmed: boolean | null;
  /** Einheitlicher Status: Nicht begonnen / In Prüfung / Verifiziert / Abgelehnt / Erneute Prüfung erforderlich / Gesperrt */
  status: VerificationStatus;
  /** Bestätigungen: Helfer-Sicherheitsinfos, Auftraggeber-Kinderschutzregeln */
  consents: { helperSafetyAccepted: boolean; customerRulesAccepted: boolean };
  guardian: {
    state: RequestState;
    emailMasked: string | null;
    sentAt: string | null;
    expiresAt: string | null;
    reason: string | null;
  } | null;
  identity: { state: RequestState; sentAt: string | null } | null;
  /** Eltern-Zusatzkonto (nur Jugendliche): Pflichtschritt */
  guardianAccount: {
    state: "none" | "invited" | "active";
    paused: boolean;
    inviteEmailMasked: string | null;
    /** true, wenn das Kind "ohne E-Mail" gewählt hat (Link wird selbst weitergegeben) */
    inviteWithoutEmail: boolean;
    sentAt: string | null;
    /** Eltern-Konto ist verknüpft, aber Einwilligung/Verifizierung der Eltern fehlt noch */
    consentGiven: boolean;
    guardianVerified: boolean;
    /** "Elternbestätigung ausstehend" bis Konto, Verifizierung und Einwilligung vollständig sind */
    parentConfirmation: "pending" | "complete";
  } | null;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}

function effectiveState(
  status: string | undefined,
  expiresAt: string | null | undefined,
): RequestState {
  if (!status) return "none";
  if (status === "pending" && expiresAt && new Date(expiresAt) < new Date()) return "expired";
  if (status === "pending" || status === "approved" || status === "declined" || status === "expired") {
    return status;
  }
  return "none"; // cancelled
}

export const getMyVerification = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyVerification> => {
    const { supabase, userId } = context;

    const [rolesRes, profileRes, privRes, reqRes, linkRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase
        .from("profiles")
        .select("verified_at, verification_method, reverification_required_at, suspended_at")
        .eq("id", userId)
        .maybeSingle(),
      supabase.from("profile_private").select("guardian_email").eq("id", userId).maybeSingle(),
      supabase
        .from("verification_requests")
        .select("kind, status, created_at, expires_at, guardian_email, note")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("guardian_links")
        .select("status, paused_at, invited_email, last_sent_at, created_at, consent_given_at, guardian_user_id")
        .eq("child_id", userId)
        .in("status", ["invited", "active"])
        .maybeSingle(),
    ]);
    if (rolesRes.error) throw rolesRes.error;

    const roles = (rolesRes.data ?? []).map((r) => r.role as string);
    const kind: VerificationKind | null = roles.includes("helper_youth")
      ? "youth"
      : roles.includes("helper_pro")
        ? "pro"
        : roles.includes("helper_adult")
          ? "adult"
          : roles.includes("customer")
            ? "customer"
            : null;

    let emailConfirmed: boolean | null = null;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
      emailConfirmed = Boolean(data?.user?.email_confirmed_at);
    } catch {
      emailConfirmed = null;
    }

    const { data: consentRows } = await supabase
      .from("user_consents")
      .select("kind, text_version")
      .eq("user_id", userId);
    const hasConsent = (kind: string, version: string) =>
      (consentRows ?? []).some((c) => c.kind === kind && c.text_version === version);

    let guardianVerified = false;
    if (linkRes.data?.guardian_user_id) {
      const { data: gp } = await supabase
        .from("profiles")
        .select("verified_at, reverification_required_at, suspended_at")
        .eq("id", linkRes.data.guardian_user_id)
        .maybeSingle();
      guardianVerified = Boolean(gp?.verified_at && !gp.reverification_required_at && !gp.suspended_at);
    }

    const requests = (reqRes.data ?? []).filter((r) => r.status !== "cancelled");
    const latestGuardian = requests.find((r) => r.kind === "youth_documents");
    const latestIdentity = requests.find((r) => r.kind === "identity");
    const guardianEmail = privRes.data?.guardian_email ?? null;

    return {
      kind,
      verifiedAt: profileRes.data?.verified_at ?? null,
      method:
        (profileRes.data?.verification_method as MyVerification["method"] | undefined) ?? null,
      emailConfirmed,
      status: deriveVerificationStatus({
        verifiedAt: profileRes.data?.verified_at ?? null,
        reverificationRequiredAt: profileRes.data?.reverification_required_at ?? null,
        suspendedAt: profileRes.data?.suspended_at ?? null,
        hasPendingRequest: (kind === "youth" ? latestGuardian : latestIdentity)?.status === "pending",
        lastRequestDeclined: (kind === "youth" ? latestGuardian : latestIdentity)?.status === "declined",
      }),
      consents: {
        helperSafetyAccepted: hasConsent("helper_safety_info", HELPER_SAFETY_VERSION),
        customerRulesAccepted: hasConsent("customer_child_protection_rules", CUSTOMER_RULES_VERSION),
      },
      guardian:
        kind === "youth"
          ? {
              state: effectiveState(latestGuardian?.status, latestGuardian?.expires_at),
              emailMasked: guardianEmail ? maskEmail(guardianEmail) : null,
              sentAt: latestGuardian?.created_at ?? null,
              expiresAt: null,
              reason: latestGuardian?.status === "declined" ? (latestGuardian.note ?? null) : null,
            }
          : null,
      guardianAccount:
        kind === "youth"
          ? {
              state: linkRes.data ? (linkRes.data.status as "invited" | "active") : "none",
              paused: Boolean(linkRes.data?.paused_at),
              inviteEmailMasked: linkRes.data?.invited_email ? maskEmail(linkRes.data.invited_email) : null,
              inviteWithoutEmail: Boolean(linkRes.data) && !linkRes.data?.invited_email,
              sentAt: linkRes.data?.last_sent_at ?? linkRes.data?.created_at ?? null,
              consentGiven: Boolean(linkRes.data?.consent_given_at),
              guardianVerified,
              parentConfirmation:
                linkRes.data?.status === "active" && linkRes.data.consent_given_at && guardianVerified
                  ? "complete"
                  : "pending",
            }
          : null,
      identity:
        kind && kind !== "youth"
          ? {
              state: effectiveState(latestIdentity?.status, null),
              sentAt: latestIdentity?.created_at ?? null,
            }
          : null,
    };
  });

/** Bucket und Dateiname für die Ausweisprüfung (Erwachsene, Profis, Auftraggeber). */
export const IDENTITY_DOC_BUCKET = "verification-docs";
export const IDENTITY_DOC_KEY = "identity_id";

/**
 * Erwachsene/Profis/Auftraggeber: Ausweisprüfung durch das Team beantragen.
 * Der Ausweis (geschwärzte Kopie) wird vorher direkt in den privaten Bucket hochgeladen,
 * Ordner = <userId>/<submissionId>/identity_id.<ext>. Nach der Prüfung wird die Kopie gelöscht;
 * gespeichert bleiben nur Ergebnis, Datum und Verfahren.
 */
export const requestIdentityVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        submissionId: z.string().uuid(),
        note: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assertServiceRole } = await import("@/lib/server/service-role.server");
    await assertServiceRole();

    const [{ data: roles }, { data: profile }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("profiles").select("verified_at").eq("id", userId).maybeSingle(),
    ]);
    if ((roles ?? []).some((r) => r.role === "helper_youth")) {
      throw new Error("not_available_for_youth");
    }
    if (profile?.verified_at) throw new Error("already_verified");

    const { data: pending } = await supabaseAdmin
      .from("verification_requests")
      .select("id")
      .eq("user_id", userId)
      .eq("kind", "identity")
      .eq("status", "pending")
      .maybeSingle();
    if (pending) return { ok: true as const, alreadyPending: true };

    const folder = `${userId}/${data.submissionId}`;
    const { data: listed, error: listError } = await supabaseAdmin.storage
      .from(IDENTITY_DOC_BUCKET)
      .list(folder);
    if (listError) throw listError;
    const match = (listed ?? []).find((f) => f.name.startsWith(`${IDENTITY_DOC_KEY}.`));
    if (!match) throw new Error("missing_documents:identity_id");

    const { error } = await supabaseAdmin.from("verification_requests").insert({
      user_id: userId,
      kind: "identity",
      status: "pending",
      note: data.note || null,
      documents: { submissionId: data.submissionId, files: { [IDENTITY_DOC_KEY]: `${folder}/${match.name}` } },
    });
    if (error) throw error;
    return { ok: true as const, alreadyPending: false };
  });

// ------------------------------------------------------------------
// Öffentlich (ohne Konto): Der alte Link aus der Eltern-Mail zeigt nur noch die
// Auftragsdaten. Entschieden wird im Eltern-Konto (angemeldet).
// ------------------------------------------------------------------

const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const getGuardianConsentRequest = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ token: tokenSchema }).parse(input))
  .handler(async ({ data }) => {
    const { lookupGuardianConsent } = await import("@/lib/server/verification.server");
    return lookupGuardianConsent(data.token);
  });

export const decideGuardianConsentFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({ token: tokenSchema, decision: z.enum(["approve", "decline", "revoke"]) })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { decideGuardianConsent } = await import("@/lib/server/verification.server");
    return decideGuardianConsent(data.token, data.decision);
  });

// Freigabe pro Auftrag: Details über Token lesbar; Entscheidung nur im Eltern-Konto (decideJobAsGuardian)
export const getJobApprovalRequest = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ token: tokenSchema }).parse(input))
  .handler(async ({ data }) => {
    const { lookupJobApproval } = await import("@/lib/server/verification.server");
    return lookupJobApproval(data.token);
  });

export const decideJobApprovalFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({ token: tokenSchema, decision: z.enum(["approve", "decline", "revoke"]) })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { decideJobApproval } = await import("@/lib/server/verification.server");
    return decideJobApproval(data.token, data.decision);
  });

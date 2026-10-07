import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Verifizierung in GreenMatch - ein Button, je nach Alter ein anderer Weg:
 *
 *  - Jugendliche (13-17): Zustimmung der Eltern per E-Mail-Link ("guardian").
 *    Ausweisprüfung ist für Minderjährige unrealistisch (viele haben noch keinen
 *    Ausweis) und aus Datenschutzsicht unerwünscht.
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
  guardian: {
    state: RequestState;
    emailMasked: string | null;
    sentAt: string | null;
    expiresAt: string | null;
    reason: string | null;
  } | null;
  identity: { state: RequestState; sentAt: string | null } | null;
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

    const [rolesRes, profileRes, privRes, reqRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase
        .from("profiles")
        .select("verified_at, verification_method")
        .eq("id", userId)
        .maybeSingle(),
      supabase.from("profile_private").select("guardian_email").eq("id", userId).maybeSingle(),
      supabase
        .from("verification_requests")
        .select("kind, status, created_at, expires_at, guardian_email, note")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10),
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
      identity:
        kind && kind !== "youth"
          ? {
              state: effectiveState(latestIdentity?.status, null),
              sentAt: latestIdentity?.created_at ?? null,
            }
          : null,
    };
  });

/** Erwachsene/Profis/Kunden: Verifizierung durch das Team beantragen. */
export const requestIdentityVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ note: z.string().trim().max(500).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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

    const { error } = await supabaseAdmin.from("verification_requests").insert({
      user_id: userId,
      kind: "identity",
      status: "pending",
      note: data.note || null,
    });
    if (error) throw error;
    return { ok: true as const, alreadyPending: false };
  });

// ------------------------------------------------------------------
// Öffentlich (ohne Konto): Seite für die Eltern. Zugriff nur mit dem
// geheimen Token aus der E-Mail; Antworten enthalten nur den Anzeigenamen.
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

// Freigabe pro Auftrag (öffentlich, Zugriff nur mit Token aus der Eltern-Mail)
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

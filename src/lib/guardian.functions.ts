import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Eltern-Zusatzkonto (Pflicht für Jugendliche 13-17).
 * Die eigentliche Logik liegt in server/guardian.server.ts (Service-Role).
 */

const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);

// ---- Jugendliche/r ---------------------------------------------------------

/**
 * Lädt die Eltern ein. Mit E-Mail: Mail an die Eltern. Ohne E-Mail ("withoutEmail"): es wird
 * nichts verschickt, stattdessen kommt ein Link zurück, den das Kind den Eltern selbst gibt.
 */
export const inviteGuardian = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .discriminatedUnion("withoutEmail", [
        z.object({ withoutEmail: z.literal(false), email: z.string().trim().email().max(200) }),
        z.object({ withoutEmail: z.literal(true) }),
      ])
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { enforceUserRateLimit } = await import("@/lib/server/rate-limit.server");
    await enforceUserRateLimit(context.userId, "invite_guardian", 5, 3600, "Du hast zu viele Einladungen verschickt. Bitte versuche es später erneut.");
    const { createGuardianInvite } = await import("@/lib/server/guardian.server");
    return createGuardianInvite(context.userId, data.withoutEmail ? null : data.email);
  });

export const changeGuardianEmailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ email: z.string().trim().email().max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { enforceUserRateLimit } = await import("@/lib/server/rate-limit.server");
    await enforceUserRateLimit(context.userId, "guardian_email_change", 5, 3600);
    const { changeGuardianEmail } = await import("@/lib/server/guardian.server");
    await changeGuardianEmail(context.userId, data.email);
    return { ok: true as const };
  });

// ---- Einladung (öffentlich lesen, Annehmen nur angemeldet) -----------------

export const getGuardianInvite = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ token: tokenSchema }).parse(input))
  .handler(async ({ data }) => {
    const { enforceIpRateLimit } = await import("@/lib/server/rate-limit.server");
    await enforceIpRateLimit("token_lookup", 60, 600);
    const { lookupGuardianInvite } = await import("@/lib/server/guardian.server");
    return lookupGuardianInvite(data.token);
  });

export const acceptGuardianInviteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ token: tokenSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { acceptGuardianInvite } = await import("@/lib/server/guardian.server");
    return acceptGuardianInvite(context.userId, data.token);
  });

// ---- Eltern-Konto ----------------------------------------------------------

export const getMyGuardianOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getGuardianOverview } = await import("@/lib/server/guardian.server");
    return getGuardianOverview(context.userId);
  });

export const decideJobAsGuardian = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        requestId: z.string().uuid(),
        decision: z.enum(["approve", "decline", "revoke"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { decideJobApprovalAsGuardian } = await import("@/lib/server/verification.server");
    return decideJobApprovalAsGuardian(context.userId, data.requestId, data.decision);
  });

export const setChildPausedFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ childId: z.string().uuid(), paused: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { setChildPaused } = await import("@/lib/server/guardian.server");
    await setChildPaused(context.userId, data.childId, data.paused);
    return { ok: true as const };
  });

/** Eltern geben die ausdrückliche Einwilligung zur Nutzung durch das Kind (nur mit verifiziertem Eltern-Konto). */
export const confirmGuardianConsentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ childId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { confirmGuardianConsent } = await import("@/lib/server/guardian.server");
    await confirmGuardianConsent(context.userId, data.childId);
    return { ok: true as const };
  });

/** Eltern beenden die Verknüpfung; das Kind ist danach für neue Aufträge gesperrt. */
export const endGuardianLinkFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ childId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { endGuardianLink } = await import("@/lib/server/guardian.server");
    await endGuardianLink(context.userId, data.childId);
    return { ok: true as const };
  });

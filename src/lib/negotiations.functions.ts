import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchProfilesByIds } from "@/lib/profile-lookup";
import {
  counterBidSchema,
  gigIdSchema,
  negotiationIdSchema,
  negotiationInputSchema,
  parseInput,
  rebidSchema,
} from "@/lib/validation";
import {
  PLATFORM_FEE_CUSTOMER_RATE,
  PLATFORM_FEE_HELPER_RATE,
} from "@/lib/platform-fees";

export interface NegotiationInput {
  gigId: string;
  bidCents: number;
  message?: string;
}

export interface Negotiation {
  id: string;
  gigId: string;
  helperId: string;
  bidCents: number;
  counterBidCents: number | null;
  message: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Helper erstellt ein Gebot für einen Gig
 */
export const createBid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => parseInput(negotiationInputSchema, data))
  .handler(async ({ context, data }) => {
    const { enforceUserRateLimit } = await import("@/lib/server/rate-limit.server");
    await enforceUserRateLimit(context.userId, "create_bid", 30, 3600);
    const { supabase, userId } = context;

    // Prüfe ob User ein Helper ist
    const { data: roles, error: rolesError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["helper_youth", "helper_adult", "helper_pro"]);

    if (rolesError) throw rolesError;
    if (!roles || roles.length === 0) {
      throw new Error("Nur Helfer können Gebote abgeben");
    }

    const { data: helperProfile, error: profileError } = await supabase
      .from("profiles")
      .select("display_name, vacation_mode")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (helperProfile?.vacation_mode) {
      throw new Error(
        "Du hast den Urlaubsmodus aktiviert und kannst aktuell keine Gebote abgeben.",
      );
    }

    // Nur auf offene Aufträge bieten, und nur ein aktives Gebot pro Auftrag: Wer schon geboten hat und ein
    // Gegenangebot bekam, antwortet darauf (annehmen / neues Gebot) statt ein zweites Gebot anzulegen.
    {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: targetGig } = await supabaseAdmin
        .from("gigs")
        .select("status, customer_id")
        .eq("id", data.gigId)
        .maybeSingle();
      if (!targetGig || !["open", "negotiating"].includes(targetGig.status)) {
        throw new Error("Auf diesen Auftrag kann nicht mehr geboten werden.");
      }
      if (targetGig.customer_id === userId) throw new Error("Du kannst nicht auf deinen eigenen Auftrag bieten.");
      const { data: activeBid } = await supabaseAdmin
        .from("negotiations")
        .select("id, status")
        .eq("gig_id", data.gigId)
        .eq("helper_id", userId)
        .in("status", ["pending", "countered"])
        .maybeSingle();
      if (activeBid) {
        throw new Error(
          activeBid.status === "countered"
            ? "Der Kunde hat dir schon ein Gegenangebot gemacht. Öffne „Meine Gebote“, um es anzunehmen oder ein neues Gebot abzugeben."
            : "Du hast auf diesen Auftrag schon ein Gebot abgegeben. Es wartet auf die Antwort des Kunden.",
        );
      }
    }

    // Jugendschutz: Gebote Jugendlicher werden nicht sofort abgegeben, sondern den Eltern vorgelegt.
    // Erst nach deren Freigabe im Eltern-Konto geht das Gebot an den Auftraggeber.
    if (roles.some((r) => r.role === "helper_youth")) {
      const { requestBidApproval, OfferApprovalRequired } = await import("@/lib/server/youth-offers.server");
      try {
        await requestBidApproval(userId, {
          gigId: data.gigId,
          bidCents: data.bidCents,
          message: data.message ?? null,
        });
      } catch (e) {
        if (e instanceof OfferApprovalRequired) {
          return { negotiation: null, awaitingGuardian: e.message as string | null };
        }
        throw e;
      }
    }

    // Erstelle Gebot
    const { data: negotiation, error } = await supabase
      .from("negotiations")
      .insert({
        gig_id: data.gigId,
        helper_id: userId,
        bid_cents: data.bidCents,
        message: data.message,
        status: "pending",
      })
      .select()
      .single();

    if (error) throw error;

    // Update Gig Status zu "negotiating"
    await supabase
      .from("gigs")
      .update({ status: "negotiating" })
      .eq("id", data.gigId)
      .eq("status", "open");

    // E-Mail-Benachrichtigung an den Kunden: neues Gebot
    const { data: gig } = await supabase
      .from("gigs")
      .select("title, customer_id")
      .eq("id", data.gigId)
      .maybeSingle();

    if (gig) {
      const { notifyUserByEmail } =
        await import("@/lib/server/notifications.server");
      const { emailTemplate, escapeHtml } = await import("@/lib/server/email.server");
      await notifyUserByEmail({
        userId: gig.customer_id,
        category: "new_bid",
        subject: `Neues Gebot für "${gig.title}"`,
        html: emailTemplate({
          heading: "Du hast ein neues Gebot erhalten",
          bodyLines: [
            `${escapeHtml(helperProfile?.display_name ?? "Ein Helfer")} hat ${(data.bidCents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" })} für deinen Auftrag „${escapeHtml(gig.title)}“ geboten.`,
          ],
          ctaLabel: "Gebot ansehen",
          ctaPath: "/my-gigs",
        }),
        inApp: {
          title: "Neues Gebot erhalten",
          body: `${helperProfile?.display_name ?? "Ein Helfer"} hat ${(data.bidCents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" })} für „${gig.title}“ geboten.`,
          link: "/my-gigs",
        },
      });
    }

    return { negotiation, awaitingGuardian: null as string | null };
  });

// ---------------------------------------------------------------------------
// Verhandlung: wer ist wann dran?
//   pending   = Gebot des Helfers, der KUNDE ist dran (annehmen / Gegenangebot / ablehnen)
//   countered = Gegenangebot des Kunden, der HELFER ist dran (annehmen / neues Gebot / ablehnen)
//   accepted / declined / withdrawn = beendet
// Berechtigung und Status werden VOR jeder Änderung geprüft, Änderungen sind an den erwarteten Status
// gebunden (kein Überschreiben bei gleichzeitigen Klicks).
// ---------------------------------------------------------------------------

type NegotiationRow = {
  id: string;
  gig_id: string;
  helper_id: string;
  bid_cents: number;
  counter_bid_cents: number | null;
  message: string | null;
  status: string;
};
type NegGig = { id: string; title: string; status: string; customer_id: string };

const eur = (cents: number) =>
  (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });

async function loadNegotiation(negotiationId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("negotiations")
    .select("*, gigs (id, title, status, customer_id)")
    .eq("id", negotiationId)
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.gigs) throw new Error("Gebot nicht gefunden.");
  const { gigs, ...n } = data as typeof data & { gigs: NegGig };
  return { supabaseAdmin, n: n as NegotiationRow, gig: gigs };
}

const CHANGED_MSG = "Das Gebot wurde inzwischen geändert. Bitte lade die Seite neu.";

/** Gig zurück auf "offen", wenn kein aktives Gebot mehr übrig ist (sonst bleibt er ewig "in Verhandlung"). */
async function reopenGigIfNoActiveBids(
  supabaseAdmin: Awaited<ReturnType<typeof loadNegotiation>>["supabaseAdmin"],
  gigId: string,
) {
  const { count } = await supabaseAdmin
    .from("negotiations")
    .select("id", { count: "exact", head: true })
    .eq("gig_id", gigId)
    .in("status", ["pending", "countered"]);
  if (!count) {
    await supabaseAdmin.from("gigs").update({ status: "open" }).eq("id", gigId).eq("status", "negotiating");
  }
}

async function notify(
  userId: string,
  subject: string,
  body: string,
  ctaPath: string,
  ctaLabel: string,
) {
  const { notifyUserByEmail } = await import("@/lib/server/notifications.server");
  const { emailTemplate } = await import("@/lib/server/email.server");
  await notifyUserByEmail({
    userId,
    category: "bid_updates",
    subject,
    html: emailTemplate({ heading: subject, bodyLines: [body], ctaLabel, ctaPath }),
    inApp: { title: subject, body, link: ctaPath },
  });
}

/**
 * Preis vereinbart: Verhandlung beenden, Helfer zuweisen (wartet auf die finale Bestätigung / Eltern-Freigabe
 * bei Jugendlichen), Zahlungsvorgang anlegen und alle übrigen Gebote auf diesen Auftrag schließen.
 */
async function finalizeAgreement(
  ctx: Awaited<ReturnType<typeof loadNegotiation>>,
  amountCents: number,
): Promise<void> {
  const { supabaseAdmin, n, gig } = ctx;

  const { data: claimed } = await supabaseAdmin
    .from("negotiations")
    .update({ status: "accepted" })
    .eq("id", n.id)
    .in("status", ["pending", "countered"])
    .select("id");
  if (!claimed || claimed.length === 0) throw new Error(CHANGED_MSG);

  const { data: assigned, error: gigError } = await supabaseAdmin
    .from("gigs")
    .update({ assigned_helper_id: n.helper_id, status: "pending_helper", budget_cents: amountCents })
    .eq("id", n.gig_id)
    .in("status", ["open", "negotiating"])
    .select("id");
  if (gigError || !assigned || assigned.length === 0) {
    // Auftrag ist nicht mehr offen (z. B. schon vergeben): Verhandlung wieder zurückstellen.
    await supabaseAdmin.from("negotiations").update({ status: n.status }).eq("id", n.id);
    throw new Error("Dieser Auftrag ist nicht mehr offen und wurde bereits vergeben oder beendet.");
  }

  const { data: existingEscrow } = await supabaseAdmin
    .from("escrow_transactions")
    .select("id")
    .eq("gig_id", n.gig_id)
    .maybeSingle();
  const fees = {
    customer_fee_cents: Math.round(amountCents * PLATFORM_FEE_CUSTOMER_RATE),
    helper_fee_cents: Math.round(amountCents * PLATFORM_FEE_HELPER_RATE),
  };
  if (existingEscrow) {
    await supabaseAdmin
      .from("escrow_transactions")
      .update({ helper_id: n.helper_id, bid_cents: amountCents, ...fees })
      .eq("id", existingEscrow.id);
  } else {
    const { error: escrowError } = await supabaseAdmin.from("escrow_transactions").insert({
      gig_id: n.gig_id,
      customer_id: gig.customer_id,
      helper_id: n.helper_id,
      bid_cents: amountCents,
      ...fees,
      state: "pending",
    });
    if (escrowError) throw escrowError;
  }

  // Alle übrigen offenen Gebote auf diesen Auftrag sind erledigt.
  const { data: others } = await supabaseAdmin
    .from("negotiations")
    .update({ status: "declined" })
    .eq("gig_id", n.gig_id)
    .neq("id", n.id)
    .in("status", ["pending", "countered"])
    .select("helper_id");
  for (const o of others ?? []) {
    await notify(
      o.helper_id,
      "Der Auftrag wurde anderweitig vergeben",
      `Für „${gig.title}“ hat sich der Auftraggeber für ein anderes Gebot entschieden.`,
      "/marketplace",
      "Weitere Aufträge finden",
    );
  }
}

/**
 * Customer macht ein Gegenangebot (nur auf ein Gebot des Helfers, bei dem er selbst dran ist)
 */
export const counterBid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => parseInput(counterBidSchema, data))
  .handler(async ({ context, data }) => {
    const { enforceUserRateLimit } = await import("@/lib/server/rate-limit.server");
    await enforceUserRateLimit(context.userId, "counter_bid", 30, 3600);
    const { userId } = context;

    const { supabaseAdmin, n, gig } = await loadNegotiation(data.negotiationId);
    if (gig.customer_id !== userId) throw new Error("Nicht autorisiert");
    if (!["open", "negotiating"].includes(gig.status)) throw new Error("Dieser Auftrag ist nicht mehr offen.");
    if (n.status === "countered") {
      throw new Error("Du hast bereits ein Gegenangebot gemacht. Jetzt ist der Helfer dran.");
    }
    if (n.status !== "pending") throw new Error(CHANGED_MSG);
    if (data.counterBidCents === n.bid_cents) {
      throw new Error("Das Gegenangebot entspricht dem Gebot. Nimm das Gebot einfach an.");
    }

    const { data: updated, error } = await supabaseAdmin
      .from("negotiations")
      .update({ counter_bid_cents: data.counterBidCents, status: "countered" })
      .eq("id", n.id)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!updated) throw new Error(CHANGED_MSG);

    await notify(
      n.helper_id,
      "Du hast ein Gegenangebot erhalten",
      `Der Kunde hat dir für „${gig.title}“ ein Gegenangebot von ${eur(data.counterBidCents)} gemacht (dein Gebot: ${eur(n.bid_cents)}). Du kannst es annehmen, ein neues Gebot abgeben oder ablehnen.`,
      "/marketplace",
      "Gegenangebot ansehen",
    );

    return { negotiation: updated };
  });

/**
 * Customer nimmt das Gebot des Helfers an (nur solange es seine Antwort braucht, also status "pending").
 * Auf ein Gegenangebot (countered) antwortet der Helfer - siehe acceptCounter.
 */
export const acceptBid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => parseInput(negotiationIdSchema, data))
  .handler(async ({ context, data }) => {
    const ctx = await loadNegotiation(data.negotiationId);
    const { n, gig } = ctx;

    if (gig.customer_id !== context.userId) throw new Error("Nicht autorisiert");
    if (n.status === "countered") {
      throw new Error("Du hast dem Helfer ein Gegenangebot gemacht. Er muss es erst annehmen oder darauf antworten.");
    }
    if (n.status !== "pending") throw new Error(CHANGED_MSG);

    await finalizeAgreement(ctx, n.bid_cents);

    await notify(
      n.helper_id,
      "Dein Gebot wurde angenommen",
      `Dein Gebot (${eur(n.bid_cents)}) für „${gig.title}“ wurde angenommen. Bitte bestätige den Auftrag unter „Meine Aufträge“.`,
      "/gigs",
      "Auftrag ansehen",
    );
    return { success: true };
  });

/**
 * Helfer nimmt das Gegenangebot des Kunden an.
 */
export const acceptCounter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => parseInput(negotiationIdSchema, data))
  .handler(async ({ context, data }) => {
    const ctx = await loadNegotiation(data.negotiationId);
    const { n, gig } = ctx;

    if (n.helper_id !== context.userId) throw new Error("Nicht autorisiert");
    if (n.status !== "countered" || n.counter_bid_cents == null) throw new Error(CHANGED_MSG);

    await finalizeAgreement(ctx, n.counter_bid_cents);

    await notify(
      gig.customer_id,
      "Der Helfer hat dein Gegenangebot angenommen",
      `Der Helfer hat dein Gegenangebot von ${eur(n.counter_bid_cents)} für „${gig.title}“ angenommen. Bitte lege den Termin fest.`,
      "/my-gigs",
      "Auftrag ansehen",
    );
    return { success: true };
  });

/**
 * Helfer antwortet auf ein Gegenangebot mit einem neuen Gebot (dieselbe Verhandlung, kein zweites Gebot).
 * Jugendliche: Das neue Gebot geht zuerst an die Eltern.
 */
export const rebid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => parseInput(rebidSchema, data))
  .handler(async ({ context, data }) => {
    const { enforceUserRateLimit } = await import("@/lib/server/rate-limit.server");
    await enforceUserRateLimit(context.userId, "rebid", 30, 3600);
    const { n, gig, supabaseAdmin } = await loadNegotiation(data.negotiationId);

    if (n.helper_id !== context.userId) throw new Error("Nicht autorisiert");
    if (n.status !== "countered") throw new Error(CHANGED_MSG);
    if (!["open", "negotiating"].includes(gig.status)) throw new Error("Dieser Auftrag ist nicht mehr offen.");

    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId);
    if ((roles ?? []).some((r) => r.role === "helper_youth")) {
      const { requestBidApproval, OfferApprovalRequired } = await import("@/lib/server/youth-offers.server");
      try {
        await requestBidApproval(context.userId, {
          gigId: n.gig_id,
          bidCents: data.bidCents,
          message: data.message ?? null,
        });
      } catch (e) {
        if (e instanceof OfferApprovalRequired) return { awaitingGuardian: e.message as string | null };
        throw e;
      }
    }

    const { data: updated, error } = await supabaseAdmin
      .from("negotiations")
      .update({
        bid_cents: data.bidCents,
        counter_bid_cents: null,
        message: data.message ?? n.message,
        status: "pending",
      })
      .eq("id", n.id)
      .eq("status", "countered")
      .select("id");
    if (error) throw error;
    if (!updated || updated.length === 0) throw new Error(CHANGED_MSG);

    await notify(
      gig.customer_id,
      "Neues Gebot für deinen Auftrag",
      `Der Helfer hat dir für „${gig.title}“ ein neues Gebot von ${eur(data.bidCents)} gemacht.`,
      "/my-gigs",
      "Gebot ansehen",
    );
    return { awaitingGuardian: null as string | null };
  });

/**
 * Lehne ein Gebot ab (Kunde) bzw. ziehe es zurück (Helfer). Nur solange die Verhandlung läuft.
 */
export const declineBid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => parseInput(negotiationIdSchema, data))
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const { supabaseAdmin, n, gig } = await loadNegotiation(data.negotiationId);

    const isCustomer = gig.customer_id === userId;
    const isHelper = n.helper_id === userId;
    if (!isCustomer && !isHelper) throw new Error("Nicht autorisiert");
    if (!["pending", "countered"].includes(n.status)) throw new Error(CHANGED_MSG);

    const { data: updated, error } = await supabaseAdmin
      .from("negotiations")
      .update({ status: isCustomer ? "declined" : "withdrawn" })
      .eq("id", n.id)
      .in("status", ["pending", "countered"])
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!updated) throw new Error(CHANGED_MSG);

    await reopenGigIfNoActiveBids(supabaseAdmin, n.gig_id);

    await notify(
      isCustomer ? n.helper_id : gig.customer_id,
      isCustomer ? "Dein Gebot wurde abgelehnt" : "Ein Helfer hat sein Gebot zurückgezogen",
      isCustomer
        ? `Dein Gebot für „${gig.title}“ wurde abgelehnt.`
        : `Ein Helfer hat sein Gebot für „${gig.title}“ zurückgezogen.`,
      isCustomer ? "/marketplace" : "/my-gigs",
      isCustomer ? "Weitere Aufträge finden" : "Meine Aufträge",
    );

    return { negotiation: updated };
  });

/**
 * Hole alle Gebote für einen Gig (als Customer)
 */
export const getNegotiationsForGig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => parseInput(gigIdSchema, data))
  .handler(async ({ context, data }) => {
    const { supabase } = context;

    const { data: negotiations, error } = await supabase
      .from("negotiations")
      .select("*")
      .eq("gig_id", data.gigId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const profiles = await fetchProfilesByIds(
      supabase,
      (negotiations ?? []).map((negotiation) => negotiation.helper_id),
    );
    return {
      negotiations: (negotiations ?? []).map((negotiation) => {
        const profile = profiles.get(negotiation.helper_id);
        return {
          ...negotiation,
          profiles: profile
            ? {
                id: profile.id,
                display_name: profile.displayName,
                city: profile.city,
              }
            : null,
        };
      }),
    };
  });

export type RequestState =
  | "awaiting_guardian" // Jugendliche/r: Eltern müssen das Gebot noch freigeben
  | "pending" // Gebot liegt beim Kunden
  | "countered" // Gegenangebot des Kunden: der Helfer ist dran
  | "accepted" // Preis vereinbart
  | "declined" // Kunde hat abgelehnt
  | "withdrawn" // selbst zurückgezogen
  | "guardian_declined" // Eltern haben nicht freigegeben
  | "expired"; // Eltern-Freigabe abgelaufen

export interface HelperRequestItem {
  /** negotiation-ID (Gebot) bzw. Freigabe-ID (noch nicht abgegeben) */
  id: string;
  source: "negotiation" | "approval";
  gigId: string;
  title: string;
  serviceType: string;
  scheduledAt: string | null;
  customerName: string;
  /** Preisvorstellung des Auftraggebers */
  gigBudgetCents: number;
  bidCents: number;
  counterBidCents: number | null;
  message: string | null;
  state: RequestState;
  gigStatus: string;
  createdAt: string;
}

/**
 * Alle Anfragen des Helfers an Aufträge von Kunden (Gebote) mit Status, für das Aufträge-Fenster.
 * Jugendliche sehen zusätzlich Gebote, die noch auf die Freigabe der Eltern warten.
 */
export const getMyRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HelperRequestItem[]> => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: negotiations }, { data: approvals }] = await Promise.all([
      supabaseAdmin
        .from("negotiations")
        .select("id, gig_id, bid_cents, counter_bid_cents, message, status, created_at")
        .eq("helper_id", userId)
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("youth_offer_approvals")
        .select("id, gig_id, bid_cents, message, status, expires_at, created_at")
        .eq("child_id", userId)
        .eq("kind", "bid")
        .in("status", ["pending", "declined", "expired"])
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const gigIds = Array.from(
      new Set([...(negotiations ?? []).map((n) => n.gig_id), ...(approvals ?? []).map((a) => a.gig_id as string)]),
    );
    if (gigIds.length === 0) return [];

    const { data: gigs } = await supabaseAdmin
      .from("gigs")
      .select("id, title, service_type, status, scheduled_at, customer_id, budget_cents")
      .in("id", gigIds);
    const gigById = new Map((gigs ?? []).map((g) => [g.id, g]));
    const customerIds = Array.from(new Set((gigs ?? []).map((g) => g.customer_id)));
    const { data: profiles } = customerIds.length
      ? await supabaseAdmin.from("profiles").select("id, display_name").in("id", customerIds)
      : { data: [] as { id: string; display_name: string | null }[] };
    const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name?.trim() || "Kunde"]));

    const base = (gigId: string) => {
      const g = gigById.get(gigId);
      return {
        gigId,
        title: g?.title ?? "Auftrag",
        serviceType: g?.service_type ?? "",
        scheduledAt: g?.scheduled_at ?? null,
        customerName: g ? (nameById.get(g.customer_id) ?? "Kunde") : "Kunde",
        gigBudgetCents: g?.budget_cents ?? 0,
        gigStatus: g?.status ?? "",
      };
    };

    const items: HelperRequestItem[] = [];
    for (const n of negotiations ?? []) {
      items.push({
        id: n.id,
        source: "negotiation",
        ...base(n.gig_id),
        bidCents: n.bid_cents,
        counterBidCents: n.counter_bid_cents,
        message: n.message,
        state: (["pending", "countered", "accepted", "declined", "withdrawn"].includes(n.status)
          ? n.status
          : "pending") as RequestState,
        createdAt: n.created_at,
      });
    }
    const now = Date.now();
    for (const a of approvals ?? []) {
      const expired = a.status === "pending" && a.expires_at && new Date(a.expires_at).getTime() < now;
      items.push({
        id: a.id,
        source: "approval",
        ...base(a.gig_id as string),
        bidCents: a.bid_cents ?? 0,
        counterBidCents: null,
        message: a.message,
        state: expired ? "expired" : a.status === "declined" ? "guardian_declined" : a.status === "pending" ? "awaiting_guardian" : "expired",
        createdAt: a.created_at,
      });
    }
    return items.sort((x, y) => y.createdAt.localeCompare(x.createdAt));
  });

/**
 * Hole alle eigenen Gebote (als Helper)
 */
export const getMyBids = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: negotiations, error } = await supabase
      .from("negotiations")
      .select(
        `
        *,
        gigs (
          id,
          title,
          service_type,
          status,
          scheduled_at,
          customer_id
        )
      `,
      )
      .eq("helper_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    const customerIds = (negotiations ?? [])
      .map(
        (negotiation) =>
          (negotiation.gigs as { customer_id?: string } | null)?.customer_id,
      )
      .filter((id): id is string => !!id);
    const profiles = await fetchProfilesByIds(supabase, customerIds);

    return {
      negotiations: (negotiations ?? []).map((negotiation) => {
        const gig = negotiation.gigs as { customer_id?: string } | null;
        const profile = gig?.customer_id
          ? profiles.get(gig.customer_id)
          : undefined;
        return {
          ...negotiation,
          gigs: gig
            ? {
                ...gig,
                profiles: profile
                  ? { id: profile.id, display_name: profile.displayName }
                  : null,
              }
            : null,
        };
      }),
    };
  });

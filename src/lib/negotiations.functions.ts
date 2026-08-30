import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchProfilesByIds } from "@/lib/profile-lookup";

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
  .validator((data: NegotiationInput) => data)
  .handler(async ({ context, data }) => {
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
      const { emailTemplate } = await import("@/lib/server/email.server");
      await notifyUserByEmail({
        userId: gig.customer_id,
        category: "new_bid",
        subject: `Neues Gebot für "${gig.title}"`,
        html: emailTemplate({
          heading: "Du hast ein neues Gebot erhalten",
          bodyLines: [
            `${helperProfile?.display_name ?? "Ein Helfer"} hat ${(data.bidCents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" })} für deinen Auftrag „${gig.title}“ geboten.`,
          ],
          ctaLabel: "Gebot ansehen",
          ctaPath: "/my-gigs",
        }),
      });
    }

    return { negotiation };
  });

/**
 * Customer macht ein Gegenangebot
 */
export const counterBid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { negotiationId: string; counterBidCents: number }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const { data: negotiation, error } = await supabase
      .from("negotiations")
      .update({
        counter_bid_cents: data.counterBidCents,
        status: "countered",
      })
      .eq("id", data.negotiationId)
      .select(
        `
        *,
        gigs!inner (customer_id)
      `,
      )
      .single();

    if (error) throw error;

    if (negotiation.gigs.customer_id !== userId) {
      throw new Error("Nicht autorisiert");
    }

    const { notifyUserByEmail } =
      await import("@/lib/server/notifications.server");
    const { emailTemplate } = await import("@/lib/server/email.server");
    await notifyUserByEmail({
      userId: negotiation.helper_id,
      category: "bid_updates",
      subject: "Du hast ein Gegenangebot erhalten",
      html: emailTemplate({
        heading: "Gegenangebot erhalten",
        bodyLines: [
          `Der Kunde hat dir ein Gegenangebot von ${(data.counterBidCents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" })} gemacht.`,
        ],
        ctaLabel: "Angebot ansehen",
        ctaPath: "/gigs",
      }),
    });

    return { negotiation };
  });

/**
 * Helper akzeptiert ein Gebot/Gegenangebot
 */
export const acceptBid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { negotiationId: string }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    // Hole Negotiation Details
    const { data: negotiation, error: negError } = await supabase
      .from("negotiations")
      .select("*, gigs (*)")
      .eq("id", data.negotiationId)
      .single();

    if (negError) throw negError;

    const gig = negotiation.gigs as {
      customer_id: string;
      title: string;
    } | null;
    if (!gig) throw new Error("Auftrag nicht gefunden.");

    // Nur der Kunde (Auftraggeber) kann ein Gebot annehmen
    if (gig.customer_id !== userId) {
      throw new Error("Nicht autorisiert");
    }

    // Update Negotiation Status
    const { error: updateError } = await supabase
      .from("negotiations")
      .update({ status: "accepted" })
      .eq("id", data.negotiationId);

    if (updateError) throw updateError;

    // Update Gig: Helfer zuweisen und Status auf "assigned" setzen
    const { error: gigError } = await supabase
      .from("gigs")
      .update({
        assigned_helper_id: negotiation.helper_id,
        status: "assigned",
        budget_cents: negotiation.counter_bid_cents ?? negotiation.bid_cents,
      })
      .eq("id", negotiation.gig_id);

    if (gigError) throw gigError;

    // Erstelle Escrow Transaction
    const finalAmount = negotiation.counter_bid_cents ?? negotiation.bid_cents;
    const customerFee = Math.round(finalAmount * 0.05); // 5% Customer Fee
    const helperFee = Math.round(finalAmount * 0.1); // 10% Helper Fee

    const { error: escrowError } = await supabase
      .from("escrow_transactions")
      .insert({
        gig_id: negotiation.gig_id,
        customer_id: gig.customer_id,
        helper_id: negotiation.helper_id,
        bid_cents: finalAmount,
        customer_fee_cents: customerFee,
        helper_fee_cents: helperFee,
        state: "pending",
      });

    if (escrowError) throw escrowError;

    const { notifyUserByEmail } =
      await import("@/lib/server/notifications.server");
    const { emailTemplate } = await import("@/lib/server/email.server");
    await notifyUserByEmail({
      userId: negotiation.helper_id,
      category: "bid_updates",
      subject: "Dein Gebot wurde angenommen",
      html: emailTemplate({
        heading: "Dein Gebot wurde angenommen",
        bodyLines: [
          `Dein Gebot für „${gig.title}“ wurde angenommen. Der Auftrag ist jetzt dir zugewiesen.`,
        ],
        ctaLabel: "Auftrag ansehen",
        ctaPath: "/gigs",
      }),
    });

    return { success: true };
  });

/**
 * Lehne ein Gebot ab
 */
export const declineBid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { negotiationId: string }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const { data: negotiation, error } = await supabase
      .from("negotiations")
      .update({ status: "declined" })
      .eq("id", data.negotiationId)
      .select(
        `
        *,
        gigs!inner (customer_id)
      `,
      )
      .single();

    if (error) throw error;

    // Customer oder Helper können ablehnen
    const isCustomer = negotiation.gigs.customer_id === userId;
    const isHelper = negotiation.helper_id === userId;

    if (!isCustomer && !isHelper) {
      throw new Error("Nicht autorisiert");
    }

    const { notifyUserByEmail } =
      await import("@/lib/server/notifications.server");
    const { emailTemplate } = await import("@/lib/server/email.server");
    const recipientId = isCustomer
      ? negotiation.helper_id
      : negotiation.gigs.customer_id;
    await notifyUserByEmail({
      userId: recipientId,
      category: "bid_updates",
      subject: "Ein Gebot wurde abgelehnt",
      html: emailTemplate({
        heading: "Gebot abgelehnt",
        bodyLines: ["Ein Gebot für einen deiner Aufträge wurde abgelehnt."],
        ctaLabel: isCustomer ? "Aufträge finden" : "Meine Aufträge",
        ctaPath: isCustomer ? "/marketplace" : "/my-gigs",
      }),
    });

    return { negotiation };
  });

/**
 * Hole alle Gebote für einen Gig (als Customer)
 */
export const getNegotiationsForGig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { gigId: string }) => data)
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

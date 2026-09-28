import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchProfilesByIds } from "@/lib/profile-lookup";
import type { Database } from "@/integrations/supabase/types";

export interface GigInput {
  title: string;
  description: string;
  serviceType: string;
  budgetCents: number;
  address: string;
  postalCode: string;
  scheduledAt: string | null;
  durationMinutes: number;
  allowedAgeGroups: string[];
}

export interface Gig {
  id: string;
  customerId: string;
  title: string;
  description: string | null;
  serviceType: string;
  budgetCents: number;
  address: string | null;
  postalCode: string | null;
  scheduledAt: string | null;
  durationMinutes: number;
  status: string;
  assignedHelperId: string | null;
  allowedAgeGroups: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Erstellt einen neuen Gig (Auftrag)
 */
export const createGig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: GigInput) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const { data: gig, error } = await supabase
      .from("gigs")
      .insert({
        customer_id: userId,
        title: data.title,
        description: data.description,
        service_type: data.serviceType,
        budget_cents: data.budgetCents,
        address: data.address,
        postal_code: data.postalCode,
        scheduled_at: data.scheduledAt,
        duration_minutes: data.durationMinutes,
        allowed_age_groups: data.allowedAgeGroups,
        status: "open",
      })
      .select()
      .single();

    if (error) throw error;
    return { gig };
  });

export interface DirectBookingInput {
  helperId: string;
  serviceType: string;
  description: string;
  address: string;
  scheduledAt: string;
  budgetCents: number;
}

/**
 * Kunde bucht einen Helfer direkt (aus "Helfer finden"), ohne vorheriges
 * Gebotsverfahren. Legt einen Gig mit status "pending_helper" an, damit er
 * dieselbe Annehmen/Ablehnen-Strecke durchläuft wie ein angenommenes Gebot
 * (siehe acceptBid in negotiations.functions.ts und respondToBooking in
 * service-listings.functions.ts).
 */
export const createDirectBookingRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: DirectBookingInput) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    if (data.helperId === userId) {
      throw new Error("Du kannst dich nicht selbst buchen.");
    }

    const { data: gig, error } = await supabase
      .from("gigs")
      .insert({
        customer_id: userId,
        title: `Buchungsanfrage: ${data.serviceType}`,
        description: data.description || null,
        service_type: data.serviceType,
        budget_cents: data.budgetCents,
        address: data.address,
        scheduled_at: data.scheduledAt,
        assigned_helper_id: data.helperId,
        status: "pending_helper",
      })
      .select()
      .single();

    if (error) throw error;

    const { notifyUserByEmail } = await import("@/lib/server/notifications.server");
    const { emailTemplate } = await import("@/lib/server/email.server");
    await notifyUserByEmail({
      userId: data.helperId,
      category: "gig_updates",
      subject: `Neue Buchungsanfrage: ${data.serviceType}`,
      html: emailTemplate({
        heading: "Neue Buchungsanfrage erhalten",
        bodyLines: [
          `Ein Kunde möchte dich direkt für „${data.serviceType}“ buchen. Bitte bestätige oder lehne die Anfrage ab.`,
        ],
        ctaLabel: "Anfrage ansehen",
        ctaPath: "/dashboard",
      }),
    });

    return { gig };
  });

/**
 * Lädt alle eigenen Gigs (als Customer)
 */
export const getMyGigs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: gigs, error } = await supabase
      .from("gigs")
      .select("*, reviews(id)")
      .eq("customer_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return { gigs: gigs ?? [] };
  });

/**
 * Lädt alle offenen Gigs (als Helper)
 */
export const getAvailableGigs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;

    const { data: gigs, error } = await supabase
      .from("gigs")
      .select("*")
      .in("status", ["open", "negotiating"])
      .order("created_at", { ascending: false });

    if (error) throw error;

    const profiles = await fetchProfilesByIds(
      supabase,
      (gigs ?? []).map((gig) => gig.customer_id),
    );
    const gigsWithProfiles = (gigs ?? []).map((gig) => {
      const profile = profiles.get(gig.customer_id);
      return {
        ...gig,
        profiles: profile
          ? {
              id: profile.id,
              display_name: profile.displayName,
              city: profile.city,
              postal_code: profile.postalCode,
            }
          : null,
      };
    });

    return { gigs: gigsWithProfiles };
  });

/**
 * Lädt Details eines einzelnen Gigs
 */
export const getGigDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { gigId: string }) => data)
  .handler(async ({ context, data }) => {
    const { supabase } = context;

    const { data: gig, error } = await supabase
      .from("gigs")
      .select("*")
      .eq("id", data.gigId)
      .single();

    if (error) throw error;

    const profiles = await fetchProfilesByIds(supabase, [gig.customer_id]);
    const profile = profiles.get(gig.customer_id);
    return {
      gig: {
        ...gig,
        profiles: profile
          ? {
              id: profile.id,
              display_name: profile.displayName,
              city: profile.city,
              postal_code: profile.postalCode,
            }
          : null,
      },
    };
  });

/**
 * Aktualisiert den Status eines Gigs
 */
export const updateGigStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { gigId: string; status: Database["public"]["Enums"]["gig_status"] }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const { data: gig, error } = await supabase
      .from("gigs")
      .update({ status: data.status })
      .eq("id", data.gigId)
      .eq("customer_id", userId)
      .select()
      .single();

    if (error) throw error;
    return { gig };
  });

/**
 * Schlägt ein Datum für einen existierenden Auftrag vor (Kunde)
 */
export const proposeGigDate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { gigId: string; scheduledAt: string }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const { data: gig, error } = await supabase
      .from("gigs")
      .update({ scheduled_at: data.scheduledAt })
      .eq("id", data.gigId)
      .eq("customer_id", userId)
      .select()
      .single();

    if (error) throw error;
    return { gig };
  });

/**
 * Weist einen Helper einem Gig zu
 */
export const assignHelperToGig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { gigId: string; helperId: string }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const { data: gig, error } = await supabase
      .from("gigs")
      .update({
        assigned_helper_id: data.helperId,
        status: "pending_helper",
      })
      .eq("id", data.gigId)
      .eq("customer_id", userId)
      .select()
      .single();

    if (error) throw error;

    const { notifyUserByEmail } = await import("@/lib/server/notifications.server");
    const { emailTemplate } = await import("@/lib/server/email.server");
    await notifyUserByEmail({
      userId: data.helperId,
      category: "gig_updates",
      subject: `Du wurdest für „${gig.title}“ eingeteilt`,
      html: emailTemplate({
        heading: "Neuer Auftrag zugewiesen",
        bodyLines: [`Du wurdest dem Auftrag „${gig.title}“ zugewiesen.`],
        ctaLabel: "Auftrag ansehen",
        ctaPath: "/gigs",
      }),
    });

    return { gig };
  });
export const completeGig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { gigId: string }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    // 1. Update Gig Status to completed
    const { data: gig, error: gigError } = await supabase
      .from("gigs")
      .update({ status: "completed" })
      .eq("id", data.gigId)
      .eq("customer_id", userId)
      .select()
      .single();

    if (gigError) throw gigError;
    if (!gig) throw new Error("Gig not found or not authorized");

    // 2. Release Escrow Funds
    if (gig.assigned_helper_id) {
      const { data: escrow, error: escrowError } = await supabase
        .from("escrow_transactions")
        .select("bid_cents, state")
        .eq("gig_id", data.gigId)
        .maybeSingle();

      if (escrowError) throw escrowError;

      if (escrow && escrow.state !== "paid_out") {
        const { error: releaseError } = await supabase
          .from("escrow_transactions")
          .update({ state: "paid_out", paid_out_at: new Date().toISOString() })
          .eq("gig_id", data.gigId);

        if (releaseError) throw releaseError;

        // 3. Update Earnings Tracker for the helper
        const year = new Date().getFullYear();
        const { data: tracker } = await supabase
          .from("earnings_tracker")
          .select("tx_count, gross_cents")
          .eq("helper_id", gig.assigned_helper_id)
          .eq("year", year)
          .maybeSingle();

        const newTxCount = (tracker?.tx_count ?? 0) + 1;
        const newGrossCents = (tracker?.gross_cents ?? 0) + (escrow.bid_cents ?? 0);

        const { error: trackerError } = await supabase
          .from("earnings_tracker")
          .upsert({
            helper_id: gig.assigned_helper_id,
            year,
            tx_count: newTxCount,
            gross_cents: newGrossCents,
          }, { onConflict: "helper_id,year" });

        if (trackerError) throw trackerError;
      }

      // Notifications
      const { notifyUserByEmail } = await import("@/lib/server/notifications.server");
      const { emailTemplate } = await import("@/lib/server/email.server");
      await notifyUserByEmail({
        userId: gig.assigned_helper_id,
        category: "gig_updates",
        subject: `Auftrag „${gig.title}“ abgeschlossen`,
        html: emailTemplate({
          heading: "Auftrag abgeschlossen",
          bodyLines: [
            `Der Auftrag „${gig.title}“ wurde als abgeschlossen markiert. Die Auszahlung wird gemäß eurer Treuhand-Regelung verarbeitet.`,
          ],
          ctaLabel: "Zum Dashboard",
          ctaPath: "/dashboard",
        }),
      });
    }

    return { gig };
  });

const CANCELLABLE_STATUSES = ["pending_helper", "assigned", "in_progress"];

export interface CancelGigInput {
  gigId: string;
  reason: string;
}

/**
 * Storniert einen laufenden Auftrag. Sowohl Kunde als auch zugewiesener
 * Helfer dürfen stornieren (Annahmen, da bisher nicht festgelegt):
 * - Keine zeitliche Frist (z.B. "nicht mehr < 2h vor Termin") - bewusst
 *   einfach gehalten, kann bei Bedarf später ergänzt werden.
 * - Ein Grund ist Pflicht, für Nachvollziehbarkeit im Streitfall.
 * - Ein bestehender Escrow-Eintrag wird auf "cancelled" gesetzt statt
 *   normal freigegeben - es fließt ohnehin kein echtes Geld (siehe
 *   platform-fees.ts), das hält den Datensatz aber für später konsistent.
 */
export const cancelGig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: CancelGigInput) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    if (!data.reason?.trim()) {
      throw new Error("Bitte gib einen Grund für die Stornierung an.");
    }

    const { data: gig, error: gigError } = await supabase
      .from("gigs")
      .select("id, title, service_type, status, customer_id, assigned_helper_id")
      .eq("id", data.gigId)
      .single();

    if (gigError || !gig) throw new Error("Auftrag nicht gefunden.");

    const isCustomer = gig.customer_id === userId;
    const isHelper = gig.assigned_helper_id === userId;
    if (!isCustomer && !isHelper) {
      throw new Error("Nicht berechtigt, diesen Auftrag zu stornieren.");
    }
    if (!CANCELLABLE_STATUSES.includes(gig.status)) {
      throw new Error("Dieser Auftrag kann in seinem aktuellen Status nicht storniert werden.");
    }

    const { error: updateError } = await supabase
      .from("gigs")
      .update({
        status: "cancelled",
        cancellation_reason: data.reason.trim(),
        cancelled_by: userId,
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", data.gigId);
    if (updateError) throw updateError;

    await supabase
      .from("escrow_transactions")
      .update({ state: "cancelled" })
      .eq("gig_id", data.gigId)
      .in("state", ["pending", "held"]);

    const otherUserId = isCustomer ? gig.assigned_helper_id : gig.customer_id;
    if (otherUserId) {
      const { notifyUserByEmail } = await import("@/lib/server/notifications.server");
      const { emailTemplate } = await import("@/lib/server/email.server");
      await notifyUserByEmail({
        userId: otherUserId,
        category: "gig_updates",
        subject: `Auftrag storniert: ${gig.title}`,
        html: emailTemplate({
          heading: "Ein Auftrag wurde storniert",
          bodyLines: [
            `„${gig.title}“ (${gig.service_type}) wurde von ${
              isCustomer ? "der Kundin/dem Kunden" : "der Helferin/dem Helfer"
            } storniert.`,
            `Grund: ${data.reason.trim()}`,
          ],
          ctaLabel: "Details ansehen",
          ctaPath: "/dashboard",
        }),
      });
    }

    return { ok: true };
  });

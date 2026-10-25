import { CUSTOMER_RULES_VERSION, GIG_SAFETY_VERSION } from "@/lib/consent-texts";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchProfilesByIds } from "@/lib/profile-lookup";
import {
  assignHelperSchema,
  cancelGigSchema,
  directBookingSchema,
  gigIdSchema,
  gigInputSchema,
  gigStatusSchema,
  parseInput,
  proposeDateSchema,
} from "@/lib/validation";

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
  /** Bestätigung "Tätigkeit geeignet, leicht und ungefährlich" - vor JEDER Veröffentlichung Pflicht */
  safetyConfirmed: boolean;
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
  .inputValidator((data: unknown) => parseInput(gigInputSchema, data))
  .handler(async ({ context, data }) => {
    const { enforceUserRateLimit } = await import("@/lib/server/rate-limit.server");
    await enforceUserRateLimit(context.userId, "create_gig", 20, 3600);
    const { supabase, userId } = context;

    // Kinderschutz: Regeln akzeptiert + Eignung der Tätigkeit bestätigt (mit Auftrags-ID und Zeitpunkt gespeichert).
    if (data.safetyConfirmed !== true) {
      throw new Error("Bitte bestätige, dass die Tätigkeit geeignet, leicht und ungefährlich ist.");
    }
    const { data: rulesRow } = await supabase
      .from("user_consents")
      .select("id")
      .eq("user_id", userId)
      .eq("kind", "customer_child_protection_rules")
      .eq("text_version", CUSTOMER_RULES_VERSION)
      .maybeSingle();
    if (!rulesRow) {
      throw new Error(
        "Bitte akzeptiere zuerst die Kinderschutzregeln und die verbotenen Tätigkeiten (Profil → Verifizierung).",
      );
    }

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

    const { error: confirmError } = await supabase.from("gig_safety_confirmations").insert({
      gig_id: gig.id,
      user_id: userId,
      text_version: GIG_SAFETY_VERSION,
    });
    if (confirmError) {
      // Ohne gespeicherte Bestätigung darf der Auftrag nicht stehen bleiben.
      await supabase.from("gigs").delete().eq("id", gig.id);
      throw confirmError;
    }
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
  .inputValidator((data: unknown) => parseInput(directBookingSchema, data))
  .handler(async ({ context, data }) => {
    const { enforceUserRateLimit } = await import("@/lib/server/rate-limit.server");
    await enforceUserRateLimit(context.userId, "direct_booking", 20, 3600);
    const { supabase, userId } = context;

    if (data.helperId === userId) {
      throw new Error("Du kannst dich nicht selbst buchen.");
    }

    // Maßgebliche Prüfung auf dem Server mit echten Daten des Helfers: Helfer-Rolle, Konto-Status,
    // Urlaub, Eltern-Zustimmung (Jugendliche), Termin frei, Jugendschutz-Zeiten.
    const { assertBookable, BookingError } = await import("@/lib/server/booking.server");
    let info;
    try {
      info = await assertBookable(data.helperId, userId, data.scheduledAt);
    } catch (e) {
      if (e instanceof BookingError) throw new Error(e.message);
      throw e;
    }

    // Preis und Leistung kommen vom gebuchten Angebot des Helfers (nicht vom Browser).
    let serviceType: string = data.serviceType;
    let budgetCents = data.budgetCents;
    let title = `Buchungsanfrage: ${data.serviceType}`;
    let listingId: string | null = null;
    if (data.listingId) {
      const service = info.services.find((s) => s.listingId === data.listingId);
      if (!service) throw new Error("Dieses Angebot ist nicht (mehr) buchbar. Bitte lade die Seite neu.");
      serviceType = service.serviceType;
      budgetCents = service.priceCents;
      title = `Buchung: ${service.title}`;
      listingId = service.listingId;
    }

    const { data: gig, error } = await supabase
      .from("gigs")
      .insert({
        customer_id: userId,
        title,
        description: data.description || null,
        service_type: serviceType,
        budget_cents: budgetCents,
        address: data.address,
        scheduled_at: data.scheduledAt,
        duration_minutes: 60,
        assigned_helper_id: data.helperId,
        source_listing_id: listingId,
        status: "pending_helper",
      })
      .select()
      .single();

    if (error) throw error;

    // Zahlungsvorgang wie bei Geboten und Angebots-Buchungen (vorher fehlte er bei Direktbuchungen).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { PLATFORM_FEE_CUSTOMER_RATE, PLATFORM_FEE_HELPER_RATE } = await import("@/lib/platform-fees");
    const { error: escrowError } = await supabaseAdmin.from("escrow_transactions").insert({
      gig_id: gig.id,
      customer_id: userId,
      helper_id: data.helperId,
      bid_cents: budgetCents,
      customer_fee_cents: Math.round(budgetCents * PLATFORM_FEE_CUSTOMER_RATE),
      helper_fee_cents: Math.round(budgetCents * PLATFORM_FEE_HELPER_RATE),
      state: "pending",
    });
    if (escrowError) {
      await supabaseAdmin.from("gigs").delete().eq("id", gig.id);
      throw escrowError;
    }

    const { notifyUserByEmail } = await import("@/lib/server/notifications.server");
    const { emailTemplate, escapeHtml } = await import("@/lib/server/email.server");
    await notifyUserByEmail({
      userId: data.helperId,
      category: "gig_updates",
      subject: `Neue Buchungsanfrage: ${title}`,
      html: emailTemplate({
        heading: "Neue Buchungsanfrage erhalten",
        bodyLines: [
          `Ein Kunde möchte dich direkt für „${escapeHtml(title)}“ buchen (${new Date(data.scheduledAt).toLocaleString("de-DE", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Berlin" })}). Bitte bestätige oder lehne die Anfrage ab.`,
        ],
        ctaLabel: "Anfrage ansehen",
        ctaPath: "/dashboard",
      }),
      inApp: {
        title: "Neue Buchungsanfrage",
        body: `Ein Kunde möchte dich für „${title}“ buchen.`,
        link: "/dashboard",
      },
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
  .inputValidator((data: unknown) => parseInput(gigIdSchema, data))
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
  .inputValidator((data: unknown) => parseInput(gigStatusSchema, data))
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
  .inputValidator((data: unknown) => parseInput(proposeDateSchema, data))
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
  .inputValidator((data: unknown) => parseInput(assignHelperSchema, data))
  .handler(async ({ context, data }) => {
    const { enforceUserRateLimit } = await import("@/lib/server/rate-limit.server");
    await enforceUserRateLimit(context.userId, "assign_helper", 30, 3600);
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
    const { emailTemplate, escapeHtml } = await import("@/lib/server/email.server");
    await notifyUserByEmail({
      userId: data.helperId,
      category: "gig_updates",
      subject: `Du wurdest für „${gig.title}“ eingeteilt`,
      html: emailTemplate({
        heading: "Neuer Auftrag zugewiesen",
        bodyLines: [`Du wurdest dem Auftrag „${escapeHtml(gig.title)}“ zugewiesen.`],
        ctaLabel: "Auftrag ansehen",
        ctaPath: "/gigs",
      }),
      inApp: {
        title: "Neuer Auftrag zugewiesen",
        body: `Du wurdest dem Auftrag „${gig.title}“ zugewiesen.`,
        link: "/gigs",
      },
    });

    return { gig };
  });
export const completeGig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => parseInput(gigIdSchema, data))
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
      const { emailTemplate, escapeHtml } = await import("@/lib/server/email.server");
      await notifyUserByEmail({
        userId: gig.assigned_helper_id,
        category: "gig_updates",
        subject: `Auftrag „${gig.title}“ abgeschlossen`,
        html: emailTemplate({
          heading: "Auftrag abgeschlossen",
          bodyLines: [
            `Der Auftrag „${escapeHtml(gig.title)}“ wurde als abgeschlossen markiert. Die Auszahlung wird gemäß eurer Treuhand-Regelung verarbeitet.`,
          ],
          ctaLabel: "Zum Dashboard",
          ctaPath: "/dashboard",
        }),
        inApp: {
          title: "Auftrag abgeschlossen",
          body: `„${gig.title}“ wurde als abgeschlossen markiert.`,
          link: "/dashboard",
        },
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
  .inputValidator((data: unknown) => parseInput(cancelGigSchema, data))
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
      const { emailTemplate, escapeHtml } = await import("@/lib/server/email.server");
      await notifyUserByEmail({
        userId: otherUserId,
        category: "gig_updates",
        subject: `Auftrag storniert: ${gig.title}`,
        html: emailTemplate({
          heading: "Ein Auftrag wurde storniert",
          bodyLines: [
            `„${escapeHtml(gig.title)}“ (${escapeHtml(gig.service_type)}) wurde von ${
              isCustomer ? "der Kundin/dem Kunden" : "der Helferin/dem Helfer"
            } storniert.`,
            `Grund: ${escapeHtml(data.reason.trim())}`,
          ],
          ctaLabel: "Details ansehen",
          ctaPath: "/dashboard",
        }),
        inApp: {
          title: "Auftrag storniert",
          body: `„${gig.title}“ wurde storniert. Grund: ${data.reason.trim()}`,
          link: "/dashboard",
        },
      });
    }

    return { ok: true };
  });

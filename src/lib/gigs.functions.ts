import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
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

/**
 * Lädt alle eigenen Gigs (als Customer)
 */
export const getMyGigs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: gigs, error } = await supabase
      .from("gigs")
      .select("*")
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
      .select(`
        *,
        profiles!gigs_customer_id_fkey (
          id,
          display_name,
          city,
          postal_code
        )
      `)
      .in("status", ["open", "negotiating"])
      .order("created_at", { ascending: false });

    if (error) throw error;
    return { gigs: gigs ?? [] };
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
      .select(`
        *,
        profiles!gigs_customer_id_fkey (
          id,
          display_name,
          city,
          postal_code
        )
      `)
      .eq("id", data.gigId)
      .single();

    if (error) throw error;
    return { gig };
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
        status: "assigned",
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

    const { data: gig, error } = await supabase
      .from("gigs")
      .update({ status: "completed" })
      .eq("id", data.gigId)
      .eq("customer_id", userId)
      .select()
      .single();

    if (error) throw error;

    if (gig.assigned_helper_id) {
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

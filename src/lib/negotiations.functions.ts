import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
      .select(`
        *,
        gigs!inner (customer_id)
      `)
      .single();

    if (error) throw error;

    // @ts-ignore - Supabase join syntax
    if (negotiation.gigs.customer_id !== userId) {
      throw new Error("Nicht autorisiert");
    }

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

    // Nur Helper kann akzeptieren
    if (negotiation.helper_id !== userId) {
      throw new Error("Nicht autorisiert");
    }

    // Update Negotiation Status
    const { error: updateError } = await supabase
      .from("negotiations")
      .update({ status: "accepted" })
      .eq("id", data.negotiationId);

    if (updateError) throw updateError;

    // Update Gig: Helper zuweisen und Status auf "assigned" setzen
    const { error: gigError } = await supabase
      .from("gigs")
      .update({
        assigned_helper_id: userId,
        status: "assigned",
        budget_cents: negotiation.counter_bid_cents ?? negotiation.bid_cents,
      })
      .eq("id", negotiation.gig_id);

    if (gigError) throw gigError;

    // Erstelle Escrow Transaction
    const finalAmount = negotiation.counter_bid_cents ?? negotiation.bid_cents;
    const customerFee = Math.round(finalAmount * 0.05); // 5% Customer Fee
    const helperFee = Math.round(finalAmount * 0.1); // 10% Helper Fee

    const { error: escrowError } = await supabase.from("escrow_transactions").insert({
      gig_id: negotiation.gig_id,
      // @ts-ignore - gigs is joined
      customer_id: negotiation.gigs.customer_id,
      helper_id: userId,
      bid_cents: finalAmount,
      customer_fee_cents: customerFee,
      helper_fee_cents: helperFee,
      state: "pending",
    });

    if (escrowError) throw escrowError;

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
      .select(`
        *,
        gigs!inner (customer_id)
      `)
      .single();

    if (error) throw error;

    // Customer oder Helper können ablehnen
    // @ts-ignore - Supabase join
    const isCustomer = negotiation.gigs.customer_id === userId;
    const isHelper = negotiation.helper_id === userId;

    if (!isCustomer && !isHelper) {
      throw new Error("Nicht autorisiert");
    }

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
      .select(`
        *,
        profiles!negotiations_helper_id_fkey (
          id,
          display_name,
          city,
          business_name
        )
      `)
      .eq("gig_id", data.gigId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return { negotiations: negotiations ?? [] };
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
      .select(`
        *,
        gigs (
          id,
          title,
          service_type,
          status,
          scheduled_at,
          profiles!gigs_customer_id_fkey (
            id,
            display_name
          )
        )
      `)
      .eq("helper_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return { negotiations: negotiations ?? [] };
  });

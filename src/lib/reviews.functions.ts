import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface ReviewInput {
  gigId: string;
  helperId: string;
  rating: number;
  comment?: string;
}

/**
 * Erstellt eine Bewertung für einen abgeschlossenen Gig
 */
export const createReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: ReviewInput) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    // Prüfe ob der Gig existiert und abgeschlossen ist
    const { data: gig, error: gigError } = await supabase
      .from("gigs")
      .select("*")
      .eq("id", data.gigId)
      .eq("customer_id", userId)
      .eq("status", "completed")
      .eq("assigned_helper_id", data.helperId)
      .single();

    if (gigError) throw new Error("Gig nicht gefunden oder nicht berechtigt");
    if (!gig) throw new Error("Gig muss abgeschlossen sein, um bewertet zu werden");

    // Erstelle Review
    const { data: review, error } = await supabase
      .from("reviews")
      .insert({
        gig_id: data.gigId,
        customer_id: userId,
        helper_id: data.helperId,
        rating: data.rating,
        comment: data.comment,
      })
      .select()
      .single();

    if (error) throw error;
    return { review };
  });

/**
 * Hole alle Reviews für einen Helper
 */
export const getHelperReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { helperId: string }) => data)
  .handler(async ({ context, data }) => {
    const { supabase } = context;

    const { data: reviews, error } = await supabase
      .from("reviews")
      .select(`
        *,
        profiles!reviews_customer_id_fkey (
          id,
          display_name
        ),
        gigs (
          id,
          title,
          service_type
        )
      `)
      .eq("helper_id", data.helperId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Berechne Durchschnitt
    const ratings = reviews?.map((r) => r.rating) ?? [];
    const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

    return {
      reviews: reviews ?? [],
      avgRating,
      reviewCount: reviews?.length ?? 0,
    };
  });

/**
 * Hole Reviews für einen Gig
 */
export const getGigReview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { gigId: string }) => data)
  .handler(async ({ context, data }) => {
    const { supabase } = context;

    const { data: review, error } = await supabase
      .from("reviews")
      .select(`
        *,
        profiles!reviews_customer_id_fkey (
          id,
          display_name
        ),
        profiles!reviews_helper_id_fkey (
          id,
          display_name
        )
      `)
      .eq("gig_id", data.gigId)
      .maybeSingle();

    if (error) throw error;
    return { review };
  });

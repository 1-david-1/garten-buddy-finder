import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchProfilesByIds } from "@/lib/profile-lookup";

export type ReviewDirection = "customer_to_helper" | "helper_to_customer";

export interface ReviewInput {
  gigId: string;
  rating: number;
  comment?: string;
}

/**
 * Ermittelt anhand des Gigs, wer hier wen bewertet - nicht dem Client
 * überlassen. Wer den Request stellt, entscheidet automatisch die
 * Richtung: der Auftrags-Kunde bewertet den Helfer, der zugewiesene
 * Helfer bewertet den Kunden.
 */
async function resolveReviewParty(
  supabase: SupabaseClient,
  userId: string,
  gigId: string,
): Promise<{ direction: ReviewDirection; customerId: string; helperId: string }> {
  const { data: gig, error } = await supabase
    .from("gigs")
    .select("customer_id, assigned_helper_id, status")
    .eq("id", gigId)
    .single();

  if (error || !gig) throw new Error("Auftrag nicht gefunden.");
  if (gig.status !== "completed") {
    throw new Error("Auftrag muss abgeschlossen sein, um bewertet zu werden.");
  }
  if (!gig.assigned_helper_id) throw new Error("Auftrag hat keinen zugewiesenen Helfer.");

  if (gig.customer_id === userId) {
    return {
      direction: "customer_to_helper",
      customerId: gig.customer_id,
      helperId: gig.assigned_helper_id,
    };
  }
  if (gig.assigned_helper_id === userId) {
    return {
      direction: "helper_to_customer",
      customerId: gig.customer_id,
      helperId: gig.assigned_helper_id,
    };
  }
  throw new Error("Nicht berechtigt, diesen Auftrag zu bewerten.");
}

/**
 * Erstellt eine Bewertung für einen abgeschlossenen Gig - für den
 * Kunden (bewertet den Helfer) genauso wie für den Helfer (bewertet
 * den Kunden). Die Richtung ergibt sich automatisch daraus, wer den
 * Request stellt.
 */
export const createReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: ReviewInput) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const party = await resolveReviewParty(supabase, userId, data.gigId);

    const { data: review, error } = await supabase
      .from("reviews")
      .insert({
        gig_id: data.gigId,
        customer_id: party.customerId,
        helper_id: party.helperId,
        direction: party.direction,
        rating: data.rating,
        comment: data.comment,
      })
      .select()
      .single();

    if (error) throw error;
    return { review };
  });

/**
 * Aktualisiert eine bestehende Bewertung (eigene Richtung).
 */
export const updateReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: ReviewInput) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const party = await resolveReviewParty(supabase, userId, data.gigId);

    const { data: updatedReview, error } = await supabase
      .from("reviews")
      .update({
        rating: data.rating,
        comment: data.comment,
      })
      .eq("gig_id", data.gigId)
      .eq("direction", party.direction)
      .select()
      .single();

    if (error) throw error;
    return { review: updatedReview };
  });

/**
 * Hole alle Bewertungen ÜBER einen Helfer (von Kunden geschrieben).
 */
export const getHelperReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { helperId: string }) => data)
  .handler(async ({ context, data }) => {
    const { supabase } = context;

    const { data: reviews, error } = await supabase
      .from("reviews")
      .select("*, gigs(id, title, service_type)")
      .eq("helper_id", data.helperId)
      .eq("direction", "customer_to_helper")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const profiles = await fetchProfilesByIds(
      supabase,
      (reviews ?? []).map((review) => review.customer_id),
    );
    const reviewsWithProfiles = (reviews ?? []).map((review) => {
      const profile = profiles.get(review.customer_id);
      return {
        ...review,
        profiles: profile
          ? { id: profile.id, display_name: profile.displayName }
          : null,
      };
    });

    const ratings = reviews?.map((r) => r.rating) ?? [];
    const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

    return {
      reviews: reviewsWithProfiles,
      avgRating,
      reviewCount: reviews?.length ?? 0,
    };
  });

/**
 * Hole alle Bewertungen ÜBER einen Kunden (von Helfern geschrieben).
 * Symmetrisches Gegenstück zu getHelperReviews - noch ohne eigene
 * Profilseite im Frontend, aber schon nutzbar (z.B. künftig im
 * Kunden-Vertrauensscore oder für Helfer vor Auftragsannahme).
 */
export const getCustomerReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { customerId: string }) => data)
  .handler(async ({ context, data }) => {
    const { supabase } = context;

    const { data: reviews, error } = await supabase
      .from("reviews")
      .select("*, gigs(id, title, service_type)")
      .eq("customer_id", data.customerId)
      .eq("direction", "helper_to_customer")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const profiles = await fetchProfilesByIds(
      supabase,
      (reviews ?? []).map((review) => review.helper_id),
    );
    const reviewsWithProfiles = (reviews ?? []).map((review) => {
      const profile = profiles.get(review.helper_id);
      return {
        ...review,
        profiles: profile
          ? { id: profile.id, display_name: profile.displayName }
          : null,
      };
    });

    const ratings = reviews?.map((r) => r.rating) ?? [];
    const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

    return {
      reviews: reviewsWithProfiles,
      avgRating,
      reviewCount: reviews?.length ?? 0,
    };
  });

/**
 * Hole die eigene (bereits abgegebene) Bewertung zu einem Gig, für die
 * Richtung des Aufrufenden - Standard ist "customer_to_helper" (Kunde
 * bewertet Helfer), damit bestehende Aufrufe ohne `direction` weiter
 * funktionieren.
 */
export const getGigReview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { gigId: string; direction?: ReviewDirection }) => data)
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const direction = data.direction ?? "customer_to_helper";

    const { data: review, error } = await supabase
      .from("reviews")
      .select("*")
      .eq("gig_id", data.gigId)
      .eq("direction", direction)
      .maybeSingle();

    if (error) throw error;
    if (!review) return { review: null };

    const profiles = await fetchProfilesByIds(supabase, [
      review.customer_id,
      review.helper_id,
    ]);
    const customer = profiles.get(review.customer_id);
    const helper = profiles.get(review.helper_id);
    return {
      review: {
        ...review,
        customer: customer
          ? { id: customer.id, display_name: customer.displayName }
          : null,
        helper: helper
          ? { id: helper.id, display_name: helper.displayName }
          : null,
      },
    };
  });

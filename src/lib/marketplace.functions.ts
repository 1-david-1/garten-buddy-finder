import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface MarketplaceHelper {
  id: string;
  displayName: string;
  city: string | null;
  postalCode: string | null;
  bio: string | null;
  role: "helper_youth" | "helper_adult" | "helper_pro";
  businessName: string | null;
  rating: number | null;
  reviewCount: number;
}

/**
 * Lädt alle Nutzer mit einer Helfer-Rolle aus der Datenbank, damit
 * Arbeitgeber jeden registrierten Helfer sehen können (nicht nur eine
 * fest einprogrammierte Beispiel-Liste). Bewertungen werden aus der
 * reviews-Tabelle aggregiert.
 */
export const getAvailableHelpers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;

    const { data: roles, error: rolesErr } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["helper_youth", "helper_adult", "helper_pro"]);
    if (rolesErr) throw rolesErr;

    const helperIds = [...new Set((roles ?? []).map((r) => r.user_id))];
    if (helperIds.length === 0) return { helpers: [] as MarketplaceHelper[] };

    const roleByUserId = new Map((roles ?? []).map((r) => [r.user_id, r.role]));

    const { data: profiles, error: profilesErr } = await supabase
      .from("profiles")
      .select("id, display_name, city, postal_code, bio, business_name")
      .in("id", helperIds);
    if (profilesErr) throw profilesErr;

    const { data: reviews, error: reviewsErr } = await supabase
      .from("reviews")
      .select("helper_id, rating")
      .in("helper_id", helperIds);
    if (reviewsErr) throw reviewsErr;

    const ratingsByHelper = new Map<string, number[]>();
    for (const r of reviews ?? []) {
      const list = ratingsByHelper.get(r.helper_id) ?? [];
      list.push(r.rating);
      ratingsByHelper.set(r.helper_id, list);
    }

    const helpers: MarketplaceHelper[] = (profiles ?? []).map((p) => {
      const ratings = ratingsByHelper.get(p.id) ?? [];
      const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
      return {
        id: p.id,
        displayName: p.display_name || "Unbenannter Helfer",
        city: p.city,
        postalCode: p.postal_code,
        bio: p.bio,
        role: (roleByUserId.get(p.id) as MarketplaceHelper["role"]) ?? "helper_adult",
        businessName: p.business_name,
        rating: avg,
        reviewCount: ratings.length,
      };
    });

    return { helpers };
  });

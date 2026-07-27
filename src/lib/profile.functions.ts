import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface ProfileUpdateInput {
  displayName?: string;
  city?: string;
  postalCode?: string;
  bio?: string;
  businessName?: string;
  ustId?: string;
  birthdate?: string;
  guardianEmail?: string;
  language?: string;
}

/**
 * Holt das eigene Profil
 */
export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, user } = context;

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error) throw error;

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    return {
      profile,
      roles: (roles ?? []).map((r) => r.role),
      email: user.email,
    };
  });

/**
 * Aktualisiert das eigene Profil
 */
export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: ProfileUpdateInput) => data)
  .handler(async ({ context, data }) => {
    const { supabase, user } = context;

    const updateData: Record<string, unknown> = {};
    if (data.displayName !== undefined) updateData.display_name = data.displayName;
    if (data.city !== undefined) updateData.city = data.city;
    if (data.postalCode !== undefined) updateData.postal_code = data.postalCode;
    if (data.bio !== undefined) updateData.bio = data.bio;
    if (data.businessName !== undefined) updateData.business_name = data.businessName;
    if (data.ustId !== undefined) updateData.ust_id = data.ustId;
    if (data.birthdate !== undefined) updateData.birthdate = data.birthdate;
    if (data.guardianEmail !== undefined) updateData.guardian_email = data.guardianEmail;
    if (data.language !== undefined) updateData.language = data.language;

    const { data: profile, error } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("id", user.id)
      .select()
      .single();

    if (error) throw error;
    return { profile };
  });

/**
 * Holt ein öffentliches Helferprofil
 */
export const getHelperProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { helperId: string }) => data)
  .handler(async ({ context, data }) => {
    const { supabase } = context;

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, display_name, city, postal_code, bio, business_name, available_today, trust_score")
      .eq("id", data.helperId)
      .single();

    if (error) throw error;

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.helperId)
      .in("role", ["helper_youth", "helper_adult", "helper_pro"]);

    const { data: reviews } = await supabase
      .from("reviews")
      .select("rating, comment, created_at, profiles!reviews_customer_id_fkey(display_name), gigs(title)")
      .eq("helper_id", data.helperId)
      .order("created_at", { ascending: false })
      .limit(10);

    const ratings = (reviews ?? []).map((r) => r.rating);
    const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;

    return {
      profile,
      roles: (roles ?? []).map((r) => r.role),
      reviews: reviews ?? [],
      avgRating,
      reviewCount: ratings.length,
    };
  });

/**
 * Fügt oder entfernt einen Helper aus den Favoriten
 */
export const toggleFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { helperId: string; add: boolean }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, user } = context;

    if (data.add) {
      const { error } = await supabase
        .from("favorites")
        .insert({ customer_id: user.id, helper_id: data.helperId });
      if (error && error.code !== "23505") throw error; // Ignore duplicate
    } else {
      const { error } = await supabase
        .from("favorites")
        .delete()
        .eq("customer_id", user.id)
        .eq("helper_id", data.helperId);
      if (error) throw error;
    }

    return { success: true };
  });

/**
 * Holt alle Favoriten des Customers
 */
export const getMyFavorites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, user } = context;

    const { data: favorites, error } = await supabase
      .from("favorites")
      .select(`
        helper_id,
        profiles!favorites_helper_id_fkey (
          id,
          display_name,
          city,
          postal_code,
          bio,
          business_name,
          available_today
        )
      `)
      .eq("customer_id", user.id);

    if (error) throw error;
    return { favorites: favorites ?? [] };
  });

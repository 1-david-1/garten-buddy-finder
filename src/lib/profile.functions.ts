import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

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
    const { supabase, userId, claims } = context;

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) throw error;

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    return {
      profile,
      roles: (roles ?? []).map((r) => r.role),
      email: claims.email as string | undefined,
    };
  });

/**
 * Aktualisiert das eigene Profil
 */
export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: ProfileUpdateInput) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const profileUpdate: Database["public"]["Tables"]["profiles"]["Update"] = {};
    if (data.displayName !== undefined) profileUpdate.display_name = data.displayName;
    if (data.city !== undefined) profileUpdate.city = data.city;
    if (data.postalCode !== undefined) profileUpdate.postal_code = data.postalCode;
    if (data.bio !== undefined) profileUpdate.bio = data.bio;
    if (data.businessName !== undefined) profileUpdate.business_name = data.businessName;
    if (data.ustId !== undefined) profileUpdate.ust_id = data.ustId;
    if (data.language !== undefined) profileUpdate.language = data.language;

    // birthdate + guardian_email liegen aus Datenschutzgründen in profile_private,
    // nicht in profiles (siehe Migration 20260721091500_profile_private.sql).
    const privateUpdate: Database["public"]["Tables"]["profile_private"]["Update"] = {};
    if (data.birthdate !== undefined) privateUpdate.birthdate = data.birthdate;
    if (data.guardianEmail !== undefined) privateUpdate.guardian_email = data.guardianEmail;

    if (Object.keys(privateUpdate).length > 0) {
      const { error: privateError } = await supabase
        .from("profile_private")
        .update(privateUpdate)
        .eq("id", userId);
      if (privateError) throw privateError;
    }

    let profile: Database["public"]["Tables"]["profiles"]["Row"] | null = null;
    if (Object.keys(profileUpdate).length > 0) {
      const { data: updated, error } = await supabase
        .from("profiles")
        .update(profileUpdate)
        .eq("id", userId)
        .select()
        .single();
      if (error) throw error;
      profile = updated;
    } else {
      const { data: current, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      if (error) throw error;
      profile = current;
    }

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
    const { supabase, userId } = context;

    if (data.add) {
      const { error } = await supabase
        .from("favorites")
        .insert({ customer_id: userId, helper_id: data.helperId });
      if (error && error.code !== "23505") throw error; // Ignore duplicate
    } else {
      const { error } = await supabase
        .from("favorites")
        .delete()
        .eq("customer_id", userId)
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
    const { supabase, userId } = context;

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
      .eq("customer_id", userId);

    if (error) throw error;
    return { favorites: favorites ?? [] };
  });

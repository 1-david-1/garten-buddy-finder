import { createServerFn } from "@tanstack/react-start";
import { businessNameSchema, displayNameSchema, optionalCitySchema } from "@/lib/sanitize";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchProfilesByIds } from "@/lib/profile-lookup";
import {
  helperIdSchema,
  notificationPrefsSchema,
  parseInput,
  toggleFavoriteSchema,
} from "@/lib/validation";
import type { Database } from "@/integrations/supabase/types";

import { z } from "zod";

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

const profileUpdateSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    city: optionalCitySchema.optional(),
    postalCode: z.string().trim().max(10).optional(),
    bio: z.string().trim().max(2000).optional(),
    businessName: businessNameSchema.optional(),
    ustId: z
      .string()
      .trim()
      .max(30)
      .regex(/^[A-Z]{2}\d{9,11}$|^$/i)
      .optional(),
    birthdate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((v) => {
        const d = new Date(`${v}T00:00:00Z`);
        return (
          !Number.isNaN(d.getTime()) &&
          d.toISOString().slice(0, 10) === v &&
          d.getUTCFullYear() >= 1900 &&
          d.getTime() <= Date.now()
        );
      }, "Bitte gib ein gültiges Geburtsdatum an.")
      .optional(),
    guardianEmail: z.string().trim().email().max(254).optional(),
    language: z.enum(["de", "en"]).optional(),
  })
  .strict();

/**
 * Holt das eigene Profil
 */
export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;

    // Mit 18 wird aus dem Jugendlichen-Konto automatisch ein Erwachsenen-Konto (best effort,
    // zusätzlich läuft das täglich per pg_cron, sofern verfügbar).
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error: syncError } = await supabaseAdmin.rpc("sync_youth_to_adult", { _user_id: userId });
      if (syncError) console.error("[profile] sync_youth_to_adult:", syncError.message);
    } catch (err) {
      console.error("[profile] sync_youth_to_adult:", (err as Error).message);
    }

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
  .inputValidator((data: unknown) => parseInput(profileUpdateSchema, data))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const profileUpdate: Database["public"]["Tables"]["profiles"]["Update"] =
      {};
    if (data.displayName !== undefined)
      profileUpdate.display_name = data.displayName;
    if (data.city !== undefined) profileUpdate.city = data.city;
    if (data.postalCode !== undefined)
      profileUpdate.postal_code = data.postalCode;
    if (data.bio !== undefined) profileUpdate.bio = data.bio;
    if (data.businessName !== undefined)
      profileUpdate.business_name = data.businessName;
    if (data.ustId !== undefined) profileUpdate.ust_id = data.ustId;
    if (data.language !== undefined) profileUpdate.language = data.language;

    // birthdate + guardian_email liegen aus Datenschutzgründen in profile_private,
    // nicht in profiles (siehe Migration 20260721091500_profile_private.sql).
    const privateUpdate: Database["public"]["Tables"]["profile_private"]["Update"] =
      {};
    if (data.birthdate !== undefined) privateUpdate.birthdate = data.birthdate;
    if (data.guardianEmail !== undefined)
      privateUpdate.guardian_email = data.guardianEmail;

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
 * Aktualisiert die E-Mail-Benachrichtigungs-Präferenzen (Teil-Update, andere
 * Kategorien bleiben unangetastet).
 */
export const updateNotificationPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => parseInput(notificationPrefsSchema, data))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const { data: current, error: readError } = await supabase
      .from("profiles")
      .select("notification_prefs")
      .eq("id", userId)
      .maybeSingle();
    if (readError) throw readError;

    const existing = (current?.notification_prefs ?? {}) as Record<
      string,
      boolean
    >;
    const prefs = {
      enabled: existing.enabled ?? true,
      new_bid: existing.new_bid ?? true,
      bid_updates: existing.bid_updates ?? true,
      gig_updates: existing.gig_updates ?? true,
    };

    if (data.enabled !== undefined) prefs.enabled = data.enabled;
    if (data.newBid !== undefined) prefs.new_bid = data.newBid;
    if (data.bidUpdates !== undefined) prefs.bid_updates = data.bidUpdates;
    if (data.gigUpdates !== undefined) prefs.gig_updates = data.gigUpdates;

    const { error } = await supabase
      .from("profiles")
      .update({ notification_prefs: prefs })
      .eq("id", userId);
    if (error) throw error;

    return { notificationPrefs: prefs };
  });

/**
 * Holt ein öffentliches Helferprofil
 */
export const getHelperProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => parseInput(helperIdSchema, data))
  .handler(async ({ context, data }) => {
    const { supabase } = context;

    const { data: profile, error } = await supabase
      .from("profiles")
      .select(
        "id, display_name, city, postal_code, bio, business_name, available_today, vacation_mode, trust_score, verified_at",
      )
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
      .select("rating, comment, created_at, customer_id, gigs(title)")
      .eq("helper_id", data.helperId)
      .order("created_at", { ascending: false })
      .limit(10);

    const reviewerProfiles = await fetchProfilesByIds(
      supabase,
      (reviews ?? []).map((review) => review.customer_id),
    );
    const reviewsWithProfiles = (reviews ?? []).map((review) => {
      const profile = reviewerProfiles.get(review.customer_id);
      return {
        ...review,
        profiles: profile ? { display_name: profile.displayName } : null,
      };
    });

    const ratings = (reviews ?? []).map((r) => r.rating);
    const avgRating =
      ratings.length > 0
        ? ratings.reduce((a, b) => a + b, 0) / ratings.length
        : null;

    const { data: listings } = await supabase
      .from("service_listings")
      .select(
        "id, title, service_type, listing_type, price_cents, start_price_cents, current_price_cents, photos",
      )
      .eq("helper_id", data.helperId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(6);

    return {
      profile,
      roles: (roles ?? []).map((r) => r.role),
      reviews: reviewsWithProfiles,
      avgRating,
      reviewCount: ratings.length,
      activeListings: listings ?? [],
    };
  });

/**
 * Fügt oder entfernt einen Helper aus den Favoriten
 */
export const toggleFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => parseInput(toggleFavoriteSchema, data))
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
      .select("helper_id")
      .eq("customer_id", userId);

    if (error) throw error;

    const { data: profileRows, error: profilesError } = await supabase
      .from("profiles")
      .select(
        "id, display_name, city, postal_code, bio, business_name, available_today",
      )
      .in(
        "id",
        (favorites ?? []).map((favorite) => favorite.helper_id),
      );

    if (profilesError) throw profilesError;

    const profileMap = new Map(
      (profileRows ?? []).map((profile) => [profile.id, profile]),
    );
    return {
      favorites: (favorites ?? []).map((favorite) => ({
        helper_id: favorite.helper_id,
        profiles: profileMap.get(favorite.helper_id) ?? null,
      })),
    };
  });

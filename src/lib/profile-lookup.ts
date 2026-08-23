import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Loads public profile data for user IDs without relying on a PostgREST
 * relationship between a domain table and `profiles`.
 */
export async function fetchProfilesByIds(
  supabase: SupabaseClient,
  ids: (string | null | undefined)[],
): Promise<
  Map<
    string,
    {
      id: string;
      displayName: string;
      city: string | null;
      postalCode: string | null;
      verifiedAt: string | null;
    }
  >
> {
  const uniqueIds = [...new Set(ids.filter((id): id is string => !!id))];
  const profiles = new Map<
    string,
    {
      id: string;
      displayName: string;
      city: string | null;
      postalCode: string | null;
      verifiedAt: string | null;
    }
  >();

  if (uniqueIds.length === 0) return profiles;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, city, postal_code, verified_at")
    .in("id", uniqueIds);

  if (error) throw error;

  for (const profile of data ?? []) {
    profiles.set(profile.id, {
      id: profile.id,
      displayName: profile.display_name ?? "",
      city: profile.city,
      postalCode: profile.postal_code,
      verifiedAt: profile.verified_at,
    });
  }

  return profiles;
}

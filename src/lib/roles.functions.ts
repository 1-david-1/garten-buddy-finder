import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const roleEnum = z.enum(["customer", "helper_youth", "helper_adult", "helper_pro"]);

const OnboardingSchema = z.object({
  role: roleEnum,
  displayName: z.string().min(2).max(80),
  city: z.string().max(80).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
  birthdate: z.string().optional().nullable(), // ISO date
  businessName: z.string().max(120).optional().nullable(),
  vatId: z.string().max(40).optional().nullable(),
  guardianEmail: z.string().email().optional().nullable(),
  language: z.enum(["de", "en"]).default("de"),
});

export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => OnboardingSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Age check for youth role
    if (data.role === "helper_youth") {
      if (!data.birthdate) throw new Error("birthdate_required");
      const age = ageFromISO(data.birthdate);
      if (age < 13 || age > 17) throw new Error("age_not_in_youth_range");
      if (!data.guardianEmail) throw new Error("guardian_email_required");
    }
    if (data.role === "helper_adult" || data.role === "helper_pro") {
      if (data.birthdate && ageFromISO(data.birthdate) < 18) throw new Error("must_be_adult");
    }
    if (data.role === "helper_pro") {
      if (!data.businessName || !data.vatId) throw new Error("business_details_required");
    }

    const { error: pErr } = await supabase.from("profiles").upsert(
      {
        id: userId,
        display_name: data.displayName,
        city: data.city ?? null,
        postal_code: data.postalCode ?? null,
        business_name: data.businessName ?? null,
        ust_id: data.vatId ?? null,
        language: data.language,
      },
      { onConflict: "id" },
    );
    if (pErr) throw pErr;

    // birthdate + guardian_email are sensitive (exact age, a minor's parent
    // contact) — kept out of the publicly-readable profiles table.
    const { error: ppErr } = await supabase.from("profile_private").upsert(
      {
        id: userId,
        birthdate: data.birthdate ?? null,
        guardian_email: data.guardianEmail ?? null,
      },
      { onConflict: "id" },
    );
    if (ppErr) throw ppErr;

    // Insert role — user_roles has a unique(user_id, role) so use upsert semantics
    const { error: rErr } = await supabase
      .from("user_roles")
      .insert({ user_id: userId, role: data.role });
    if (rErr && !String(rErr.message).includes("duplicate")) throw rErr;

    return { ok: true, role: data.role };
  });

export const getMyRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (error) throw error;
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("display_name, city, language")
      .eq("id", context.userId)
      .maybeSingle();
    return { roles: (data ?? []).map((r) => r.role as string), profile };
  });

function ageFromISO(iso: string): number {
  const d = new Date(iso);
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
}

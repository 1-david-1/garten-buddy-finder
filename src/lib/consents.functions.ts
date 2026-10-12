import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CUSTOMER_RULES_VERSION, HELPER_SAFETY_VERSION } from "@/lib/consent-texts";

/**
 * Einmalige Bestätigungen je Textversion:
 *  - Auftraggeber: Kinderschutzregeln + verbotene Tätigkeiten
 *  - Helfer: Sicherheitsinformationen
 * Die Version steht in consent-texts.ts; bei geändertem Text muss neu bestätigt werden.
 */
const VERSIONS = {
  customer_child_protection_rules: CUSTOMER_RULES_VERSION,
  helper_safety_info: HELPER_SAFETY_VERSION,
} as const;

export const acceptConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ kind: z.enum(["customer_child_protection_rules", "helper_safety_info"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("user_consents").upsert(
      { user_id: context.userId, kind: data.kind, text_version: VERSIONS[data.kind] },
      { onConflict: "user_id,kind,text_version", ignoreDuplicates: true },
    );
    if (error) throw error;
    return { ok: true as const };
  });

export const getMyConsents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_consents")
      .select("kind, text_version")
      .eq("user_id", context.userId);
    if (error) throw error;
    const has = (kind: keyof typeof VERSIONS) =>
      (data ?? []).some((c) => c.kind === kind && c.text_version === VERSIONS[kind]);
    return {
      customerRulesAccepted: has("customer_child_protection_rules"),
      helperSafetyAccepted: has("helper_safety_info"),
    };
  });

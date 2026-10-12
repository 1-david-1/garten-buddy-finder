import { createServerFn } from "@tanstack/react-start";
import { requireAdminAuth } from "@/lib/admin-middleware";

/**
 * Admin: Zähler für den "Handlungsbedarf" (Übersicht + Badges an den Tabs).
 *
 *  - openReports:      Meldungen mit Status "offen" oder "eskaliert"
 *  - urgentReports:    davon schwere Meldungen (severity = severe) oder eskalierte
 *  - pendingIdentity:  offene Ausweisprüfungen
 *  - pendingYouth:     offene Jugend-Unterlagen (Zustimmung der Eltern)
 */
export const getAdminAttentionCounts = createServerFn({ method: "GET" })
  .middleware([requireAdminAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const head = { count: "exact", head: true } as const;
    const [openRes, urgentSevereRes, escalatedRes, identityRes, youthRes] = await Promise.all([
      supabaseAdmin.from("user_reports").select("id", head).in("status", ["open", "escalated"]),
      supabaseAdmin
        .from("user_reports")
        .select("id", head)
        .eq("status", "open")
        .eq("severity", "severe"),
      supabaseAdmin.from("user_reports").select("id", head).eq("status", "escalated"),
      supabaseAdmin
        .from("verification_requests")
        .select("id", head)
        .eq("kind", "identity")
        .eq("status", "pending"),
      supabaseAdmin
        .from("verification_requests")
        .select("id", head)
        .eq("kind", "youth_documents")
        .eq("status", "pending"),
    ]);
    for (const r of [openRes, urgentSevereRes, escalatedRes, identityRes, youthRes]) {
      if (r.error) throw r.error;
    }

    return {
      openReports: openRes.count ?? 0,
      urgentReports: (urgentSevereRes.count ?? 0) + (escalatedRes.count ?? 0),
      pendingIdentity: identityRes.count ?? 0,
      pendingYouth: youthRes.count ?? 0,
    };
  });

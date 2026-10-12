import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdminAuth } from "@/lib/admin-middleware";

/**
 * Melden, Blockieren und Sperren.
 *  - Jede/r angemeldete Nutzer/in kann melden und blockieren.
 *  - Eltern können im Namen ihres Kindes melden und blockieren (onBehalfOfChildId).
 *  - Das GreenMatch-Team bearbeitet Meldungen und kann Konten sperren.
 * Durchgesetzt wird in der Datenbank (Trigger/Policies in der Migration 20261008...).
 */

export const REPORT_REASONS = [
  { value: "inappropriate_message", label: "Unangemessene Nachricht" },
  { value: "sexualized_contact", label: "Sexualisierte Nachricht oder Kontaktaufnahme" },
  { value: "pressure_or_threat", label: "Druck oder Drohung" },
  { value: "dangerous_activity", label: "Gefährliche Tätigkeit" },
  { value: "forbidden_activity", label: "Verbotene Tätigkeit" },
  { value: "off_platform_contact", label: "Versuch, die Kommunikation außerhalb der Plattform zu verlagern" },
  { value: "false_age", label: "Falsche Altersangabe" },
  { value: "false_identity", label: "Falsche Identitätsangabe" },
  { value: "job_changed", label: "Änderung des Auftrags" },
  { value: "harassment", label: "Belästigung" },
  { value: "fraud_suspicion", label: "Betrugsverdacht" },
  { value: "other_safety_risk", label: "Sonstige Sicherheitsgefahr" },
] as const;

/** Frühere Kategorien (Runde 1) - bleiben für die Anzeige bereits gespeicherter Meldungen gültig. */
export const LEGACY_REPORT_REASON_LABELS: Record<string, string> = {
  inappropriate_behavior: "Unangemessenes Verhalten",
  unsafe_conditions: "Unsichere Arbeitsbedingungen",
  fraud: "Betrug oder falsche Angaben",
  rules_violation: "Verstoß gegen Jugendschutz-Regeln",
  other: "Sonstiges",
};

/** Schwere Meldungen: automatische Pause für beteiligte Jugendliche + Eskalation + Information der Eltern. */
export const SEVERE_REPORT_REASONS = [
  "sexualized_contact",
  "pressure_or_threat",
  "dangerous_activity",
  "forbidden_activity",
  "other_safety_risk",
] as const;

export const RESTRICTION_KINDS = [
  { value: "review_hold", label: "Vorübergehende Sperre während einer Prüfung" },
  { value: "job_ban", label: "Auftragssperre" },
  { value: "communication_ban", label: "Kommunikationssperre" },
  { value: "youth_profile", label: "Sperre des Minderjährigenprofils" },
  { value: "account", label: "Vollständige Kontosperre" },
  { value: "permanent", label: "Dauerhafte Sperre (schwere oder wiederholte Verstöße)" },
] as const;

const reasonValues = [
  ...REPORT_REASONS.map((r) => r.value),
  ...Object.keys(LEGACY_REPORT_REASON_LABELS),
] as [string, ...string[]];
const restrictionValues = RESTRICTION_KINDS.map((r) => r.value) as [string, ...string[]];

// ---- Melden ----------------------------------------------------------------

export const reportUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        reportedUserId: z.string().uuid(),
        reason: z.enum(reasonValues),
        details: z.string().trim().max(1000).optional(),
        gigId: z.string().uuid().optional(),
        messageId: z.string().uuid().optional(),
        onBehalfOfChildId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.reportedUserId === userId) throw new Error("Du kannst dich nicht selbst melden.");

    if (data.onBehalfOfChildId) {
      const { assertIsGuardianOf } = await import("@/lib/server/guardian.server");
      await assertIsGuardianOf(userId, data.onBehalfOfChildId);
    }

    const severe = (SEVERE_REPORT_REASONS as readonly string[]).includes(data.reason);
    const { data: report, error } = await supabase
      .from("user_reports")
      .insert({
        reporter_id: userId,
        reported_user_id: data.reportedUserId,
        gig_id: data.gigId ?? null,
        message_id: data.messageId ?? null,
        context_child_id: data.onBehalfOfChildId ?? null,
        reason: data.reason,
        severity: severe ? "severe" : "normal",
        details: data.details || null,
      })
      .select("id")
      .single();
    if (error || !report) throw error ?? new Error("report_failed");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("user_report_events")
      .insert({ report_id: report.id, actor_id: userId, action: "created", note: severe ? "schwere Meldung" : null });

    // Schwere Meldung: beteiligte Jugendliche automatisch pausieren, Eltern informieren, eskalieren.
    if (severe) {
      const { pauseChildrenAndNotifyGuardians } = await import("@/lib/server/guardian.server");
      const candidates = new Set<string>([userId, data.reportedUserId]);
      if (data.onBehalfOfChildId) candidates.add(data.onBehalfOfChildId);
      if (data.gigId) {
        const { data: gig } = await supabaseAdmin
          .from("gigs")
          .select("assigned_helper_id")
          .eq("id", data.gigId)
          .maybeSingle();
        if (gig?.assigned_helper_id) candidates.add(gig.assigned_helper_id);
      }
      const { data: youthRoles } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("role", "helper_youth")
        .in("user_id", [...candidates]);
      const youthIds = (youthRoles ?? []).map((r) => r.user_id);

      const label = REPORT_REASONS.find((r) => r.value === data.reason)?.label ?? data.reason;
      const paused = await pauseChildrenAndNotifyGuardians(youthIds, label);

      await supabaseAdmin.from("user_reports").update({ status: "escalated" }).eq("id", report.id);
      await supabaseAdmin.from("user_report_events").insert({
        report_id: report.id,
        actor_id: null,
        action: "escalated",
        note:
          paused.length > 0
            ? `Automatisch eskaliert; ${paused.length} Minderjährigenprofil(e) pausiert, Eltern informiert.`
            : "Automatisch eskaliert.",
      });
    }
    return { ok: true as const, escalated: severe };
  });

// ---- Blockieren ------------------------------------------------------------

export const blockUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        block: z.boolean(),
        onBehalfOfChildId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const blockerId = data.onBehalfOfChildId ?? userId;
    if (data.userId === blockerId) throw new Error("Du kannst dich nicht selbst blockieren.");

    if (data.onBehalfOfChildId) {
      // Eltern blockieren für ihr Kind: Service-Role, weil die Zeile dem Kind gehört.
      const { assertIsGuardianOf } = await import("@/lib/server/guardian.server");
      await assertIsGuardianOf(userId, data.onBehalfOfChildId);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      if (data.block) {
        const { error } = await supabaseAdmin
          .from("user_blocks")
          .upsert({ blocker_id: blockerId, blocked_id: data.userId }, { onConflict: "blocker_id,blocked_id" });
        if (error) throw error;
      } else {
        const { error } = await supabaseAdmin
          .from("user_blocks")
          .delete()
          .eq("blocker_id", blockerId)
          .eq("blocked_id", data.userId);
        if (error) throw error;
      }
      return { ok: true as const };
    }

    if (data.block) {
      const { error } = await supabase
        .from("user_blocks")
        .upsert({ blocker_id: userId, blocked_id: data.userId }, { onConflict: "blocker_id,blocked_id" });
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("user_blocks")
        .delete()
        .eq("blocker_id", userId)
        .eq("blocked_id", data.userId);
      if (error) throw error;
    }
    return { ok: true as const };
  });

export const getMyBlockedUserIds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_blocks")
      .select("blocked_id")
      .eq("blocker_id", context.userId);
    if (error) throw error;
    return { blockedUserIds: (data ?? []).map((b) => b.blocked_id) };
  });

// ---- Team: Meldungen bearbeiten, Konten sperren ----------------------------

export interface AdminReportItem {
  id: string;
  createdAt: string;
  status: "open" | "escalated" | "resolved" | "dismissed";
  severity: "normal" | "severe";
  hasMessage: boolean;
  activeRestrictions: { id: string; kind: string; reason: string | null; source: string }[];
  events: { action: string; note: string | null; at: string }[];
  reason: string;
  details: string | null;
  reporterName: string;
  reportedUserId: string;
  reportedName: string;
  reportedSuspended: boolean;
  childName: string | null;
  gigTitle: string | null;
  resolutionNote: string | null;
}

export const listReports = createServerFn({ method: "GET" })
  .middleware([requireAdminAuth])
  .handler(async (): Promise<{ items: AdminReportItem[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: reports, error } = await supabaseAdmin
      .from("user_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;

    const ids = new Set<string>();
    const gigIds = new Set<string>();
    for (const r of reports ?? []) {
      ids.add(r.reporter_id);
      ids.add(r.reported_user_id);
      if (r.context_child_id) ids.add(r.context_child_id);
      if (r.gig_id) gigIds.add(r.gig_id);
    }
    const [{ data: profiles }, { data: gigs }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, display_name, suspended_at").in("id", [...ids]),
      gigIds.size
        ? supabaseAdmin.from("gigs").select("id, title").in("id", [...gigIds])
        : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    ]);
    const reportIds = (reports ?? []).map((r) => r.id);
    const reportedIds = [...new Set((reports ?? []).map((r) => r.reported_user_id))];
    const [{ data: restrictions }, { data: events }] = await Promise.all([
      reportedIds.length
        ? supabaseAdmin
            .from("account_restrictions")
            .select("id, user_id, kind, reason, source")
            .in("user_id", reportedIds)
            .is("lifted_at", null)
        : Promise.resolve({ data: [] as { id: string; user_id: string; kind: string; reason: string | null; source: string }[] }),
      reportIds.length
        ? supabaseAdmin
            .from("user_report_events")
            .select("report_id, action, note, created_at")
            .in("report_id", reportIds)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [] as { report_id: string; action: string; note: string | null; created_at: string }[] }),
    ]);
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    const gigById = new Map((gigs ?? []).map((g) => [g.id, g.title]));

    const sorted = [...(reports ?? [])].sort((a, b) => {
      const rank = (r: typeof a) => (r.status === "escalated" ? 0 : r.status === "open" ? 1 : 2);
      return rank(a) - rank(b);
    });
    return {
      items: sorted.map((r) => ({
        id: r.id,
        createdAt: r.created_at,
        status: r.status as AdminReportItem["status"],
        severity: (r.severity as AdminReportItem["severity"]) ?? "normal",
        hasMessage: Boolean(r.message_id),
        activeRestrictions: (restrictions ?? [])
          .filter((x) => x.user_id === r.reported_user_id)
          .map((x) => ({ id: x.id, kind: x.kind, reason: x.reason, source: x.source })),
        events: (events ?? [])
          .filter((e) => e.report_id === r.id)
          .map((e) => ({ action: e.action, note: e.note, at: e.created_at })),
        reason: r.reason,
        details: r.details,
        reporterName: byId.get(r.reporter_id)?.display_name ?? "—",
        reportedUserId: r.reported_user_id,
        reportedName: byId.get(r.reported_user_id)?.display_name ?? "—",
        reportedSuspended: Boolean(byId.get(r.reported_user_id)?.suspended_at),
        childName: r.context_child_id ? (byId.get(r.context_child_id)?.display_name ?? "—") : null,
        gigTitle: r.gig_id ? (gigById.get(r.gig_id) ?? null) : null,
        resolutionNote: r.resolution_note,
      })),
    };
  });

export const resolveReport = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        reportId: z.string().uuid(),
        status: z.enum(["resolved", "dismissed", "escalated"]),
        note: z.string().trim().max(500).optional(),
        /** optional: gleichzeitig eine Sperre verhängen */
        restriction: z.enum(restrictionValues).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: report } = await supabaseAdmin
      .from("user_reports")
      .select("id, reported_user_id")
      .eq("id", data.reportId)
      .maybeSingle();
    if (!report) throw new Error("not_found");

    if (data.restriction) {
      const { applyRestriction } = await import("@/lib/server/safety.server");
      await applyRestriction({
        userId: report.reported_user_id,
        kind: data.restriction,
        reason: data.note,
        actorId: context.userId,
      });
    }

    const closed = data.status !== "escalated";
    const { error } = await supabaseAdmin
      .from("user_reports")
      .update({
        status: data.status,
        resolution_note: data.note || null,
        resolved_by: closed ? context.userId : null,
        resolved_at: closed ? new Date().toISOString() : null,
      })
      .eq("id", data.reportId);
    if (error) throw error;

    await supabaseAdmin.from("user_report_events").insert({
      report_id: data.reportId,
      actor_id: context.userId,
      action: data.status,
      note: [data.restriction ? `Sperre: ${data.restriction}` : null, data.note].filter(Boolean).join(" · ") || null,
    });
    return { ok: true as const };
  });

/** Sperre verhängen (Team). */
export const setRestriction = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        kind: z.enum(restrictionValues),
        reason: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { applyRestriction } = await import("@/lib/server/safety.server");
    await applyRestriction({ userId: data.userId, kind: data.kind, reason: data.reason, actorId: context.userId });
    return { ok: true as const };
  });

/** Sperre aufheben (Team). */
export const liftRestriction = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((input: unknown) => z.object({ restrictionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("account_restrictions")
      .update({ lifted_at: new Date().toISOString(), lifted_by: context.userId })
      .eq("id", data.restrictionId)
      .is("lifted_at", null);
    if (error) throw error;
    return { ok: true as const };
  });

/** Erneute Prüfung verlangen oder aufheben (z. B. bei Zweifeln an Alters- oder Identitätsangaben). */
export const setReverificationRequired = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid(), required: z.boolean() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ reverification_required_at: data.required ? new Date().toISOString() : null })
      .eq("id", data.userId);
    if (error) throw error;
    await supabaseAdmin
      .from("verification_results")
      .update({ status: data.required ? "reverification_required" : "verified" })
      .eq("user_id", data.userId);
    return { ok: true as const };
  });

// ---- Sicherheits-Abbruch (Notfall- und Abbruchfunktion) --------------------

/**
 * Auftrag sofort abbrechen, wenn man sich unsicher fühlt oder Gefahr besteht.
 * Ohne negative Folgen: kein Grund nötig, keine Bewertung. Beteiligte werden informiert,
 * bei Jugendlichen automatisch auch die Eltern.
 */
export const abortGigForSafety = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ gigId: z.string().uuid(), note: z.string().trim().max(500).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: gig } = await supabase
      .from("gigs")
      .select("id, title, status, customer_id, assigned_helper_id")
      .eq("id", data.gigId)
      .maybeSingle();
    if (!gig) throw new Error("Auftrag nicht gefunden.");
    if (gig.customer_id !== userId && gig.assigned_helper_id !== userId) {
      throw new Error("Nicht berechtigt.");
    }
    if (!["pending_helper", "assigned", "in_progress"].includes(gig.status)) {
      throw new Error("Dieser Auftrag kann nicht mehr abgebrochen werden.");
    }

    const { error } = await supabase
      .from("gigs")
      .update({
        status: "cancelled",
        cancellation_reason: `Sicherheitsabbruch${data.note ? `: ${data.note}` : ""}`,
        cancelled_by: userId,
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", data.gigId);
    if (error) throw error;

    const { notifySafetyAbort } = await import("@/lib/server/safety.server");
    await notifySafetyAbort({ gig, actorId: userId });
    return { ok: true as const };
  });

export const setUserSuspended = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid(), suspended: z.boolean() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ suspended_at: data.suspended ? new Date().toISOString() : null })
      .eq("id", data.userId);
    if (error) throw error;
    return { ok: true as const };
  });

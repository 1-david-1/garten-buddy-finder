import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminAuth } from "@/lib/admin-middleware";

const DAY = 86_400_000;

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

// ------------------------------------------------------------------
// Übersicht
// ------------------------------------------------------------------

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireAdminAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const since14 = new Date(Date.now() - 14 * DAY).toISOString();

    const [
      profilesRes,
      rolesRes,
      gigsRes,
      escrowRes,
      auditRes,
      settingsRes,
      recentProfilesRes,
      recentGigsRes,
    ] = await Promise.all([
      supabase.from("profiles").select("id, created_at"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("gigs").select("id, status, created_at"),
      supabase
        .from("escrow_transactions")
        .select("bid_cents, customer_fee_cents, helper_fee_cents, state, paid_out_at"),
      supabase
        .from("admin_audit_log")
        .select("id, admin_id, action, target_type, target_id, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
      supabase.from("admin_settings").select("key, value"),
      supabase.from("profiles").select("id, created_at").gte("created_at", since14),
      supabase.from("gigs").select("id, created_at").gte("created_at", since14),
    ]);

    if (profilesRes.error) throw profilesRes.error;
    if (rolesRes.error) throw rolesRes.error;
    if (gigsRes.error) throw gigsRes.error;
    if (escrowRes.error) throw escrowRes.error;
    if (auditRes.error) throw auditRes.error;
    if (settingsRes.error) throw settingsRes.error;
    if (recentProfilesRes.error) throw recentProfilesRes.error;
    if (recentGigsRes.error) throw recentGigsRes.error;

    const gigs = gigsRes.data ?? [];
    const roles = rolesRes.data ?? [];
    const escrow = escrowRes.data ?? [];

    const activeStatuses = new Set(["open", "negotiating", "assigned", "in_progress"]);
    const activeGigs = gigs.filter((g) => activeStatuses.has(g.status)).length;
    const completedGigs = gigs.filter((g) => g.status === "completed").length;

    const gigStatusBreakdown = [
      "draft",
      "open",
      "negotiating",
      "assigned",
      "in_progress",
      "completed",
      "cancelled",
    ].map((status) => ({
      status,
      count: gigs.filter((g) => g.status === status).length,
    }));

    const helperRoleSet = new Set(["helper_youth", "helper_adult", "helper_pro"]);
    const helperIds = new Set(roles.filter((r) => helperRoleSet.has(r.role)).map((r) => r.user_id));
    const customerIds = new Set(
      roles.filter((r) => r.role === "customer").map((r) => r.user_id),
    );

    const paidOut = escrow.filter((e) => e.state === "paid_out");
    const grossVolumeCents = paidOut.reduce((s, e) => s + e.bid_cents, 0);
    const platformFeesCents = paidOut.reduce(
      (s, e) => s + e.customer_fee_cents + e.helper_fee_cents,
      0,
    );
    const openDisputes = escrow.filter((e) => e.state === "disputed").length;

    // 14-Tage Buckets für Signups & neue Aufträge
    const dayLabels = Array.from({ length: 14 }, (_, i) => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - (13 - i));
      return d;
    });
    const signupsByDay = new Map<string, number>();
    for (const p of recentProfilesRes.data ?? []) {
      const k = dayKey(new Date(p.created_at));
      signupsByDay.set(k, (signupsByDay.get(k) ?? 0) + 1);
    }
    const gigsByDay = new Map<string, number>();
    for (const g of recentGigsRes.data ?? []) {
      const k = dayKey(new Date(g.created_at));
      gigsByDay.set(k, (gigsByDay.get(k) ?? 0) + 1);
    }
    const growthChart = dayLabels.map((d) => {
      const k = dayKey(d);
      return {
        label: d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }),
        signups: signupsByDay.get(k) ?? 0,
        gigs: gigsByDay.get(k) ?? 0,
      };
    });

    // Admin-Namen für's Audit-Log nachladen
    const auditRows = auditRes.data ?? [];
    const adminIds = Array.from(new Set(auditRows.map((a) => a.admin_id)));
    const { data: adminProfiles } = adminIds.length
      ? await supabase.from("profiles").select("id, display_name").in("id", adminIds)
      : { data: [] as { id: string; display_name: string }[] };
    const adminNameById = new Map((adminProfiles ?? []).map((p) => [p.id, p.display_name]));

    const recentAuditLog = auditRows.map((a) => ({
      id: a.id,
      adminName: adminNameById.get(a.admin_id) ?? "—",
      action: a.action,
      targetType: a.target_type,
      targetId: a.target_id,
      createdAt: a.created_at,
    }));

    const settingsByKey = new Map((settingsRes.data ?? []).map((s) => [s.key, s.value]));

    return {
      kpis: {
        totalUsers: (profilesRes.data ?? []).length,
        totalHelpers: helperIds.size,
        totalCustomers: customerIds.size,
        activeGigs,
        completedGigs,
        grossVolumeCents,
        platformFeesCents,
        openDisputes,
      },
      growthChart,
      gigStatusBreakdown,
      recentAuditLog,
      quickSettings: {
        maintenanceMode: Boolean(settingsByKey.get("maintenance_mode") ?? false),
        registrationEnabled: Boolean(settingsByKey.get("registration_enabled") ?? true),
      },
    };
  });

// ------------------------------------------------------------------
// Nutzer
// ------------------------------------------------------------------

export const getAdminUsers = createServerFn({ method: "GET" })
  .middleware([requireAdminAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;

    const [profilesRes, rolesRes] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          "id, display_name, city, trust_score, verified_at, business_name, ust_id, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.from("user_roles").select("user_id, role"),
    ]);

    if (profilesRes.error) throw profilesRes.error;
    if (rolesRes.error) throw rolesRes.error;

    const rolesByUser = new Map<string, string[]>();
    for (const r of rolesRes.data ?? []) {
      const list = rolesByUser.get(r.user_id) ?? [];
      list.push(r.role);
      rolesByUser.set(r.user_id, list);
    }

    return {
      users: (profilesRes.data ?? []).map((p) => ({
        id: p.id,
        displayName: p.display_name,
        city: p.city,
        trustScore: p.trust_score,
        verifiedAt: p.verified_at,
        businessName: p.business_name,
        ustId: p.ust_id,
        createdAt: p.created_at,
        roles: rolesByUser.get(p.id) ?? [],
      })),
    };
  });

export const setUserVerified = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid(), verified: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("profiles")
      .update({ verified_at: data.verified ? new Date().toISOString() : null })
      .eq("id", data.userId);
    if (error) throw error;

    await supabase.rpc("log_admin_action", {
      _action: data.verified ? "user.verify" : "user.unverify",
      _target_type: "user",
      _target_id: data.userId,
      _metadata: null,
    });

    return { ok: true };
  });

export const adjustTrustScore = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ userId: z.string().uuid(), delta: z.number().int().min(-100).max(100) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: profile, error: readErr } = await supabase
      .from("profiles")
      .select("trust_score")
      .eq("id", data.userId)
      .maybeSingle();
    if (readErr) throw readErr;

    const nextScore = Math.max(0, Math.min(100, (profile?.trust_score ?? 50) + data.delta));
    const { error } = await supabase
      .from("profiles")
      .update({ trust_score: nextScore })
      .eq("id", data.userId);
    if (error) throw error;

    await supabase.rpc("log_admin_action", {
      _action: "user.adjust_trust_score",
      _target_type: "user",
      _target_id: data.userId,
      _metadata: { delta: data.delta, next_score: nextScore },
    });

    return { ok: true, trustScore: nextScore };
  });

// ------------------------------------------------------------------
// Aufträge
// ------------------------------------------------------------------

export const getAdminGigs = createServerFn({ method: "GET" })
  .middleware([requireAdminAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        status: z
          .enum([
            "all",
            "draft",
            "open",
            "negotiating",
            "assigned",
            "in_progress",
            "completed",
            "cancelled",
          ])
          .default("all"),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    let query = supabase
      .from("gigs")
      .select(
        "id, title, service_type, budget_cents, status, customer_id, assigned_helper_id, scheduled_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.status !== "all") query = query.eq("status", data.status);

    const { data: gigs, error } = await query;
    if (error) throw error;

    const rows = gigs ?? [];
    const userIds = Array.from(
      new Set(
        rows.flatMap((g) => [g.customer_id, g.assigned_helper_id].filter(Boolean) as string[]),
      ),
    );
    const gigIds = rows.map((g) => g.id);

    const [profilesRes, negotiationsRes, escrowRes] = await Promise.all([
      userIds.length
        ? supabase.from("profiles").select("id, display_name").in("id", userIds)
        : Promise.resolve({ data: [] as { id: string; display_name: string }[], error: null }),
      gigIds.length
        ? supabase.from("negotiations").select("gig_id").in("gig_id", gigIds)
        : Promise.resolve({ data: [] as { gig_id: string }[], error: null }),
      gigIds.length
        ? supabase.from("escrow_transactions").select("gig_id, state").in("gig_id", gigIds)
        : Promise.resolve({ data: [] as { gig_id: string; state: string }[], error: null }),
    ]);
    if (profilesRes.error) throw profilesRes.error;
    if (negotiationsRes.error) throw negotiationsRes.error;
    if (escrowRes.error) throw escrowRes.error;

    const nameById = new Map((profilesRes.data ?? []).map((p) => [p.id, p.display_name]));
    const negotiationCountByGig = new Map<string, number>();
    for (const n of negotiationsRes.data ?? []) {
      negotiationCountByGig.set(n.gig_id, (negotiationCountByGig.get(n.gig_id) ?? 0) + 1);
    }
    const escrowStateByGig = new Map((escrowRes.data ?? []).map((e) => [e.gig_id, e.state]));

    return {
      gigs: rows.map((g) => ({
        id: g.id,
        title: g.title,
        serviceType: g.service_type,
        budgetCents: g.budget_cents,
        status: g.status,
        customerName: nameById.get(g.customer_id) ?? "—",
        helperName: g.assigned_helper_id ? (nameById.get(g.assigned_helper_id) ?? "—") : null,
        scheduledAt: g.scheduled_at,
        createdAt: g.created_at,
        negotiationCount: negotiationCountByGig.get(g.id) ?? 0,
        escrowState: escrowStateByGig.get(g.id) ?? null,
      })),
    };
  });

// ------------------------------------------------------------------
// Einstellungen
// ------------------------------------------------------------------

export const getAdminSettings = createServerFn({ method: "GET" })
  .middleware([requireAdminAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("admin_settings")
      .select("key, value, description, updated_at")
      .order("key", { ascending: true });
    if (error) throw error;
    return { settings: data ?? [] };
  });

const settingValueSchema = z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]);

export const updateAdminSetting = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((input: unknown) =>
    z.object({ key: z.string().min(1).max(100), value: settingValueSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("admin_settings")
      .update({ value: data.value })
      .eq("key", data.key);
    if (error) throw error;

    await supabase.rpc("log_admin_action", {
      _action: "setting.update",
      _target_type: "setting",
      _target_id: null,
      _metadata: { key: data.key, value: data.value },
    });

    return { ok: true };
  });

// ------------------------------------------------------------------
// Audit-Log
// ------------------------------------------------------------------

export const getAdminAuditLog = createServerFn({ method: "GET" })
  .middleware([requireAdminAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("admin_audit_log")
      .select("id, admin_id, action, target_type, target_id, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;

    const rows = data ?? [];
    const adminIds = Array.from(new Set(rows.map((r) => r.admin_id)));
    const { data: admins } = adminIds.length
      ? await supabase.from("profiles").select("id, display_name").in("id", adminIds)
      : { data: [] as { id: string; display_name: string }[] };
    const nameById = new Map((admins ?? []).map((p) => [p.id, p.display_name]));

    return {
      entries: rows.map((r) => ({
        id: r.id,
        adminName: nameById.get(r.admin_id) ?? "—",
        action: r.action,
        targetType: r.target_type,
        targetId: r.target_id,
        metadata: r.metadata,
        createdAt: r.created_at,
      })),
    };
  });

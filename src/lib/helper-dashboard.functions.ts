import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PSTG_TX_THRESHOLD = 25;
const PSTG_GROSS_CENTS_THRESHOLD = 180000; // 1.800 €

export const getHelperDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const year = new Date().getFullYear();

    const [profileRes, privateRes, gigsRes, escrowRes, reviewsRes, earningsRes] = await Promise.all(
      [
        supabase
          .from("profiles")
          .select("display_name, available_today")
          .eq("id", userId)
          .maybeSingle(),
        supabase.from("profile_private").select("tax_id, birthdate").eq("id", userId).maybeSingle(),
        supabase
          .from("gigs")
          .select(
            "id, title, service_type, budget_cents, address, scheduled_at, status, customer_id",
          )
          .eq("assigned_helper_id", userId)
          .order("scheduled_at", { ascending: false, nullsFirst: false })
          .limit(20),
        supabase
          .from("escrow_transactions")
          .select("id, gig_id, bid_cents, helper_fee_cents, state, paid_out_at, created_at")
          .eq("helper_id", userId)
          .order("created_at", { ascending: false })
          .limit(90),
        supabase.from("reviews").select("rating").eq("helper_id", userId),
        supabase
          .from("earnings_tracker")
          .select("tx_count, gross_cents, payouts_locked")
          .eq("helper_id", userId)
          .eq("year", year)
          .maybeSingle(),
      ],
    );

    if (profileRes.error) throw profileRes.error;
    if (privateRes.error) throw privateRes.error;
    if (gigsRes.error) throw gigsRes.error;
    if (escrowRes.error) throw escrowRes.error;
    if (reviewsRes.error) throw reviewsRes.error;
    if (earningsRes.error) throw earningsRes.error;

    const gigs = gigsRes.data ?? [];
    const escrow = escrowRes.data ?? [];
    const reviews = reviewsRes.data ?? [];

    // Customer display names for the recent-orders list
    const customerIds = Array.from(new Set(gigs.map((g) => g.customer_id)));
    const { data: customerProfiles } = customerIds.length
      ? await supabase.from("profiles").select("id, display_name").in("id", customerIds)
      : { data: [] as { id: string; display_name: string }[] };
    const nameById = new Map((customerProfiles ?? []).map((p) => [p.id, p.display_name]));

    // Completion rate (Erfolgsquote): completed vs. completed+cancelled
    const finished = gigs.filter((g) => g.status === "completed" || g.status === "cancelled");
    const completed = gigs.filter((g) => g.status === "completed");
    const completionRate = finished.length > 0 ? completed.length / finished.length : null;

    // Average rating
    const ratingCount = reviews.length;
    const avgRating =
      ratingCount > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / ratingCount : null;

    // Net earnings = bid - helper_fee, only for paid-out transactions
    const paidOut = escrow.filter((e) => e.state === "paid_out" && e.paid_out_at);
    const netCentsOf = (e: (typeof escrow)[number]) => e.bid_cents - e.helper_fee_cents;

    const now = Date.now();
    const DAY = 86_400_000;
    const last7Total = paidOut
      .filter((e) => now - new Date(e.paid_out_at!).getTime() <= 7 * DAY)
      .reduce((s, e) => s + netCentsOf(e), 0);
    const prev7Total = paidOut
      .filter((e) => {
        const age = now - new Date(e.paid_out_at!).getTime();
        return age > 7 * DAY && age <= 14 * DAY;
      })
      .reduce((s, e) => s + netCentsOf(e), 0);

    // Daily buckets for the last 7 days (oldest -> newest) for the earnings chart
    const dayLabels = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
    const chart = Array.from({ length: 7 }, (_, i) => {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      dayStart.setDate(dayStart.getDate() - (6 - i));
      const dayEnd = new Date(dayStart.getTime() + DAY);
      const cents = paidOut
        .filter((e) => {
          const t = new Date(e.paid_out_at!).getTime();
          return t >= dayStart.getTime() && t < dayEnd.getTime();
        })
        .reduce((s, e) => s + netCentsOf(e), 0);
      return { label: dayLabels[dayStart.getDay()], euros: Math.round(cents / 100) };
    });

    const tracker = earningsRes.data ?? { tx_count: 0, gross_cents: 0, payouts_locked: false };
    const pstg = {
      txCount: tracker.tx_count,
      grossCents: tracker.gross_cents,
      payoutsLocked: tracker.payouts_locked,
      txThreshold: PSTG_TX_THRESHOLD,
      grossThreshold: PSTG_GROSS_CENTS_THRESHOLD,
      thresholdReached:
        tracker.tx_count >= PSTG_TX_THRESHOLD || tracker.gross_cents >= PSTG_GROSS_CENTS_THRESHOLD,
    };

    const recentGigs = gigs.slice(0, 8).map((g) => ({
      id: g.id,
      title: g.title,
      serviceType: g.service_type,
      budgetCents: g.budget_cents,
      address: g.address,
      scheduledAt: g.scheduled_at,
      status: g.status,
      customerName: nameById.get(g.customer_id) ?? "—",
    }));

    return {
      profile: {
        displayName: profileRes.data?.display_name ?? "",
        availableToday: profileRes.data?.available_today ?? false,
        hasTaxId: Boolean(privateRes.data?.tax_id),
        birthdate: privateRes.data?.birthdate ?? null,
      },
      stats: {
        earningsLast7Cents: last7Total,
        earningsPrev7Cents: prev7Total,
        earningsTrendPct: prev7Total > 0 ? ((last7Total - prev7Total) / prev7Total) * 100 : null,
        completionRate,
        completedCount: completed.length,
        finishedCount: finished.length,
        avgRating,
        ratingCount,
      },
      chart,
      pstg,
      recentGigs,
    };
  });

export const setAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ availableToday: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ available_today: data.availableToday })
      .eq("id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

export const submitTaxId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ taxId: z.string().min(4).max(40) }).parse(input))
  .handler(async ({ data, context }) => {
    const year = new Date().getFullYear();
    const { error: pErr } = await context.supabase
      .from("profile_private")
      .update({ tax_id: data.taxId })
      .eq("id", context.userId);
    if (pErr) throw pErr;

    const { error: eErr } = await context.supabase
      .from("earnings_tracker")
      .update({ payouts_locked: false })
      .eq("helper_id", context.userId)
      .eq("year", year);
    if (eErr) throw eErr;

    return { ok: true };
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachGigLocations, fetchGigLocations, GIG_PUBLIC_COLUMNS } from "@/lib/gig-location";
import { berlinDayFrom, berlinParts, berlinWallTimeToDate } from "@/lib/berlin-time";
import { isActiveStatus } from "@/lib/gig-status";

const PSTG_TX_THRESHOLD = 25;
const PSTG_GROSS_CENTS_THRESHOLD = 180000; // 1.800 €

export const getHelperDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // Jahr der Verdienst-Statistik nach deutscher Ortszeit (passt zur Datenbank-Funktion complete_gig_and_release)
    const year = berlinParts(new Date()).year;

    const [
      profileRes,
      privateRes,
      gigsRes,
      pendingGigsRes,
      escrowRes,
      reviewsRes,
      earningsRes,
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          "display_name, available_today, vacation_mode, vacation_return_date",
        )
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("profile_private")
        .select("tax_id, birthdate")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("gigs")
        .select(
          "id, title, service_type, description, budget_cents, district, scheduled_at, status, customer_id",
        )
        .eq("assigned_helper_id", userId)
        .order("scheduled_at", { ascending: false, nullsFirst: false })
        .limit(20),
      supabase
        .from("gigs")
        .select(
          "id, title, service_type, budget_cents, district, scheduled_at, status, customer_id, created_at",
        )
        .eq("assigned_helper_id", userId)
        .eq("status", "pending_helper")
        .order("created_at", { ascending: false }),
      supabase
        .from("escrow_transactions")
        .select(
          "id, gig_id, bid_cents, helper_fee_cents, state, paid_out_at, created_at",
        )
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
    ]);

    if (profileRes.error) throw profileRes.error;
    if (privateRes.error) throw privateRes.error;
    if (gigsRes.error) throw gigsRes.error;
    if (pendingGigsRes.error) throw pendingGigsRes.error;
    if (escrowRes.error) throw escrowRes.error;
    if (reviewsRes.error) throw reviewsRes.error;
    if (earningsRes.error) throw earningsRes.error;

    const gigs = gigsRes.data ?? [];
    const pendingGigs = pendingGigsRes.data ?? [];
    const escrow = escrowRes.data ?? [];
    const reviews = reviewsRes.data ?? [];

    // Genaue Adresse: nur für Aufträge, die der Helfer angenommen hat (Status assigned / in_progress).
    // Für Buchungsanfragen (pending_helper) liefert die Datenbank bewusst keine Adresse - dort nur der Stadtteil.
    const locations = await fetchGigLocations(supabase, [
      ...gigs.slice(0, 8).map((g) => g.id),
      ...pendingGigs.map((g) => g.id),
    ]);

    const customerIds = Array.from(new Set([...gigs.map((g) => g.customer_id), ...pendingGigs.map((g) => g.customer_id)]));
    const { data: customerProfiles } = customerIds.length
      ? await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", customerIds)
      : { data: [] as { id: string; display_name: string }[] };
    const nameById = new Map(
      (customerProfiles ?? []).map((p) => [p.id, p.display_name]),
    );

    const finished = gigs.filter(
      (g) => g.status === "completed" || g.status === "cancelled",
    );
    const completed = gigs.filter((g) => g.status === "completed");
    const completionRate =
      finished.length > 0 ? completed.length / finished.length : null;

    const ratingCount = reviews.length;
    const avgRating =
      ratingCount > 0
        ? reviews.reduce((s, r) => s + r.rating, 0) / ratingCount
        : null;

    const paidOut = escrow.filter(
      (e) => e.state === "paid_out" && e.paid_out_at,
    );
    const netCentsOf = (e: (typeof escrow)[number]) =>
      e.bid_cents - e.helper_fee_cents;

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

    const dayLabels = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
    // Letzte 7 Tage nach deutscher Ortszeit (Tagesgrenze = Mitternacht in Deutschland, nicht in UTC)
    const chart = Array.from({ length: 7 }, (_, i) => {
      const day = berlinDayFrom(new Date(now), -(6 - i));
      const next = berlinDayFrom(new Date(now), -(6 - i) + 1);
      const dayStart = berlinWallTimeToDate(day.year, day.month, day.day, 0, 0).getTime();
      const dayEnd = berlinWallTimeToDate(next.year, next.month, next.day, 0, 0).getTime();
      const cents = paidOut
        .filter((e) => {
          const t = new Date(e.paid_out_at!).getTime();
          return t >= dayStart && t < dayEnd;
        })
        .reduce((s, e) => s + netCentsOf(e), 0);
      return {
        label: dayLabels[day.isoWeekday % 7],
        euros: Math.round(cents / 100),
      };
    });

    const tracker = earningsRes.data ?? {
      tx_count: 0,
      gross_cents: 0,
      payouts_locked: false,
    };
    const pstg = {
      txCount: tracker.tx_count,
      grossCents: tracker.gross_cents,
      payoutsLocked: tracker.payouts_locked,
      txThreshold: PSTG_TX_THRESHOLD,
      grossThreshold: PSTG_GROSS_CENTS_THRESHOLD,
      thresholdReached:
        tracker.tx_count >= PSTG_TX_THRESHOLD ||
        tracker.gross_cents >= PSTG_GROSS_CENTS_THRESHOLD,
    };

    const recentGigs = gigs.slice(0, 8).map((g) => ({
      id: g.id,
      title: g.title,
      serviceType: g.service_type,
      description: g.description,
      budgetCents: g.budget_cents,
      address: locations.get(g.id)?.address ?? null,
      district: g.district,
      scheduledAt: g.scheduled_at,
      status: g.status,
      customerId: g.customer_id,
      customerName: nameById.get(g.customer_id) ?? "—",
    }));

    const pendingBookings = pendingGigs.map((g) => ({
      id: g.id,
      title: g.title,
      serviceType: g.service_type,
      budgetCents: g.budget_cents,
      address: locations.get(g.id)?.address ?? null,
      district: g.district,
      scheduledAt: g.scheduled_at,
      status: g.status,
      customerId: g.customer_id,
      customerName: nameById.get(g.customer_id) ?? "—",
      createdAt: g.created_at,
    }));

    const vacationReturnDate = profileRes.data?.vacation_return_date ?? null;
    const vacationExpired =
      vacationReturnDate !== null &&
      new Date(vacationReturnDate).getTime() <= Date.now();
    const vacationMode =
      (profileRes.data?.vacation_mode ?? false) && !vacationExpired;

    if (vacationExpired && profileRes.data?.vacation_mode) {
      await supabase
        .from("profiles")
        .update({ vacation_mode: false, vacation_return_date: null })
        .eq("id", userId);
    }

    return {
      profile: {
        displayName: profileRes.data?.display_name ?? "",
        availableToday: profileRes.data?.available_today ?? false,
        vacationMode,
        vacationReturnDate: vacationExpired ? null : vacationReturnDate,
        hasTaxId: Boolean(privateRes.data?.tax_id),
        birthdate: privateRes.data?.birthdate ?? null,
      },
      stats: {
        earningsLast7Cents: last7Total,
        earningsPrev7Cents: prev7Total,
        earningsTrendPct:
          prev7Total > 0
            ? ((last7Total - prev7Total) / prev7Total) * 100
            : null,
        completionRate,
        completedCount: completed.length,
        finishedCount: finished.length,
        avgRating,
        ratingCount,
      },
      chart,
      pstg,
      recentGigs,
      pendingBookings,
    };
  });

export const setAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ availableToday: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ available_today: data.availableToday })
      .eq("id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

export const setVacationMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        vacationMode: z.boolean(),
        returnDate: z.string().date().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const update: {
      vacation_mode: boolean;
      vacation_return_date: string | null;
      available_today?: boolean;
    } = {
      vacation_mode: data.vacationMode,
      vacation_return_date: data.vacationMode
        ? (data.returnDate ?? null)
        : null,
    };
    if (data.vacationMode) update.available_today = false;

    const { error } = await context.supabase
      .from("profiles")
      .update(update)
      .eq("id", context.userId);
    if (error) throw error;

    return { ok: true };
  });

export const submitTaxId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ taxId: z.string().min(4).max(40) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Jahr der Verdienst-Statistik nach deutscher Ortszeit (passt zur Datenbank-Funktion complete_gig_and_release)
    const year = berlinParts(new Date()).year;
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

/**
 * Alle Aufträge des Helfers - in der Schreibweise, die die Seite "Aufträge" liest (camelCase).
 * Vorher kamen hier die rohen Datenbank-Felder (budget_cents ...) an, die Seite las aber budgetCents/scheduledAt/customerId:
 * Beträge und Termine blieben leer, und "Annehmen" schickte keine Kunden-ID mit (der Chat mit dem Kunden startete nicht).
 */
export const getHelperGigs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: gigRows, error } = await supabase
      .from("gigs")
      .select(GIG_PUBLIC_COLUMNS)
      .eq("assigned_helper_id", userId)
      .order("updated_at", { ascending: false })
      .limit(300);

    if (error) throw error;
    // Adresse nur für angenommene Aufträge (RLS auf gig_locations), sonst null.
    const gigs = await attachGigLocations(supabase, gigRows ?? []);

    const customerIds = Array.from(new Set(gigs.map((g) => g.customer_id)));
    const { data: customerProfiles } = customerIds.length
      ? await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", customerIds)
      : { data: [] as { id: string; display_name: string }[] };
    const nameById = new Map(
      (customerProfiles ?? []).map((p) => [p.id, p.display_name]),
    );

    // Zahlungsstatus je Auftrag (Treuhand)
    const { data: escrowRows } = await supabase
      .from("escrow_transactions")
      .select("gig_id, state")
      .in("gig_id", gigs.map((g) => g.id));
    const paymentByGig = new Map((escrowRows ?? []).map((e) => [e.gig_id, String(e.state)]));

    const rows = gigs.map((g) => ({
      id: g.id,
      title: g.title,
      description: g.description,
      serviceType: g.service_type,
      budgetCents: g.budget_cents,
      scheduledAt: g.scheduled_at,
      durationMinutes: g.duration_minutes,
      status: g.status,
      customerId: g.customer_id,
      customerName: nameById.get(g.customer_id) ?? "—",
      address: g.address,
      district: g.district,
      paymentState: paymentByGig.get(g.id) ?? null,
      updatedAt: g.updated_at,
    }));

    // Was auf dich wartet zuerst, dann anstehende Aufträge nach Termin, dann der Verlauf (neueste zuerst)
    const rank = (r: (typeof rows)[number]) =>
      r.status === "pending_helper" ? 0 : isActiveStatus(r.status) ? 1 : 2;
    return rows.sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      if (ra === 1) return (a.scheduledAt ?? "9999") < (b.scheduledAt ?? "9999") ? -1 : 1;
      return a.updatedAt < b.updatedAt ? 1 : -1;
    });
  });

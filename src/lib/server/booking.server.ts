// Server-only: echte Daten des Helfers für Buchungen (Verfügbarkeit, Angebote, Voraussetzungen).
// Nur aus Server-Function-Handlern importieren (dynamisch).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  BOOKING_WINDOW_DAYS,
  slotProblem,
  type BookableService,
  type BusyInterval,
  type HelperBookingInfo,
} from "@/lib/booking-slots";

export class BookingError extends Error {}

/**
 * Lädt alles, was für eine Buchung bei diesem Helfer zählt:
 * Helfer-Rolle, Konto-Status, Urlaub, Verifizierung/Eltern-Konto (Jugendliche), bestehende Termine,
 * buchbare Angebote mit Preis.
 */
export async function loadHelperBookingInfo(helperId: string, customerId: string): Promise<HelperBookingInfo> {
  const [{ data: roles }, { data: profile }] = await Promise.all([
    supabaseAdmin.from("user_roles").select("role").eq("user_id", helperId),
    supabaseAdmin
      .from("profiles")
      .select("display_name, vacation_mode, vacation_return_date, suspended_at")
      .eq("id", helperId)
      .maybeSingle(),
  ]);
  const roleList = (roles ?? []).map((r) => r.role as string);
  const isHelper = roleList.some((r) => ["helper_youth", "helper_adult", "helper_pro"].includes(r));
  const isYouth = roleList.includes("helper_youth");

  const base: HelperBookingInfo = {
    helperId,
    helperName: profile?.display_name?.trim() || "Helfer",
    isYouth,
    bookable: false,
    reason: null,
    unavailableUntil: null,
    busy: [],
    services: [],
  };
  const fail = (reason: string): HelperBookingInfo => ({ ...base, reason });

  if (!isHelper || !profile) return fail("Dieser Nutzer ist kein Helfer.");
  if (helperId === customerId) return fail("Du kannst dich nicht selbst buchen.");
  if (profile.suspended_at) return fail("Dieser Helfer ist derzeit nicht buchbar.");

  const { data: restricted } = await supabaseAdmin.rpc("is_restricted", { _user_id: helperId, _scope: "jobs" });
  const { data: required } = await supabaseAdmin.rpc("verification_required");
  const { data: verified } = await supabaseAdmin.rpc("is_verified", { _user_id: helperId });
  const { data: blocked } = await supabaseAdmin.rpc("users_blocked", { _a: helperId, _b: customerId });
  if (restricted) return fail("Dieser Helfer ist derzeit nicht buchbar.");
  if (required && !verified) return fail("Dieser Helfer ist noch nicht verifiziert und kann nicht gebucht werden.");
  if (blocked) return fail("Dieser Helfer ist für dich nicht buchbar.");

  if (isYouth) {
    const { data: consent } = await supabaseAdmin.rpc("has_guardian_consent", { _user_id: helperId });
    if (!consent) return fail("Dieser Helfer ist noch nicht freigeschaltet (Eltern-Zustimmung fehlt).");
  }

  let unavailableUntil: string | null = null;
  if (profile.vacation_mode) {
    if (!profile.vacation_return_date) return fail("Dieser Helfer macht gerade Urlaub.");
    unavailableUntil = String(profile.vacation_return_date).slice(0, 10);
  }

  const now = new Date();
  const until = new Date(now.getTime() + BOOKING_WINDOW_DAYS * 24 * 3_600_000);
  const { data: gigs } = await supabaseAdmin
    .from("gigs")
    .select("scheduled_at, duration_minutes")
    .eq("assigned_helper_id", helperId)
    .in("status", ["pending_helper", "assigned", "in_progress"])
    .not("scheduled_at", "is", null)
    .gte("scheduled_at", new Date(now.getTime() - 24 * 3_600_000).toISOString())
    .lte("scheduled_at", until.toISOString());
  const busy: BusyInterval[] = (gigs ?? []).map((g) => {
    const start = new Date(g.scheduled_at as string);
    return {
      start: start.toISOString(),
      end: new Date(start.getTime() + (g.duration_minutes ?? 60) * 60_000).toISOString(),
    };
  });

  const { data: listings } = await supabaseAdmin
    .from("service_listings")
    .select("id, title, service_type, listing_type, price_cents")
    .eq("helper_id", helperId)
    .eq("status", "active")
    .neq("listing_type", "auction")
    .not("price_cents", "is", null)
    .order("created_at", { ascending: false })
    .limit(20);
  const services: BookableService[] = (listings ?? []).map((l) => ({
    listingId: l.id,
    title: l.title,
    serviceType: l.service_type,
    priceCents: l.price_cents as number,
  }));

  return { ...base, bookable: true, unavailableUntil, busy, services };
}

/** Prüft serverseitig (maßgeblich) ob dieser Termin beim Helfer buchbar ist; wirft BookingError mit Klartext. */
export async function assertBookable(
  helperId: string,
  customerId: string,
  scheduledAtIso: string,
  minutes = 60,
): Promise<HelperBookingInfo> {
  const info = await loadHelperBookingInfo(helperId, customerId);
  if (!info.bookable) throw new BookingError(info.reason ?? "Dieser Helfer ist nicht buchbar.");
  const start = new Date(scheduledAtIso);
  if (Number.isNaN(start.getTime())) throw new BookingError("Ungültiger Termin.");
  const problem = slotProblem(info, start, minutes);
  if (problem) throw new BookingError(problem);
  return info;
}

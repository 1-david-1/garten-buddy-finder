import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { HelperBookingInfo } from "@/lib/booking-slots";

/**
 * Echte Daten für die Buchungsmaske: Verfügbarkeit (bestehende Termine, Urlaub, Jugendschutz) und die
 * buchbaren Angebote mit Preis des Helfers. Es werden nur Zeitspannen übertragen, keine Auftragsdetails.
 */
export const getHelperBookingInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ helperId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }): Promise<HelperBookingInfo> => {
    const { loadHelperBookingInfo } = await import("@/lib/server/booking.server");
    return loadHelperBookingInfo(data.helperId, context.userId);
  });

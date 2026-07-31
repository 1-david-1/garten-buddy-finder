import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server-Middleware für alle Admin-Server-Functions.
 * Baut auf requireSupabaseAuth auf (liefert supabase-Client + userId) und
 * bricht mit "Forbidden" ab, falls der aufrufende Nutzer keine admin-Rolle hat.
 *
 * Die eigentliche Durchsetzung passiert über RLS (has_role() in den Policies),
 * dieser Check hier sorgt nur für eine saubere Fehlermeldung/frühen Abbruch,
 * statt dass Admin-Functions bei fehlenden Rechten einfach leere Daten liefern.
 */
export const requireAdminAuth = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { supabase, userId } = context;

    const { data: isAdmin, error } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (error) throw error;
    if (!isAdmin) throw new Error("Forbidden: admin role required");

    return next();
  });

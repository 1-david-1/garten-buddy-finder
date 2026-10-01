import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface AppNotification {
  id: string;
  category: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

/**
 * Lädt die letzten Benachrichtigungen des eingeloggten Nutzers für die
 * Glocke, plus die Anzahl ungelesener. Einträge entstehen ausschließlich
 * serverseitig über notifyUserByEmail() (siehe notifications.server.ts).
 */
export const getNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data, error } = await supabase
      .from("notifications")
      .select("id, category, title, body, link, read_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) throw error;

    const notifications: AppNotification[] = (data ?? []).map((n) => ({
      id: n.id,
      category: n.category,
      title: n.title,
      body: n.body,
      link: n.link,
      readAt: n.read_at,
      createdAt: n.created_at,
    }));

    return {
      notifications,
      unreadCount: notifications.filter((n) => !n.readAt).length,
    };
  });

/**
 * Markiert eine oder alle Benachrichtigungen als gelesen.
 */
export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { notificationId?: string; all?: boolean }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    let query = supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("read_at", null);

    if (!data.all && data.notificationId) {
      query = query.eq("id", data.notificationId);
    }

    const { error } = await query;
    if (error) throw error;
    return { ok: true };
  });

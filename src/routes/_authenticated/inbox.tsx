import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { useAppNavItems } from "@/lib/use-app-nav";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, Calendar, MessageSquare, Tag, Banknote, Info, Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

interface BookingRequest {
  id: string;
  service_type: string;
  description: string | null;
  address: string | null;
  scheduled_at: string | null;
  budget_cents: number;
  status: string;
  created_at: string;
  customer: {
    display_name: string | null;
  } | null;
}

interface Notification {
  id: string;
  type: string;
  title: string;
  content: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export const getInboxDataFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Fetch booking requests
    const { data: gigs } = await supabase
      .from("gigs")
      .select("id, service_type, description, address, scheduled_at, budget_cents, status, created_at, customer_id")
      .eq("assigned_helper_id", userId)
      .eq("status", "negotiating")
      .order("created_at", { ascending: false });

    const customerIds = [...new Set((gigs || []).map((g) => g.customer_id))];
    const { data: profiles } = customerIds.length
      ? await supabase.from("profiles").select("id, display_name").in("id", customerIds)
      : { data: [] as { id: string; display_name: string | null }[] };
    const profileById = new Map((profiles || []).map((p) => [p.id, p]));

    const bookingRequests: BookingRequest[] = (gigs || []).map((g) => ({
      id: g.id,
      service_type: g.service_type,
      description: g.description,
      address: g.address,
      scheduled_at: g.scheduled_at,
      budget_cents: g.budget_cents,
      status: g.status,
      created_at: g.created_at,
      customer: profileById.get(g.customer_id) ?? null,
    }));

    // Fetch notifications
    const { data: notifications, error } = await supabase
      .from("notifications")
      .select("id, type, title, content, link, is_read, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
      
    // Handle case where notifications table doesn't exist yet (before migration runs)
    if (error && error.code === '42P01') {
      return { bookingRequests, notifications: [] };
    }

    return { bookingRequests, notifications: (notifications as Notification[]) || [] };
  });

export const respondToBookingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      bookingId: z.string(),
      action: z.enum(["accept", "decline"]),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    if (data.action === "accept") {
      await supabase
        .from("gigs")
        .update({ status: "assigned" })
        .eq("id", data.bookingId)
        .eq("assigned_helper_id", userId);
    } else {
      await supabase
        .from("gigs")
        .update({ status: "open", assigned_helper_id: null })
        .eq("id", data.bookingId)
        .eq("assigned_helper_id", userId);
    }
  });

export const markNotificationReadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ notificationId: z.string() }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", data.notificationId)
      .eq("user_id", userId);
  });

export const markAllNotificationsReadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false);
  });

export const Route = createFileRoute("/_authenticated/inbox")({
  beforeLoad: async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      throw redirect({ to: "/auth" });
    }
  },
  loader: async () => {
    return await getInboxDataFn({});
  },
  component: InboxPage,
});

function InboxPage() {
  const loaderData = Route.useLoaderData();
  const { navItems } = useAppNavItems();

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  };
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  };
  const formatPrice = (cents: number) => {
    return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
  };

  const getIconForType = (type: string) => {
    switch (type) {
      case "message": return <MessageSquare className="w-5 h-5 text-blue-500" />;
      case "gig_status": return <Calendar className="w-5 h-5 text-orange-500" />;
      case "market_offer": return <Tag className="w-5 h-5 text-emerald-500" />;
      case "payment_received": return <Banknote className="w-5 h-5 text-amber-500" />;
      case "booking_request": return <Bell className="w-5 h-5 text-primary" />;
      default: return <Info className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const unreadCount = loaderData.notifications.filter(n => !n.is_read).length;

  return (
    <DashboardShell title="Postfach" navItems={navItems} activeKey="inbox">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-brand text-2xl">Postfach</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ihre Buchungsanfragen und Benachrichtigungen
          </p>
        </div>
      </div>

      <Tabs defaultValue="notifications" className="w-full">
        <TabsList className="mb-6 h-12 w-full justify-start overflow-x-auto bg-transparent p-0 border-b border-border/50">
          <TabsTrigger 
            value="notifications" 
            className="rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Alle Benachrichtigungen
            {unreadCount > 0 && (
              <span className="ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                {unreadCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger 
            value="requests" 
            className="rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Buchungsanfragen
            {loaderData.bookingRequests.length > 0 && (
              <span className="ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground">
                {loaderData.bookingRequests.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="notifications" className="space-y-4">
          <div className="flex justify-end mb-4">
            <button 
              className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              onClick={async () => {
                await markAllNotificationsReadFn({});
                window.location.reload();
              }}
            >
              <Check className="w-4 h-4" /> Alle als gelesen markieren
            </button>
          </div>

          {loaderData.notifications.length === 0 ? (
            <div className="text-center py-12 bg-muted/30 rounded-lg border border-dashed border-border/50">
              <Bell className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-muted-foreground">
                Keine Benachrichtigungen vorhanden
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {loaderData.notifications.map((notification) => {
                const isUnread = !notification.is_read;
                return (
                  <Link 
                    to={notification.link || "#"}
                    key={notification.id}
                    onClick={async (e) => {
                      if (!notification.link) e.preventDefault();
                      if (isUnread) {
                        markNotificationReadFn({ data: { notificationId: notification.id }}); // Non-blocking
                      }
                    }}
                    className={cn(
                      "block p-4 rounded-xl border transition-all duration-200 hover:shadow-md",
                      isUnread ? "bg-card border-primary/20 shadow-sm" : "bg-muted/10 border-border/50 opacity-80"
                    )}
                  >
                    <div className="flex gap-4">
                      <div className="mt-1 shrink-0">
                        {getIconForType(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className={cn("text-base font-semibold truncate", isUnread ? "text-foreground" : "text-foreground/80")}>
                            {notification.title}
                          </h3>
                          <span className="text-xs text-muted-foreground whitespace-nowrap pt-1">
                            {formatDate(notification.created_at)}
                          </span>
                        </div>
                        {notification.content && (
                          <p className={cn("text-sm mt-1 line-clamp-2", isUnread ? "text-muted-foreground" : "text-muted-foreground/70")}>
                            {notification.content}
                          </p>
                        )}
                      </div>
                      {isUnread && (
                        <div className="flex items-center">
                          <Circle className="w-3 h-3 fill-primary text-primary" />
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="requests" className="space-y-4 mt-0">
          {loaderData.bookingRequests.length === 0 ? (
            <div className="text-center py-12 bg-muted/30 rounded-lg border border-dashed border-border/50">
              <Calendar className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-muted-foreground">
                Keine offenen Buchungsanfragen
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {loaderData.bookingRequests.map((booking) => (
                <div key={booking.id} className="bg-card border border-border/50 rounded-lg p-4 space-y-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                      <span className="text-primary font-semibold">
                        {(booking.customer?.display_name || "K")[0].toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium">
                        {booking.customer?.display_name || "Anonym"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(booking.created_at)} &bull; {formatTime(booking.created_at)}
                      </p>
                    </div>
                  </div>

                  <div className="bg-muted/30 rounded-lg p-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Leistung:</span>
                      <span className="font-medium">{booking.service_type}</span>
                    </div>
                    {booking.description && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Beschreibung:</span>
                        <span className="font-medium">{booking.description}</span>
                      </div>
                    )}
                    {booking.scheduled_at && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Datum:</span>
                          <span className="font-medium">{formatDate(booking.scheduled_at)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Uhrzeit:</span>
                          <span className="font-medium">{formatTime(booking.scheduled_at)}</span>
                        </div>
                      </>
                    )}
                    {booking.address && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Adresse:</span>
                        <span className="font-medium">{booking.address}</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-2 mt-2 border-t border-border/50">
                      <span className="text-muted-foreground">Budget:</span>
                      <span className="font-bold text-emerald-500 text-base">
                        {formatPrice(booking.budget_cents)}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      className="flex-1 py-2 px-4 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors font-medium border border-border/50 shadow-sm"
                      onClick={async () => {
                        await respondToBookingFn({
                          data: { bookingId: booking.id, action: "decline" },
                        });
                        window.location.reload();
                      }}
                    >
                      Ablehnen
                    </button>
                    <button
                      className="flex-1 py-2 px-4 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium shadow-sm"
                      onClick={async () => {
                        await respondToBookingFn({
                          data: { bookingId: booking.id, action: "accept" },
                        });
                        window.location.reload();
                      }}
                    >
                      Annehmen
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </DashboardShell>
  );
}

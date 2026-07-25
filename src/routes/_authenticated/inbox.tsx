import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { BarChart3, Mail } from "lucide-react";
import { DashboardShell, type DashboardNavItem } from "@/components/dashboard/dashboard-shell";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string | null;
  booking_id: string | null;
  is_read: boolean;
  created_at: string;
}

interface BookingRequest {
  id: string;
  service_type: string;
  description: string | null;
  address: string;
  scheduled_date: string;
  scheduled_time: string;
  budget_cents: number;
  status: string;
  created_at: string;
  customer: {
    full_name: string | null;
    avatar_url: string | null;
  };
}

const getInboxDataFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Get notifications
    const { data: notifications } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    // Get pending booking requests
    const { data: bookings } = await supabase
      .from("bookings")
      .select(`
        id,
        service_type,
        description,
        address,
        scheduled_date,
        scheduled_time,
        budget_cents,
        status,
        created_at,
        customer:user_profiles!bookings_customer_id_fkey(
          full_name,
          avatar_url
        )
      `)
      .eq("helper_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    return {
      notifications: (notifications || []) as Notification[],
      bookingRequests: (bookings || []) as BookingRequest[],
    };
  });

const markAsReadFn = createServerFn({ method: "POST" })
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

const respondToBookingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      bookingId: z.string(),
      action: z.enum(["accept", "decline"]),
    })
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const newStatus = data.action === "accept" ? "accepted" : "declined";

    // Update booking status
    await supabase
      .from("bookings")
      .update({ status: newStatus })
      .eq("id", data.bookingId)
      .eq("helper_id", userId);

    // Create notification for customer
    const { data: booking } = await supabase
      .from("bookings")
      .select("customer_id")
      .eq("id", data.bookingId)
      .single();

    if (booking) {
      await supabase.from("notifications").insert({
        user_id: booking.customer_id,
        type: data.action === "accept" ? "booking_accepted" : "booking_declined",
        title: data.action === "accept" ? "Buchung angenommen" : "Buchung abgelehnt",
        message: `Deine Buchungsanfrage wurde ${data.action === "accept" ? "angenommen" : "abgelehnt"}.`,
        booking_id: data.bookingId,
      });
    }
  });

export const Route = createFileRoute("/_authenticated/inbox")({
  beforeLoad: async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/auth" });
  },
  loader: async () => await getInboxDataFn({}),
  component: InboxPage,
});

function InboxPage() {
  const loaderData = Route.useLoaderData();

  const navItems: DashboardNavItem[] = [
    { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: <BarChart3 className="size-4" /> },
    { key: "inbox", label: "Postfach", href: "/inbox", icon: <Mail className="size-4" /> },
  ];

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatPrice = (cents: number) =>
    (cents / 100).toLocaleString("de-DE", {
      style: "currency",
      currency: "EUR",
    });

  return (
    <DashboardShell title="Postfach" navItems={navItems} activeKey="inbox">
      <h1 className="font-brand text-2xl">Postfach</h1>
      <p className="mt-1 text-sm text-muted-foreground">Ihre Buchungsanfragen und Benachrichtigungen</p>

      <div className="mt-6 space-y-8">
        {/* Booking Requests Section */}
        <section>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary"></span>
            Buchungsanfragen
            {loaderData.bookingRequests.length > 0 && (
              <span className="bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full">
                {loaderData.bookingRequests.length}
              </span>
            )}
          </h2>

          {loaderData.bookingRequests.length === 0 ? (
            <div className="text-center py-12 bg-muted/30 rounded-lg border border-dashed border-border/50">
              <p className="text-muted-foreground">Keine offenen Buchungsanfragen</p>
            </div>
          ) : (
            <div className="space-y-4">
              {loaderData.bookingRequests.map((booking) => (
                <div
                  key={booking.id}
                  className="bg-card border border-border/50 rounded-lg p-4 space-y-4"
                >
                  {/* Customer Info */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                      {booking.customer.avatar_url ? (
                        <img
                          src={booking.customer.avatar_url}
                          alt={booking.customer.full_name || "Kunde"}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <span className="text-primary font-semibold">
                          {(booking.customer.full_name || "K")[0].toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{booking.customer.full_name || "Anonym"}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(booking.created_at)} • {formatTime(booking.created_at)}
                      </p>
                    </div>
                  </div>

                  {/* Booking Details */}
                  <div className="bg-muted/30 rounded-lg p-4 space-y-2">
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
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Datum:</span>
                      <span className="font-medium">{booking.scheduled_date}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Uhrzeit:</span>
                      <span className="font-medium">{booking.scheduled_time}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Adresse:</span>
                      <span className="font-medium">{booking.address}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-border/50">
                      <span className="text-muted-foreground">Budget:</span>
                      <span className="font-bold text-emerald-500">
                        {formatPrice(booking.budget_cents)}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3">
                    <button
                      className="flex-1 py-2 px-4 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors font-medium"
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
                      className="flex-1 py-2 px-4 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
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
        </section>

        {/* Notifications Section */}
        <section>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-muted-foreground"></span>
            Benachrichtigungen
          </h2>

          {loaderData.notifications.length === 0 ? (
            <div className="text-center py-12 bg-muted/30 rounded-lg border border-dashed border-border/50">
              <p className="text-muted-foreground">Keine Benachrichtigungen</p>
            </div>
          ) : (
            <div className="space-y-2">
              {loaderData.notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 rounded-lg border transition-colors cursor-pointer ${
                    notification.is_read
                      ? "bg-muted/20 border-border/30"
                      : "bg-card border-border/50 hover:bg-muted/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {!notification.is_read && (
                          <span className="w-2 h-2 rounded-full bg-primary"></span>
                        )}
                        <p className="font-medium">{notification.title}</p>
                      </div>
                      {notification.message && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {notification.message}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">
                        {formatDate(notification.created_at)} •{" "}
                        {formatTime(notification.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}

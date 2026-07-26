import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { BarChart3, ClipboardList, Mail, Wallet } from "lucide-react";
import { DashboardShell, type DashboardNavItem } from "@/components/dashboard/dashboard-shell";
import { useI18n } from "@/lib/i18n";
import { getMyRoles } from "@/lib/roles.functions";

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

export const getInboxDataFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Buchungsanfragen = Gigs, die diesem Helfer zugeordnet sind und noch
    // seine Bestätigung brauchen ("negotiating"). Es gibt keine separate
    // "bookings"- oder "notifications"-Tabelle in der Datenbank - beides
    // lief in Wirklichkeit schon immer über "gigs".
    const { data: gigs } = await supabase
      .from("gigs")
      .select(
        "id, service_type, description, address, scheduled_at, budget_cents, status, created_at, customer_id",
      )
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

    return { bookingRequests };
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
      // Ablehnen gibt den Gig zurück in den offenen Pool, statt ihn zu löschen.
      await supabase
        .from("gigs")
        .update({ status: "open", assigned_helper_id: null })
        .eq("id", data.bookingId)
        .eq("assigned_helper_id", userId);
    }
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
  const { t } = useI18n();
  const loaderData = Route.useLoaderData();
  const getRoles = useServerFn(getMyRoles);
  const q = useQuery({ queryKey: ["my-roles"], queryFn: () => getRoles() });

  const isHelper = q.data?.roles?.some((r: string) => r.startsWith("helper_"));

  const navItems: DashboardNavItem[] = [
    {
      key: "dashboard",
      label: t("dashboard.nav.dashboard"),
      href: "/dashboard",
      icon: <BarChart3 className="size-4" />,
    },
    { key: "inbox", label: "Postfach", href: "/inbox", icon: <Mail className="size-4" /> },
  ];

  if (isHelper) {
    navItems.push(
      {
        key: "orders",
        label: t("dashboard.nav.orders"),
        href: "/gigs",
        icon: <ClipboardList className="size-4" />,
      },
      {
        key: "earnings",
        label: t("dashboard.nav.earnings"),
        href: "/earnings",
        icon: <Wallet className="size-4" />,
      },
    );
  }

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

  const formatPrice = (cents: number) => {
    return (cents / 100).toLocaleString("de-DE", {
      style: "currency",
      currency: "EUR",
    });
  };

  return (
    <DashboardShell title="Postfach" navItems={navItems} activeKey="inbox">
      <h1 className="font-brand text-2xl">Postfach</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Ihre Buchungsanfragen und Benachrichtigungen
      </p>

      <div className="mt-6 space-y-8">
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
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                      <span className="text-primary font-semibold">
                        {(booking.customer?.display_name || "K")[0].toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium">{booking.customer?.display_name || "Anonym"}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(booking.created_at)} &bull; {formatTime(booking.created_at)}
                      </p>
                    </div>
                  </div>

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
                    <div className="flex justify-between pt-2 border-t border-border/50">
                      <span className="text-muted-foreground">Budget:</span>
                      <span className="font-bold text-emerald-500">
                        {formatPrice(booking.budget_cents)}
                      </span>
                    </div>
                  </div>

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
      </div>
    </DashboardShell>
  );
}

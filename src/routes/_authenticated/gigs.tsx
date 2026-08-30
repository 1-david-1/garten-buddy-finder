import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  ClipboardList,
  Euro,
  MessageSquare,
  X,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { useAppNavItems } from "@/lib/use-app-nav";
import { getHelperDashboard } from "@/lib/helper-dashboard.functions";
import { respondToBooking } from "@/lib/service-listings.functions";
import { startConversation } from "@/lib/messaging.functions";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/gigs")({
  component: GigsPage,
});

const statusVariant: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  completed: "default",
  in_progress: "secondary",
  assigned: "secondary",
  pending_helper: "outline",
  negotiating: "outline",
  open: "outline",
  cancelled: "destructive",
  draft: "outline",
};

const STATUS_LABELS: Record<string, string> = {
  completed: "Abgeschlossen",
  in_progress: "In Bearbeitung",
  assigned: "Zugewiesen",
  pending_helper: "Ausstehend",
  negotiating: "In Verhandlung",
  open: "Offen",
  cancelled: "Storniert",
  draft: "Entwurf",
};

function formatEuros(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, {
    style: "currency",
    currency: "EUR",
  });
}

interface PendingBooking {
  id: string;
  title: string;
  budgetCents: number;
  scheduledAt: string | null;
  customerId: string;
  customerName: string;
}

function GigsPage() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const getFn = useServerFn(getHelperDashboard);
  const q = useQuery({
    queryKey: ["helper-dashboard"],
    queryFn: () => getFn(),
  });

  const { navItems } = useAppNavItems();
  const intlLocale = locale === "de" ? "de-DE" : "en-US";

  // Chat starten (für zugewiesene Aufträge)
  const startConversationFn = useServerFn(startConversation);
  const messageMutation = useMutation({
    mutationFn: (input: { otherUserId: string; gigId: string }) =>
      startConversationFn({
        data: { otherUserId: input.otherUserId, gigId: input.gigId },
      }),
    onSuccess: (result) => {
      navigate({
        to: "/messages/$conversationId",
        params: { conversationId: result.conversationId },
      });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  // Buchungsanfragen annehmen / ablehnen (pending_helper)
  const respondFn = useServerFn(respondToBooking);
  const respondMutation = useMutation({
    mutationFn: async (input: {
      gigId: string;
      accept: boolean;
      customerId: string;
    }) => {
      await respondFn({ data: { gigId: input.gigId, accept: input.accept } });
      if (input.accept) {
        const result = await startConversationFn({
          data: { otherUserId: input.customerId, gigId: input.gigId },
        });
        return { accepted: true, conversationId: result.conversationId };
      }
      return { accepted: false, conversationId: null };
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["helper-dashboard"] });
      if (variables.accept && result.conversationId) {
        toast.success("Buchungsanfrage angenommen! Chat wird geöffnet...");
        navigate({
          to: "/messages/$conversationId",
          params: { conversationId: result.conversationId },
        });
      } else {
        toast.success("Buchungsanfrage abgelehnt.");
      }
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const pendingBookings: PendingBooking[] = q.data?.pendingBookings ?? [];
  const recentGigs = q.data?.recentGigs ?? [];

  return (
    <DashboardShell
      title={t("dashboard.nav.orders")}
      navItems={navItems}
      activeKey="orders"
    >
      <h1 className="font-brand text-2xl">
        {t("dashboard.helper.orders.title")}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("dashboard.helper.orders.sub")}
      </p>

      {/* Offene Buchungsanfragen */}
      {pendingBookings.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-semibold text-base">Offene Buchungsanfragen</h2>
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
              {pendingBookings.length}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pendingBookings.map((booking) => (
              <Card
                key={booking.id}
                className="relative border-primary/50 bg-glass backdrop-blur overflow-hidden"
              >
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-transparent" />
                <CardContent className="relative p-4 space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold leading-tight text-sm">
                        {booking.title}
                      </p>
                      <Badge
                        variant="outline"
                        className="shrink-0 text-[10px] text-amber-400 border-amber-400/30 bg-amber-400/10"
                      >
                        Wartet
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {booking.customerName}
                      </span>{" "}
                      möchte buchen
                    </p>
                    {booking.scheduledAt && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <CalendarClock className="size-3 shrink-0" />
                        {new Date(booking.scheduledAt).toLocaleString(
                          intlLocale,
                          { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" },
                        )}
                      </p>
                    )}
                    <p className="text-xs font-semibold text-primary flex items-center gap-1">
                      <Euro className="size-3 shrink-0" />
                      {formatEuros(booking.budgetCents, intlLocale)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 gap-1.5 text-xs h-8"
                      disabled={respondMutation.isPending}
                      onClick={() =>
                        respondMutation.mutate({
                          gigId: booking.id,
                          accept: true,
                          customerId: booking.customerId,
                        })
                      }
                    >
                      <CheckCircle2 className="size-3.5" />
                      Annehmen & Chatten
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs h-8 text-destructive border-destructive/30 hover:bg-destructive/10"
                      disabled={respondMutation.isPending}
                      onClick={() =>
                        respondMutation.mutate({
                          gigId: booking.id,
                          accept: false,
                          customerId: booking.customerId,
                        })
                      }
                    >
                      <X className="size-3.5" />
                      Ablehnen
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Zugewiesene & laufende Aufträge */}
      <Card className="mt-6 border-glass-border bg-glass backdrop-blur">
        <CardHeader>
          <CardTitle className="font-brand text-lg">
            {t("dashboard.helper.orders.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {q.isLoading ? (
            <p className="text-sm text-muted-foreground">
              {t("common.loading")}
            </p>
          ) : q.isError ? (
            <p className="text-sm text-destructive">
              {(q.error as Error)?.message ?? t("dashboard.helper.error.body")}
            </p>
          ) : !recentGigs.length ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <ClipboardList className="size-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                {t("dashboard.helper.orders.empty")}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    {t("dashboard.helper.orders.col.title")}
                  </TableHead>
                  <TableHead className="hidden sm:table-cell">
                    {t("dashboard.helper.orders.col.customer")}
                  </TableHead>
                  <TableHead className="hidden md:table-cell">
                    {t("dashboard.helper.orders.col.date")}
                  </TableHead>
                  <TableHead>
                    {t("dashboard.helper.orders.col.amount")}
                  </TableHead>
                  <TableHead>
                    {t("dashboard.helper.orders.col.status")}
                  </TableHead>
                  <TableHead className="text-right">Nachricht</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentGigs.map((gig) => (
                  <TableRow key={gig.id}>
                    <TableCell className="font-medium">{gig.title}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {gig.customerName}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {gig.scheduledAt
                        ? new Date(gig.scheduledAt).toLocaleDateString(
                            intlLocale,
                          )
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {formatEuros(gig.budgetCents, intlLocale)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[gig.status] ?? "outline"}>
                        {STATUS_LABELS[gig.status] ?? gig.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          messageMutation.mutate({
                            otherUserId: gig.customerId,
                            gigId: gig.id,
                          })
                        }
                        disabled={messageMutation.isPending}
                        title="Chat starten"
                      >
                        <MessageSquare className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </DashboardShell>
  );
}

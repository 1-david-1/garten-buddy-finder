import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  CalendarClock,
  ChevronRight,
  Euro,
  MapPin,
  MessageSquare,
  Palmtree,
  Rocket,
  Star,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { StatsCard } from "./stats-card";
import {
  CustomizableDashboard,
  type DashboardWidget,
} from "@/components/dashboard/customizable-dashboard";
import { GrowthChecklistWidget } from "@/components/dashboard/growth-checklist-widget";
import { PreJobChecklistWidget } from "@/components/dashboard/pre-job-checklist-widget";
import { useAppNavItems } from "@/lib/use-app-nav";
import { useAuth } from "@/lib/auth";
import {
  getHelperDashboard,
  setAvailability,
  setVacationMode,
  submitTaxId,
} from "@/lib/helper-dashboard.functions";
import { SafetyActions } from "@/components/safety-actions";
import { SafetyAbortButton } from "@/components/safety-abort-button";
import { cancelGig } from "@/lib/gigs.functions";
import { respondToBooking } from "@/lib/service-listings.functions";
import { startConversation } from "@/lib/messaging.functions";
import { createReview, getGigReview, updateReview } from "@/lib/reviews.functions";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import { GuardianConsentBanner } from "@/components/verification-card";
import { publicLocationLabel } from "@/lib/gig-location";
import { RecurringBlocksCard } from "@/components/booking/recurring-blocks-card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { JourneyTrack } from "@/components/dashboard/dashboard-visuals";
import {
  EarningsWidget,
  GigStatusWidget,
  HelperStats,
  ScheduleWidget,
} from "@/components/dashboard/helper-widgets";
import { tintFor } from "@/lib/dashboard-format";
import { gigJourney } from "@/lib/customer-dashboard-data";
import { HELPER_JOURNEY_LABELS } from "@/lib/helper-dashboard-data";
import { describeGigStatus, type PaymentState } from "@/lib/gig-status";

interface RecentGig {
  id: string;
  title: string;
  serviceType: string;
  description: string | null;
  budgetCents: number;
  address: string | null;
  district: string | null;
  scheduledAt: string | null;
  status: string;
  paymentState: string | null;
  customerId: string;
  customerName: string;
}

interface PendingBooking {
  id: string;
  title: string;
  serviceType: string;
  budgetCents: number;
  address: string | null;
  district: string | null;
  scheduledAt: string | null;
  status: string;
  customerId: string;
  customerName: string;
  createdAt: string;
}

function useHelperDashboardData() {
  const getFn = useServerFn(getHelperDashboard);
  return useQuery({ queryKey: ["helper-dashboard"], queryFn: () => getFn() });
}

function formatEuros(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, {
    style: "currency",
    currency: "EUR",
  });
}

const statusColors: Record<string, string> = {
  completed: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
  in_progress: "text-primary border-primary/30 bg-primary/10",
  assigned: "text-sky-400 border-sky-400/30 bg-sky-400/10",
  pending_helper: "text-sky-400 border-sky-400/30 bg-sky-400/10",
  negotiating: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  open: "text-muted-foreground border-muted/30 bg-muted/10",
  cancelled: "text-red-400 border-red-400/30 bg-red-400/10",
  draft: "text-muted-foreground border-muted/30 bg-muted/10",
};

function ageFromISO(iso: string): number {
  const d = new Date(iso);
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
}

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.07 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};

export function HelperDashboard() {
  const { t, locale } = useI18n();
  const intlLocale = locale === "de" ? "de-DE" : "en-GB";
  const navigate = useNavigate();
  const { user } = useAuth();
  const q = useHelperDashboardData();
  const queryClient = useQueryClient();
  const [selectedGig, setSelectedGig] = useState<RecentGig | null>(null);
  const [taxIdInput, setTaxIdInput] = useState("");

  const availabilityFn = useServerFn(setAvailability);
  const availabilityMutation = useMutation({
    mutationFn: (availableToday: boolean) =>
      availabilityFn({ data: { availableToday } }),
    onSuccess: (_, availableToday) => {
      queryClient.invalidateQueries({ queryKey: ["helper-dashboard"] });
      toast.success(
        availableToday
          ? "Du bist jetzt online. Du wirst benachrichtigt, sobald eine neue Anfrage reinkommt."
          : "Du bist jetzt offline.",
      );
    },
  });

  const [vacationReturnDateInput, setVacationReturnDateInput] = useState("");
  const vacationFn = useServerFn(setVacationMode);
  const vacationMutation = useMutation({
    mutationFn: (input: { vacationMode: boolean; returnDate: string | null }) =>
      vacationFn({ data: input }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["helper-dashboard"] }),
  });

  const taxIdFn = useServerFn(submitTaxId);
  const taxIdMutation = useMutation({
    mutationFn: (taxId: string) => taxIdFn({ data: { taxId } }),
    onSuccess: () => {
      setTaxIdInput("");
      queryClient.invalidateQueries({ queryKey: ["helper-dashboard"] });
    },
  });

  const respondFn = useServerFn(respondToBooking);
  const startConversationFn = useServerFn(startConversation);

  const respondMutation = useMutation({
    mutationFn: async (input: { gigId: string; accept: boolean; customerId: string }) => {
      await respondFn({ data: { gigId: input.gigId, accept: input.accept } });
      if (input.accept) {
        // Starte Chat direkt nach Annahme
        const result = await startConversationFn({
          data: { otherUserId: input.customerId, gigId: input.gigId },
        });
        return { accepted: true, conversationId: result.conversationId };
      }
      return { accepted: false, conversationId: null };
    },
    onSuccess: (result, variables) => {
      // Optimistisch aktualisieren
      queryClient.setQueryData(["helper-dashboard"], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          pendingBookings: old.pendingBookings?.filter((b: any) => b.id !== variables.gigId),
          recentGigs: old.recentGigs?.map((gig: any) =>
            gig.id === variables.gigId ? { ...gig, status: variables.accept ? "assigned" : "open" } : gig,
          ),
        };
      });

      queryClient.setQueryData(["helper-gigs"], (old: any[]) => {
        if (!old) return old;
        return old.map((gig: any) =>
          gig.id === variables.gigId ? { ...gig, status: variables.accept ? "assigned" : "open" } : gig,
        );
      });

      if (variables.accept && result.conversationId) {
        toast.success("Buchungsanfrage angenommen! Chat wird geöffnet...");
        queryClient.invalidateQueries({ queryKey: ["helper-dashboard"] });
        navigate({
          to: "/messages/$conversationId",
          params: { conversationId: result.conversationId },
        });
      } else {
        toast.success("Buchungsanfrage abgelehnt.");
        queryClient.invalidateQueries({ queryKey: ["helper-dashboard"] });
      }
    },
    onError: (err) => toast.error((err as Error).message),
  });

  // ── Kunde bewerten (nach abgeschlossenem Auftrag) ──
  const [customerReviewRating, setCustomerReviewRating] = useState(5);
  const [customerReviewComment, setCustomerReviewComment] = useState("");
  const getGigReviewFn = useServerFn(getGigReview);
  const createReviewFn = useServerFn(createReview);
  const updateReviewFn = useServerFn(updateReview);

  const customerReviewQuery = useQuery({
    queryKey: ["gig-review-of-customer", selectedGig?.id],
    queryFn: () =>
      getGigReviewFn({
        data: { gigId: selectedGig!.id, direction: "helper_to_customer" },
      }),
    enabled: !!selectedGig && selectedGig.status === "completed",
  });

  useEffect(() => {
    const existing = customerReviewQuery.data?.review;
    if (existing) {
      setCustomerReviewRating(existing.rating);
      setCustomerReviewComment(existing.comment ?? "");
    } else {
      setCustomerReviewRating(5);
      setCustomerReviewComment("");
    }
  }, [selectedGig?.id, customerReviewQuery.data]);

  const customerReviewMutation = useMutation({
    mutationFn: () => {
      const payload = {
        gigId: selectedGig!.id,
        rating: customerReviewRating,
        comment: customerReviewComment,
      };
      return customerReviewQuery.data?.review
        ? updateReviewFn({ data: payload })
        : createReviewFn({ data: payload });
    },
    onSuccess: () => {
      toast.success("Bewertung gespeichert.");
      queryClient.invalidateQueries({
        queryKey: ["gig-review-of-customer", selectedGig?.id],
      });
    },
    onError: (err) =>
      toast.error(
        err instanceof Error ? err.message : "Bewertung konnte nicht gespeichert werden.",
      ),
  });

  // ── Auftrag stornieren ──
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  useEffect(() => {
    setShowCancelForm(false);
    setCancelReason("");
  }, [selectedGig?.id]);
  const cancelGigFn = useServerFn(cancelGig);
  const cancelMutation = useMutation({
    mutationFn: (input: { gigId: string; reason: string }) =>
      cancelGigFn({ data: input }),
    onSuccess: () => {
      toast.success("Auftrag storniert.");
      queryClient.invalidateQueries({ queryKey: ["helper-dashboard"] });
      setSelectedGig(null);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Stornierung fehlgeschlagen."),
  });

  const { navItems } = useAppNavItems();

  if (q.isError) {
    return (
      <DashboardShell
        title={t("dashboard.helper.title")}
        navItems={navItems}
        activeKey="dashboard"
      >
        <Alert variant="destructive">
          <AlertTitle>{t("dashboard.helper.error.title")}</AlertTitle>
          <AlertDescription>
            {(q.error as Error)?.message ?? t("dashboard.helper.error.body")}
          </AlertDescription>
        </Alert>
      </DashboardShell>
    );
  }

  if (q.isLoading || !q.data) {
    return (
      <DashboardShell
        title={t("dashboard.helper.title")}
        navItems={navItems}
        activeKey="dashboard"
      >
        <div className="space-y-4 animate-pulse">
          <div className="h-8 w-48 rounded-xl bg-glass" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 rounded-2xl bg-glass" />
            ))}
          </div>
          <div className="h-64 rounded-2xl bg-glass" />
        </div>
      </DashboardShell>
    );
  }

  const { profile, stats, chart, earningsMonths, pstg, recentGigs, agenda, pendingBookings } = q.data;
  const isYouth = profile.birthdate
    ? ageFromISO(profile.birthdate) < 18
    : false;
  const pstgRatio = Math.max(
    pstg.txCount / pstg.txThreshold,
    pstg.grossCents / pstg.grossThreshold,
  );

  // Für die "Vor dem Einsatz"-Checkliste: bestätigte, noch nicht erledigte Einsätze, die nächsten zuerst
  // (kein Termin = ans Ende). Kommt aus der Agenda, damit auch bei vielen Terminen die nächsten dabei sind.
  const upcomingJobs = agenda.slice(0, 5).map((g) => ({
    id: g.id,
    serviceType: g.serviceType,
    description: g.description,
    // Genaue Adresse nur nach Annahme; sonst der Stadtteil
    address: g.address ?? publicLocationLabel(g.district),
    scheduledAt: g.scheduledAt,
    customerName: g.customerName,
  }));

  const widgets: DashboardWidget[] = [
    {
      id: "requests",
      title: "Offene Buchungsanfragen",
      description: "Neue Anfragen von Kunden, die auf deine Antwort warten.",
      defaultWidth: "full",
      essential: true,
      render: () =>
        pendingBookings && pendingBookings.length > 0 ? (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="font-brand text-xl font-bold">Offene Buchungsanfragen</h2>
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                {pendingBookings.length}
              </span>
            </div>
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(16rem,1fr))]">
              {pendingBookings.map((booking: PendingBooking) => (
                <Card key={booking.id} className="relative border-primary/50 bg-glass backdrop-blur shadow-[0_0_20px_rgba(var(--color-primary-rgb),0.12)] overflow-hidden">
                  {/* Glow accent */}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-transparent" />
                  <CardContent className="relative p-5 space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold leading-tight">{booking.title}</h3>
                        <Badge variant="outline" className="shrink-0 text-[10px] text-amber-400 border-amber-400/30 bg-amber-400/10">
                          Wartet
                        </Badge>
                      </div>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <p className="flex items-center gap-1.5">
                          <span className="font-medium text-foreground">{booking.customerName}</span>
                          möchte buchen
                        </p>
                        {booking.scheduledAt && (
                          <p className="flex items-center gap-1.5">
                            <CalendarClock className="size-3.5 shrink-0" />
                            {new Date(booking.scheduledAt).toLocaleString(intlLocale, {
                              weekday: "short",
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        )}
                        <p className="flex items-center gap-1.5 font-semibold text-primary">
                          <Euro className="size-3.5 shrink-0" />
                          {formatEuros(booking.budgetCents, intlLocale)}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        className="flex-1 gap-1.5"
                        size="sm"
                        disabled={respondMutation.isPending}
                        onClick={() =>
                          respondMutation.mutate({
                            gigId: booking.id,
                            accept: true,
                            customerId: booking.customerId,
                          })
                        }
                      >
                        <MessageSquare className="size-3.5" />
                        {booking.scheduledAt ? "Termin bestätigen" : "Annehmen & Chatten"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={respondMutation.isPending}
                        onClick={() =>
                          respondMutation.mutate({
                            gigId: booking.id,
                            accept: false,
                            customerId: booking.customerId,
                          })
                        }
                      >
                        Ablehnen
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : null,
    },
    {
      id: "stats",
      title: "Kennzahlen",
      description: "Verdienst der Woche, Bewertung, Abschlussquote und erledigte Aufträge.",
      defaultWidth: "full",
      essential: true,
      render: () => <HelperStats stats={stats} chart={chart} locale={intlLocale} />,
    },
    {
      id: "schedule",
      title: "Deine Einsätze",
      description: "Nächster Einsatz, was danach kommt, und ein Mini-Kalender mit Einsätzen und offenen Anfragen.",
      defaultWidth: "full",
      essential: true,
      render: () => <ScheduleWidget agenda={agenda} requests={pendingBookings} />,
    },
    {
      id: "earnings-chart",
      title: "Verdienst",
      description: "Auszahlungen der letzten 7 Tage oder 6 Monate und was noch auf Freigabe wartet.",
      essential: true,
      render: () => (
        <EarningsWidget chart={chart} months={earningsMonths} stats={stats} locale={intlLocale} />
      ),
    },
    {
      id: "gig-status",
      title: "Auftrags-Status",
      description: "Wie viele deiner letzten Aufträge offen, laufend oder erledigt sind. Standardmäßig ausgeblendet – die Erfolgsquote oben und die Liste „Letzte Aufträge“ zeigen das Wichtigste schon.",
      defaultVisible: false,
      render: () => <GigStatusWidget statuses={recentGigs.map((g) => g.status)} />,
    },
    {
      id: "pre-job",
      title: "Vor dem Einsatz",
      description: "Checkliste für deinen nächsten bestätigten Auftrag.",
      essential: true,
      render: () => (
        <Card className="h-[28rem] overflow-hidden border-glass-border bg-glass backdrop-blur">
          <PreJobChecklistWidget jobs={upcomingJobs} intlLocale={intlLocale} />
        </Card>
      ),
    },
    {
      id: "recent-orders",
      title: "Letzte Aufträge",
      description: "Deine neuesten Aufträge. Ein Klick öffnet die Details.",
      defaultWidth: "full",
      essential: true,
      render: () => (
        <Card
          id="recent-gigs"
          className="border-glass-border bg-glass backdrop-blur"
        >
          <CardHeader>
            <CardTitle className="font-brand text-lg">
              {t("dashboard.helper.orders.title")}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {t("dashboard.helper.orders.sub")}
            </p>
          </CardHeader>
          <CardContent>
            {recentGigs.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/20">
                  <MapPin className="size-7 text-muted-foreground/40" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("dashboard.helper.orders.empty")}
                </p>
                <Button asChild variant="outline" size="sm">
                  <Link to="/marketplace">Aufträge finden</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {recentGigs.slice(0, 8).map((gig) => (
                  <motion.div
                    key={gig.id}
                    whileHover={{ x: 3 }}
                    transition={{ type: "spring", stiffness: 400 }}
                    onClick={() => setSelectedGig(gig)}
                    className="cursor-pointer rounded-xl border border-glass-border px-4 py-3 transition-colors hover:bg-glass"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    <div className="flex min-w-0 flex-1 basis-48 items-center gap-3">
                      <Avatar className="size-9 shrink-0">
                        <AvatarFallback className="text-xs" style={tintFor(gig.customerName)}>
                          {gig.customerName.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-sm">{gig.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {gig.customerName}
                          {gig.scheduledAt && (
                            <> · {new Date(gig.scheduledAt).toLocaleDateString(intlLocale)}</>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="ml-auto flex shrink-0 items-center gap-3">
                      <span className="font-semibold text-sm tabular-nums">
                        {formatEuros(gig.budgetCents, intlLocale)}
                      </span>
                      <Badge
                        variant="outline"
                        className={`shrink-0 text-[11px] ${statusColors[gig.status] ?? ""}`}
                      >
                        {t(`status.${gig.status}`)}
                      </Badge>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </div>
                    </div>
                    {(() => {
                      const journey = gigJourney({ status: gig.status, payment_state: gig.paymentState });
                      if (!journey || journey.finished) return null;
                      const info = describeGigStatus(gig.status, "helper", {
                        paymentState: gig.paymentState as PaymentState,
                        hasScheduledDate: !!gig.scheduledAt,
                      });
                      return (
                        <JourneyTrack
                          className="mt-3"
                          journey={journey}
                          labels={HELPER_JOURNEY_LABELS}
                          needsAction={info.needsAction}
                        />
                      );
                    })()}
                  </motion.div>
                ))}
              </div>
            )}
            {recentGigs.length > 0 && (
              <div className="mt-4 text-right">
                <Button asChild variant="ghost" size="sm" className="gap-1">
                  <Link to="/gigs">
                    Alle Aufträge ansehen
                    <ChevronRight className="size-4" />
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ),
    },
    {
      id: "pstg",
      title: "Steuer-Monitor (PStTG)",
      description: "Wie nah du an der Meldeschwelle für Plattform-Einnahmen bist.",
      defaultWidth: "full",
      render: () => (
        <Card className="border-glass-border bg-glass backdrop-blur">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="font-brand text-lg">
                  {t("dashboard.helper.pstg.title")}
                </CardTitle>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {t("dashboard.helper.pstg.sub")}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-primary">
                  {Math.round(Math.min(100, pstgRatio * 100))}%
                </p>
                <p className="text-xs text-muted-foreground">Schwellenwert</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Progress value={Math.min(100, pstgRatio * 100)} className="h-2.5" />
            <div className="mt-3 flex justify-between font-mono text-[11px] text-muted-foreground">
              <span>
                {pstg.txCount} / {pstg.txThreshold} Tx
              </span>
              <span>
                {formatEuros(pstg.grossCents, intlLocale)} /{" "}
                {formatEuros(pstg.grossThreshold, intlLocale)}
              </span>
            </div>

            {pstg.thresholdReached && !profile.hasTaxId && (
              <Alert variant="destructive" className="mt-4">
                <AlertTitle>{t("dashboard.helper.pstg.locked")}</AlertTitle>
                <AlertDescription>
                  <form
                    className="mt-3 flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (taxIdInput.trim())
                        taxIdMutation.mutate(taxIdInput.trim());
                    }}
                  >
                    <Input
                      placeholder={t("dashboard.helper.pstg.taxIdLabel")}
                      value={taxIdInput}
                      onChange={(e) => setTaxIdInput(e.target.value)}
                      className="h-9"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={taxIdMutation.isPending}
                    >
                      {t("dashboard.helper.pstg.taxIdSubmit")}
                    </Button>
                  </form>
                  {taxIdMutation.isError && (
                    <p className="mt-2 text-xs text-destructive">
                      {t("dashboard.helper.error.generic")}
                    </p>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      ),
    },
    {
      id: "growth",
      title: "Mehr Kunden gewinnen",
      description: "Kleine Checkliste, die mehr Anfragen bringen soll.",
      render: () => (
        <Card className="h-[28rem] overflow-hidden border-glass-border bg-glass backdrop-blur">
          <GrowthChecklistWidget userId={user?.id ?? "anon"} />
        </Card>
      ),
    },
    {
      id: "find-orders",
      title: "Neue Aufträge finden",
      description: "Schnellzugriff auf den Marktplatz mit offenen Aufträgen.",
      render: () => (
        <div className="relative flex h-full flex-col justify-center overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/15 via-primary/5 to-transparent p-6">
          {/* Decorative blobs */}
          <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-8 right-20 h-24 w-24 rounded-full bg-primary/10 blur-xl" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Rocket className="size-5 text-primary" />
                <span className="text-sm font-semibold text-primary uppercase tracking-widest">
                  Neue Aufträge
                </span>
              </div>
              <h2 className="font-brand text-xl font-bold">
                Bereit für deinen nächsten Auftrag?
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Durchstöbere offene Aufträge in deiner Nähe und biete jetzt mit.
              </p>
            </div>
            <Button asChild className="shrink-0 gap-2" size="lg">
              <Link to="/marketplace">
                Marktplatz öffnen
                <ChevronRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      ),
    },
  ];

  return (
    <DashboardShell
      title={t("dashboard.helper.title")}
      navItems={navItems}
      activeKey="dashboard"
    >
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        {/* ── Header row ── */}
        <motion.div
          variants={itemVariants}
          className="flex flex-wrap items-start justify-between gap-4"
          id="top"
        >
          <div>
            <h1 className="font-brand text-2xl">
              {t("dashboard.helper.greeting")}
              {profile.displayName ? `, ${profile.displayName}` : ""}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("dashboard.helper.title")}
            </p>
          </div>

          {/* Availability & Vacation toggles */}
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-3 rounded-2xl border border-glass-border bg-glass px-4 py-2.5 backdrop-blur">
              <span
                className={`h-2.5 w-2.5 rounded-full transition-colors ${profile.availableToday ? "bg-primary shadow-[0_0_8px_var(--color-primary)]" : "bg-muted-foreground"}`}
              />
              <span className="text-sm font-medium">
                {profile.availableToday
                  ? t("dashboard.helper.available")
                  : t("dashboard.helper.unavailable")}
              </span>
              <Switch
                checked={profile.availableToday}
                onCheckedChange={(checked) =>
                  availabilityMutation.mutate(checked)
                }
                disabled={availabilityMutation.isPending || profile.vacationMode}
                aria-label={
                  profile.availableToday
                    ? t("dashboard.helper.available")
                    : t("dashboard.helper.unavailable")
                }
              />
            </div>
            {availabilityMutation.isError && (
              <span className="text-xs text-destructive">
                {t("dashboard.helper.error.generic")}
              </span>
            )}
            <div className="flex flex-col items-end gap-2 rounded-2xl border border-glass-border bg-glass px-4 py-2.5 backdrop-blur">
              <div className="flex items-center gap-3">
                <Palmtree
                  className={`size-4 ${profile.vacationMode ? "text-primary" : "text-muted-foreground"}`}
                />
                <span className="text-sm font-medium">
                  {t("dashboard.helper.vacation.label")}
                </span>
                <Switch
                  checked={profile.vacationMode}
                  disabled={vacationMutation.isPending}
                  onCheckedChange={(checked) => {
                    if (!checked) {
                      vacationMutation.mutate({ vacationMode: false, returnDate: null });
                      return;
                    }
                    vacationMutation.mutate({
                      vacationMode: true,
                      returnDate: vacationReturnDateInput || null,
                    });
                  }}
                  aria-label={t("dashboard.helper.vacation.label")}
                />
              </div>
              {profile.vacationMode ? (
                <p className="text-xs text-muted-foreground">
                  {profile.vacationReturnDate
                    ? `${t("dashboard.helper.vacation.backOn")} ${new Date(profile.vacationReturnDate).toLocaleDateString(intlLocale, { day: "2-digit", month: "2-digit", year: "numeric" })}`
                    : t("dashboard.helper.vacation.activeNoDate")}
                </p>
              ) : (
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={vacationReturnDateInput}
                    onChange={(e) => setVacationReturnDateInput(e.target.value)}
                    className="h-8 w-36 text-xs"
                    aria-label={t("dashboard.helper.vacation.returnDateLabel")}
                  />
                </div>
              )}
            </div>
            <RecurringBlocksCard variant="pill" pillLabel={t("dashboard.helper.blocks.button")} />
          </div>
        </motion.div>

        {/* ── Alerts ── */}
        {profile.vacationMode && (
          <motion.div variants={itemVariants}>
            <Alert className="mt-6 border-primary/30 bg-primary/5">
              <Palmtree className="size-4 text-primary" />
              <AlertTitle>{t("dashboard.helper.vacation.bannerTitle")}</AlertTitle>
              <AlertDescription>{t("dashboard.helper.vacation.bannerBody")}</AlertDescription>
            </Alert>
          </motion.div>
        )}
        {isYouth && (
          <motion.div variants={itemVariants} className="mt-6 empty:hidden">
            <GuardianConsentBanner />
          </motion.div>
        )}
        {isYouth && (
          <motion.div variants={itemVariants}>
            <Alert className="mt-6 border-primary/30 bg-primary/5">
              <CalendarClock className="size-4 text-primary" />
              <AlertTitle>{t("dashboard.helper.youth.title")}</AlertTitle>
              <AlertDescription>{t("dashboard.helper.youth.banner")}</AlertDescription>
            </Alert>
          </motion.div>
        )}

        {/* ── Anpassbare Bereiche ── */}
        <CustomizableDashboard scope="helper" widgets={widgets} title="Dein Überblick" />
      </motion.div>

      {/* ── Gig detail sheet ── */}
      <Sheet
        open={selectedGig !== null}
        onOpenChange={(open) => !open && setSelectedGig(null)}
      >
        <SheetContent>
          {selectedGig && (
            <>
              <SheetHeader>
                <SheetTitle>{selectedGig.title}</SheetTitle>
                <SheetDescription>
                  {t("dashboard.helper.detail.title")}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4 px-1 text-sm">
                <div className="flex items-center justify-between border-b border-glass-border pb-3">
                  <span className="text-muted-foreground">
                    {t("dashboard.helper.detail.customer")}
                  </span>
                  <span className="font-medium">{selectedGig.customerName}</span>
                </div>
                <div className="flex items-center justify-between border-b border-glass-border pb-3">
                  <span className="text-muted-foreground">
                    {t("dashboard.helper.detail.date")}
                  </span>
                  <span className="font-medium">
                    {selectedGig.scheduledAt
                      ? new Date(selectedGig.scheduledAt).toLocaleString(intlLocale)
                      : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-glass-border pb-3">
                  <span className="text-muted-foreground">
                    {t("dashboard.helper.detail.address")}
                  </span>
                  <span className="font-medium">
                    {selectedGig.address ?? publicLocationLabel(selectedGig.district)}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-glass-border pb-3">
                  <span className="text-muted-foreground">
                    {t("dashboard.helper.detail.amount")}
                  </span>
                  <span className="font-medium text-primary">
                    {formatEuros(selectedGig.budgetCents, intlLocale)}
                  </span>
                </div>
                <div className="flex items-center justify-between pb-3">
                  <span className="text-muted-foreground">
                    {t("dashboard.helper.orders.col.status")}
                  </span>
                  <Badge
                    variant="outline"
                    className={statusColors[selectedGig.status] ?? ""}
                  >
                    {t(`status.${selectedGig.status}`)}
                  </Badge>
                </div>
                {(selectedGig.status === "pending_helper" || selectedGig.status === "assigned") && (
                  <div className="mt-6 flex gap-2">
                    <Button
                      className="flex-1 gap-1.5"
                      size="sm"
                      disabled={respondMutation.isPending}
                      onClick={() =>
                        respondMutation.mutate({
                          gigId: selectedGig.id,
                          accept: true,
                          customerId: selectedGig.customerId,
                        })
                      }
                    >
                      <MessageSquare className="size-3.5" />
                      {selectedGig.scheduledAt ? "Termin bestätigen" : "Annehmen & Chatten"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={respondMutation.isPending}
                      onClick={() =>
                        respondMutation.mutate({
                          gigId: selectedGig.id,
                          accept: false,
                          customerId: selectedGig.customerId,
                        })
                      }
                    >
                      Ablehnen
                    </Button>
                  </div>
                )}

                {(selectedGig.status === "pending_helper" ||
                  selectedGig.status === "assigned" ||
                  selectedGig.status === "in_progress") && (
                  <SafetyAbortButton
                    gigId={selectedGig.id}
                    onDone={() => {
                      queryClient.invalidateQueries({ queryKey: ["helper-dashboard"] });
                      setSelectedGig(null);
                    }}
                  />
                )}

                <div className="mt-6 space-y-2">
                  <p className="text-xs text-muted-foreground">Sicherheit: Auftraggeber</p>
                  <SafetyActions
                    userId={selectedGig.customerId}
                    userName={selectedGig.customerName}
                    gigId={selectedGig.id}
                  />
                </div>

                {(selectedGig.status === "assigned" || selectedGig.status === "in_progress") && (
                  <div className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                    <h4 className="mb-2 text-sm font-semibold text-destructive">
                      Auftrag stornieren
                    </h4>
                    {showCancelForm ? (
                      <div className="space-y-2">
                        <Textarea
                          placeholder="Grund für die Stornierung..."
                          value={cancelReason}
                          onChange={(e) => setCancelReason(e.target.value)}
                          rows={2}
                          className="text-sm"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={cancelMutation.isPending || !cancelReason.trim()}
                            onClick={() =>
                              cancelMutation.mutate({
                                gigId: selectedGig.id,
                                reason: cancelReason,
                              })
                            }
                          >
                            Stornierung bestätigen
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setShowCancelForm(false)}
                          >
                            Abbrechen
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="mb-3 text-xs text-muted-foreground">
                          {selectedGig.customerName} wird per E-Mail über die
                          Stornierung informiert.
                        </p>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setShowCancelForm(true)}
                        >
                          <XCircle className="mr-2 size-4" />
                          Auftrag stornieren
                        </Button>
                      </>
                    )}
                  </div>
                )}

                {selectedGig.status === "completed" && (
                  <div className="mt-6 border-t border-glass-border pt-4">
                    <p className="mb-2 text-sm font-medium">
                      {selectedGig.customerName} bewerten
                    </p>
                    {customerReviewQuery.isLoading ? (
                      <p className="text-xs text-muted-foreground">Lädt...</p>
                    ) : (
                      <>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              onClick={() => setCustomerReviewRating(star)}
                              className="p-0.5"
                              aria-label={`${star} Sterne`}
                            >
                              <Star
                                className={`size-5 ${
                                  star <= customerReviewRating
                                    ? "fill-amber-400 text-amber-400"
                                    : "text-muted-foreground"
                                }`}
                              />
                            </button>
                          ))}
                        </div>
                        <Textarea
                          className="mt-2"
                          placeholder="Wie war die Zusammenarbeit mit dem Kunden? (optional)"
                          rows={2}
                          value={customerReviewComment}
                          onChange={(e) => setCustomerReviewComment(e.target.value)}
                        />
                        <Button
                          size="sm"
                          className="mt-2"
                          disabled={customerReviewMutation.isPending}
                          onClick={() => customerReviewMutation.mutate()}
                        >
                          {customerReviewQuery.data?.review
                            ? "Bewertung aktualisieren"
                            : "Bewertung abgeben"}
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </DashboardShell>
  );
}

import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Euro,
  MapPin,
  MessageSquare,
  Palmtree,
  Rocket,
  Star,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { useAppNavItems } from "@/lib/use-app-nav";
import {
  getHelperDashboard,
  setAvailability,
  setVacationMode,
  submitTaxId,
} from "@/lib/helper-dashboard.functions";
import { respondToBooking } from "@/lib/service-listings.functions";
import { startConversation } from "@/lib/messaging.functions";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";

interface RecentGig {
  id: string;
  title: string;
  serviceType: string;
  budgetCents: number;
  address: string | null;
  scheduledAt: string | null;
  status: string;
  customerName: string;
}

interface PendingBooking {
  id: string;
  title: string;
  serviceType: string;
  budgetCents: number;
  address: string | null;
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
  const q = useHelperDashboardData();
  const queryClient = useQueryClient();
  const [selectedGig, setSelectedGig] = useState<RecentGig | null>(null);
  const [taxIdInput, setTaxIdInput] = useState("");

  const availabilityFn = useServerFn(setAvailability);
  const availabilityMutation = useMutation({
    mutationFn: (availableToday: boolean) =>
      availabilityFn({ data: { availableToday } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["helper-dashboard"] }),
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

  const { profile, stats, chart, pstg, recentGigs, pendingBookings } = q.data;
  const isYouth = profile.birthdate
    ? ageFromISO(profile.birthdate) < 18
    : false;
  const pstgRatio = Math.max(
    pstg.txCount / pstg.txThreshold,
    pstg.grossCents / pstg.grossThreshold,
  );

  // Gig status breakdown for progress bar
  const completedCount = recentGigs.filter(g => g.status === "completed").length;
  const inProgressCount = recentGigs.filter(g => g.status === "in_progress" || g.status === "assigned").length;
  const openCount = recentGigs.filter(g => g.status === "open" || g.status === "negotiating").length;
  const totalGigs = recentGigs.length;

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
          <motion.div variants={itemVariants}>
            <Alert className="mt-6 border-primary/30 bg-primary/5">
              <CalendarClock className="size-4 text-primary" />
              <AlertTitle>{t("dashboard.helper.youth.title")}</AlertTitle>
              <AlertDescription>{t("dashboard.helper.youth.banner")}</AlertDescription>
            </Alert>
          </motion.div>
        )}

        {/* ── Pending Bookings ── */}
        {pendingBookings && pendingBookings.length > 0 && (
          <motion.div variants={itemVariants} className="mt-8">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="font-brand text-xl font-bold">Offene Buchungsanfragen</h2>
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                {pendingBookings.length}
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                        Annehmen & Chatten
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
          </motion.div>
        )}


        {/* ── Stat cards ── */}
        <motion.div
          variants={itemVariants}
          className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {/* Earnings */}
          <motion.div
            whileHover={{ y: -3, scale: 1.01 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <Card className="relative overflow-hidden border-glass-border bg-glass backdrop-blur">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent pointer-events-none" />
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-normal text-muted-foreground">
                  {t("dashboard.helper.stat.earnings")}
                </CardTitle>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
                  <Euro className="size-4 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tracking-tight">
                  {formatEuros(stats.earningsLast7Cents, intlLocale)}
                </div>
                {stats.earningsTrendPct !== null ? (
                  <p className="mt-1 flex items-center gap-1 text-xs">
                    {stats.earningsTrendPct >= 0 ? (
                      <TrendingUp className="size-3.5 text-primary" />
                    ) : (
                      <TrendingDown className="size-3.5 text-destructive" />
                    )}
                    <span className={stats.earningsTrendPct >= 0 ? "text-primary" : "text-destructive"}>
                      {stats.earningsTrendPct >= 0 ? "+" : ""}
                      {stats.earningsTrendPct.toFixed(1)}%
                    </span>
                    <span className="text-muted-foreground">
                      {t("dashboard.helper.stat.vsLastWeek")}
                    </span>
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("dashboard.helper.stat.vsLastWeek")}
                  </p>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Rating */}
          <motion.div
            whileHover={{ y: -3, scale: 1.01 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <Card className="relative overflow-hidden border-glass-border bg-glass backdrop-blur">
              <div className="absolute inset-0 bg-gradient-to-br from-amber-400/10 via-transparent to-transparent pointer-events-none" />
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-normal text-muted-foreground">
                  {t("dashboard.helper.stat.rating")}
                </CardTitle>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-400/10">
                  <Star className="size-4 text-amber-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tracking-tight">
                  {stats.avgRating !== null ? stats.avgRating.toFixed(1) : "—"}
                  {stats.avgRating !== null && (
                    <span className="ml-1 text-base text-amber-400">★</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {stats.ratingCount > 0
                    ? `${stats.ratingCount} ${t("dashboard.helper.stat.ratingSub")}`
                    : t("dashboard.helper.stat.noRatings")}
                </p>
              </CardContent>
            </Card>
          </motion.div>

          {/* Completion Rate */}
          <motion.div
            whileHover={{ y: -3, scale: 1.01 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <Card className="relative overflow-hidden border-glass-border bg-glass backdrop-blur">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/10 via-transparent to-transparent pointer-events-none" />
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-normal text-muted-foreground">
                  {t("dashboard.helper.stat.completionRate")}
                </CardTitle>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-400/10">
                  <CheckCircle2 className="size-4 text-emerald-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tracking-tight">
                  {stats.completionRate !== null
                    ? `${Math.round(stats.completionRate * 100)}%`
                    : "—"}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {stats.completionRate !== null
                    ? `${stats.completedCount} / ${stats.finishedCount} ${t("dashboard.helper.stat.completionSub")}`
                    : t("dashboard.helper.stat.completionSub")}
                </p>
              </CardContent>
            </Card>
          </motion.div>

          {/* Completed total */}
          <motion.div
            whileHover={{ y: -3, scale: 1.01 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <Card className="relative overflow-hidden border-glass-border bg-glass backdrop-blur">
              <div className="absolute inset-0 bg-gradient-to-br from-sky-400/10 via-transparent to-transparent pointer-events-none" />
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-normal text-muted-foreground">
                  {t("dashboard.helper.stat.completedTotal")}
                </CardTitle>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-400/10">
                  <MapPin className="size-4 text-sky-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tracking-tight">
                  {stats.completedCount}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("dashboard.helper.stat.total")}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>

        {/* ── Chart + PStTG + Gig status ── */}
        <motion.div
          variants={itemVariants}
          className="mt-6 grid gap-4 lg:grid-cols-3"
        >
          {/* Earnings chart – spans 2 cols */}
          <Card
            id="earnings-chart"
            className="border-glass-border bg-glass backdrop-blur lg:col-span-2"
          >
            <CardHeader>
              <CardTitle className="font-brand text-lg">
                {t("dashboard.helper.chart.title")}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {t("dashboard.helper.chart.sub")}
              </p>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart}>
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
                  />
                  <YAxis hide />
                  <Tooltip
                    cursor={{ fill: "var(--color-glass)" }}
                    contentStyle={{
                      background: "var(--color-background)",
                      border: "1px solid var(--color-glass-border)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                    formatter={(value: number) => [
                      `${value} €`,
                      t("dashboard.helper.chart.title"),
                    ]}
                  />
                  <Bar
                    dataKey="euros"
                    fill="var(--color-primary)"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Gig status breakdown card */}
          <Card className="border-glass-border bg-glass backdrop-blur">
            <CardHeader>
              <CardTitle className="font-brand text-lg flex items-center gap-2">
                <Zap className="size-4 text-primary" />
                Auftrags-Status
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Letzte {totalGigs} Aufträge
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {totalGigs === 0 ? (
                <p className="text-sm text-muted-foreground">Noch keine Aufträge.</p>
              ) : (
                <>
                  {/* Multi-segment progress bar */}
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted/30">
                    {completedCount > 0 && (
                      <div
                        className="bg-emerald-400 transition-all"
                        style={{ width: `${(completedCount / totalGigs) * 100}%` }}
                      />
                    )}
                    {inProgressCount > 0 && (
                      <div
                        className="bg-primary transition-all"
                        style={{ width: `${(inProgressCount / totalGigs) * 100}%` }}
                      />
                    )}
                    {openCount > 0 && (
                      <div
                        className="bg-amber-400 transition-all"
                        style={{ width: `${(openCount / totalGigs) * 100}%` }}
                      />
                    )}
                  </div>
                  {/* Legend */}
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400" />
                        <span className="text-muted-foreground">Abgeschlossen</span>
                      </div>
                      <span className="font-semibold">{completedCount}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="inline-block h-2.5 w-2.5 rounded-full bg-primary" />
                        <span className="text-muted-foreground">In Bearbeitung</span>
                      </div>
                      <span className="font-semibold">{inProgressCount}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400" />
                        <span className="text-muted-foreground">Offen / Verhandlung</span>
                      </div>
                      <span className="font-semibold">{openCount}</span>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* ── PStTG Steuer-Monitor ── */}
        <motion.div variants={itemVariants} className="mt-6">
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
        </motion.div>

        {/* ── CTA Banner ── */}
        <motion.div variants={itemVariants} className="mt-6">
          <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/15 via-primary/5 to-transparent p-6">
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
        </motion.div>

        {/* ── Recent orders ── */}
        <motion.div variants={itemVariants} className="mt-6">
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
                  {recentGigs.map((gig) => (
                    <motion.div
                      key={gig.id}
                      whileHover={{ x: 3 }}
                      transition={{ type: "spring", stiffness: 400 }}
                      onClick={() => setSelectedGig(gig)}
                      className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-glass-border px-4 py-3 transition-colors hover:bg-glass"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-sm">{gig.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {gig.customerName}
                          {gig.scheduledAt && (
                            <> · {new Date(gig.scheduledAt).toLocaleDateString(intlLocale)}</>
                          )}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
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
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
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
                    {selectedGig.address ?? "—"}
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
                {selectedGig.status === "pending_helper" && (
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
                      Annehmen & Chatten
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
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </DashboardShell>
  );
}

import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Euro,
  Mail,
  Package,
  Palmtree,
  Star,
  TrendingDown,
  TrendingUp,
  Wallet,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DashboardShell,
  type DashboardNavItem,
} from "@/components/dashboard/dashboard-shell";
import {
  getHelperDashboard,
  setAvailability,
  setVacationMode,
  submitTaxId,
} from "@/lib/helper-dashboard.functions";
import { useI18n } from "@/lib/i18n";

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

const statusVariant: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  completed: "default",
  in_progress: "secondary",
  assigned: "secondary",
  negotiating: "outline",
  open: "outline",
  cancelled: "destructive",
  draft: "outline",
};

function ageFromISO(iso: string): number {
  const d = new Date(iso);
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
}

export function HelperDashboard() {
  const { t, locale } = useI18n();
  const intlLocale = locale === "de" ? "de-DE" : "en-GB";
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

  const navItems: DashboardNavItem[] = [
    {
      key: "dashboard",
      label: t("dashboard.nav.dashboard"),
      href: "/dashboard",
      icon: <BarChart3 className="size-4" />,
    },
    {
      key: "inbox",
      label: "Postfach",
      href: "/inbox",
      icon: <Mail className="size-4" />,
    },
    {
      key: "marketplace",
      label: "Aufträge finden",
      href: "/marketplace",
      icon: <ClipboardList className="size-4" />,
    },
    {
      key: "orders",
      label: t("dashboard.nav.orders"),
      href: "/gigs",
      icon: <ClipboardList className="size-4" />,
    },
    {
      key: "sell",
      label: "Meine Angebote",
      href: "/sell",
      icon: <Package className="size-4" />,
    },
    {
      key: "earnings",
      label: t("dashboard.nav.earnings"),
      href: "/earnings",
      icon: <Wallet className="size-4" />,
    },
  ];

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
        <p className="text-muted-foreground">{t("common.loading")}</p>
      </DashboardShell>
    );
  }

  const { profile, stats, chart, pstg, recentGigs } = q.data;
  const isYouth = profile.birthdate
    ? ageFromISO(profile.birthdate) < 18
    : false;
  const pstgRatio = Math.max(
    pstg.txCount / pstg.txThreshold,
    pstg.grossCents / pstg.grossThreshold,
  );

  return (
    <DashboardShell
      title={t("dashboard.helper.title")}
      navItems={navItems}
      activeKey="dashboard"
    >
      <div
        id="top"
        className="flex flex-wrap items-center justify-between gap-4"
      >
        <div>
          <h1 className="font-brand text-2xl">
            {t("dashboard.helper.greeting")}
            {profile.displayName ? `, ${profile.displayName}` : ""}
          </h1>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-3 rounded-2xl border border-glass-border bg-glass px-4 py-2.5 backdrop-blur">
            <span
              className={`h-2.5 w-2.5 rounded-full ${profile.availableToday ? "bg-primary shadow-[0_0_8px_var(--color-primary)]" : "bg-muted-foreground"}`}
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
                    vacationMutation.mutate({
                      vacationMode: false,
                      returnDate: null,
                    });
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
      </div>

      {profile.vacationMode && (
        <Alert className="mt-6 border-primary/30 bg-primary/5">
          <Palmtree className="size-4 text-primary" />
          <AlertTitle>{t("dashboard.helper.vacation.bannerTitle")}</AlertTitle>
          <AlertDescription>
            {t("dashboard.helper.vacation.bannerBody")}
          </AlertDescription>
        </Alert>
      )}

      {isYouth && (
        <Alert className="mt-6 border-primary/30 bg-primary/5">
          <CalendarClock className="size-4 text-primary" />
          <AlertTitle>{t("dashboard.helper.youth.title")}</AlertTitle>
          <AlertDescription>
            {t("dashboard.helper.youth.banner")}
          </AlertDescription>
        </Alert>
      )}

      {/* Stat cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-glass-border bg-glass backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground">
              {t("dashboard.helper.stat.earnings")}
            </CardTitle>
            <Euro className="size-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {formatEuros(stats.earningsLast7Cents, intlLocale)}
            </div>
            {stats.earningsTrendPct !== null ? (
              <p className="mt-1 flex items-center gap-1 text-xs">
                {stats.earningsTrendPct >= 0 ? (
                  <TrendingUp className="size-3.5 text-primary" />
                ) : (
                  <TrendingDown className="size-3.5 text-destructive" />
                )}
                <span
                  className={
                    stats.earningsTrendPct >= 0
                      ? "text-primary"
                      : "text-destructive"
                  }
                >
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

        <Card className="border-glass-border bg-glass backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground">
              {t("dashboard.helper.stat.rating")}
            </CardTitle>
            <Star className="size-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {stats.avgRating !== null ? stats.avgRating.toFixed(1) : "—"}
              {stats.avgRating !== null && (
                <span className="ml-1 text-base text-primary">★</span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {stats.ratingCount > 0
                ? `${stats.ratingCount} ${t("dashboard.helper.stat.ratingSub")}`
                : t("dashboard.helper.stat.noRatings")}
            </p>
          </CardContent>
        </Card>

        <Card className="border-glass-border bg-glass backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground">
              {t("dashboard.helper.stat.completionRate")}
            </CardTitle>
            <CheckCircle2 className="size-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
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

        <Card className="border-glass-border bg-glass backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground">
              {t("dashboard.helper.stat.completedTotal")}
            </CardTitle>
            <ClipboardList className="size-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{stats.completedCount}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("dashboard.helper.stat.total")}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Chart + PStTG monitor */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card
          id="earnings-chart"
          className="border-glass-border bg-glass backdrop-blur"
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

        <Card className="border-glass-border bg-glass backdrop-blur">
          <CardHeader>
            <CardTitle className="font-brand text-lg">
              {t("dashboard.helper.pstg.title")}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {t("dashboard.helper.pstg.sub")}
            </p>
          </CardHeader>
          <CardContent>
            <Progress value={Math.min(100, pstgRatio * 100)} className="h-2" />
            <div className="mt-2 flex justify-between font-mono text-[11px] text-muted-foreground">
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
      </div>

      {/* Recent orders */}
      <Card
        id="recent-gigs"
        className="mt-6 border-glass-border bg-glass backdrop-blur"
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
            <p className="text-sm text-muted-foreground">
              {t("dashboard.helper.orders.empty")}
            </p>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentGigs.map((gig) => (
                  <TableRow
                    key={gig.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedGig(gig)}
                  >
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
                        {t(`status.${gig.status}`)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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
                  <span className="font-medium">
                    {selectedGig.customerName}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-glass-border pb-3">
                  <span className="text-muted-foreground">
                    {t("dashboard.helper.detail.date")}
                  </span>
                  <span className="font-medium">
                    {selectedGig.scheduledAt
                      ? new Date(selectedGig.scheduledAt).toLocaleString(
                          intlLocale,
                        )
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
                    variant={statusVariant[selectedGig.status] ?? "outline"}
                  >
                    {t(`status.${selectedGig.status}`)}
                  </Badge>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </DashboardShell>
  );
}

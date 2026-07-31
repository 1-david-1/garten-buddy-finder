import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  Euro,
  Info,
  ScrollText,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  ShieldOff,
  Users as UsersIcon,
  ClipboardList,
  Wrench,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DashboardShell, type DashboardNavItem } from "@/components/dashboard/dashboard-shell";
import { useI18n } from "@/lib/i18n";
import {
  adjustTrustScore,
  getAdminAuditLog,
  getAdminGigs,
  getAdminOverview,
  getAdminSettings,
  getAdminUsers,
  setUserVerified,
  updateAdminSetting,
} from "@/lib/admin.functions";

type GigStatusFilter =
  | "all"
  | "draft"
  | "open"
  | "negotiating"
  | "assigned"
  | "in_progress"
  | "completed"
  | "cancelled";

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  completed: "default",
  in_progress: "secondary",
  assigned: "secondary",
  negotiating: "outline",
  open: "outline",
  cancelled: "destructive",
  draft: "outline",
};

const settingLabels: Record<string, string> = {
  pstg_tx_threshold: "PStTG Transaktions-Schwellenwert",
  pstg_gross_cents_threshold: "PStTG Umsatz-Schwellenwert (Cent)",
  platform_fee_customer_pct: "Plattformgebühr Kunde (%)",
  platform_fee_helper_pct: "Plattformgebühr Helfer (%)",
  maintenance_mode: "Wartungsmodus",
  registration_enabled: "Registrierung erlaubt",
  max_gig_budget_cents: "Max. Auftragsbudget (Cent)",
  notification_email_admin: "Admin-Benachrichtigungs-E-Mails",
};

function formatEuros(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { style: "currency", currency: "EUR" });
}

function formatDate(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDateTime(iso: string, locale: string) {
  return new Date(iso).toLocaleString(locale);
}

// Rohen JSON-Settingwert in einen bearbeitbaren String umwandeln
function valueToInputString(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return String(value);
  return String(value ?? "");
}

// Bearbeiteten String anhand des ursprünglichen Werttyps zurück in JSON umwandeln
function inputStringToValue(raw: string, original: unknown): string | number | boolean | string[] {
  if (typeof original === "boolean") return raw === "true";
  if (typeof original === "number") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  if (Array.isArray(original)) {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return raw;
}

export function AdminDashboard() {
  const { t, locale } = useI18n();
  const intlLocale = locale === "de" ? "de-DE" : "en-GB";
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("overview");
  const [userSearch, setUserSearch] = useState("");
  const [gigStatusFilter, setGigStatusFilter] = useState<GigStatusFilter>("all");
  const [settingDrafts, setSettingDrafts] = useState<Record<string, string>>({});

  const navItems: DashboardNavItem[] = [
    {
      key: "admin",
      label: t("admin.title"),
      href: "/admin",
      icon: <ShieldCheck className="size-4" />,
    },
    {
      key: "dashboard",
      label: t("admin.nav.backToDashboard"),
      href: "/dashboard",
      icon: <BarChart3 className="size-4" />,
    },
  ];

  // ---- Übersicht -----------------------------------------------------
  const getOverviewFn = useServerFn(getAdminOverview);
  const overviewQ = useQuery({ queryKey: ["admin-overview"], queryFn: () => getOverviewFn() });

  const updateSettingFn = useServerFn(updateAdminSetting);
  const quickSettingMutation = useMutation({
    mutationFn: (input: { key: string; value: boolean }) => updateSettingFn({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
      queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
    },
  });

  // ---- Nutzer ----------------------------------------------------------
  const getUsersFn = useServerFn(getAdminUsers);
  const usersQ = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => getUsersFn(),
    enabled: tab === "users",
  });

  const setVerifiedFn = useServerFn(setUserVerified);
  const verifyMutation = useMutation({
    mutationFn: (input: { userId: string; verified: boolean }) => setVerifiedFn({ data: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const adjustTrustFn = useServerFn(adjustTrustScore);
  const trustMutation = useMutation({
    mutationFn: (input: { userId: string; delta: number }) => adjustTrustFn({ data: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const filteredUsers = useMemo(() => {
    const rows = usersQ.data?.users ?? [];
    const q = userSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (u) => u.displayName.toLowerCase().includes(q) || (u.city ?? "").toLowerCase().includes(q),
    );
  }, [usersQ.data, userSearch]);

  // ---- Aufträge ----------------------------------------------------------
  const getGigsFn = useServerFn(getAdminGigs);
  const gigsQ = useQuery({
    queryKey: ["admin-gigs", gigStatusFilter],
    queryFn: () => getGigsFn({ data: { status: gigStatusFilter } }),
    enabled: tab === "gigs",
  });

  // ---- Einstellungen -------------------------------------------------
  const getSettingsFn = useServerFn(getAdminSettings);
  const settingsQ = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => getSettingsFn(),
    enabled: tab === "settings",
  });

  const saveSettingMutation = useMutation({
    mutationFn: (input: { key: string; value: string | number | boolean | string[] }) =>
      updateSettingFn({ data: input }),
    onSuccess: (_res, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
      queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
      setSettingDrafts((prev) => {
        const next = { ...prev };
        delete next[variables.key];
        return next;
      });
    },
  });

  // ---- Audit-Log -------------------------------------------------------
  const getAuditFn = useServerFn(getAdminAuditLog);
  const auditQ = useQuery({
    queryKey: ["admin-audit"],
    queryFn: () => getAuditFn(),
    enabled: tab === "audit",
  });

  const isForbidden =
    overviewQ.isError && (overviewQ.error as Error)?.message?.includes("Forbidden");

  if (isForbidden) {
    return (
      <DashboardShell title={t("admin.title")} navItems={navItems} activeKey="admin">
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>{t("admin.forbidden.title")}</AlertTitle>
          <AlertDescription>{t("admin.forbidden.body")}</AlertDescription>
        </Alert>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell title={t("admin.title")} navItems={navItems} activeKey="admin">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-brand text-2xl">{t("admin.title")}</h1>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview" className="gap-1.5">
            <BarChart3 className="size-3.5" />
            {t("admin.nav.overview")}
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5">
            <UsersIcon className="size-3.5" />
            {t("admin.nav.users")}
          </TabsTrigger>
          <TabsTrigger value="gigs" className="gap-1.5">
            <ClipboardList className="size-3.5" />
            {t("admin.nav.gigs")}
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5">
            <SettingsIcon className="size-3.5" />
            {t("admin.nav.settings")}
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5">
            <ScrollText className="size-3.5" />
            {t("admin.nav.audit")}
          </TabsTrigger>
        </TabsList>

        {/* ------------------------------------------------------------ */}
        {/* Übersicht                                                     */}
        {/* ------------------------------------------------------------ */}
        <TabsContent value="overview" className="mt-6 space-y-6">
          {overviewQ.isError && !isForbidden ? (
            <Alert variant="destructive">
              <AlertTitle>{t("admin.error.title")}</AlertTitle>
              <AlertDescription>
                {(overviewQ.error as Error)?.message ?? t("admin.error.generic")}
              </AlertDescription>
            </Alert>
          ) : overviewQ.isLoading || !overviewQ.data ? (
            <p className="text-muted-foreground">{t("common.loading")}</p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card className="border-glass-border bg-glass backdrop-blur">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-normal text-muted-foreground">
                      {t("admin.overview.kpi.totalUsers")}
                    </CardTitle>
                    <UsersIcon className="size-4 text-primary" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold">{overviewQ.data.kpis.totalUsers}</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {overviewQ.data.kpis.totalHelpers} {t("admin.overview.kpi.helpers")} ·{" "}
                      {overviewQ.data.kpis.totalCustomers} {t("admin.overview.kpi.customers")}
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-glass-border bg-glass backdrop-blur">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-normal text-muted-foreground">
                      {t("admin.overview.kpi.activeGigs")}
                    </CardTitle>
                    <ClipboardList className="size-4 text-primary" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold">{overviewQ.data.kpis.activeGigs}</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {overviewQ.data.kpis.completedGigs} {t("admin.overview.kpi.completedGigs")}
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-glass-border bg-glass backdrop-blur">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-normal text-muted-foreground">
                      {t("admin.overview.kpi.grossVolume")}
                    </CardTitle>
                    <Euro className="size-4 text-primary" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold">
                      {formatEuros(overviewQ.data.kpis.grossVolumeCents, intlLocale)}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("admin.overview.kpi.platformFees")}:{" "}
                      {formatEuros(overviewQ.data.kpis.platformFeesCents, intlLocale)}
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-glass-border bg-glass backdrop-blur">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-normal text-muted-foreground">
                      {t("admin.overview.kpi.openDisputes")}
                    </CardTitle>
                    <AlertTriangle
                      className={`size-4 ${overviewQ.data.kpis.openDisputes > 0 ? "text-destructive" : "text-primary"}`}
                    />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold">
                      {overviewQ.data.kpis.openDisputes}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="border-glass-border bg-glass backdrop-blur">
                  <CardHeader>
                    <CardTitle className="font-brand text-lg">
                      {t("admin.overview.chart.title")}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {t("admin.overview.chart.sub")}
                    </p>
                  </CardHeader>
                  <CardContent className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={overviewQ.data.growthChart}>
                        <XAxis
                          dataKey="label"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
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
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar
                          dataKey="signups"
                          name={t("admin.overview.chart.signups")}
                          fill="var(--color-primary)"
                          radius={[6, 6, 0, 0]}
                        />
                        <Bar
                          dataKey="gigs"
                          name={t("admin.overview.chart.gigs")}
                          fill="var(--color-muted-foreground)"
                          radius={[6, 6, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card className="border-glass-border bg-glass backdrop-blur">
                  <CardHeader>
                    <CardTitle className="font-brand text-lg">
                      {t("admin.overview.statusBreakdown.title")}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {t("admin.overview.statusBreakdown.sub")}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {(() => {
                      const total = overviewQ.data.gigStatusBreakdown.reduce(
                        (s, b) => s + b.count,
                        0,
                      );
                      return overviewQ.data.gigStatusBreakdown.map((b) => (
                        <div key={b.status}>
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">
                              {t(`status.${b.status}`)}
                            </span>
                            <span className="font-medium">{b.count}</span>
                          </div>
                          <Progress
                            value={total > 0 ? (b.count / total) * 100 : 0}
                            className="h-1.5"
                          />
                        </div>
                      ));
                    })()}
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="border-glass-border bg-glass backdrop-blur">
                  <CardHeader>
                    <CardTitle className="font-brand text-lg">
                      {t("admin.overview.quickSettings.title")}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {t("admin.overview.quickSettings.sub")}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between rounded-xl border border-glass-border p-3">
                      <div className="flex items-center gap-2">
                        <Wrench className="size-4 text-muted-foreground" />
                        <span className="text-sm">{t("admin.overview.quickSettings.maintenance")}</span>
                      </div>
                      <Switch
                        checked={overviewQ.data.quickSettings.maintenanceMode}
                        disabled={quickSettingMutation.isPending}
                        onCheckedChange={(checked) =>
                          quickSettingMutation.mutate({ key: "maintenance_mode", value: checked })
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-glass-border p-3">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="size-4 text-muted-foreground" />
                        <span className="text-sm">
                          {t("admin.overview.quickSettings.registration")}
                        </span>
                      </div>
                      <Switch
                        checked={overviewQ.data.quickSettings.registrationEnabled}
                        disabled={quickSettingMutation.isPending}
                        onCheckedChange={(checked) =>
                          quickSettingMutation.mutate({
                            key: "registration_enabled",
                            value: checked,
                          })
                        }
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-glass-border bg-glass backdrop-blur">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="font-brand text-lg">
                        {t("admin.overview.auditPreview.title")}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {t("admin.overview.auditPreview.sub")}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setTab("audit")}>
                      {t("admin.overview.auditPreview.viewAll")}
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {overviewQ.data.recentAuditLog.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {t("admin.overview.auditPreview.empty")}
                      </p>
                    ) : (
                      <ul className="space-y-2 text-sm">
                        {overviewQ.data.recentAuditLog.map((entry) => (
                          <li
                            key={entry.id}
                            className="flex items-center justify-between border-b border-glass-border pb-2 last:border-0 last:pb-0"
                          >
                            <span>
                              <span className="font-medium">{entry.adminName}</span>{" "}
                              <span className="text-muted-foreground">{entry.action}</span>
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatDateTime(entry.createdAt, intlLocale)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        {/* ------------------------------------------------------------ */}
        {/* Nutzer                                                        */}
        {/* ------------------------------------------------------------ */}
        <TabsContent value="users" className="mt-6">
          <Card className="border-glass-border bg-glass backdrop-blur">
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle className="font-brand text-lg">{t("admin.users.title")}</CardTitle>
                <p className="text-sm text-muted-foreground">{t("admin.users.sub")}</p>
              </div>
              <div className="relative w-full max-w-xs">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder={t("admin.users.search")}
                  className="pl-8"
                />
              </div>
            </CardHeader>
            <CardContent>
              {usersQ.isError ? (
                <Alert variant="destructive">
                  <AlertTitle>{t("admin.error.title")}</AlertTitle>
                  <AlertDescription>{t("admin.error.generic")}</AlertDescription>
                </Alert>
              ) : usersQ.isLoading || !usersQ.data ? (
                <p className="text-muted-foreground">{t("common.loading")}</p>
              ) : filteredUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("admin.users.empty")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("admin.users.col.name")}</TableHead>
                        <TableHead>{t("admin.users.col.roles")}</TableHead>
                        <TableHead className="hidden md:table-cell">
                          {t("admin.users.col.city")}
                        </TableHead>
                        <TableHead>{t("admin.users.col.trust")}</TableHead>
                        <TableHead className="hidden sm:table-cell">
                          {t("admin.users.col.verified")}
                        </TableHead>
                        <TableHead className="hidden lg:table-cell">
                          {t("admin.users.col.joined")}
                        </TableHead>
                        <TableHead>{t("admin.users.col.actions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium">
                            {u.displayName || "—"}
                            {u.businessName && (
                              <div className="text-xs text-muted-foreground">
                                {u.businessName}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {u.roles.length === 0 ? (
                                <span className="text-xs text-muted-foreground">—</span>
                              ) : (
                                u.roles.map((r) => (
                                  <Badge key={r} variant="outline" className="text-[10px]">
                                    {r}
                                  </Badge>
                                ))
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="hidden text-muted-foreground md:table-cell">
                            {u.city ?? "—"}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-sm">{u.trustScore}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-6"
                                disabled={trustMutation.isPending}
                                onClick={() =>
                                  trustMutation.mutate({ userId: u.id, delta: -5 })
                                }
                              >
                                −
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-6"
                                disabled={trustMutation.isPending}
                                onClick={() => trustMutation.mutate({ userId: u.id, delta: 5 })}
                              >
                                +
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            {u.verifiedAt ? (
                              <Badge className="gap-1">
                                <ShieldCheck className="size-3" />
                                {formatDate(u.verifiedAt, intlLocale)}
                              </Badge>
                            ) : (
                              <Badge variant="outline">—</Badge>
                            )}
                          </TableCell>
                          <TableCell className="hidden text-muted-foreground lg:table-cell">
                            {formatDate(u.createdAt, intlLocale)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={verifyMutation.isPending}
                              onClick={() =>
                                verifyMutation.mutate({
                                  userId: u.id,
                                  verified: !u.verifiedAt,
                                })
                              }
                            >
                              {u.verifiedAt ? (
                                <>
                                  <ShieldOff className="mr-1.5 size-3.5" />
                                  {t("admin.users.unverify")}
                                </>
                              ) : (
                                <>
                                  <ShieldCheck className="mr-1.5 size-3.5" />
                                  {t("admin.users.verify")}
                                </>
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------------------------------------ */}
        {/* Aufträge                                                      */}
        {/* ------------------------------------------------------------ */}
        <TabsContent value="gigs" className="mt-6">
          <Card className="border-glass-border bg-glass backdrop-blur">
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle className="font-brand text-lg">{t("admin.gigs.title")}</CardTitle>
                <p className="text-sm text-muted-foreground">{t("admin.gigs.sub")}</p>
              </div>
              <Select
                value={gigStatusFilter}
                onValueChange={(v) => setGigStatusFilter(v as GigStatusFilter)}
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("admin.gigs.filter.all")}</SelectItem>
                  {[
                    "draft",
                    "open",
                    "negotiating",
                    "assigned",
                    "in_progress",
                    "completed",
                    "cancelled",
                  ].map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`status.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              {gigsQ.isError ? (
                <Alert variant="destructive">
                  <AlertTitle>{t("admin.error.title")}</AlertTitle>
                  <AlertDescription>{t("admin.error.generic")}</AlertDescription>
                </Alert>
              ) : gigsQ.isLoading || !gigsQ.data ? (
                <p className="text-muted-foreground">{t("common.loading")}</p>
              ) : gigsQ.data.gigs.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("admin.gigs.empty")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("admin.gigs.col.title")}</TableHead>
                        <TableHead className="hidden sm:table-cell">
                          {t("admin.gigs.col.customer")}
                        </TableHead>
                        <TableHead className="hidden md:table-cell">
                          {t("admin.gigs.col.helper")}
                        </TableHead>
                        <TableHead>{t("admin.gigs.col.budget")}</TableHead>
                        <TableHead>{t("admin.gigs.col.status")}</TableHead>
                        <TableHead className="hidden lg:table-cell">
                          {t("admin.gigs.col.negotiations")}
                        </TableHead>
                        <TableHead className="hidden lg:table-cell">
                          {t("admin.gigs.col.escrow")}
                        </TableHead>
                        <TableHead className="hidden xl:table-cell">
                          {t("admin.gigs.col.created")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {gigsQ.data.gigs.map((g) => (
                        <TableRow key={g.id}>
                          <TableCell className="font-medium">{g.title}</TableCell>
                          <TableCell className="hidden text-muted-foreground sm:table-cell">
                            {g.customerName}
                          </TableCell>
                          <TableCell className="hidden text-muted-foreground md:table-cell">
                            {g.helperName ?? "—"}
                          </TableCell>
                          <TableCell>{formatEuros(g.budgetCents, intlLocale)}</TableCell>
                          <TableCell>
                            <Badge variant={statusVariant[g.status] ?? "outline"}>
                              {t(`status.${g.status}`)}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {g.negotiationCount}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {g.escrowState ? (
                              <Badge variant="outline">{g.escrowState}</Badge>
                            ) : (
                              t("admin.gigs.escrow.none")
                            )}
                          </TableCell>
                          <TableCell className="hidden text-muted-foreground xl:table-cell">
                            {formatDate(g.createdAt, intlLocale)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------------------------------------ */}
        {/* Einstellungen                                                 */}
        {/* ------------------------------------------------------------ */}
        <TabsContent value="settings" className="mt-6">
          <Card className="border-glass-border bg-glass backdrop-blur">
            <CardHeader>
              <CardTitle className="font-brand text-lg">{t("admin.settings.title")}</CardTitle>
              <p className="text-sm text-muted-foreground">{t("admin.settings.sub")}</p>
            </CardHeader>
            <CardContent>
              {settingsQ.isError ? (
                <Alert variant="destructive">
                  <AlertTitle>{t("admin.error.title")}</AlertTitle>
                  <AlertDescription>{t("admin.error.generic")}</AlertDescription>
                </Alert>
              ) : settingsQ.isLoading || !settingsQ.data ? (
                <p className="text-muted-foreground">{t("common.loading")}</p>
              ) : settingsQ.data.settings.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("admin.settings.empty")}</p>
              ) : (
                <div className="space-y-3">
                  {settingsQ.data.settings.map((s) => {
                    const draft = settingDrafts[s.key] ?? valueToInputString(s.value);
                    const isBoolean = typeof s.value === "boolean";
                    const isDirty = draft !== valueToInputString(s.value);
                    return (
                      <div
                        key={s.key}
                        className="flex flex-col gap-2 rounded-xl border border-glass-border p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            {settingLabels[s.key] ?? s.key}
                          </p>
                          {s.description && (
                            <p className="flex items-start gap-1 text-xs text-muted-foreground">
                              <Info className="mt-0.5 size-3 shrink-0" />
                              {s.description}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {isBoolean ? (
                            <Switch
                              checked={draft === "true"}
                              onCheckedChange={(checked) =>
                                setSettingDrafts((prev) => ({
                                  ...prev,
                                  [s.key]: String(checked),
                                }))
                              }
                            />
                          ) : (
                            <Input
                              value={draft}
                              onChange={(e) =>
                                setSettingDrafts((prev) => ({
                                  ...prev,
                                  [s.key]: e.target.value,
                                }))
                              }
                              className="h-9 w-48"
                            />
                          )}
                          <Button
                            size="sm"
                            disabled={!isDirty || saveSettingMutation.isPending}
                            onClick={() =>
                              saveSettingMutation.mutate({
                                key: s.key,
                                value: inputStringToValue(draft, s.value),
                              })
                            }
                          >
                            {t("admin.settings.save")}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------------------------------------ */}
        {/* Audit-Log                                                     */}
        {/* ------------------------------------------------------------ */}
        <TabsContent value="audit" className="mt-6">
          <Card className="border-glass-border bg-glass backdrop-blur">
            <CardHeader>
              <CardTitle className="font-brand text-lg">{t("admin.audit.title")}</CardTitle>
              <p className="text-sm text-muted-foreground">{t("admin.audit.sub")}</p>
            </CardHeader>
            <CardContent>
              {auditQ.isError ? (
                <Alert variant="destructive">
                  <AlertTitle>{t("admin.error.title")}</AlertTitle>
                  <AlertDescription>{t("admin.error.generic")}</AlertDescription>
                </Alert>
              ) : auditQ.isLoading || !auditQ.data ? (
                <p className="text-muted-foreground">{t("common.loading")}</p>
              ) : auditQ.data.entries.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("admin.audit.empty")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("admin.audit.col.time")}</TableHead>
                        <TableHead>{t("admin.audit.col.admin")}</TableHead>
                        <TableHead>{t("admin.audit.col.action")}</TableHead>
                        <TableHead className="hidden sm:table-cell">
                          {t("admin.audit.col.target")}
                        </TableHead>
                        <TableHead className="hidden md:table-cell">
                          {t("admin.audit.col.metadata")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditQ.data.entries.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {formatDateTime(e.createdAt, intlLocale)}
                          </TableCell>
                          <TableCell className="font-medium">{e.adminName}</TableCell>
                          <TableCell>
                            <code className="text-xs">{e.action}</code>
                          </TableCell>
                          <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
                            {e.targetType}
                            {e.targetId ? ` · ${e.targetId.slice(0, 8)}…` : ""}
                          </TableCell>
                          <TableCell className="hidden max-w-xs truncate text-xs text-muted-foreground md:table-cell">
                            {e.metadata ? JSON.stringify(e.metadata) : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardShell>
  );
}

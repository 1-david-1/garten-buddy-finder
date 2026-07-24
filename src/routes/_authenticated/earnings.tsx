import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, ClipboardList, Mail, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardShell, type DashboardNavItem } from "@/components/dashboard/dashboard-shell";
import { getHelperDashboard } from "@/lib/helper-dashboard.functions";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/earnings")({
  component: EarningsPage,
});

function formatEuros(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { style: "currency", currency: "EUR" });
}

function EarningsPage() {
  const { t, locale } = useI18n();
  const getFn = useServerFn(getHelperDashboard);
  const q = useQuery({ queryKey: ["helper-dashboard"], queryFn: () => getFn() });

  const navItems: DashboardNavItem[] = [
    { key: "dashboard", label: t("dashboard.nav.dashboard"), href: "/dashboard", icon: <BarChart3 className="size-4" /> },
    { key: "inbox", label: "Postfach", href: "/inbox", icon: <Mail className="size-4" /> },
    { key: "orders", label: t("dashboard.nav.orders"), href: "/gigs", icon: <ClipboardList className="size-4" /> },
    { key: "earnings", label: t("dashboard.nav.earnings"), href: "/earnings", icon: <Wallet className="size-4" /> },
  ];

  const intlLocale = locale === "de" ? "de-DE" : "en-US";
  const hasAnyEarnings = q.data ? q.data.chart.some((d) => d.euros > 0) || q.data.stats.completedCount > 0 : false;

  return (
    <DashboardShell title={t("dashboard.nav.earnings")} navItems={navItems} activeKey="earnings">
      <h1 className="font-brand text-2xl">{t("dashboard.nav.earnings")}</h1>

      {q.isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : q.isError ? (
        <p className="mt-6 text-sm text-destructive">
          {(q.error as Error)?.message ?? t("dashboard.helper.error.body")}
        </p>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <Card className="border-glass-border bg-glass backdrop-blur">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-normal text-muted-foreground">
                {t("dashboard.helper.stat.last7")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">
                {formatEuros(q.data!.stats.earningsLast7Cents, intlLocale)}
              </div>
            </CardContent>
          </Card>
          <Card className="border-glass-border bg-glass backdrop-blur">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-normal text-muted-foreground">
                {t("dashboard.helper.stat.completedTotal")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{q.data!.stats.completedCount}</div>
            </CardContent>
          </Card>
          <Card className="border-glass-border bg-glass backdrop-blur">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-normal text-muted-foreground">
                {t("dashboard.helper.stat.completionSub")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">
                {q.data!.stats.completionRate !== null
                  ? `${Math.round(q.data!.stats.completionRate * 100)}%`
                  : "—"}
              </div>
            </CardContent>
          </Card>

          <Card className="border-glass-border bg-glass backdrop-blur lg:col-span-3">
            <CardHeader>
              <CardTitle className="font-brand text-lg">{t("dashboard.helper.chart.title")}</CardTitle>
              <p className="text-sm text-muted-foreground">{t("dashboard.helper.chart.sub")}</p>
            </CardHeader>
            <CardContent className="h-64">
              {!hasAnyEarnings ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                  <Wallet className="size-8 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">{t("dashboard.helper.orders.empty")}</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={q.data!.chart}>
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis tickLine={false} axisLine={false} fontSize={12} width={40} />
                    <Tooltip formatter={(v: number) => [`${v} €`, ""]} />
                    <Bar dataKey="euros" radius={[6, 6, 0, 0]} fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </DashboardShell>
  );
}

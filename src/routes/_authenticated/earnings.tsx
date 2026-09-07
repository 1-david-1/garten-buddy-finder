import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { useAppNavItems } from "@/lib/use-app-nav";
import { getHelperDashboard } from "@/lib/helper-dashboard.functions";
import { useI18n } from "@/lib/i18n";
import { StatsCard } from "@/components/dashboard/stats-card";

export const Route = createFileRoute("/_authenticated/earnings")({
  component: EarningsPage,
});

function formatEuros(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, {
    style: "currency",
    currency: "EUR",
  });
}

function EarningsPage() {
  const { t, locale } = useI18n();
  const getFn = useServerFn(getHelperDashboard);
  const q = useQuery({
    queryKey: ["helper-dashboard"],
    queryFn: () => getFn(),
  });

  const { navItems } = useAppNavItems();

  const intlLocale = locale === "de" ? "de-DE" : "en-US";
  const hasAnyEarnings = q.data
    ? q.data.chart.some((d) => d.euros > 0) || q.data.stats.completedCount > 0
    : false;

  return (
    <DashboardShell
      title={t("dashboard.nav.earnings")}
      navItems={navItems}
      activeKey="earnings"
    >
      <h1 className="font-brand text-2xl">{t("dashboard.nav.earnings")}</h1>

      {q.isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">
          {t("common.loading")}
        </p>
      ) : q.isError ? (
        <p className="mt-6 text-sm text-destructive">
          {(q.error as Error)?.message ?? t("dashboard.helper.error.body")}
        </p>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <StatsCard
            title={t("dashboard.helper.stat.last7")}
            currentValue={q.data!.stats.earningsLast7Cents / 100}
            valuePrefix="€"
            description={t("dashboard.helper.stat.vsLastWeek")}
            chartData={q.data!.chart.map((d) => ({
              name: d.label,
              value: (d.euros / (Math.max(...q.data!.chart.map((v) => v.euros), 1))) * 100,
            }))}
            className="border-glass-border bg-glass backdrop-blur"
          />
          <Card className="border-glass-border bg-glass backdrop-blur">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-normal text-muted-foreground">
                {t("dashboard.helper.stat.completedTotal")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">
                {q.data!.stats.completedCount}
              </div>
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
              <CardTitle className="font-brand text-lg">
                {t("dashboard.helper.chart.title")}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {t("dashboard.helper.chart.sub")}
              </p>
            </CardHeader>
            <CardContent className="h-64">
              {!hasAnyEarnings ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                  <Wallet className="size-8 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    {t("dashboard.helper.orders.empty")}
                  </p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={q.data!.chart}>
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
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </DashboardShell>
  );
}

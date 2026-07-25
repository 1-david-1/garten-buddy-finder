import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DashboardShell, type DashboardNavItem } from "@/components/dashboard/dashboard-shell";
import { getHelperDashboard } from "@/lib/helper-dashboard.functions";
import { useI18n } from "@/lib/i18n";
import { BarChart3, Mail, Wallet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/gigs")({
  component: GigsPage,
});

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  completed: "default",
  in_progress: "secondary",
  assigned: "secondary",
  negotiating: "outline",
  open: "outline",
  cancelled: "destructive",
  draft: "outline",
};

function formatEuros(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { style: "currency", currency: "EUR" });
}

function GigsPage() {
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

  return (
    <DashboardShell title={t("dashboard.nav.orders")} navItems={navItems} activeKey="orders">
      <h1 className="font-brand text-2xl">{t("dashboard.helper.orders.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("dashboard.helper.orders.sub")}</p>

      <Card className="mt-6 border-glass-border bg-glass backdrop-blur">
        <CardHeader>
          <CardTitle className="font-brand text-lg">{t("dashboard.helper.orders.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {q.isLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : q.isError ? (
            <p className="text-sm text-destructive">
              {(q.error as Error)?.message ?? t("dashboard.helper.error.body")}
            </p>
          ) : !q.data?.recentGigs?.length ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <ClipboardList className="size-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">{t("dashboard.helper.orders.empty")}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("dashboard.helper.orders.col.title")}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t("dashboard.helper.orders.col.customer")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("dashboard.helper.orders.col.date")}</TableHead>
                  <TableHead>{t("dashboard.helper.orders.col.amount")}</TableHead>
                  <TableHead>{t("dashboard.helper.orders.col.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.data.recentGigs.map((gig) => (
                  <TableRow key={gig.id}>
                    <TableCell className="font-medium">{gig.title}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{gig.customerName}</TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {gig.scheduledAt ? new Date(gig.scheduledAt).toLocaleDateString(intlLocale) : "—"}
                    </TableCell>
                    <TableCell>{formatEuros(gig.budgetCents, intlLocale)}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[gig.status] ?? "outline"}>{t(`status.${gig.status}`)}</Badge>
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

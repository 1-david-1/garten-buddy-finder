import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ClipboardList, MessageSquare } from "lucide-react";
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
  negotiating: "outline",
  open: "outline",
  cancelled: "destructive",
  draft: "outline",
};

function formatEuros(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, {
    style: "currency",
    currency: "EUR",
  });
}

function GigsPage() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const getFn = useServerFn(getHelperDashboard);
  const q = useQuery({
    queryKey: ["helper-dashboard"],
    queryFn: () => getFn(),
  });

  const { navItems } = useAppNavItems();

  const startConversationFn = useServerFn(startConversation);
  const messageMutation = useMutation({
    mutationFn: (input: { customerId: string; gigId: string }) =>
      startConversationFn({
        data: { otherUserId: input.customerId, gigId: input.gigId },
      }),
    onSuccess: (result) => {
      navigate({
        to: "/messages/$conversationId",
        params: { conversationId: result.conversationId },
      });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const intlLocale = locale === "de" ? "de-DE" : "en-US";

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
          ) : !q.data?.recentGigs?.length ? (
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
                {q.data.recentGigs.map((gig) => (
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
                        {t(`status.${gig.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          messageMutation.mutate({
                            customerId: gig.customerId,
                            gigId: gig.id,
                          })
                        }
                        disabled={messageMutation.isPending}
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

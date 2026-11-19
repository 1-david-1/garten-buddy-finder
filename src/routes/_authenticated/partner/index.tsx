import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, CalendarClock, ChevronRight, Users, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { useAppNavItems } from "@/lib/use-app-nav";
import { getMyPartners } from "@/lib/partners.functions";
import { formatBerlinDateTime } from "@/lib/berlin-time";
import { formatEuros } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/partner/")({
  component: PartnersPage,
});

function PartnersPage() {
  const { navItems } = useAppNavItems();
  const getFn = useServerFn(getMyPartners);
  const query = useQuery({ queryKey: ["my-partners"], queryFn: () => getFn(), staleTime: 30_000 });

  const relation = query.data?.relation;
  const isHelperView = relation === "customers";
  const title = isHelperView ? "Kunden" : "Meine Helfer";
  const partners = query.data?.partners ?? [];

  return (
    <DashboardShell title={title} navItems={navItems} activeKey="partners">
      <div className="mx-auto max-w-3xl space-y-4">
        <div>
          <h1 className="font-brand text-2xl">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isHelperView
              ? "Alle Auftraggeber, für die du Aufträge hast – mit Terminen, Zahlungen und Verlauf an einem Ort."
              : "Alle Helfer, die für dich arbeiten oder gearbeitet haben – mit Terminen, Zahlungen und Verlauf an einem Ort."}
          </p>
        </div>

        {query.isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {query.isError && (
          <p className="text-sm text-destructive">
            {(query.error as Error)?.message ?? "Die Übersicht konnte nicht geladen werden."}
          </p>
        )}

        {query.isSuccess && partners.length === 0 && (
          <Card className="border-glass-border bg-glass backdrop-blur">
            <CardContent className="space-y-3 py-8 text-center">
              <Users className="mx-auto size-8 text-muted-foreground" />
              <p className="font-medium">
                {isHelperView ? "Noch keine Kunden" : "Noch keine Helfer"}
              </p>
              <p className="text-sm text-muted-foreground">
                {isHelperView
                  ? "Sobald du einen Auftrag angenommen hast, erscheint der Auftraggeber hier."
                  : "Sobald du einen Helfer für einen Auftrag gewählt oder gebucht hast, erscheint er hier."}
              </p>
              <Button asChild size="sm">
                <Link to={isHelperView ? "/marketplace" : "/create-gig"}>
                  {isHelperView ? "Aufträge finden" : "Auftrag erstellen"}
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          {partners.map((p) => (
            <Link key={p.id} to="/partner/$partnerId" params={{ partnerId: p.id }} className="block">
              <Card className="border-glass-border bg-glass backdrop-blur transition hover:border-primary/40">
                <CardContent className="flex items-center gap-3 py-4">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold">{p.name}</span>
                      {p.verified && <BadgeCheck className="size-4 text-primary" aria-label="Verifiziert" />}
                      {p.city && <span className="text-xs text-muted-foreground">{p.city}</span>}
                      {p.needsActionCount > 0 && (
                        <Badge variant="outline" className="border-amber-400/40 bg-amber-400/10 text-amber-400">
                          {isHelperView
                            ? `${p.needsActionCount} Anfrage${p.needsActionCount > 1 ? "n" : ""} wartet auf dich`
                            : `${p.needsActionCount} Zahlung${p.needsActionCount > 1 ? "en" : ""} freizugeben`}
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>{p.activeCount} aktiv</span>
                      <span>{p.completedCount} abgeschlossen</span>
                      {p.nextAppointment && (
                        <span className="flex items-center gap-1">
                          <CalendarClock className="size-3" />
                          Nächster Termin: {formatBerlinDateTime(p.nextAppointment)}
                        </span>
                      )}
                      {p.awaitingPaymentCents > 0 && (
                        <span className="flex items-center gap-1">
                          <Wallet className="size-3" />
                          Zahlung offen: {formatEuros(p.awaitingPaymentCents)}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}

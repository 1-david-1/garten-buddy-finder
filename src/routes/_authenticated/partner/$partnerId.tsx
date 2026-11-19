import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  Clock,
  Euro,
  Loader2,
  MapPin,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { useAppNavItems } from "@/lib/use-app-nav";
import { getPartnerDetail, type PartnerGig } from "@/lib/partners.functions";
import { completeGig } from "@/lib/gigs.functions";
import { toastForPayout } from "@/lib/payout-toast";
import { startConversation } from "@/lib/messaging.functions";
import { formatBerlinDateTime } from "@/lib/berlin-time";
import { ADDRESS_AFTER_ACCEPTANCE_NOTE, publicLocationLabel } from "@/lib/gig-location";
import { describeGigStatus, describePayment, isActiveStatus, TONE_CLASSES, type PaymentState } from "@/lib/gig-status";
import { isPaymentReleasable } from "@/lib/partners";
import { cn, formatEuros } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/partner/$partnerId")({
  component: PartnerDetailPage,
});

function PartnerDetailPage() {
  const { partnerId } = Route.useParams();
  const { navItems } = useAppNavItems();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const getFn = useServerFn(getPartnerDetail);
  const completeFn = useServerFn(completeGig);
  const startConversationFn = useServerFn(startConversation);
  const [confirmGig, setConfirmGig] = useState<PartnerGig | null>(null);

  const query = useQuery({
    queryKey: ["partner", partnerId],
    queryFn: () => getFn({ data: { partnerId } }),
  });

  const completeMutation = useMutation({
    mutationFn: (gigId: string) => completeFn({ data: { gigId } }),
    onSuccess: (res) => {
      toastForPayout(res.payout, res.newlyCompleted);
      setConfirmGig(null);
      queryClient.invalidateQueries({ queryKey: ["partner", partnerId] });
      queryClient.invalidateQueries({ queryKey: ["my-partners"] });
      queryClient.invalidateQueries({ queryKey: ["my-gigs"] });
    },
    onError: (err) => {
      toast.error((err as Error).message);
      // Nach einem Fehler den tatsächlichen Stand neu laden, damit nichts veraltet angezeigt wird
      queryClient.invalidateQueries({ queryKey: ["partner", partnerId] });
    },
  });

  const chatMutation = useMutation({
    mutationFn: async () => {
      const existing = query.data?.conversationId;
      if (existing) return existing;
      const res = await startConversationFn({ data: { otherUserId: partnerId } });
      return res.conversationId;
    },
    onSuccess: (conversationId) => {
      navigate({ to: "/messages/$conversationId", params: { conversationId } });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const data = query.data;
  const isHelperView = data?.relation === "customers";
  const title = data?.partner.name ?? (isHelperView ? "Kunde" : "Helfer");
  const active = (data?.gigs ?? []).filter((g) => isActiveStatus(g.status));
  const history = (data?.gigs ?? []).filter((g) => !isActiveStatus(g.status));

  return (
    <DashboardShell title={title} navItems={navItems} activeKey="partners">
      <div className="mx-auto max-w-3xl space-y-5">
        <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5 text-muted-foreground">
          <Link to="/partner">
            <ArrowLeft className="size-4" />
            {isHelperView ? "Alle Kunden" : "Alle Helfer"}
          </Link>
        </Button>

        {query.isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        )}

        {query.isError && (
          <Card className="border-glass-border bg-glass">
            <CardContent className="py-6 text-sm text-destructive">
              {(query.error as Error)?.message ?? "Die Ansicht konnte nicht geladen werden."}
            </CardContent>
          </Card>
        )}

        {data && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h1 className="truncate font-brand text-2xl">{data.partner.name}</h1>
                  {data.partner.verified && <BadgeCheck className="size-5 text-primary" aria-label="Verifiziert" />}
                </div>
                <p className="text-sm text-muted-foreground">
                  {isHelperView ? "Kunde" : "Helfer"}
                  {data.partner.city ? ` · ${data.partner.city}` : ""}
                </p>
              </div>
              <Button onClick={() => chatMutation.mutate()} disabled={chatMutation.isPending} className="gap-2">
                {chatMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <MessageSquare className="size-4" />}
                Nachricht schreiben
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Aktiv" value={String(data.totals.activeCount)} />
              <Stat label="Abgeschlossen" value={String(data.totals.completedCount)} />
              <Stat label={isHelperView ? "Bezahlt" : "Bezahlt (von dir)"} value={formatEuros(data.totals.paidCents)} />
              <Stat
                label="Zahlung offen"
                value={formatEuros(data.totals.awaitingPaymentCents)}
                highlight={data.totals.awaitingPaymentCents > 0}
              />
            </div>

            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Aktuell</h2>
              {active.length === 0 && (
                <p className="text-sm text-muted-foreground">Gerade ist nichts offen oder geplant.</p>
              )}
              {active.map((g) => (
                <GigRow key={g.id} gig={g} onRelease={() => setConfirmGig(g)} releasing={completeMutation.isPending} />
              ))}
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Verlauf</h2>
              {history.length === 0 && <p className="text-sm text-muted-foreground">Noch keine abgeschlossenen Aufträge.</p>}
              {history.map((g) => (
                <GigRow key={g.id} gig={g} onRelease={() => setConfirmGig(g)} releasing={completeMutation.isPending} />
              ))}
            </section>
          </>
        )}
      </div>

      <AlertDialog open={!!confirmGig} onOpenChange={(open) => !open && !completeMutation.isPending && setConfirmGig(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmGig?.status === "completed" ? "Zahlung freigeben?" : "Auftrag abschließen und Zahlung freigeben?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmGig?.status === "completed"
                ? `Die Zahlung für „${confirmGig?.title}“ geht an den Helfer.`
                : `Bestätige nur, wenn die Arbeit „${confirmGig?.title}“ erledigt ist. Die Zahlung (${formatEuros(confirmGig?.budgetCents ?? 0)}) wird danach an den Helfer freigegeben.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={completeMutation.isPending}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              disabled={completeMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (confirmGig) completeMutation.mutate(confirmGig.id);
              }}
            >
              {completeMutation.isPending ? "Wird freigegeben …" : "Ja, freigeben"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardShell>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={cn("border-glass-border bg-glass backdrop-blur", highlight && "border-amber-400/40")}>
      <CardContent className="py-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-lg font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function GigRow({ gig, onRelease, releasing }: { gig: PartnerGig; onRelease: () => void; releasing: boolean }) {
  const paymentState = gig.paymentState as PaymentState;
  const info = describeGigStatus(gig.status, gig.myRole, { paymentState, hasScheduledDate: !!gig.scheduledAt });
  const payment = describePayment(paymentState, gig.myRole);
  const canRelease =
    gig.myRole === "customer" &&
    ((["assigned", "in_progress"].includes(gig.status)) || (gig.status === "completed" && isPaymentReleasable(paymentState)));

  return (
    <Card className={cn("border-glass-border bg-glass backdrop-blur", info.needsAction && "border-amber-400/40")}>
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="min-w-0 flex-1 truncate font-semibold">{gig.title}</h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className={cn("text-[11px]", TONE_CLASSES[info.tone])}>
              {info.label}
            </Badge>
            {payment && gig.status !== "cancelled" && (
              <Badge variant="outline" className={cn("text-[11px]", TONE_CLASSES[payment.tone])}>
                {payment.label}
              </Badge>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <CalendarClock className="size-3" />
            {gig.scheduledAt ? formatBerlinDateTime(gig.scheduledAt) : "Termin wird noch abgestimmt"}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {gig.durationMinutes / 60} Std.
          </span>
          <span className="flex items-center gap-1">
            <Euro className="size-3" />
            {formatEuros(gig.budgetCents)}
          </span>
          <span className="flex items-center gap-1">
            <MapPin className="size-3" />
            {gig.address ?? publicLocationLabel(gig.district)}
          </span>
        </div>

        {!gig.address && isActiveStatus(gig.status) && gig.myRole === "helper" && (
          <p className="text-xs text-muted-foreground">{ADDRESS_AFTER_ACCEPTANCE_NOTE}</p>
        )}

        {info.next && (
          <p className={cn("rounded-md px-3 py-2 text-sm", info.needsAction ? "bg-amber-400/10 text-amber-300" : "bg-muted/40 text-muted-foreground")}>
            {info.next}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {canRelease && (
            <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={onRelease} disabled={releasing}>
              <CheckCircle2 className="size-4" />
              {gig.status === "completed" ? "Zahlung freigeben" : "Auftrag abschließen & Zahlung freigeben"}
            </Button>
          )}
          {gig.myRole === "helper" && gig.status === "pending_helper" && (
            <Button asChild size="sm" variant="outline">
              <Link to="/gigs">Anfrage beantworten</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

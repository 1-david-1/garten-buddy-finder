import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Hourglass, Inbox } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  acceptCounter,
  declineBid,
  getMyRequests,
  rebid,
  type HelperRequestItem,
  type RequestState,
} from "@/lib/negotiations.functions";
import { SERVICE_TYPES } from "@/lib/service-types";

const STATE: Record<RequestState, { label: string; hint: string; className: string }> = {
  awaiting_guardian: {
    label: "Wartet auf deine Eltern",
    hint: "Deine Eltern müssen das Gebot im Eltern-Konto freigeben, erst dann geht es an den Kunden.",
    className: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  },
  pending: {
    label: "Offen",
    hint: "Der Kunde hat noch nicht geantwortet.",
    className: "text-sky-400 border-sky-400/30 bg-sky-400/10",
  },
  countered: {
    label: "Gegenangebot – du bist dran",
    hint: "Der Kunde hat einen anderen Preis vorgeschlagen.",
    className: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  },
  accepted: {
    label: "Angenommen",
    hint: "Der Preis ist vereinbart. Bitte bestätige den Auftrag weiter unten.",
    className: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
  },
  declined: {
    label: "Abgelehnt",
    hint: "Der Kunde hat das Gebot abgelehnt oder den Auftrag anderweitig vergeben.",
    className: "text-destructive border-destructive/30 bg-destructive/10",
  },
  withdrawn: {
    label: "Zurückgezogen",
    hint: "Du hast das Gebot zurückgezogen.",
    className: "text-muted-foreground border-border bg-muted/30",
  },
  guardian_declined: {
    label: "Eltern haben abgelehnt",
    hint: "Deine Eltern haben das Gebot nicht freigegeben.",
    className: "text-destructive border-destructive/30 bg-destructive/10",
  },
  expired: {
    label: "Abgelaufen",
    hint: "Die Eltern-Freigabe ist abgelaufen. Du kannst ein neues Gebot abgeben.",
    className: "text-muted-foreground border-border bg-muted/30",
  },
};

const euro = (cents: number, locale: string) =>
  (cents / 100).toLocaleString(locale, { style: "currency", currency: "EUR" });

/** Anfragen (Gebote) des Helfers an Kundenaufträge mit Status - im Aufträge-Fenster. */
export function HelperRequests({ intlLocale }: { intlLocale: string }) {
  const queryClient = useQueryClient();
  const getFn = useServerFn(getMyRequests);
  const acceptCounterFn = useServerFn(acceptCounter);
  const rebidFn = useServerFn(rebid);
  const withdrawFn = useServerFn(declineBid);
  const [rebidId, setRebidId] = useState<string | null>(null);
  const [rebidAmount, setRebidAmount] = useState("");

  const q = useQuery({ queryKey: ["helper-requests"], queryFn: () => getFn() });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["helper-requests"] });
    void queryClient.invalidateQueries({ queryKey: ["helper-gigs"] });
    void queryClient.invalidateQueries({ queryKey: ["helper-dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["my-bids"] });
  };
  const onError = (err: unknown) => {
    toast.error((err as Error).message);
    refresh();
  };

  const accept = useMutation({
    mutationFn: (negotiationId: string) => acceptCounterFn({ data: { negotiationId } }),
    onSuccess: () => {
      toast.success("Gegenangebot angenommen! Bitte bestätige den Auftrag unten.");
      refresh();
    },
    onError,
  });
  const newBid = useMutation({
    mutationFn: (v: { negotiationId: string; bidCents: number }) => rebidFn({ data: v }),
    onSuccess: (res) => {
      if (res.awaitingGuardian) {
        toast.info("Deine Eltern müssen zustimmen", { description: res.awaitingGuardian, duration: 10000 });
      } else {
        toast.success("Neues Gebot gesendet.");
      }
      setRebidId(null);
      setRebidAmount("");
      refresh();
    },
    onError,
  });
  const withdraw = useMutation({
    mutationFn: (negotiationId: string) => withdrawFn({ data: { negotiationId } }),
    onSuccess: () => {
      toast.success("Gebot zurückgezogen.");
      refresh();
    },
    onError,
  });

  const items = q.data ?? [];
  const open = items.filter((i) => ["awaiting_guardian", "pending", "countered"].includes(i.state));
  const done = items.filter((i) => !["awaiting_guardian", "pending", "countered"].includes(i.state));

  if (q.isLoading || (!q.isError && items.length === 0)) return null;

  const serviceLabel = (v: string) => SERVICE_TYPES.find((s) => s.value === v)?.label ?? v;

  const renderItem = (r: HelperRequestItem) => {
    const st = STATE[r.state];
    return (
      <Card key={`${r.source}-${r.id}`} className="border-glass-border bg-glass backdrop-blur">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight">{r.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {serviceLabel(r.serviceType)} · {r.customerName}
              </p>
            </div>
            <Badge variant="outline" className={`shrink-0 text-[10px] ${st.className}`}>
              {st.label}
            </Badge>
          </div>

          <div className="space-y-1 text-xs text-muted-foreground">
            {r.scheduledAt && (
              <p className="flex items-center gap-1">
                <CalendarClock className="size-3 shrink-0" />
                {new Date(r.scheduledAt).toLocaleString(intlLocale, {
                  weekday: "short",
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}
            <p>
              Dein Gebot: <span className="font-medium text-foreground">{euro(r.bidCents, intlLocale)}</span>
              {r.gigBudgetCents > 0 && <> · Wunschpreis des Kunden: {euro(r.gigBudgetCents, intlLocale)}</>}
            </p>
            {r.counterBidCents != null && r.state === "countered" && (
              <p>
                Gegenangebot:{" "}
                <span className="font-semibold text-amber-400">{euro(r.counterBidCents, intlLocale)}</span>
              </p>
            )}
            <p className="flex items-start gap-1">
              <Hourglass className="mt-0.5 size-3 shrink-0" />
              {st.hint}
            </p>
          </div>

          {r.state === "countered" && r.counterBidCents != null && (
            <>
              {rebidId === r.id ? (
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min="1"
                    step="0.5"
                    placeholder="Neues Gebot (€)"
                    value={rebidAmount}
                    onChange={(e) => setRebidAmount(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <Button size="sm" variant="outline" onClick={() => setRebidId(null)}>
                    Abbrechen
                  </Button>
                  <Button
                    size="sm"
                    disabled={!(parseFloat(rebidAmount) > 0) || newBid.isPending}
                    onClick={() =>
                      newBid.mutate({ negotiationId: r.id, bidCents: Math.round(parseFloat(rebidAmount) * 100) })
                    }
                  >
                    Senden
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={accept.isPending} onClick={() => accept.mutate(r.id)}>
                    Annehmen ({euro(r.counterBidCents, intlLocale)})
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setRebidId(r.id)}>
                    Neues Gebot
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    disabled={withdraw.isPending}
                    onClick={() => withdraw.mutate(r.id)}
                  >
                    Ablehnen
                  </Button>
                </div>
              )}
            </>
          )}
          {r.state === "pending" && r.source === "negotiation" && (
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              disabled={withdraw.isPending}
              onClick={() => withdraw.mutate(r.id)}
            >
              Gebot zurückziehen
            </Button>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <Card className="mt-6 border-glass-border bg-glass backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-brand text-lg">
          <Inbox className="size-5 text-primary" />
          Meine Anfragen
          {open.length > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">
              {open.length}
            </span>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Aufträge von Kunden, auf die du geboten hast, mit dem aktuellen Stand deiner Anfrage.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {q.isError && (
          <p className="text-sm text-destructive">{(q.error as Error)?.message ?? "Anfragen konnten nicht geladen werden."}</p>
        )}
        {open.length > 0 && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{open.map(renderItem)}</div>}
        {done.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bisherige Anfragen</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{done.map(renderItem)}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

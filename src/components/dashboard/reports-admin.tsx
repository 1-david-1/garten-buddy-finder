import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  LEGACY_REPORT_REASON_LABELS,
  liftRestriction,
  listReports,
  REPORT_REASONS,
  resolveReport,
  RESTRICTION_KINDS,
  setRestriction,
  setReverificationRequired,
  type AdminReportItem,
} from "@/lib/safety.functions";

const REASON_LABEL: Record<string, string> = {
  ...LEGACY_REPORT_REASON_LABELS,
  ...Object.fromEntries(REPORT_REASONS.map((r) => [r.value, r.label])),
};
const RESTRICTION_LABEL = Object.fromEntries(RESTRICTION_KINDS.map((r) => [r.value, r.label])) as Record<string, string>;
const KEY = ["admin-reports"] as const;

/** Admin-Tab: Meldungen von Nutzern und Eltern bearbeiten, Konten sperren oder entsperren. */
export function ReportsAdmin() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listReports);
  const query = useQuery({ queryKey: KEY, queryFn: () => listFn() });
  const items = query.data?.items ?? [];
  const open = items.filter((i) => i.status === "open" || i.status === "escalated");
  const closed = items.filter((i) => i.status === "resolved" || i.status === "dismissed");
  const refresh = () => queryClient.invalidateQueries({ queryKey: KEY });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Meldungen zu Auftraggebern und Helfern. Meldungen von Eltern sind mit dem Kind markiert und sollten
        zuerst bearbeitet werden. Eine Sperre verhindert Gebote, Zuweisungen und Nachrichten.
      </p>
      {query.isLoading && <p className="text-sm text-muted-foreground">Lädt…</p>}
      {query.isError && <p className="text-sm text-destructive">Konnte nicht geladen werden.</p>}
      {!query.isLoading && open.length === 0 && (
        <Card className="border-glass-border bg-glass backdrop-blur">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">Keine offenen Meldungen.</CardContent>
        </Card>
      )}
      {open.map((r) => (
        <ReportCard key={r.id} item={r} onDone={refresh} />
      ))}
      {closed.length > 0 && (
        <div className="space-y-2 pt-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Bearbeitet</h3>
          {closed.slice(0, 20).map((r) => (
            <ReportCard key={r.id} item={r} onDone={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReportCard({ item, onDone }: { item: AdminReportItem; onDone: () => void }) {
  const resolveFn = useServerFn(resolveReport);
  const restrictFn = useServerFn(setRestriction);
  const liftFn = useServerFn(liftRestriction);
  const reverifyFn = useServerFn(setReverificationRequired);
  const [note, setNote] = useState("");
  const [kind, setKind] = useState<string>(RESTRICTION_KINDS[1].value);

  const onError = () => toast.error("Das hat nicht geklappt.");

  const resolve = useMutation({
    mutationFn: (v: { status: "resolved" | "dismissed" | "escalated"; restriction?: string }) =>
      resolveFn({
        data: { reportId: item.id, status: v.status, note: note.trim() || undefined, restriction: v.restriction },
      }),
    onSuccess: () => {
      toast.success("Meldung bearbeitet und protokolliert.");
      onDone();
    },
    onError,
  });
  const restrict = useMutation({
    mutationFn: () =>
      restrictFn({ data: { userId: item.reportedUserId, kind, reason: note.trim() || undefined } }),
    onSuccess: () => {
      toast.success("Sperre verhängt. Die Person wurde informiert.");
      onDone();
    },
    onError,
  });
  const lift = useMutation({
    mutationFn: (id: string) => liftFn({ data: { restrictionId: id } }),
    onSuccess: () => {
      toast.success("Sperre aufgehoben.");
      onDone();
    },
    onError,
  });
  const reverify = useMutation({
    mutationFn: () => reverifyFn({ data: { userId: item.reportedUserId, required: true } }),
    onSuccess: () => {
      toast.success("Erneute Prüfung verlangt.");
      onDone();
    },
    onError,
  });

  const busy = resolve.isPending || restrict.isPending || lift.isPending || reverify.isPending;
  const isOpen = item.status === "open" || item.status === "escalated";

  return (
    <Card className={`bg-glass backdrop-blur ${item.severity === "severe" ? "border-destructive/60" : "border-glass-border"}`}>
      <CardContent className="space-y-3 pt-5 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <strong>{REASON_LABEL[item.reason] ?? item.reason}</strong>
            {item.severity === "severe" && <Badge variant="destructive">Schwere Meldung</Badge>}
            {item.status === "escalated" && <Badge variant="destructive">Eskaliert</Badge>}
            {item.childName && (
              <Badge variant="outline" className="border-amber-400/40 text-amber-400">
                Eltern-Meldung für {item.childName}
              </Badge>
            )}
            {item.status === "resolved" && <Badge variant="outline">Erledigt</Badge>}
            {item.status === "dismissed" && <Badge variant="outline">Unbegründet</Badge>}
          </div>
          <span className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString("de-DE")}</span>
        </div>

        <p>
          <span className="text-muted-foreground">Gemeldet: </span>
          <strong>{item.reportedName}</strong>
          <span className="text-muted-foreground"> · von </span>
          {item.reporterName}
          {item.gigTitle ? <span className="text-muted-foreground"> · Auftrag: {item.gigTitle}</span> : null}
          {item.hasMessage ? <span className="text-muted-foreground"> · mit Nachricht</span> : null}
        </p>
        {item.details && <p className="whitespace-pre-line rounded-lg bg-muted/30 p-3">{item.details}</p>}
        {item.resolutionNote && <p className="text-xs text-muted-foreground">Notiz des Teams: {item.resolutionNote}</p>}

        {item.activeRestrictions.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Aktive Sperren der gemeldeten Person:</p>
            {item.activeRestrictions.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-destructive/10 px-3 py-1.5">
                <span>
                  {RESTRICTION_LABEL[r.kind] ?? r.kind}
                  {r.source === "auto" ? " (automatisch)" : ""}
                </span>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => lift.mutate(r.id)}>
                  Aufheben
                </Button>
              </div>
            ))}
          </div>
        )}

        {item.events.length > 0 && (
          <ul className="space-y-0.5 border-l border-glass-border pl-3 text-xs text-muted-foreground">
            {item.events.map((e, i) => (
              <li key={i}>
                {new Date(e.at).toLocaleString("de-DE")} · {e.action}
                {e.note ? ` – ${e.note}` : ""}
              </li>
            ))}
          </ul>
        )}

        {isOpen && (
          <div className="space-y-3 border-t border-glass-border pt-3">
            <Textarea
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Interne Notiz (wird protokolliert; bei Sperren nicht an die Person weitergegeben)"
              className="min-h-16 text-sm"
            />
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              >
                {RESTRICTION_KINDS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <Button size="sm" variant="destructive" disabled={busy} onClick={() => restrict.mutate()}>
                {restrict.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Sperre verhängen
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => reverify.mutate()}>
                Erneute Prüfung verlangen
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy} onClick={() => resolve.mutate({ status: "resolved" })}>
                Erledigt
              </Button>
              {item.status === "open" && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => resolve.mutate({ status: "escalated" })}>
                  Eskalieren
                </Button>
              )}
              <Button size="sm" variant="outline" disabled={busy} onClick={() => resolve.mutate({ status: "dismissed" })}>
                Unbegründet
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

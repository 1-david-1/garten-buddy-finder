import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getSystemStatus } from "@/lib/system-status.functions";

/** Admin: Systemstatus - zeigt fehlende Server-Einstellungen und Migrationen. */
export function SystemStatusAdmin() {
  const statusFn = useServerFn(getSystemStatus);
  const query = useQuery({ queryKey: ["system-status"], queryFn: () => statusFn(), staleTime: 0 });
  const checks = query.data?.checks ?? [];
  const failed = checks.filter((c) => !c.ok);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Systemstatus</h3>
          <p className="text-sm text-muted-foreground">
            Prüft Server-Einstellungen und Datenbank. Wenn Funktionen wie Eltern-Einladung, Ausweis-Upload oder
            E-Mails nicht klappen, steht die Ursache hier.
          </p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => query.refetch()} disabled={query.isFetching}>
          <RefreshCw className={`size-3.5 ${query.isFetching ? "animate-spin" : ""}`} />
          Erneut prüfen
        </Button>
      </div>

      {query.isLoading && <p className="text-sm text-muted-foreground">Prüft…</p>}
      {query.isError && <p className="text-sm text-destructive">Der Status konnte nicht geladen werden.</p>}

      {query.data && (
        <p className={`text-sm font-medium ${failed.length === 0 ? "text-primary" : "text-destructive"}`}>
          {failed.length === 0 ? "Alles in Ordnung." : `${failed.length} Problem(e) gefunden.`}
        </p>
      )}

      <div className="space-y-2">
        {[...failed, ...checks.filter((c) => c.ok)].map((c) => (
          <Card key={c.key} className={`bg-glass backdrop-blur ${c.ok ? "border-glass-border" : "border-destructive/50"}`}>
            <CardContent className="flex items-start gap-3 py-3 text-sm">
              {c.ok ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
              ) : (
                <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
              )}
              <div className="min-w-0">
                <p className="font-medium">{c.label}</p>
                <p className="break-words text-xs text-muted-foreground">{c.detail}</p>
                {c.fix && <p className="mt-1 text-xs text-amber-400">Lösung: {c.fix}</p>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

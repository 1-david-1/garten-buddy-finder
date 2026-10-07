import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Clock, Loader2, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { decideJobApprovalFn, getJobApprovalRequest } from "@/lib/verification.functions";

/**
 * Öffentliche Seite (kein Login): Eltern geben einen einzelnen Auftrag ihres Kindes frei.
 * Zugriff nur mit dem geheimen Token aus der E-Mail.
 */
export const Route = createFileRoute("/auftrag-freigabe/$token")({
  head: () => ({
    meta: [
      { title: "Auftrag freigeben · GreenMatch" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: JobApprovalPage,
});

function JobApprovalPage() {
  const { token } = Route.useParams();
  const queryClient = useQueryClient();
  const lookupFn = useServerFn(getJobApprovalRequest);
  const decideFn = useServerFn(decideJobApprovalFn);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["job-approval", token],
    queryFn: () => lookupFn({ data: { token } }),
    retry: false,
  });

  const decide = useMutation({
    mutationFn: (decision: "approve" | "decline" | "revoke") =>
      decideFn({ data: { token, decision } }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["job-approval", token] });
    },
    onError: (e) => {
      const m = (e as Error).message ?? "";
      setError(
        m.includes("job_already_started")
          ? "Der Auftrag läuft bereits und kann nicht mehr zurückgezogen werden."
          : m.includes("expired")
            ? "Der Link ist abgelaufen. Ihr Kind kann den Auftrag in der App erneut anfragen."
            : m.includes("already_decided")
              ? "Über diese Anfrage wurde bereits entschieden."
              : "Das hat nicht geklappt. Bitte versuchen Sie es erneut.",
      );
      queryClient.invalidateQueries({ queryKey: ["job-approval", token] });
    },
  });

  const data = query.data;
  const job = data && data.state !== "invalid" ? data.job : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-glass-border">
        <div className="mx-auto flex h-16 max-w-2xl items-center px-4">
          <Link to="/" className="font-brand text-2xl text-primary">
            GreenMatch<span className="text-foreground">.</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-12">
        {query.isLoading && <p className="text-muted-foreground">Lädt…</p>}

        {(query.isError || data?.state === "invalid") && (
          <Notice
            icon={<XCircle className="size-6 text-destructive" />}
            title="Dieser Link ist nicht (mehr) gültig"
            body="Möglicherweise wurde inzwischen eine neuere E-Mail verschickt. Bitte verwenden Sie den Link aus der neuesten Nachricht."
          />
        )}

        {data && data.state === "expired" && (
          <Notice
            icon={<Clock className="size-6 text-amber-400" />}
            title="Der Link ist abgelaufen"
            body={`${data.childName} kann den Auftrag in der App erneut anfragen. Bis dahin passiert nichts.`}
          />
        )}

        {data && data.state === "declined" && (
          <Notice
            icon={<ShieldAlert className="size-6 text-amber-400" />}
            title="Auftrag nicht freigegeben"
            body={`${data.childName} kann diesen Auftrag nicht annehmen. Vielen Dank für Ihre Rückmeldung.`}
          />
        )}

        {data && data.state === "approved" && (
          <div className="space-y-6">
            <Notice
              icon={<BadgeCheck className="size-6 text-primary" />}
              title="Auftrag freigegeben"
              body={`${data.childName} kann diesen Auftrag jetzt annehmen. Vielen Dank!`}
            />
            <div className="rounded-2xl border border-glass-border bg-glass p-5 backdrop-blur">
              <p className="text-sm text-muted-foreground">
                Sie haben es sich anders überlegt? Solange der Auftrag noch nicht läuft, können Sie
                die Freigabe zurückziehen.
              </p>
              {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
              <Button
                variant="outline"
                className="mt-4"
                disabled={decide.isPending}
                onClick={() => decide.mutate("revoke")}
              >
                {decide.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Freigabe zurückziehen
              </Button>
            </div>
          </div>
        )}

        {data && data.state === "pending" && job && (
          <div className="space-y-6">
            <div>
              <span className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-primary">
                <ShieldCheck className="size-3.5" />
                Freigabe für einen Auftrag
              </span>
              <h1 className="font-brand text-3xl leading-tight">
                {data.childName} möchte diesen Auftrag annehmen
              </h1>
              <p className="mt-3 text-muted-foreground">
                Bei GreenMatch fragen wir Sie für jeden einzelnen Auftrag. Ohne Ihre Freigabe kann{" "}
                {data.childName} ihn nicht annehmen.
              </p>
            </div>

            <dl className="divide-y divide-glass-border rounded-2xl border border-glass-border bg-glass px-6 backdrop-blur">
              <Row label="Auftrag" value={`${job.title} (${job.serviceType})`} />
              <Row label="Wann" value={job.when} />
              <Row label="Wo (PLZ)" value={job.postalCode ?? "wird noch abgestimmt"} />
              <Row
                label="Auftraggeber"
                value={`${job.customerName} · ${job.customerVerified ? "verifiziert" : "noch nicht verifiziert"}`}
              />
              <Row
                label="Vereinbarter Preis"
                value={(job.priceCents / 100).toLocaleString("de-DE", {
                  style: "currency",
                  currency: "EUR",
                })}
              />
            </dl>

            <div className="space-y-4 rounded-2xl border border-glass-border bg-glass p-6 backdrop-blur">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="confirm"
                  checked={confirmed}
                  onCheckedChange={(v) => setConfirmed(v === true)}
                  className="mt-0.5"
                />
                <Label htmlFor="confirm" className="text-sm font-normal leading-relaxed">
                  Ich bin Elternteil bzw. Erziehungsberechtigte(r) von {data.childName} und gebe
                  diesen Auftrag frei.
                </Label>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  size="lg"
                  disabled={!confirmed || decide.isPending}
                  onClick={() => decide.mutate("approve")}
                >
                  {decide.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Auftrag freigeben
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate("decline")}
                >
                  Nicht freigeben
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Für Jugendliche gelten höchstens 2 Stunden pro Tag, nur zwischen 08:00 und 18:00
                Uhr. Das prüft die Plattform automatisch.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:gap-4">
      <dt className="w-40 shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}

function Notice({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-glass-border bg-glass p-6 backdrop-blur">
      <span className="mt-0.5">{icon}</span>
      <div>
        <h1 className="font-brand text-2xl">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Clock, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getJobApprovalRequest } from "@/lib/verification.functions";

/**
 * Öffentliche Seite (kein Login): zeigt die Auftragsdaten aus alten Eltern-Mails.
 * Entschieden wird NICHT mehr über diesen Link, sondern im Eltern-Konto (angemeldet) -
 * sonst könnte ein Kind, das den Link nur "weiterleitet", sich selbst freigeben.
 */
export const Route = createFileRoute("/auftrag-freigabe/$token")({
  head: () => ({
    meta: [
      { title: "Auftrag ansehen · GreenMatch" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: JobApprovalPage,
});

function JobApprovalPage() {
  const { token } = Route.useParams();
  const lookupFn = useServerFn(getJobApprovalRequest);

  const query = useQuery({
    queryKey: ["job-approval", token],
    queryFn: () => lookupFn({ data: { token } }),
    retry: false,
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
            body="Möglicherweise wurde inzwischen eine neuere E-Mail verschickt. Bitte öffnen Sie Ihr Eltern-Konto."
          />
        )}

        {data && data.state === "expired" && (
          <Notice
            icon={<Clock className="size-6 text-amber-400" />}
            title="Die Anfrage ist abgelaufen"
            body={`${data.childName} kann den Auftrag in der App erneut anfragen. Bis dahin passiert nichts.`}
          />
        )}

        {data && data.state === "declined" && (
          <Notice
            icon={<ShieldAlert className="size-6 text-amber-400" />}
            title="Auftrag nicht freigegeben"
            body={`${data.childName} kann diesen Auftrag nicht annehmen.`}
          />
        )}

        {data && data.state === "approved" && (
          <Notice
            icon={<BadgeCheck className="size-6 text-primary" />}
            title="Auftrag freigegeben"
            body={`${data.childName} kann diesen Auftrag annehmen. Zurückziehen können Sie die Freigabe im Eltern-Konto.`}
          />
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
                Die Freigabe erfolgt in Ihrem Eltern-Konto. Dort können Sie den Auftrag freigeben oder
                ablehnen.
              </p>
            </div>
            <JobRows job={job} />
          </div>
        )}

        {data && data.state !== "invalid" && (
          <div className="mt-6">
            <Button asChild size="lg">
              <Link to="/eltern">Zum Eltern-Konto</Link>
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}

function JobRows({
  job,
}: {
  job: { activity: string; title: string; when: string; location: string; customerName: string; customerVerified: boolean; priceCents: number; description: string | null };
}) {
  return (
    <dl className="divide-y divide-glass-border rounded-2xl border border-glass-border bg-glass px-6 backdrop-blur">
      <Row label="Art der Tätigkeit" value={`${job.activity} – ${job.title}`} />
      {job.description && <Row label="Beschreibung" value={job.description} />}
      <Row label="Zeit" value={job.when} />
      <Row label="Ort" value={job.location} />
      <Row
        label="Auftraggeber"
        value={`${job.customerName} · ${job.customerVerified ? "verifiziert" : "noch nicht verifiziert"}`}
      />
      <Row
        label="Vereinbarter Preis"
        value={(job.priceCents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
      />
    </dl>
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

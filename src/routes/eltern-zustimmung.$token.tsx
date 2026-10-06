import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Clock, Loader2, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { decideGuardianConsentFn, getGuardianConsentRequest } from "@/lib/verification.functions";

/**
 * Öffentliche Seite (kein Login): Eltern öffnen den Link aus der E-Mail und sehen,
 * wofür sie zustimmen. Zugriff nur mit dem geheimen Token aus der Mail.
 */
export const Route = createFileRoute("/eltern-zustimmung/$token")({
  head: () => ({
    meta: [
      { title: "Zustimmung der Eltern · GreenMatch" },
      // Token-Seite: nicht indexieren, Link nicht per Referer weitergeben.
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: GuardianConsentPage,
});

const RULES = [
  "Nur leichte Gartenarbeit – keine schweren oder gefährlichen Maschinen.",
  "Höchstens 2 Stunden pro Tag, nur zwischen 08:00 und 18:00 Uhr.",
  "Absprachen laufen über den Chat in der App – keine Telefonnummern oder Adressen vorab.",
  "Aufträge lassen sich jederzeit ablehnen. Sie können Ihre Zustimmung jederzeit widerrufen.",
];

function GuardianConsentPage() {
  const { token } = Route.useParams();
  const queryClient = useQueryClient();
  const lookupFn = useServerFn(getGuardianConsentRequest);
  const decideFn = useServerFn(decideGuardianConsentFn);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["guardian-consent", token],
    queryFn: () => lookupFn({ data: { token } }),
    retry: false,
  });

  const decide = useMutation({
    mutationFn: (decision: "approve" | "decline" | "revoke") =>
      decideFn({ data: { token, decision } }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["guardian-consent", token] });
    },
    onError: (e) => {
      const m = (e as Error).message ?? "";
      setError(
        m.includes("expired")
          ? "Der Link ist abgelaufen. Bitte lassen Sie in der App eine neue Mail anfordern."
          : m.includes("already_decided")
            ? "Über diese Anfrage wurde bereits entschieden."
            : "Das hat nicht geklappt. Bitte versuchen Sie es erneut.",
      );
      queryClient.invalidateQueries({ queryKey: ["guardian-consent", token] });
    },
  });

  const data = query.data;

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
            body="Möglicherweise wurde inzwischen eine neuere E-Mail verschickt. Bitte verwenden Sie den Link aus der neuesten Nachricht oder lassen Sie Ihr Kind in der App eine neue Anfrage senden."
          />
        )}

        {data && data.state === "expired" && (
          <Notice
            icon={<Clock className="size-6 text-amber-400" />}
            title="Der Link ist abgelaufen"
            body={`${data.childName} kann in der App jederzeit eine neue Mail an Sie senden.`}
          />
        )}

        {data && data.state === "approved" && (
          <div className="space-y-6">
            <Notice
              icon={<BadgeCheck className="size-6 text-primary" />}
              title="Zustimmung erteilt"
              body={`${data.childName} ist freigeschaltet und kann Aufträge annehmen. Vielen Dank!`}
            />
            <div className="rounded-2xl border border-glass-border bg-glass p-5 backdrop-blur">
              <p className="text-sm text-muted-foreground">
                Sie möchten die Zustimmung zurückziehen? Dann kann {data.childName} sofort keine
                Gebote mehr abgeben und keine Angebote mehr veröffentlichen.
              </p>
              <Button
                variant="outline"
                className="mt-4"
                disabled={decide.isPending}
                onClick={() => decide.mutate("revoke")}
              >
                {decide.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Zustimmung widerrufen
              </Button>
            </div>
          </div>
        )}

        {data && data.state === "declined" && (
          <Notice
            icon={<ShieldAlert className="size-6 text-amber-400" />}
            title="Keine Zustimmung"
            body={`${data.childName} bleibt gesperrt für Aufträge. Wenn Sie es sich anders überlegen, kann ${data.childName} in der App eine neue Anfrage senden.`}
          />
        )}

        {data && data.state === "pending" && (
          <div className="space-y-6">
            <div>
              <span className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-primary">
                <ShieldCheck className="size-3.5" />
                Zustimmung der Eltern
              </span>
              <h1 className="font-brand text-3xl leading-tight">
                {data.childName} möchte bei GreenMatch Gartenhilfe anbieten
              </h1>
              <p className="mt-3 text-muted-foreground">
                GreenMatch ist eine Nachbarschafts-Plattform: Gartenbesitzer in der Nähe suchen
                Hilfe bei Rasen, Hecke und Beet. Jugendliche zwischen 13 und 17 Jahren können sich
                so Taschengeld verdienen – aber nur mit Ihrer Zustimmung.
              </p>
            </div>

            <div className="rounded-2xl border border-glass-border bg-glass p-6 backdrop-blur">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Das gilt für Jugendliche
              </h2>
              <ul className="space-y-2 text-sm">
                {RULES.map((rule) => (
                  <li key={rule} className="flex gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-muted-foreground">
                Die automatische Prüfung der Zeitfenster im Buchungskalender wird gerade
                ausgebaut. Bis dahin gelten diese Zeiten als verbindliche Plattform-Regel.
              </p>
            </div>

            <div className="space-y-4 rounded-2xl border border-glass-border bg-glass p-6 backdrop-blur">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="confirm"
                  checked={confirmed}
                  onCheckedChange={(v) => setConfirmed(v === true)}
                  className="mt-0.5"
                />
                <Label htmlFor="confirm" className="text-sm font-normal leading-relaxed">
                  Ich bin Elternteil bzw. Erziehungsberechtigte(r) von {data.childName} und
                  stimme zu, dass {data.childName} über GreenMatch Gartenhilfe anbietet.
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
                  Ich stimme zu
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate("decline")}
                >
                  Nicht zustimmen
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Wir speichern Ihre Entscheidung samt Zeitpunkt. Ihre E-Mail-Adresse wird nur für
                diese Anfrage verwendet.
              </p>
            </div>
          </div>
        )}
      </main>
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

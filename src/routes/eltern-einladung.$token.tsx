import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BadgeCheck, Clock, Loader2, Printer, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { YouthProtectionRules } from "@/components/youth-protection-rules";
import { useAuth } from "@/lib/auth";
import { acceptGuardianInviteFn, getGuardianInvite } from "@/lib/guardian.functions";

/**
 * Einladung zum Eltern-Konto (Pflicht für Jugendliche 13-17).
 * Öffentlich lesbar (nur mit geheimem Token), Annehmen nur mit Anmeldung.
 */
export const Route = createFileRoute("/eltern-einladung/$token")({
  head: () => ({
    meta: [
      { title: "Eltern-Konto · GreenMatch" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: GuardianInvitePage,
});

const ACCEPT_ERRORS: Record<string, string> = {
  own_account: "Das ist das Konto des Kindes selbst. Bitte melde dich mit dem Konto eines Elternteils an.",
  guardian_is_youth: "Mit einem Jugendlichen-Konto kann kein Eltern-Konto angelegt werden.",
  email_not_confirmed:
    "Deine E-Mail-Adresse ist noch nicht bestätigt. Bitte klicke zuerst auf den Link in der Bestätigungs-Mail und öffne diese Seite danach erneut.",
  expired: "Die Einladung ist abgelaufen. Dein Kind kann in der App eine neue erstellen.",
  invalid_token: "Diese Einladung ist nicht (mehr) gültig.",
};

function GuardianInvitePage() {
  const { token } = Route.useParams();
  const { user } = useAuth();
  const lookupFn = useServerFn(getGuardianInvite);
  const acceptFn = useServerFn(acceptGuardianInviteFn);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const query = useQuery({
    queryKey: ["guardian-invite", token],
    queryFn: () => lookupFn({ data: { token } }),
    retry: false,
  });

  const accept = useMutation({
    mutationFn: () => acceptFn({ data: { token } }),
    onError: (e) => {
      const m = (e as Error).message ?? "";
      const hit = Object.entries(ACCEPT_ERRORS).find(([code]) => m.includes(code));
      setError(hit ? hit[1] : "Das hat nicht geklappt. Bitte versuche es erneut.");
    },
  });

  const data = query.data;
  const open = data?.state === "open";

  // Bewusst KEINE automatische Verknüpfung: Wer den Link nur öffnet (z. B. über eine Weiterleitung),
  // wird nicht ungewollt als Elternteil verknüpft. Die Verknüpfung passiert erst nach Bestätigung.

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-glass-border">
        <div className="mx-auto flex h-16 max-w-2xl items-center px-4">
          <Link to="/" className="font-brand text-2xl text-primary">
            GreenMatch<span className="text-foreground">.</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-4 py-12">
        {query.isLoading && <p className="text-muted-foreground">Lädt…</p>}

        {(query.isError || data?.state === "invalid") && (
          <Notice
            icon={<XCircle className="size-6 text-destructive" />}
            title="Diese Einladung ist nicht (mehr) gültig"
            body="Vielleicht wurde sie bereits verwendet oder durch eine neuere ersetzt. Dein Kind kann in der App jederzeit eine neue Einladung erstellen."
          />
        )}

        {data?.state === "expired" && (
          <Notice
            icon={<Clock className="size-6 text-amber-400" />}
            title="Die Einladung ist abgelaufen"
            body={`${data.childName} kann in der App eine neue Einladung erstellen.`}
          />
        )}

        {open && data && (
          <>
            <div>
              <span className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-primary">
                <ShieldCheck className="size-3.5" />
                Eltern-Konto
              </span>
              <h1 className="font-brand text-3xl leading-tight">
                {data.childName} möchte bei GreenMatch Gartenhilfe anbieten
              </h1>
              <p className="mt-3 text-muted-foreground">
                Das ist ab 13 Jahren nur mit Ihrer Zustimmung möglich. Dafür ist ein Eltern-Konto
                Pflicht – es dient der Sicherheit Ihres Kindes.
              </p>
            </div>

            <ul className="space-y-2 rounded-2xl border border-glass-border bg-glass p-5 text-sm backdrop-blur">
              <li>
                <strong>Alle Auftragsdaten im Blick:</strong> Ort, Zeit, Auftraggeber und Art der
                Tätigkeit.
              </li>
              <li>
                <strong>Jeden Auftrag einzeln freigeben</strong> – ohne Ihre Freigabe kann Ihr Kind
                keinen Auftrag annehmen.
              </li>
              <li>
                <strong>Sicherheitsfunktionen:</strong> Konto pausieren, Auftraggeber melden und
                blockieren.
              </li>
              <li>
                <strong>Regeln:</strong> höchstens 2 Stunden täglich, nur zwischen 08:00 und 18:00 Uhr,
                nicht während des Schulunterrichts, nur leichte und ungefährliche Tätigkeiten.
              </li>
            </ul>

            <YouthProtectionRules />

            {!user ? (
              <div className="space-y-3 rounded-2xl border border-glass-border bg-glass p-5 backdrop-blur">
                <Button asChild size="lg" className="w-full">
                  <Link to="/auth" search={{ mode: "signup", role: "guardian", invite: token }}>
                    Eltern-Konto anlegen
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="w-full">
                  <Link to="/auth" search={{ invite: token }}>
                    Ich habe schon ein Konto – anmelden
                  </Link>
                </Button>
                <Button asChild variant="ghost" size="sm" className="w-full gap-2">
                  <a href="/einverstaendniserklaerung" target="_blank" rel="noreferrer">
                    <Printer className="size-4" />
                    Einverständniserklärung ansehen und drucken
                  </a>
                </Button>
              </div>
            ) : (
              <div className="space-y-3 rounded-2xl border border-glass-border bg-glass p-5 backdrop-blur">
                {!accept.isSuccess && (
                  <>
                    <label className="flex items-start gap-3 text-sm">
                      <Checkbox
                        checked={confirmed}
                        onCheckedChange={(v) => setConfirmed(v === true)}
                        className="mt-0.5"
                      />
                      <span>
                        Ich bin Elternteil bzw. Erziehungsberechtigte/r von <strong>{data.childName}</strong>{" "}
                        und möchte mein Konto als Eltern-Konto mit diesem Kind verknüpfen.
                      </span>
                    </label>
                    <Button
                      size="lg"
                      className="w-full"
                      onClick={() => {
                        setError(null);
                        accept.mutate();
                      }}
                      disabled={!confirmed || accept.isPending}
                    >
                      {accept.isPending ? (
                        <>
                          <Loader2 className="mr-2 size-4 animate-spin" /> Konto wird verknüpft…
                        </>
                      ) : (
                        "Eltern-Konto verknüpfen"
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Du hast diese Einladung nicht erwartet? Dann schließe diese Seite einfach – es wird nichts
                      verknüpft.
                    </p>
                  </>
                )}
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
            )}
          </>
        )}

        {accept.isSuccess && (
          <div className="space-y-4">
            <Notice
              icon={<BadgeCheck className="size-6 text-primary" />}
              title="Eltern-Konto verknüpft"
              body={`Sie sind jetzt mit ${accept.data.childName} verknüpft. Nächster Schritt: Die unterschriebene Einverständniserklärung und die Ausweise von Ihnen und Ihrem Kind hochladen lassen. Danach prüft unser Team die Unterlagen.`}
            />
            <Button asChild>
              <Link to="/eltern">Zum Eltern-Konto</Link>
            </Button>
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

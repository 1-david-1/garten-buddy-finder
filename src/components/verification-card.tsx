import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, CheckCircle2, Clock, Loader2, MailCheck, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { updateProfile } from "@/lib/profile.functions";
import {
  getMyVerification,
  requestGuardianConsent,
  requestIdentityVerification,
  type MyVerification,
  type RequestState,
} from "@/lib/verification.functions";

const QUERY_KEY = ["my-verification"] as const;

const ERROR_TEXTS: Record<string, string> = {
  recently_sent:
    "Die Mail wurde gerade erst verschickt. Bitte warte ein paar Minuten, bevor du sie erneut sendest.",
  guardian_email_missing:
    "Es ist noch keine E-Mail-Adresse deiner Eltern hinterlegt. Trage sie unten ein.",
  already_consented: "Deine Eltern haben bereits zugestimmt.",
  already_verified: "Dein Profil ist bereits verifiziert.",
  not_youth: "Diese Funktion gilt nur für Jugendliche.",
  not_available_for_youth: "Für Jugendliche läuft die Verifizierung über die Eltern-Zustimmung.",
};

function errorText(e: unknown): string {
  const message = (e as Error)?.message ?? "";
  for (const [code, text] of Object.entries(ERROR_TEXTS)) {
    if (message.includes(code)) return text;
  }
  return "Das hat nicht geklappt. Bitte versuche es später noch einmal.";
}

function useVerification() {
  const fn = useServerFn(getMyVerification);
  return useQuery({ queryKey: QUERY_KEY, queryFn: () => fn() });
}

function formatDate(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleDateString("de-DE") : "";
}

function StatusRow({
  icon,
  title,
  detail,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  detail?: string;
  tone: "ok" | "wait" | "todo";
}) {
  const color =
    tone === "ok" ? "text-primary" : tone === "wait" ? "text-amber-400" : "text-muted-foreground";
  return (
    <div className="flex items-start gap-3 text-sm">
      <span className={`mt-0.5 ${color}`}>{icon}</span>
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      </div>
    </div>
  );
}

function guardianRow(g: NonNullable<MyVerification["guardian"]>) {
  const to = g.emailMasked ? ` an ${g.emailMasked}` : "";
  const map: Record<RequestState, { tone: "ok" | "wait" | "todo"; detail: string }> = {
    none: { tone: "todo", detail: "Noch nicht angefragt." },
    pending: {
      tone: "wait",
      detail: `Mail${to} gesendet${g.expiresAt ? ` – Link gültig bis ${formatDate(g.expiresAt)}` : ""}.`,
    },
    approved: { tone: "ok", detail: "Deine Eltern haben zugestimmt." },
    declined: { tone: "todo", detail: "Die Eltern haben abgelehnt oder die Zustimmung widerrufen." },
    expired: { tone: "todo", detail: "Der Link ist abgelaufen. Du kannst eine neue Mail senden." },
  };
  return map[g.state];
}

function useRequestMutations() {
  const queryClient = useQueryClient();
  const guardianFn = useServerFn(requestGuardianConsent);
  const identityFn = useServerFn(requestIdentityVerification);
  const refresh = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const guardian = useMutation({
    mutationFn: () => guardianFn(),
    onSuccess: (res) => {
      toast.success(`Mail an ${res.emailMasked} gesendet.`);
      refresh();
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const identity = useMutation({
    mutationFn: (note: string) => identityFn({ data: { note: note || undefined } }),
    onSuccess: (res) => {
      toast.success(
        res.alreadyPending
          ? "Deine Anfrage liegt bereits bei uns."
          : "Anfrage gesendet. Wir prüfen dein Profil und melden uns.",
      );
      refresh();
    },
    onError: (e) => toast.error(errorText(e)),
  });

  return { guardian, identity };
}

/** Vollständige Karte für die Profilseite. */
export function VerificationCard() {
  const { data, isLoading, isError } = useVerification();
  const { guardian, identity } = useRequestMutations();
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState("");
  const [editingEmail, setEditingEmail] = useState(false);
  const [guardianEmail, setGuardianEmail] = useState("");
  const updateProfileFn = useServerFn(updateProfile);
  const changeEmail = useMutation({
    mutationFn: (email: string) => updateProfileFn({ data: { guardianEmail: email } }),
    onSuccess: () => {
      setEditingEmail(false);
      guardian.mutate();
    },
    onError: () => toast.error("Die Adresse konnte nicht gespeichert werden."),
  });
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(guardianEmail.trim());

  return (
    <Card className="border-glass-border bg-glass backdrop-blur">
      <CardContent className="space-y-4 pt-5">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <BadgeCheck className="size-3.5" />
          Verifizierung
        </p>

        {isLoading && <p className="text-sm text-muted-foreground">Lädt…</p>}
        {isError && (
          <p className="text-sm text-muted-foreground">Der Status konnte nicht geladen werden.</p>
        )}

        {data && (
          <>
            {data.verifiedAt ? (
              <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/10 p-3">
                <BadgeCheck className="mt-0.5 size-5 text-primary" />
                <div>
                  <p className="text-sm font-semibold text-primary">Verifiziert</p>
                  <p className="text-xs text-muted-foreground">
                    {data.method === "guardian_consent"
                      ? "Deine Eltern haben zugestimmt"
                      : "Von GreenMatch geprüft"}
                    {" · "}
                    {formatDate(data.verifiedAt)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {data.kind === "youth"
                  ? "Du brauchst die Zustimmung deiner Eltern, bevor du bieten kannst. Einen Ausweis brauchst du dafür nicht."
                  : "Verifizierte Profile bekommen das Häkchen „Verifiziert“ bei Angeboten und auf dem Helferprofil."}
              </p>
            )}

            <div className="space-y-3">
              {data.emailConfirmed !== null && (
                <StatusRow
                  icon={<MailCheck className="size-4" />}
                  title="E-Mail-Adresse"
                  detail={data.emailConfirmed ? "Bestätigt." : "Noch nicht bestätigt."}
                  tone={data.emailConfirmed ? "ok" : "todo"}
                />
              )}

              {data.guardian && (
                <StatusRow
                  icon={
                    data.guardian.state === "approved" ? (
                      <CheckCircle2 className="size-4" />
                    ) : data.guardian.state === "pending" ? (
                      <Clock className="size-4" />
                    ) : (
                      <ShieldAlert className="size-4" />
                    )
                  }
                  title="Zustimmung der Eltern"
                  detail={guardianRow(data.guardian).detail}
                  tone={guardianRow(data.guardian).tone}
                />
              )}

              {data.identity && (
                <StatusRow
                  icon={
                    data.verifiedAt ? (
                      <CheckCircle2 className="size-4" />
                    ) : data.identity.state === "pending" ? (
                      <Clock className="size-4" />
                    ) : (
                      <ShieldAlert className="size-4" />
                    )
                  }
                  title={data.kind === "pro" ? "Gewerbe & Profil geprüft" : "Profil geprüft"}
                  detail={
                    data.verifiedAt
                      ? "Geprüft vom GreenMatch-Team."
                      : data.identity.state === "pending"
                        ? `Anfrage vom ${formatDate(data.identity.sentAt)} wird geprüft.`
                        : data.kind === "pro"
                          ? "Halte Gewerbeanmeldung und USt-IdNr. bereit – wir melden uns bei Rückfragen."
                          : "Noch nicht beantragt."
                  }
                  tone={
                    data.verifiedAt ? "ok" : data.identity.state === "pending" ? "wait" : "todo"
                  }
                />
              )}
            </div>

            {/* Der eine Button – je nach Alter ein anderer Weg */}
            {data.guardian && data.guardian.state !== "approved" && (
              <div className="space-y-2">
                <Button
                  className="w-full"
                  disabled={guardian.isPending}
                  onClick={() => guardian.mutate()}
                >
                  {guardian.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                  {data.guardian.state === "none"
                    ? "Eltern-Zustimmung anfordern"
                    : "Mail an Eltern erneut senden"}
                </Button>

                {editingEmail ? (
                  <div className="space-y-2">
                    <Input
                      type="email"
                      value={guardianEmail}
                      onChange={(e) => setGuardianEmail(e.target.value)}
                      placeholder="E-Mail-Adresse deiner Eltern"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        disabled={!emailLooksValid || changeEmail.isPending}
                        onClick={() => changeEmail.mutate(guardianEmail.trim())}
                      >
                        Speichern & Mail senden
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingEmail(false)}>
                        Abbrechen
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingEmail(true)}
                    className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
                  >
                    Falsche Adresse? Eltern-E-Mail ändern
                  </button>
                )}
              </div>
            )}

            {data.identity && !data.verifiedAt && data.identity.state !== "pending" && (
              <>
                {showNote ? (
                  <div className="space-y-2">
                    <Textarea
                      value={note}
                      maxLength={500}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Optional: Hinweis für unser Team (z. B. Link zu deiner Website)"
                      className="min-h-20 text-sm"
                    />
                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        disabled={identity.isPending}
                        onClick={() => identity.mutate(note.trim())}
                      >
                        {identity.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                        Anfrage senden
                      </Button>
                      <Button variant="ghost" onClick={() => setShowNote(false)}>
                        Abbrechen
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button className="w-full" onClick={() => setShowNote(true)}>
                    Verifizierung beantragen
                  </Button>
                )}
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Schmaler Hinweis fürs Dashboard. Erscheint nur für Jugendliche ohne Eltern-Zustimmung,
 * weil sie bis dahin nicht bieten können - alle anderen sollen nicht genervt werden.
 */
export function GuardianConsentBanner() {
  const { data } = useVerification();
  const { guardian } = useRequestMutations();

  if (!data || data.kind !== "youth" || data.verifiedAt || !data.guardian) return null;
  const pending = data.guardian.state === "pending";

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-400" />
        <div>
          <p className="text-sm font-semibold">
            {pending ? "Warten auf deine Eltern" : "Zustimmung deiner Eltern fehlt"}
          </p>
          <p className="text-xs text-muted-foreground">
            {pending
              ? `Wir haben eine Mail${data.guardian.emailMasked ? ` an ${data.guardian.emailMasked}` : ""} geschickt. Sobald sie zustimmen, kannst du bieten.`
              : "Ohne Zustimmung kannst du noch keine Gebote abgeben oder Angebote einstellen."}
          </p>
        </div>
      </div>
      <Button
        size="sm"
        variant={pending ? "outline" : "default"}
        disabled={guardian.isPending}
        onClick={() => guardian.mutate()}
      >
        {guardian.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
        {pending ? "Mail erneut senden" : "Eltern-Zustimmung anfordern"}
      </Button>
    </div>
  );
}

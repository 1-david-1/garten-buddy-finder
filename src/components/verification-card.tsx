import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, CheckCircle2, Clock, Loader2, MailCheck, ShieldAlert, Users } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { YouthDocumentsForm } from "@/components/youth-documents-form";
import { GuardianInviteStep } from "@/components/guardian-invite-step";
import { IdentityDocumentForm } from "@/components/identity-document-form";
import { YouthProtectionRules } from "@/components/youth-protection-rules";
import { ConsentAcknowledgement } from "@/components/consent-acknowledgement";
import { VERIFICATION_STATUS_LABEL } from "@/lib/verification-status";
import { changeGuardianEmailFn } from "@/lib/guardian.functions";
import {
  getMyVerification,
  type MyVerification,
  type RequestState,
} from "@/lib/verification.functions";

const QUERY_KEY = ["my-verification"] as const;

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

function youthRow(g: NonNullable<MyVerification["guardian"]>): {
  tone: "ok" | "wait" | "todo";
  detail: string;
} {
  const map: Record<RequestState, { tone: "ok" | "wait" | "todo"; detail: string }> = {
    none: { tone: "todo", detail: "Noch keine Unterlagen eingereicht." },
    pending: {
      tone: "wait",
      detail: `Eingereicht${g.sentAt ? ` am ${formatDate(g.sentAt)}` : ""} – unser Team prüft die Unterlagen.`,
    },
    approved: { tone: "ok", detail: "Unterlagen geprüft." },
    declined: {
      tone: "todo",
      detail: g.reason ? `Nicht bestätigt: ${g.reason}` : "Nicht bestätigt. Bitte reiche die Unterlagen erneut ein.",
    },
    expired: { tone: "todo", detail: "Bitte reiche die Unterlagen erneut ein." },
  };
  return map[g.state];
}

/** Vollständige Karte für die Profilseite. */
export function VerificationCard() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useVerification();
  const changeEmailFn = useServerFn(changeGuardianEmailFn);
  const refresh = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const [showIdForm, setShowIdForm] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [guardianEmail, setGuardianEmail] = useState("");

  const changeEmail = useMutation({
    mutationFn: (email: string) => changeEmailFn({ data: { email } }),
    onSuccess: () => {
      setEditingEmail(false);
      toast.success("Eltern-E-Mail gespeichert. Offene Freigabe-Anfragen gehen beim nächsten Annehmen an die neue Adresse.");
      refresh();
    },
    onError: () => toast.error("Die Adresse konnte nicht gespeichert werden."),
  });
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(guardianEmail.trim());

  return (
    <Card id="verification" className="border-glass-border bg-glass backdrop-blur">
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
                  <p className="text-sm font-semibold text-primary">Verifizierung abgeschlossen</p>
                  <p className="text-xs text-muted-foreground">
                    {data.method === "guardian_consent"
                      ? "Identität geprüft · Alter geprüft (Einverständnis und Ausweise)"
                      : "Identität geprüft · Alter geprüft"}
                    {" · "}
                    {formatDate(data.verifiedAt)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {data.kind === "youth"
                  ? "Zwei Schritte: (1) Deine Eltern legen ein Eltern-Konto an – das ist Pflicht für deine Sicherheit. (2) Du reichst die unterschriebene Einverständniserklärung sowie Vorder- und Rückseite der Ausweise von Eltern und dir ein. Nach der Prüfung durch unser Team bist du verifiziert und kannst bieten."
                  : "Nach erfolgreicher Prüfung erscheint die Kennzeichnung „Identität geprüft“ bei Angeboten und auf dem Profil. Ohne abgeschlossene Verifizierung kannst du keine Aufträge erstellen oder annehmen und keine Nachrichten senden."}
              </p>
            )}

            <p className="text-xs">
              <span className="text-muted-foreground">Status: </span>
              <strong>{VERIFICATION_STATUS_LABEL[data.status]}</strong>
            </p>

            <div className="space-y-3">
              {data.emailConfirmed !== null && (
                <StatusRow
                  icon={<MailCheck className="size-4" />}
                  title="E-Mail-Adresse"
                  detail={data.emailConfirmed ? "Bestätigt." : "Noch nicht bestätigt."}
                  tone={data.emailConfirmed ? "ok" : "todo"}
                />
              )}

              {data.guardianAccount && (
                <StatusRow
                  icon={
                    data.guardianAccount.state === "active" ? (
                      <CheckCircle2 className="size-4" />
                    ) : data.guardianAccount.state === "invited" ? (
                      <Clock className="size-4" />
                    ) : (
                      <Users className="size-4" />
                    )
                  }
                  title="Eltern-Konto"
                  detail={
                    data.guardianAccount.state === "active"
                      ? data.guardianAccount.paused
                        ? "Verknüpft – von deinen Eltern pausiert."
                        : data.guardianAccount.parentConfirmation === "complete"
                          ? "Verknüpft, verifiziert, Einwilligung liegt vor."
                          : "Elternbestätigung ausstehend: Deine Eltern müssen ihr Konto noch verifizieren lassen und die Einwilligung abgeben."
                      : data.guardianAccount.state === "invited"
                        ? "Eingeladen – deine Eltern haben das Konto noch nicht angelegt."
                        : "Noch nicht angelegt (Pflicht)."
                  }
                  tone={
                    data.guardianAccount.state === "active" && data.guardianAccount.parentConfirmation === "complete"
                      ? "ok"
                      : data.guardianAccount.state === "active"
                        ? "wait"
                      : data.guardianAccount.state === "invited"
                        ? "wait"
                        : "todo"
                  }
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
                  title="Einverständnis & Ausweise"
                  detail={youthRow(data.guardian).detail}
                  tone={youthRow(data.guardian).tone}
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
                  tone={data.verifiedAt ? "ok" : data.identity.state === "pending" ? "wait" : "todo"}
                />
              )}
            </div>

            {/* Jugendliche, Schritt 1: Eltern-Konto (Pflicht) */}
            {data.guardianAccount && data.guardianAccount.state !== "active" && (
              <GuardianInviteStep account={data.guardianAccount} onChanged={refresh} />
            )}

            {/* Sicherheitsinformationen (Helfer) bzw. Kinderschutzregeln (Auftraggeber) */}
            {(data.kind === "youth" || data.kind === "adult" || data.kind === "pro") && (
              <ConsentAcknowledgement
                kind="helper_safety_info"
                accepted={data.consents.helperSafetyAccepted}
                onAccepted={refresh}
              />
            )}
            {data.kind === "customer" && (
              <ConsentAcknowledgement
                kind="customer_child_protection_rules"
                accepted={data.consents.customerRulesAccepted}
                onAccepted={refresh}
              />
            )}

            {/* Jugendliche, Schritt 2: Unterlagen einreichen */}
            {data.guardian &&
              !data.verifiedAt &&
              data.guardian.state !== "pending" &&
              data.guardian.state !== "approved" && <YouthDocumentsForm onSubmitted={refresh} />}

            {/* Eltern-E-Mail: dorthin gehen die Freigabe-Anfragen für einzelne Aufträge */}
            {data.guardian && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Freigabe-Anfragen für einzelne Aufträge gehen an{" "}
                  <strong>{data.guardian.emailMasked ?? "die Login-Adresse des Eltern-Kontos"}</strong>
                  {data.guardian.emailMasked && data.guardianAccount?.state === "active"
                    ? " und an die Login-Adresse des Eltern-Kontos"
                    : ""}
                  . Entschieden wird im Eltern-Konto.
                </p>
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
                        Speichern
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
                    className="text-xs text-muted-foreground underline hover:text-foreground"
                  >
                    Eltern-E-Mail ändern
                  </button>
                )}
              </div>
            )}

            {data.identity && !data.verifiedAt && data.identity.state !== "pending" && (
              <>
                {showIdForm ? (
                  <div className="space-y-3">
                    <IdentityDocumentForm
                      onSubmitted={() => {
                        setShowIdForm(false);
                        refresh();
                      }}
                    />
                    <Button variant="ghost" size="sm" onClick={() => setShowIdForm(false)}>
                      Abbrechen
                    </Button>
                  </div>
                ) : (
                  <Button className="w-full" onClick={() => setShowIdForm(true)}>
                    Ausweisprüfung starten
                  </Button>
                )}
              </>
            )}

            {data.guardianAccount && <YouthProtectionRules />}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Hinweis fürs Dashboard: nur für Jugendliche, die noch nicht verifiziert sind,
 * weil sie bis dahin nicht bieten können. Führt zur Unterlagen-Einreichung im Profil.
 */
export function GuardianConsentBanner() {
  const { data } = useVerification();

  if (!data || data.kind !== "youth" || data.verifiedAt || !data.guardian) return null;
  const pending = data.guardian.state === "pending";

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-400" />
        <div>
          <p className="text-sm font-semibold">
            {pending ? "Wir prüfen deine Unterlagen" : "Verifizierung fehlt"}
          </p>
          <p className="text-xs text-muted-foreground">
            {pending
              ? "Sobald unser Team alles geprüft hat, kannst du bieten und Angebote einstellen."
              : "Lade deine Eltern zum Eltern-Konto ein und reiche die Einverständniserklärung und die Ausweise ein – erst nach der Prüfung kannst du bieten und Angebote einstellen."}
          </p>
        </div>
      </div>
      {!pending && (
        <Button asChild size="sm">
          <Link to="/profile" hash="verification">
            Jetzt starten
          </Link>
        </Button>
      )}
    </div>
  );
}

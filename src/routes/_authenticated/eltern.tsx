import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BadgeCheck, Clock, Loader2, PauseCircle, PlayCircle, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { SiteNav } from "@/components/site-nav";
import { QueryErrorCard } from "@/components/query-error-card";
import { SafetyActions } from "@/components/safety-actions";
import { YouthProtectionRules } from "@/components/youth-protection-rules";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { IdentityDocumentForm } from "@/components/identity-document-form";
import { Checkbox } from "@/components/ui/checkbox";
import { GUARDIAN_CONSENT_TEXT } from "@/lib/consent-texts";
import {
  confirmGuardianConsentFn,
  decideJobAsGuardian,
  endGuardianLinkFn,
  getMyGuardianOverview,
  setChildPausedFn,
} from "@/lib/guardian.functions";
import { VERIFICATION_STATUS_LABEL } from "@/lib/verification-status";
import type { GuardianApprovalItem, GuardianChildOverview } from "@/lib/server/guardian.server";

/**
 * Eltern-Konto: Überblick über Konto und Aufträge des Kindes, Freigaben und Sicherheitsfunktionen
 * (Pausieren, Melden, Blockieren). Pflicht für jugendliche Helfer (13-17).
 */
export const Route = createFileRoute("/_authenticated/eltern")({
  // Links aus der Eltern-Mail: /eltern?request=<id>&aktion=freigeben|ablehnen|melden
  // Entschieden wird erst per Klick hier im Konto - der Link allein ändert nichts.
  validateSearch: (search: Record<string, unknown>): { request?: string; aktion?: string } => ({
    request:
      typeof search.request === "string" && /^[0-9a-f-]{36}$/i.test(search.request) ? search.request : undefined,
    aktion:
      search.aktion === "freigeben" || search.aktion === "ablehnen" || search.aktion === "melden"
        ? search.aktion
        : undefined,
  }),
  head: () => ({ meta: [{ title: "Eltern-Konto · GreenMatch" }] }),
  component: GuardianPage,
});

const QUERY_KEY = ["guardian-overview"] as const;

function decisionError(e: unknown): string {
  const m = (e as Error)?.message ?? "";
  if (m.includes("job_changed"))
    return "Der Auftrag wurde seit der Anfrage geändert. Ihr Kind muss ihn erneut anfragen, damit Sie die aktuellen Angaben freigeben können.";
  if (m.includes("guardian_not_verified"))
    return "Bitte lassen Sie zuerst Ihr Eltern-Konto verifizieren (Ausweisprüfung).";
  if (m.includes("job_already_started")) return "Der Auftrag läuft bereits und kann nicht mehr zurückgezogen werden.";
  if (m.includes("expired")) return "Die Anfrage ist abgelaufen. Ihr Kind kann den Auftrag in der App erneut anfragen.";
  if (m.includes("already_decided")) return "Über diese Anfrage wurde bereits entschieden.";
  if (m.includes("forbidden")) return "Dafür haben Sie keine Berechtigung.";
  return "Das hat nicht geklappt. Bitte versuchen Sie es erneut.";
}

function GuardianPage() {
  const overviewFn = useServerFn(getMyGuardianOverview);
  const query = useQuery({ queryKey: QUERY_KEY, queryFn: () => overviewFn() });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        <div>
          <span className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-primary">
            <ShieldCheck className="size-3.5" />
            Eltern-Konto
          </span>
          <h1 className="font-brand text-3xl">Sicherheit Ihres Kindes</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Hier sehen Sie alle Auftragsdaten, geben jeden Auftrag einzeln frei und können das Konto
            Ihres Kindes jederzeit pausieren.
          </p>
        </div>

        {query.isLoading && <p className="text-sm text-muted-foreground">Lädt…</p>}
        {query.isError && <QueryErrorCard error={query.error} />}

        {query.data && <GuardianVerificationBlock verification={query.data.verification} onChanged={() => query.refetch()} />}

        {query.data && query.data.children.length === 0 && (
          <Card className="border-glass-border bg-glass backdrop-blur">
            <CardContent className="space-y-2 py-8 text-center text-sm text-muted-foreground">
              <p>Mit diesem Konto ist noch kein Kind verknüpft.</p>
              <p>
                Öffnen Sie dazu den Einladungslink Ihres Kindes (per E-Mail oder weitergeleitet) und
                melden Sie sich an.
              </p>
            </CardContent>
          </Card>
        )}

        {query.data?.children.map((child) => (
          <ChildSection key={child.childId} child={child} guardianVerified={query.data.verification.status === "verified"} />
        ))}

        <YouthProtectionRules />
        <p className="text-xs text-muted-foreground">
          Höchstarbeitszeit und Uhrzeit prüft die Plattform automatisch; den Schulunterricht und die
          Eignung der Tätigkeit prüfen Sie bei jeder Freigabe. Bei akuter Gefahr: Notruf 112. Beratung für
          Kinder und Jugendliche: „Nummer gegen Kummer“, 116 111.
        </p>
      </main>
    </div>
  );
}

function GuardianVerificationBlock({
  verification,
  onChanged,
}: {
  verification: { status: keyof typeof VERIFICATION_STATUS_LABEL; rejectedReason: string | null };
  onChanged: () => void;
}) {
  const needsUpload =
    verification.status === "not_started" ||
    verification.status === "rejected" ||
    verification.status === "reverification_required";
  return (
    <Card className="border-glass-border bg-glass backdrop-blur">
      <CardContent className="space-y-4 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold">Verifizierung Ihres Eltern-Kontos</p>
          <Badge variant={verification.status === "verified" ? "default" : "outline"}>
            {verification.status === "verified" ? "Verifizierung abgeschlossen" : VERIFICATION_STATUS_LABEL[verification.status]}
          </Badge>
        </div>
        {verification.status === "verified" && (
          <p className="text-xs text-muted-foreground">Identität geprüft · Alter geprüft</p>
        )}
        {verification.status === "rejected" && verification.rejectedReason && (
          <p className="text-sm text-destructive">Abgelehnt: {verification.rejectedReason}</p>
        )}
        {verification.status === "in_review" && (
          <p className="text-sm text-muted-foreground">Ihre Ausweiskopie wird geprüft. Wir melden uns per E-Mail.</p>
        )}
        {verification.status === "suspended" && (
          <p className="text-sm text-destructive">Ihr Konto ist gesperrt. Bitte wenden Sie sich an das GreenMatch-Team.</p>
        )}
        {needsUpload && (
          <>
            <p className="text-sm text-muted-foreground">
              Bevor Sie Ihrem Kind zustimmen oder Aufträge freigeben können, muss Ihre Identität und Ihr
              Alter geprüft werden.
            </p>
            <IdentityDocumentForm onSubmitted={onChanged} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ConsentBlock({ child, verified, onDone }: { child: GuardianChildOverview; verified: boolean; onDone: () => void }) {
  const confirmFn = useServerFn(confirmGuardianConsentFn);
  const [checked, setChecked] = useState(false);
  const confirm = useMutation({
    mutationFn: () => confirmFn({ data: { childId: child.childId } }),
    onSuccess: () => {
      toast.success("Einwilligung gespeichert.");
      onDone();
    },
    onError: (e) => toast.error(decisionError(e)),
  });
  if (child.consentGiven) return null;
  return (
    <Card className="border-amber-400/40 bg-glass backdrop-blur">
      <CardContent className="space-y-3 pt-5 text-sm">
        <p className="font-semibold">Einwilligung zur Nutzung durch {child.childName}</p>
        <p className="text-xs leading-relaxed">{GUARDIAN_CONSENT_TEXT}</p>
        {!verified && (
          <p className="text-xs text-amber-400">
            Die Einwilligung ist erst nach der Verifizierung Ihres Eltern-Kontos möglich.
          </p>
        )}
        <label className="flex items-start gap-3 text-xs">
          <Checkbox
            checked={checked}
            disabled={!verified}
            onCheckedChange={(v) => setChecked(v === true)}
            className="mt-0.5"
          />
          Ich bestätige die Verbindung zu {child.childName} und gebe die Einwilligung ab.
        </label>
        <Button disabled={!verified || !checked || confirm.isPending} onClick={() => confirm.mutate()}>
          {confirm.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          Einwilligung abgeben
        </Button>
      </CardContent>
    </Card>
  );
}

function ChildSection({ child, guardianVerified }: { child: GuardianChildOverview; guardianVerified: boolean }) {
  const queryClient = useQueryClient();
  const pauseFn = useServerFn(setChildPausedFn);
  const refresh = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const pause = useMutation({
    mutationFn: (paused: boolean) => pauseFn({ data: { childId: child.childId, paused } }),
    onSuccess: (_r, paused) => {
      toast.success(paused ? "Das Konto wurde pausiert." : "Das Konto ist wieder aktiv.");
      refresh();
    },
    onError: () => toast.error("Das hat nicht geklappt. Bitte versuchen Sie es erneut."),
  });

  function togglePause() {
    if (!child.paused) {
      const ok = window.confirm(
        `Konto von ${child.childName} pausieren? Ihr Kind kann dann keine Gebote abgeben und keine Aufträge annehmen, bis Sie es wieder aktivieren.`,
      );
      if (!ok) return;
    }
    pause.mutate(!child.paused);
  }

  const endFn = useServerFn(endGuardianLinkFn);
  const endLink = useMutation({
    mutationFn: () => endFn({ data: { childId: child.childId } }),
    onSuccess: () => {
      toast.success("Die Verknüpfung wurde beendet. Neue Aufträge sind für Ihr Kind gesperrt.");
      refresh();
    },
    onError: () => toast.error("Das hat nicht geklappt. Bitte versuchen Sie es erneut."),
  });
  function endLinkConfirm() {
    const ok = window.confirm(
      `Verknüpfung mit ${child.childName} beenden? Alle offenen und erteilten Freigaben erlöschen, ${child.childName} kann keine neuen Aufträge mehr annehmen.`,
    );
    if (ok) endLink.mutate();
  }

  const waiting = child.approvals.filter((a) => a.status === "pending");
  const history = child.approvals.filter((a) => a.status !== "pending");

  return (
    <section className="space-y-4">
      <Card className="border-glass-border bg-glass backdrop-blur">
        <CardContent className="space-y-4 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-brand text-2xl">{child.childName}</h2>
              {child.verifiedAt ? (
                <Badge variant="outline" className="gap-1 border-primary/40 text-primary">
                  <BadgeCheck className="size-3.5" />
                  Verifiziert
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 border-amber-400/40 text-amber-400">
                  <Clock className="size-3.5" />
                  Verifizierung läuft
                </Badge>
              )}
              {child.paused && (
                <Badge variant="outline" className="gap-1 border-amber-400/40 text-amber-400">
                  <PauseCircle className="size-3.5" />
                  Von Ihnen pausiert
                </Badge>
              )}
              {child.suspended && (
                <Badge variant="destructive" className="gap-1">
                  <ShieldAlert className="size-3.5" />
                  Vom Team gesperrt
                </Badge>
              )}
            </div>
            <Button
              variant={child.paused ? "default" : "outline"}
              size="sm"
              className="gap-1.5"
              disabled={pause.isPending}
              onClick={togglePause}
            >
              {pause.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : child.paused ? (
                <PlayCircle className="size-4" />
              ) : (
                <PauseCircle className="size-4" />
              )}
              {child.paused ? "Konto wieder aktivieren" : "Konto pausieren"}
            </Button>
          </div>
          {!child.verifiedAt && (
            <p className="text-xs text-muted-foreground">
              Ihr Kind ist erst nach der Prüfung der Unterlagen (Einverständniserklärung und
              Ausweise) durch unser Team freigeschaltet.
            </p>
          )}
        </CardContent>
      </Card>

      <ConsentBlock child={child} verified={guardianVerified} onDone={refresh} />

      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Wartet auf Ihre Freigabe
        </h3>
        {waiting.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aktuell keine offenen Anfragen.</p>
        ) : (
          waiting.map((a) => <ApprovalCard key={a.requestId} item={a} child={child} onDone={refresh} />)
        )}
      </div>

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" className="text-destructive" disabled={endLink.isPending} onClick={endLinkConfirm}>
          Verknüpfung mit {child.childName} beenden
        </Button>
      </div>

      {history.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Bisherige Aufträge</h3>
          {history.map((a) => (
            <ApprovalCard key={a.requestId} item={a} child={child} onDone={refresh} />
          ))}
        </div>
      )}
    </section>
  );
}

const STATUS_LABEL: Record<GuardianApprovalItem["status"], string> = {
  pending: "Wartet auf Freigabe",
  approved: "Freigegeben",
  declined: "Nicht freigegeben",
  expired: "Abgelaufen",
};

function ApprovalCard({
  item,
  child,
  onDone,
}: {
  item: GuardianApprovalItem;
  child: GuardianChildOverview;
  onDone: () => void;
}) {
  const decideFn = useServerFn(decideJobAsGuardian);
  const { request: focusId, aktion } = Route.useSearch();
  const focused = focusId === item.requestId;
  const [confirmed, setConfirmed] = useState(false);
  const decide = useMutation({
    mutationFn: (decision: "approve" | "decline" | "revoke") =>
      decideFn({ data: { requestId: item.requestId, decision } }),
    onSuccess: (_r, decision) => {
      toast.success(
        decision === "approve" ? "Auftrag freigegeben." : decision === "decline" ? "Nicht freigegeben." : "Freigabe zurückgezogen.",
      );
      onDone();
    },
    onError: (e) => {
      toast.error(decisionError(e));
      onDone();
    },
  });

  const { job } = item;
  const started = job.gigStatus === "in_progress" || job.gigStatus === "completed";

  return (
    <Card
      id={`request-${item.requestId}`}
      className={`bg-glass backdrop-blur ${focused ? "border-primary ring-2 ring-primary/40" : "border-glass-border"}`}
    >
      <CardContent className="space-y-4 pt-5">
        {focused && aktion && (
          <p className="rounded-lg bg-primary/10 p-2 text-xs">
            {aktion === "melden"
              ? "Zum Melden nutzen Sie unten „Melden“."
              : "Bitte prüfen Sie die Angaben. Erst Ihr Klick auf den Button unten gilt als Entscheidung."}
          </p>
        )}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="font-semibold">{job.title}</p>
          <Badge variant="outline">{STATUS_LABEL[item.status]}</Badge>
        </div>

        <dl className="divide-y divide-glass-border text-sm">
          <Row label="Art der Tätigkeit" value={job.activity} />
          {job.description && <Row label="Beschreibung" value={job.description} />}
          <Row label="Datum" value={job.dateLabel} />
          <Row label="Beginn" value={job.startLabel} />
          <Row label="Ende" value={job.endLabel} />
          <Row label="Dauer" value={job.durationLabel} />
          <Row label="Ort" value={job.location} />
          <Row
            label="Auftraggeber"
            value={`${job.customerName} · ${job.customerVerified ? "Identität geprüft" : "nicht verifiziert"}`}
          />
          <Row
            label="Vergütung"
            value={
              job.priceCents > 0
                ? (job.priceCents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" })
                : "nicht angegeben"
            }
          />
          <Row label="Erkennbare Risiken" value={job.risks} />
        </dl>
        <p className="text-xs text-muted-foreground">
          Keine Reaktion gilt nicht als Zustimmung. Ändern sich Ort, Zeit, Tätigkeit, Auftraggeber oder andere
          wesentliche Bedingungen, ist eine neue Zustimmung nötig. Ihr Kind kann den Auftrag jederzeit abbrechen.
          Bei akuter Gefahr: Notruf 112.
        </p>

        {item.status === "pending" && (
          <div className="space-y-3">
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              Ich habe Ort, Zeit, Auftraggeber und Tätigkeit geprüft und gebe diesen Auftrag für{" "}
              {child.childName} frei.
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button disabled={!confirmed || decide.isPending} onClick={() => decide.mutate("approve")}>
                {decide.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Auftrag freigeben
              </Button>
              <Button variant="outline" disabled={decide.isPending} onClick={() => decide.mutate("decline")}>
                Nicht freigeben
              </Button>
            </div>
          </div>
        )}

        {item.status === "approved" && !started && (
          <Button variant="outline" size="sm" disabled={decide.isPending} onClick={() => decide.mutate("revoke")}>
            Freigabe zurückziehen
          </Button>
        )}

        <div className="border-t border-glass-border pt-3">
          <p className="mb-2 text-xs text-muted-foreground">Sicherheit: Auftraggeber</p>
          <SafetyActions
            userId={job.customerId}
            userName={job.customerName}
            gigId={job.gigId}
            onBehalfOfChildId={child.childId}
            blockedOverride={child.blockedUserIds.includes(job.customerId)}
            onChanged={onDone}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-4">
      <dt className="w-40 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

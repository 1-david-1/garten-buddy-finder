import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  decideIdentityVerification,
  listIdentityVerifications,
  type IdentityVerificationItem,
} from "@/lib/identity-verification.functions";

const KEY = ["admin-identity-verifications"] as const;

/** Admin: Ausweisprüfung für Erwachsene, Profis und Auftraggeber. */
export function IdentityVerificationAdmin() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listIdentityVerifications);
  const query = useQuery({ queryKey: KEY, queryFn: () => listFn() });
  const items = query.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold">Ausweisprüfung (Erwachsene, Profis, Auftraggeber)</h3>
        <p className="text-sm text-muted-foreground">
          Prüfe Name, Geburtsdatum und Wohnort auf der geschwärzten Kopie. Nach der Entscheidung wird die Kopie
          gelöscht; es bleiben nur Ergebnis, Datum und Verfahren.
        </p>
      </div>
      {query.isLoading && <p className="text-sm text-muted-foreground">Lädt…</p>}
      {!query.isLoading && items.length === 0 && (
        <Card className="border-glass-border bg-glass backdrop-blur">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Keine offenen Ausweisprüfungen.
          </CardContent>
        </Card>
      )}
      {items.map((item) => (
        <ReviewCard
          key={item.requestId}
          item={item}
          onDone={() => queryClient.invalidateQueries({ queryKey: KEY })}
        />
      ))}
    </div>
  );
}

function ReviewCard({ item, onDone }: { item: IdentityVerificationItem; onDone: () => void }) {
  const decideFn = useServerFn(decideIdentityVerification);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [redactionOk, setRedactionOk] = useState(false);

  const decide = useMutation({
    mutationFn: (v: { decision: "approve" | "reject"; unredacted?: boolean }) =>
      decideFn({
        data: {
          requestId: item.requestId,
          decision: v.decision,
          reason: v.unredacted ? undefined : reason.trim() || undefined,
          redactionChecked: v.decision === "approve" ? redactionOk : undefined,
          unredacted: v.unredacted,
        },
      }),
    onSuccess: (_r, v) => {
      toast.success(v.decision === "approve" ? "Verifiziert." : "Abgelehnt – die Person wurde informiert.");
      onDone();
    },
    onError: () => toast.error("Das hat nicht geklappt."),
  });

  return (
    <Card className="border-glass-border bg-glass backdrop-blur">
      <CardContent className="space-y-4 pt-5 text-sm">
        <div className="grid gap-1 sm:grid-cols-2">
          <p>
            <span className="text-muted-foreground">Name im Profil: </span>
            <strong>{item.displayName}</strong>
          </p>
          <p>
            <span className="text-muted-foreground">Stadt im Profil: </span>
            {item.city ?? "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Rollen: </span>
            {item.roles.join(", ") || "—"}
          </p>
          <p className="text-xs text-muted-foreground">
            Eingereicht am {new Date(item.submittedAt).toLocaleString("de-DE")}
          </p>
          {item.note && (
            <p className="sm:col-span-2">
              <span className="text-muted-foreground">Hinweis: </span>
              {item.note}
            </p>
          )}
        </div>

        {item.document ? (
          <a
            href={item.document.url ?? undefined}
            target="_blank"
            rel="noreferrer noopener"
            className="block w-fit rounded-xl border border-glass-border p-2 text-xs hover:border-primary/50"
          >
            {item.document.url && !item.document.isPdf ? (
              <img src={item.document.url} alt="Ausweiskopie" className="h-40 rounded-lg object-cover" />
            ) : (
              <div className="flex h-40 w-56 items-center justify-center rounded-lg bg-muted/30">
                <FileText className="size-8 text-muted-foreground" />
              </div>
            )}
            <span className="mt-1.5 flex items-center justify-between gap-1">
              Ausweiskopie öffnen <ExternalLink className="size-3 opacity-60" />
            </span>
          </a>
        ) : (
          <p className="text-amber-400">Keine Kopie vorhanden (ältere Anfrage) – bitte nachfordern.</p>
        )}

        {rejecting ? (
          <div className="space-y-2">
            <Textarea
              value={reason}
              maxLength={300}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Grund für die Ablehnung (wird der Person angezeigt)"
              className="min-h-20 text-sm"
            />
            <div className="flex gap-2">
              <Button
                variant="destructive"
                disabled={!reason.trim() || decide.isPending}
                onClick={() => decide.mutate({ decision: "reject" })}
              >
                {decide.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Ablehnen
              </Button>
              <Button variant="ghost" onClick={() => setRejecting(false)}>
                Abbrechen
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="flex items-start gap-3 text-xs">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={redactionOk}
                onChange={(e) => setRedactionOk(e.target.checked)}
              />
              Auf der Kopie sind keine Ausweisnummer, Seriennummer, CAN, maschinenlesbare Zone oder Anschrift
              sichtbar – nur Name, Geburtsdatum, Wohnort-Stadt und ggf. Gültigkeitsdatum.
            </label>
            <div className="flex flex-wrap gap-2">
              <Button disabled={decide.isPending || !redactionOk} onClick={() => decide.mutate({ decision: "approve" })}>
                {decide.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Verifizieren
              </Button>
              <Button
                variant="destructive"
                disabled={decide.isPending}
                onClick={() => decide.mutate({ decision: "reject", unredacted: true })}
              >
                Ablehnen: Schwärzung unvollständig
              </Button>
              <Button variant="outline" onClick={() => setRejecting(true)}>
                Anderer Ablehnungsgrund …
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  decideYouthVerification,
  listYouthVerifications,
  type YouthDocKey,
  type YouthVerificationItem,
} from "@/lib/youth-verification.functions";

const DOC_LABELS: Record<YouthDocKey, string> = {
  consent: "Einverständniserklärung",
  parent_id_front: "Ausweis Elternteil – vorne",
  parent_id_back: "Ausweis Elternteil – hinten",
  child_id_front: "Ausweis Kind – vorne",
  child_id_back: "Ausweis Kind – hinten",
};

/** Admin-Tab: Unterlagen Jugendlicher prüfen und verifizieren oder ablehnen. */
export function YouthVerificationAdmin() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listYouthVerifications);
  const query = useQuery({
    queryKey: ["admin-youth-verifications"],
    queryFn: () => listFn(),
    // Signed-URLs laufen nach 10 Minuten ab.
    staleTime: 5 * 60 * 1000,
  });

  const items = query.data?.items ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Prüfe, ob Einverständniserklärung und Ausweise zusammenpassen (Namen, Geburtsdatum des
        Kindes, Unterschrift). Die Dateien werden nach deiner Entscheidung gelöscht.
      </p>
      {query.isLoading && <p className="text-sm text-muted-foreground">Lädt…</p>}
      {query.isError && <p className="text-sm text-destructive">Konnte nicht geladen werden.</p>}
      {!query.isLoading && items.length === 0 && (
        <Card className="border-glass-border bg-glass backdrop-blur">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Keine offenen Prüfungen.
          </CardContent>
        </Card>
      )}
      {items.map((item) => (
        <ReviewCard
          key={item.requestId}
          item={item}
          onDone={() => queryClient.invalidateQueries({ queryKey: ["admin-youth-verifications"] })}
        />
      ))}
    </div>
  );
}

function ReviewCard({ item, onDone }: { item: YouthVerificationItem; onDone: () => void }) {
  const decideFn = useServerFn(decideYouthVerification);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const decide = useMutation({
    mutationFn: (decision: "approve" | "reject") =>
      decideFn({ data: { requestId: item.requestId, decision, reason: reason.trim() || undefined } }),
    onSuccess: (_r, decision) => {
      toast.success(decision === "approve" ? "Verifiziert." : "Abgelehnt – das Kind wurde informiert.");
      onDone();
    },
    onError: () => toast.error("Das hat nicht geklappt."),
  });

  return (
    <Card className="border-glass-border bg-glass backdrop-blur">
      <CardContent className="space-y-4 pt-5">
        <div className="grid gap-1 text-sm sm:grid-cols-2">
          <p>
            <span className="text-muted-foreground">Kind: </span>
            <strong>{item.childName}</strong>
          </p>
          <p>
            <span className="text-muted-foreground">Angegebenes Geburtsdatum: </span>
            {item.statedBirthdate ? new Date(item.statedBirthdate).toLocaleDateString("de-DE") : "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Elternteil: </span>
            {item.guardianName}
          </p>
          <p>
            <span className="text-muted-foreground">Eltern-E-Mail: </span>
            {item.guardianEmail ?? "—"}
          </p>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Eingereicht am {new Date(item.submittedAt).toLocaleString("de-DE")}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {item.documents.map((d) => (
            <a
              key={d.key}
              href={d.url ?? undefined}
              target="_blank"
              rel="noreferrer noopener"
              className="group flex flex-col gap-1.5 rounded-xl border border-glass-border p-2 text-xs hover:border-primary/50"
            >
              {d.url && !d.isPdf ? (
                <img
                  src={d.url}
                  alt={DOC_LABELS[d.key]}
                  className="h-28 w-full rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-28 items-center justify-center rounded-lg bg-muted/30">
                  <FileText className="size-8 text-muted-foreground" />
                </div>
              )}
              <span className="flex items-center justify-between gap-1">
                {DOC_LABELS[d.key]}
                <ExternalLink className="size-3 shrink-0 opacity-60" />
              </span>
            </a>
          ))}
        </div>

        {rejecting ? (
          <div className="space-y-2">
            <Textarea
              value={reason}
              maxLength={300}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Grund für die Ablehnung (wird dem Jugendlichen angezeigt)"
              className="min-h-20 text-sm"
            />
            <div className="flex gap-2">
              <Button
                variant="destructive"
                disabled={!reason.trim() || decide.isPending}
                onClick={() => decide.mutate("reject")}
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
          <div className="flex gap-2">
            <Button disabled={decide.isPending} onClick={() => decide.mutate("approve")}>
              {decide.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Verifizieren
            </Button>
            <Button variant="outline" onClick={() => setRejecting(true)}>
              Ablehnen …
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

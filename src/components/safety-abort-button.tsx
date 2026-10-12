import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Siren } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { abortGigForSafety } from "@/lib/safety.functions";

/**
 * Notfall- und Abbruchfunktion: Auftrag sofort abbrechen, wenn Unsicherheit oder Gefahr besteht.
 * Kein Grund nötig, keine negative Bewertung. Die andere Seite und - bei Jugendlichen - die
 * Eltern werden automatisch informiert.
 */
export function SafetyAbortButton({ gigId, onDone }: { gigId: string; onDone?: () => void }) {
  const abortFn = useServerFn(abortGigForSafety);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");

  const abort = useMutation({
    mutationFn: () => abortFn({ data: { gigId, note: note.trim() || undefined } }),
    onSuccess: () => {
      toast.success("Der Auftrag wurde abgebrochen. Die Beteiligten werden informiert.");
      setOpen(false);
      onDone?.();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Abbruch fehlgeschlagen."),
  });

  return (
    <div className="mt-6 rounded-xl border border-amber-400/40 bg-amber-400/5 p-4">
      <h4 className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <Siren className="size-4 text-amber-400" />
        Unsicher oder in Gefahr?
      </h4>
      <p className="mb-3 text-xs text-muted-foreground">
        Bei akuter Gefahr wähle sofort den <strong>Notruf 112</strong>. Du kannst den Auftrag jederzeit
        abbrechen – ohne negative Bewertung und ohne Begründung.
      </p>
      {open ? (
        <div className="space-y-2">
          <Textarea
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional: Was ist passiert?"
            rows={2}
            className="text-sm"
          />
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" disabled={abort.isPending} onClick={() => abort.mutate()}>
              {abort.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Auftrag jetzt abbrechen
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Zurück
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          Sicherheitsabbruch
        </Button>
      )}
    </div>
  );
}

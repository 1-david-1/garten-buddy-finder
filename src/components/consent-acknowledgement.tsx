import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { acceptConsent } from "@/lib/consents.functions";
import { CUSTOMER_RULES_TEXT, HELPER_SAFETY_POINTS } from "@/lib/consent-texts";

/**
 * Einmalige Bestätigungen in der Verifizierung:
 *  - Helfer (auch Jugendliche): Sicherheitsinformationen
 *  - Auftraggeber: Kinderschutzregeln und verbotene Tätigkeiten
 */
export function ConsentAcknowledgement({
  kind,
  accepted,
  onAccepted,
}: {
  kind: "helper_safety_info" | "customer_child_protection_rules";
  accepted: boolean;
  onAccepted: () => void;
}) {
  const acceptFn = useServerFn(acceptConsent);
  const [checked, setChecked] = useState(false);
  const accept = useMutation({
    mutationFn: () => acceptFn({ data: { kind } }),
    onSuccess: () => {
      toast.success("Bestätigt.");
      onAccepted();
    },
    onError: () => toast.error("Das hat nicht geklappt. Bitte versuche es erneut."),
  });

  const isHelper = kind === "helper_safety_info";
  const title = isHelper ? "Sicherheitsinformationen" : "Kinderschutzregeln und verbotene Tätigkeiten";

  if (accepted) {
    return (
      <p className="flex items-center gap-2 text-xs text-primary">
        <CheckCircle2 className="size-4" />
        {title}: bestätigt.
      </p>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-glass-border p-4">
      <p className="text-sm font-semibold">{title}</p>
      {isHelper ? (
        <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed">
          {HELPER_SAFETY_POINTS.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : (
        <p className="text-xs leading-relaxed">{CUSTOMER_RULES_TEXT}</p>
      )}
      <div className="flex items-start gap-3">
        <Checkbox
          id={`ack-${kind}`}
          checked={checked}
          onCheckedChange={(v) => setChecked(v === true)}
          className="mt-0.5"
        />
        <Label htmlFor={`ack-${kind}`} className="text-xs font-normal leading-relaxed">
          {isHelper ? "Ich habe die Sicherheitsinformationen gelesen und verstanden." : "Ich akzeptiere die Regeln."}
        </Label>
      </div>
      <Button size="sm" disabled={!checked || accept.isPending} onClick={() => accept.mutate()}>
        {accept.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
        Bestätigen
      </Button>
    </div>
  );
}

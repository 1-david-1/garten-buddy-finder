import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { ExternalLink, FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IdCheckNotice, YouthProtectionRules } from "@/components/youth-protection-rules";
import { ID_REDACTION_CONFIRMATION } from "@/lib/consent-texts";
import { supabase } from "@/integrations/supabase/client";
import {
  submitYouthVerification,
  YOUTH_DOC_BUCKET,
  YOUTH_DOC_KEYS,
  type YouthDocKey,
} from "@/lib/youth-verification.functions";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

const LABELS: Record<YouthDocKey, { label: string; hint?: string }> = {
  consent: {
    label: "Einverständniserklärung der Eltern (unterschrieben)",
    hint: "Foto, Scan oder PDF",
  },
  parent_id_front: { label: "Ausweis Elternteil – Vorderseite" },
  parent_id_back: { label: "Ausweis Elternteil – Rückseite" },
  child_id_front: { label: "Ausweis Kind – Vorderseite" },
  child_id_back: { label: "Ausweis Kind – Rückseite" },
};

/** Unterlagen für die Verifizierung Jugendlicher: Einverständnis + Ausweise (Eltern und Kind). */
export function YouthDocumentsForm({ onSubmitted }: { onSubmitted: () => void }) {
  const submitFn = useServerFn(submitYouthVerification);
  const [guardianName, setGuardianName] = useState("");
  const [files, setFiles] = useState<Partial<Record<YouthDocKey, File>>>({});
  const [accepted, setAccepted] = useState(false);

  const complete = YOUTH_DOC_KEYS.every((k) => files[k]) && guardianName.trim().length >= 2;

  const submit = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Bitte melde dich erneut an.");

      const submissionId = crypto.randomUUID();
      for (const key of YOUTH_DOC_KEYS) {
        const file = files[key]!;
        const { error } = await supabase.storage
          .from(YOUTH_DOC_BUCKET)
          .upload(`${uid}/${submissionId}/${key}.${EXT[file.type]}`, file, {
            contentType: file.type,
            upsert: false,
          });
        if (error) throw new Error(`Upload fehlgeschlagen (${LABELS[key].label}).`);
      }
      await submitFn({ data: { submissionId, guardianName: guardianName.trim() } });
    },
    onSuccess: () => {
      toast.success("Unterlagen eingereicht. Wir prüfen sie und melden uns.");
      onSubmitted();
    },
    onError: (e) => {
      const m = (e as Error).message ?? "";
      console.error("[Jugend-Unterlagen]", e);
      const text = m.includes("already_pending")
        ? "Es liegt bereits eine Einreichung zur Prüfung vor."
        : m.includes("verification_schema_outdated")
          ? "Die Verifizierungsfunktion wird gerade eingerichtet. Bitte informiere den Betreiber."
        : m.includes("server_misconfigured")
          ? "Der Server ist noch nicht vollständig eingerichtet (Service-Schlüssel fehlt). Bitte informiere den Betreiber."
          : m.startsWith("Upload") || m.startsWith("Bitte")
            ? m
            : "Das hat nicht geklappt. Bitte versuche es später noch einmal.";
      toast.error(
        text,
        m && text !== m ? { description: m.slice(0, 160) } : undefined,
      );
    },
  });

  function pick(key: YouthDocKey, file: File | undefined) {
    if (!file) return;
    if (!ALLOWED.includes(file.type)) {
      toast.error("Erlaubt sind Fotos (JPG, PNG, WebP) und PDF.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Die Datei ist größer als 10 MB.");
      return;
    }
    setFiles((prev) => ({ ...prev, [key]: file }));
  }

  return (
    <div className="space-y-4 rounded-xl border border-glass-border p-4">
      <div className="space-y-1">
        <p className="text-sm font-semibold">Schritt 2: Unterlagen einreichen</p>
        <p className="text-xs text-muted-foreground">
          Lass deine Eltern die{" "}
          <a
            href="/einverstaendniserklaerung"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline"
          >
            Einverständniserklärung
          </a>{" "}
          ausfüllen und unterschreiben. Ausweise von Elternteil und Kind: bitte nach den Hinweisen unten
          schwärzen.
        </p>
      </div>

      <YouthProtectionRules />
      <IdCheckNotice />

      <div className="space-y-1.5">
        <Label htmlFor="guardian-name" className="text-xs">
          Name des Elternteils / Erziehungsberechtigten
        </Label>
        <Input
          id="guardian-name"
          value={guardianName}
          maxLength={100}
          onChange={(e) => setGuardianName(e.target.value)}
        />
      </div>

      {YOUTH_DOC_KEYS.map((key) => (
        <div key={key} className="space-y-1.5">
          <Label htmlFor={`doc-${key}`} className="flex items-center gap-1.5 text-xs">
            <FileUp className="size-3.5" />
            {key === "consent" ? (
              <a
                href="/einverstaendniserklaerung"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary underline"
                onClick={(e) => e.stopPropagation()}
              >
                {LABELS[key].label}
                <ExternalLink className="size-3" />
              </a>
            ) : (
              LABELS[key].label
            )}
          </Label>
          {key === "consent" && (
            <p className="text-[11px] text-muted-foreground">
              Zum Ausdrucken: auf die Beschriftung klicken, die Vorlage öffnet sich in einem neuen Tab.
            </p>
          )}
          <Input
            id={`doc-${key}`}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => pick(key, e.target.files?.[0])}
          />
          {files[key] && (
            <p className="truncate text-[11px] text-muted-foreground">{files[key]!.name}</p>
          )}
        </div>
      ))}

      <div className="flex items-start gap-3">
        <Checkbox
          id="docs-privacy"
          checked={accepted}
          onCheckedChange={(v) => setAccepted(v === true)}
          className="mt-0.5"
        />
        <Label htmlFor="docs-privacy" className="text-xs font-normal leading-relaxed">
          {ID_REDACTION_CONFIRMATION}
        </Label>
      </div>

      <Button
        className="w-full"
        disabled={!complete || !accepted || submit.isPending}
        onClick={() => submit.mutate()}
      >
        {submit.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
        Zur Prüfung einreichen
      </Button>
    </div>
  );
}

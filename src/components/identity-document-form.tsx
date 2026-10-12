import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { IdCheckNotice } from "@/components/youth-protection-rules";
import { ID_REDACTION_CONFIRMATION } from "@/lib/consent-texts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  IDENTITY_DOC_BUCKET,
  IDENTITY_DOC_KEY,
  requestIdentityVerification,
} from "@/lib/verification.functions";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/**
 * Ausweisprüfung für Erwachsene, Profis und Auftraggeber:
 * geschwärzte Ausweiskopie hochladen (Hinweistext siehe IdCheckNotice).
 */
export function IdentityDocumentForm({ onSubmitted }: { onSubmitted: () => void }) {
  const requestFn = useServerFn(requestIdentityVerification);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [redacted, setRedacted] = useState(false);

  const submit = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid || !file) throw new Error("Bitte melde dich erneut an.");

      const submissionId = crypto.randomUUID();
      const { error } = await supabase.storage
        .from(IDENTITY_DOC_BUCKET)
        .upload(`${uid}/${submissionId}/${IDENTITY_DOC_KEY}.${EXT[file.type]}`, file, {
          contentType: file.type,
          upsert: false,
        });
      if (error) throw new Error("Upload fehlgeschlagen.");
      return requestFn({ data: { submissionId, note: note.trim() || undefined } });
    },
    onSuccess: (res) => {
      toast.success(
        res.alreadyPending
          ? "Deine Anfrage liegt bereits bei uns."
          : "Ausweiskopie eingereicht. Wir prüfen sie und melden uns.",
      );
      onSubmitted();
    },
    onError: (e) => {
      const m = (e as Error).message ?? "";
      toast.error(
        m.startsWith("Upload") || m.startsWith("Bitte")
          ? m
          : "Das hat nicht geklappt. Bitte versuche es später noch einmal.",
      );
    },
  });

  function pick(f: File | undefined) {
    if (!f) return;
    if (!ALLOWED.includes(f.type)) {
      toast.error("Erlaubt sind Fotos (JPG, PNG, WebP) und PDF.");
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error("Die Datei ist größer als 10 MB.");
      return;
    }
    setFile(f);
  }

  return (
    <div className="space-y-4">
      <IdCheckNotice />

      <div className="space-y-1.5">
        <Label htmlFor="identity-file" className="flex items-center gap-1.5 text-xs">
          <FileUp className="size-3.5" />
          Foto deines Ausweises (geschwärzt)
        </Label>
        <Input
          id="identity-file"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={(e) => pick(e.target.files?.[0])}
        />
        {file && <p className="truncate text-[11px] text-muted-foreground">{file.name}</p>}
      </div>

      <Textarea
        value={note}
        maxLength={500}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional: Hinweis für unser Team (z. B. Link zu deiner Website)"
        className="min-h-20 text-sm"
      />

      <div className="flex items-start gap-3">
        <Checkbox
          id="identity-redacted"
          checked={redacted}
          onCheckedChange={(v) => setRedacted(v === true)}
          className="mt-0.5"
        />
        <Label htmlFor="identity-redacted" className="text-xs font-normal leading-relaxed">
          {ID_REDACTION_CONFIRMATION}
        </Label>
      </div>

      <Button className="w-full" disabled={!file || !redacted || submit.isPending} onClick={() => submit.mutate()}>
        {submit.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
        Zur Prüfung einreichen
      </Button>
    </div>
  );
}

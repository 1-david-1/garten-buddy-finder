import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { IdCheckNotice } from "@/components/youth-protection-rules";
import { ID_CONSENT_TEXT, ID_CONSENT_VERSION, ID_REDACTION_CONFIRMATION } from "@/lib/consent-texts";
import {
  IMAGE_ACCEPT,
  ImageValidationError,
  UPLOAD_EXT,
  UPLOAD_MIME,
  assertImageFile,
  prepareImageForUpload,
} from "@/lib/image-upload";
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

/**
 * Ausweisprüfung für Erwachsene, Profis und Auftraggeber:
 * geschwärzte Ausweiskopie hochladen (Hinweistext siehe IdCheckNotice).
 */
export function IdentityDocumentForm({ onSubmitted }: { onSubmitted: () => void }) {
  const requestFn = useServerFn(requestIdentityVerification);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [redacted, setRedacted] = useState(false);
  const [consent, setConsent] = useState(false);

  const submit = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid || !file) throw new Error("Bitte melde dich erneut an.");

      // Nur echte Bilder: Typ + Magic Bytes prüfen, Bild neu erzeugen (entfernt versteckte Daten/EXIF).
      let prepared: File;
      try {
        prepared = await prepareImageForUpload(file, { maxBytes: MAX_BYTES });
      } catch (e) {
        if (e instanceof ImageValidationError) throw new Error(`Bitte wähle ein anderes Bild. ${e.message}`);
        throw e;
      }

      const submissionId = crypto.randomUUID();
      const { error } = await supabase.storage
        .from(IDENTITY_DOC_BUCKET)
        .upload(`${uid}/${submissionId}/${IDENTITY_DOC_KEY}.${UPLOAD_EXT}`, prepared, {
          contentType: UPLOAD_MIME,
          upsert: false,
        });
      if (error) throw new Error("Upload fehlgeschlagen.");
      return requestFn({
        data: { submissionId, note: note.trim() || undefined, consentVersion: ID_CONSENT_VERSION },
      });
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
      console.error("[Ausweisprüfung]", e);
      const text = m.includes("server_misconfigured")
        ? "Der Server ist noch nicht vollständig eingerichtet (Service-Schlüssel fehlt). Bitte informiere den Betreiber."
        : m.startsWith("Upload") || m.startsWith("Bitte")
          ? m
          : "Das hat nicht geklappt. Bitte versuche es später noch einmal.";
      toast.error(text, m && text !== m ? { description: m.slice(0, 160) } : undefined);
    },
  });

  async function pick(input: HTMLInputElement) {
    const f = input.files?.[0];
    if (!f) return;
    try {
      await assertImageFile(f, MAX_BYTES);
      setFile(f);
    } catch (e) {
      setFile(null);
      input.value = "";
      toast.error(e instanceof ImageValidationError ? e.message : "Die Datei konnte nicht geprüft werden.");
    }
  }

  return (
    <div className="space-y-4">
      <IdCheckNotice />

      <div className="space-y-1.5">
        <Label htmlFor="identity-file" className="flex items-center gap-1.5 text-xs">
          <FileUp className="size-3.5" />
          Foto deines Ausweises (geschwärzt, nur JPG, PNG oder WebP)
        </Label>
        <Input
          id="identity-file"
          type="file"
          accept={IMAGE_ACCEPT}
          onChange={(e) => void pick(e.target)}
        />
        <p className="text-[11px] text-muted-foreground">
          Nur Bilder (JPG, PNG, WebP), höchstens 10 MB. PDFs und andere Dateien werden abgelehnt. Das Bild wird vor dem
          Hochladen neu erzeugt, dabei fallen versteckte Zusatzdaten und Standortdaten (EXIF) weg.
        </p>
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

      <div className="flex items-start gap-3">
        <Checkbox
          id="identity-consent"
          checked={consent}
          onCheckedChange={(v) => setConsent(v === true)}
          className="mt-0.5"
        />
        <Label htmlFor="identity-consent" className="text-xs font-normal leading-relaxed">
          {ID_CONSENT_TEXT}{" "}
          <a href="/datenschutz" target="_blank" rel="noreferrer" className="text-primary underline">
            Datenschutzerklärung
          </a>
        </Label>
      </div>

      <Button
        className="w-full"
        disabled={!file || !redacted || !consent || submit.isPending}
        onClick={() => submit.mutate()}
      >
        {submit.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
        Zur Prüfung einreichen
      </Button>
    </div>
  );
}

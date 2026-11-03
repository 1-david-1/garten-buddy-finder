import { useEffect, useMemo, useRef, useState } from "react";
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
import GlassFolder, { GLASS_FOLDER_DE, type FolderFile } from "@/components/ui/glass-folder";
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
  // Gewähltes Foto samt Vorschau-URL (nur im Browser, wird nach dem Wechsel wieder freigegeben)
  const [picked, setPicked] = useState<{ file: File; url: string } | null>(null);
  const file = picked?.file ?? null;
  const inputRef = useRef<HTMLInputElement>(null);
  const pickedUrlRef = useRef<string | null>(null);
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

  function replacePicked(next: { file: File; url: string } | null) {
    if (pickedUrlRef.current) URL.revokeObjectURL(pickedUrlRef.current);
    pickedUrlRef.current = next?.url ?? null;
    setPicked(next);
  }

  // Beim Verlassen der Seite die Vorschau-URL freigeben
  useEffect(
    () => () => {
      if (pickedUrlRef.current) URL.revokeObjectURL(pickedUrlRef.current);
    },
    [],
  );

  async function pick(input: HTMLInputElement) {
    const f = input.files?.[0];
    if (!f) return;
    try {
      await assertImageFile(f, MAX_BYTES);
      replacePicked({ file: f, url: URL.createObjectURL(f) });
    } catch (e) {
      replacePicked(null);
      input.value = "";
      toast.error(e instanceof ImageValidationError ? e.message : "Die Datei konnte nicht geprüft werden.");
    }
  }

  // Der Ordner zeigt das gewählte Foto als Datei. Das Objekt bleibt gleich, solange das Foto gleich bleibt.
  const folderFiles = useMemo<FolderFile[]>(
    () =>
      picked
        ? [
            {
              name: "Ausweis (geschwärzt)",
              meta: (picked.file.size / 1024 / 1024).toFixed(1).replace(".", ",") + " MB",
              image: picked.url,
            },
          ]
        : [],
    [picked],
  );

  return (
    <div className="space-y-4">
      <IdCheckNotice />

      <div className="flex flex-col items-center gap-3 rounded-xl border border-glass-border p-4">
        <GlassFolder
          width={250}
          label="Ausweis"
          meta={picked ? "Foto bereit" : "Noch leer"}
          tone="light"
          art="verdant"
          seed={7}
          strings={GLASS_FOLDER_DE}
          controlledFiles={folderFiles}
          action="add"
          onAddRequest={() => inputRef.current?.click()}
        />
        <p className="text-center text-[11px] text-muted-foreground">
          {picked
            ? "Dein Foto liegt im Ordner. Klicke auf den Ordner, um es dir anzusehen."
            : "Tippe auf das Plus, um das Foto deines Ausweises in den Ordner zu legen."}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          <FileUp className="mr-1.5 size-3.5" />
          {picked ? "Anderes Foto wählen" : "Foto auswählen"}
        </Button>
        <Label htmlFor="identity-file" className="sr-only">
          Foto deines Ausweises (geschwärzt, nur JPG, PNG oder WebP)
        </Label>
        <Input
          ref={inputRef}
          id="identity-file"
          type="file"
          accept={IMAGE_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => void pick(e.target)}
        />
        <p className="text-center text-[11px] text-muted-foreground">
          Nur Bilder (JPG, PNG, WebP), höchstens 10 MB. PDFs und andere Dateien werden abgelehnt. Das Bild wird vor dem
          Hochladen neu erzeugt, dabei fallen versteckte Zusatzdaten und Standortdaten (EXIF) weg.
        </p>
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

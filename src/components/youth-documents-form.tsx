import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { ExternalLink, FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import GlassFolder, { GLASS_FOLDER_DE, type FolderFile } from "@/components/ui/glass-folder";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IdCheckNotice, YouthProtectionRules } from "@/components/youth-protection-rules";
import { ID_REDACTION_CONFIRMATION } from "@/lib/consent-texts";
import {
  IMAGE_ACCEPT,
  ImageValidationError,
  UPLOAD_EXT,
  UPLOAD_MIME,
  assertImageFile,
  prepareImageForUpload,
} from "@/lib/image-upload";
import { supabase } from "@/integrations/supabase/client";
import {
  submitYouthVerification,
  YOUTH_DOC_BUCKET,
  YOUTH_DOC_KEYS,
  PARENT_ID_KEYS,
  type YouthDocKey,
} from "@/lib/youth-verification.functions";

const MAX_BYTES = 10 * 1024 * 1024;

const LABELS: Record<YouthDocKey, { label: string; hint?: string }> = {
  consent: {
    label: "Einverständniserklärung der Eltern (unterschrieben)",
    hint: "Foto oder Scan als Bild",
  },
  parent_id_front: { label: "Ausweis Elternteil – Vorderseite" },
  parent_id_back: { label: "Ausweis Elternteil – Rückseite" },
  child_id_front: { label: "Ausweis Kind – Vorderseite" },
  child_id_back: { label: "Ausweis Kind – Rückseite" },
};

/** Kurznamen für die Dateien im Ordner. */
const SHORT: Record<YouthDocKey, string> = {
  consent: "Einverständnis Eltern",
  parent_id_front: "Ausweis Eltern vorn",
  parent_id_back: "Ausweis Eltern hinten",
  child_id_front: "Ausweis Kind vorn",
  child_id_back: "Ausweis Kind hinten",
};

/** Unterlagen für die Verifizierung Jugendlicher: Einverständnis + Ausweise (Eltern und Kind). */
export function YouthDocumentsForm({
  onSubmitted,
  parentIdCovered = false,
}: {
  onSubmitted: () => void;
  /** Der Ausweis des Elternteils liegt schon im Eltern-Konto (eingereicht oder geprüft) */
  parentIdCovered?: boolean;
}) {
  const submitFn = useServerFn(submitYouthVerification);
  const [guardianName, setGuardianName] = useState("");
  const [files, setFiles] = useState<Partial<Record<YouthDocKey, File>>>({});
  const [accepted, setAccepted] = useState(false);

  // Nur die Unterlagen, die noch fehlen: Den Ausweis der Eltern liefert dann das Eltern-Konto.
  const keys = useMemo(
    () => YOUTH_DOC_KEYS.filter((k) => !(parentIdCovered && PARENT_ID_KEYS.includes(k))),
    [parentIdCovered],
  );

  // Vorschau-URLs und stabile Ordner-Dateien je gewähltem Foto (nur im Browser)
  const previews = useRef(new Map<File, string>());
  const folderCache = useRef(new WeakMap<File, FolderFile>());
  const inputRefs = useRef<Partial<Record<YouthDocKey, HTMLInputElement | null>>>({});
  useEffect(() => {
    const map = previews.current;
    return () => {
      map.forEach((url) => URL.revokeObjectURL(url));
      map.clear();
    };
  }, []);

  const folderFiles = useMemo<FolderFile[]>(
    () =>
      keys
        .filter((k) => files[k])
        .map((k) => {
          const f = files[k]!;
          let entry = folderCache.current.get(f);
          if (!entry) {
            entry = {
              name: SHORT[k],
              meta: (f.size / 1024 / 1024).toFixed(1).replace(".", ",") + " MB",
              image: previews.current.get(f),
            };
            folderCache.current.set(f, entry);
          }
          return entry;
        }),
    [files, keys],
  );

  const complete = keys.every((k) => files[k]) && guardianName.trim().length >= 2;

  const submit = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Bitte melde dich erneut an.");

      const submissionId = crypto.randomUUID();
      for (const key of keys) {
        // Nur echte Bilder: Typ + Magic Bytes prüfen, Bild neu erzeugen (entfernt versteckte Daten/EXIF).
        let prepared: File;
        try {
          prepared = await prepareImageForUpload(files[key]!, { maxBytes: MAX_BYTES });
        } catch (e) {
          if (e instanceof ImageValidationError) {
            throw new Error(`Bitte wähle ein anderes Bild (${LABELS[key].label}). ${e.message}`);
          }
          throw e;
        }
        const { error } = await supabase.storage
          .from(YOUTH_DOC_BUCKET)
          .upload(`${uid}/${submissionId}/${key}.${UPLOAD_EXT}`, prepared, {
            contentType: UPLOAD_MIME,
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

  async function pick(key: YouthDocKey, input: HTMLInputElement) {
    const file = input.files?.[0];
    if (!file) return;
    try {
      await assertImageFile(file, MAX_BYTES);
      previews.current.set(file, URL.createObjectURL(file));
      setFiles((prev) => {
        const old = prev[key];
        if (old) {
          const url = previews.current.get(old);
          if (url) URL.revokeObjectURL(url);
          previews.current.delete(old);
        }
        return { ...prev, [key]: file };
      });
    } catch (e) {
      setFiles((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      input.value = "";
      toast.error(e instanceof ImageValidationError ? e.message : "Die Datei konnte nicht geprüft werden.");
    }
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

      <div className="flex flex-col items-center gap-2 rounded-xl border border-glass-border p-4">
        <GlassFolder
          width={250}
          label="Unterlagen"
          meta={folderFiles.length + " von " + keys.length + " Unterlagen"}
          tone="light"
          art="verdant"
          seed={11}
          strings={GLASS_FOLDER_DE}
          controlledFiles={folderFiles}
          action="add"
          onAddRequest={() => {
            const next = keys.find((k) => !files[k]) ?? keys[0];
            inputRefs.current[next]?.click();
          }}
        />
        <p className="text-center text-[11px] text-muted-foreground">
          Jedes Foto, das du unten auswählst, landet in der Mappe. Mit dem Plus öffnest du die nächste fehlende Unterlage.
        </p>
      </div>

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

      {parentIdCovered && (
        <p className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-xs">
          Den Ausweis deines Elternteils musst du <strong>nicht nochmal</strong> hochladen: Er wurde schon im
          Eltern-Konto eingereicht. Hier fehlen nur noch die Einverständniserklärung und dein eigener Ausweis.
        </p>
      )}

      {keys.map((key) => (
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
            ref={(el) => {
              inputRefs.current[key] = el;
            }}
            id={`doc-${key}`}
            type="file"
            accept={IMAGE_ACCEPT}
            onChange={(e) => void pick(key, e.target)}
          />
          <p className="text-[11px] text-muted-foreground">
            Nur Bilder (JPG, PNG, WebP), höchstens 10 MB. Auch die unterschriebene Einverständniserklärung bitte als
            Foto oder Scan-Bild hochladen, nicht als PDF.
          </p>
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

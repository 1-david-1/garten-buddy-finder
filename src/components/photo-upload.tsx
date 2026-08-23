import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const MAX_PHOTOS = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB, muss zum Bucket-Limit in der Migration passen
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Extrahiert den Storage-Pfad aus einer öffentlichen Supabase-Storage-URL. */
function pathFromPublicUrl(url: string): string | null {
  const marker = "/listing-photos/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

export function PhotoUpload({
  helperId,
  listingId,
  photos,
  onChange,
  disabled,
}: {
  helperId: string;
  listingId: string;
  photos: string[];
  onChange: (photos: string[]) => void;
  disabled?: boolean;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      toast.error(`Maximal ${MAX_PHOTOS} Fotos pro Angebot.`);
      return;
    }

    const toUpload = Array.from(files).slice(0, remaining);
    setIsUploading(true);
    try {
      const uploadedUrls: string[] = [];
      for (const file of toUpload) {
        if (!ALLOWED_TYPES.includes(file.type)) {
          toast.error(`${file.name}: nur JPEG, PNG oder WebP erlaubt.`);
          continue;
        }
        if (file.size > MAX_FILE_SIZE) {
          toast.error(`${file.name}: Datei zu groß (max. 5 MB).`);
          continue;
        }

        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `${helperId}/${listingId}/${crypto.randomUUID()}.${ext}`;

        const { error } = await supabase.storage
          .from("listing-photos")
          .upload(path, file, {
            cacheControl: "3600",
            upsert: false,
          });
        if (error) {
          toast.error(
            `${file.name}: Upload fehlgeschlagen (${error.message}).`,
          );
          continue;
        }

        const { data } = supabase.storage
          .from("listing-photos")
          .getPublicUrl(path);
        uploadedUrls.push(data.publicUrl);
      }

      if (uploadedUrls.length > 0) {
        onChange([...photos, ...uploadedUrls]);
      }
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemove(url: string) {
    const path = pathFromPublicUrl(url);
    onChange(photos.filter((p) => p !== url));
    if (path) {
      const { error } = await supabase.storage
        .from("listing-photos")
        .remove([path]);
      if (error) {
        // Nicht kritisch: das Bild ist aus dem Angebot entfernt, auch wenn
        // die Datei im Storage übrig bleibt (verwaist, aber nicht sichtbar).
        console.error(
          "Foto konnte nicht aus dem Storage gelöscht werden:",
          error.message,
        );
      }
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((url) => (
          <div
            key={url}
            className="group relative aspect-square overflow-hidden rounded-xl border border-glass-border"
          >
            <img
              src={url}
              alt="Angebotsfoto"
              className="h-full w-full object-cover"
            />
            <button
              type="button"
              onClick={() => handleRemove(url)}
              disabled={disabled}
              className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 backdrop-blur transition group-hover:opacity-100 disabled:opacity-0"
              aria-label="Foto entfernen"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}

        {photos.length < MAX_PHOTOS && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || isUploading}
            className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-glass-border bg-glass/30 text-muted-foreground transition hover:border-primary/40 hover:text-primary disabled:opacity-50"
          >
            {isUploading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <ImagePlus className="size-5" />
            )}
            <span className="text-xs">Foto hinzufügen</span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <p className="text-xs text-muted-foreground">
        Bis zu {MAX_PHOTOS} Fotos, je max. 5 MB (JPEG, PNG, WebP).
      </p>
    </div>
  );
}

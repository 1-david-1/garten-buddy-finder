/**
 * Sichere Bild-Uploads: nur echte Bilder (JPG, PNG, WebP), keine PDFs, SVGs oder sonstigen Dateien.
 *
 * Schutzschichten (Browser, vor dem Upload):
 *  1. Dateigröße und deklarierter Typ (file.type) werden geprüft.
 *  2. Die ersten Bytes ("Magic Bytes") müssen zu einem erlaubten Bildformat passen. Eine
 *     umbenannte .exe, .html, .svg oder .pdf wird so erkannt.
 *  3. Das Bild wird tatsächlich dekodiert und neu als JPEG gezeichnet (Canvas). Dabei fallen
 *     eingebettete Zusatzdaten (versteckter Code, Skripte, EXIF mit GPS-Position) weg.
 *     Es wird immer nur dieses neu erzeugte Bild hochgeladen.
 *
 * Schutzschicht auf dem Server: Die Storage-Buckets erlauben nur image/jpeg, image/png und
 * image/webp (Migration 20261021000100_input_hardening.sql).
 */

export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedImageMime = (typeof IMAGE_MIME_TYPES)[number];

/** Wert für das accept-Attribut von <input type="file"> */
export const IMAGE_ACCEPT = IMAGE_MIME_TYPES.join(",");

/** Aus jedem hochgeladenen Bild wird ein JPEG. */
export const UPLOAD_MIME: AllowedImageMime = "image/jpeg";
export const UPLOAD_EXT = "jpg";

export class ImageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageValidationError";
  }
}

function ascii(bytes: Uint8Array, from: number, to: number): string {
  let out = "";
  for (let i = from; i < to && i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

/** Erkennt das echte Bildformat anhand der ersten Bytes. null = kein erlaubtes Bild. */
export function sniffImageType(bytes: Uint8Array): AllowedImageMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    ascii(bytes, 1, 4) === "PNG" &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "image/webp";
  return null;
}

/** Schnellprüfung ohne Dekodieren (Größe, deklarierter Typ, Magic Bytes). */
export async function assertImageFile(file: File, maxBytes: number): Promise<AllowedImageMime> {
  if (file.size === 0) throw new ImageValidationError("Die Datei ist leer.");
  if (file.size > maxBytes) {
    throw new ImageValidationError(`Die Datei ist größer als ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  }
  if (!(IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
    throw new ImageValidationError("Erlaubt sind nur Bilder (JPG, PNG oder WebP). PDFs und andere Dateien sind nicht möglich.");
  }
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const real = sniffImageType(head);
  if (!real || real !== file.type) {
    throw new ImageValidationError("Die Datei ist kein gültiges Bild (JPG, PNG oder WebP).");
  }
  return real;
}

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file);
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      // weiter mit dem <img>-Fallback
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("decode"));
      img.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => undefined };
  } catch {
    throw new ImageValidationError("Das Bild konnte nicht gelesen werden. Bitte wähle eine andere Datei.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface PrepareOptions {
  /** Maximale Größe der gewählten Datei in Bytes. */
  maxBytes: number;
  /** Längste Bildkante nach der Umwandlung (Standard 2400 px). */
  maxDimension?: number;
  /** JPEG-Qualität 0..1 (Standard 0.9). */
  quality?: number;
  /** Mindestkante, damit ein Ausweis lesbar bleibt (Standard 200 px). */
  minDimension?: number;
}

/**
 * Prüft die Datei und liefert ein neu erzeugtes, bereinigtes JPEG zum Hochladen.
 * Wirft ImageValidationError mit einer verständlichen deutschen Meldung.
 */
export async function prepareImageForUpload(file: File, opts: PrepareOptions): Promise<File> {
  await assertImageFile(file, opts.maxBytes);

  const maxDim = opts.maxDimension ?? 2400;
  const minDim = opts.minDimension ?? 200;
  const decoded = await decode(file);
  try {
    const { width, height } = decoded;
    if (!width || !height || width > 20000 || height > 20000) {
      throw new ImageValidationError("Die Bildmaße sind ungültig.");
    }
    if (Math.min(width, height) < minDim) {
      throw new ImageValidationError("Das Bild ist zu klein. Bitte lade ein größeres, gut lesbares Foto hoch.");
    }
    const scale = Math.min(1, maxDim / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ImageValidationError("Das Bild konnte nicht verarbeitet werden.");
    ctx.fillStyle = "#ffffff"; // PNG-Transparenz auf Weiß setzen
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(decoded.source, 0, 0, w, h);

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, UPLOAD_MIME, opts.quality ?? 0.9));
    if (!blob || blob.size === 0) throw new ImageValidationError("Das Bild konnte nicht verarbeitet werden.");
    if (blob.size > opts.maxBytes) {
      throw new ImageValidationError(`Das Bild ist nach der Verarbeitung noch größer als ${Math.round(opts.maxBytes / 1024 / 1024)} MB.`);
    }
    return new File([blob], `upload.${UPLOAD_EXT}`, { type: UPLOAD_MIME });
  } finally {
    decoded.close();
  }
}

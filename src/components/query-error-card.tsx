import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/** Extracts a readable message from whatever react-query hands us as `error`. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  // Supabase's PostgrestError (and errors serialized across the server-fn
  // boundary) are plain objects like { message, code, details, hint } —
  // NOT instances of Error, so the check above misses them.
  if (error && typeof error === "object") {
    const obj = error as Record<string, unknown>;
    const parts = [obj.message, obj.details, obj.hint].filter(
      (p): p is string => typeof p === "string" && p.length > 0,
    );
    if (parts.length > 0) {
      return obj.code
        ? `${parts.join(" — ")} (${obj.code})`
        : parts.join(" — ");
    }
    // Last resort: dump the object so at least something debuggable shows
    // up instead of a generic, useless message.
    try {
      const json = JSON.stringify(obj);
      if (json && json !== "{}") return json;
    } catch {
      // ignore, fall through
    }
  }

  return "Unbekannter Fehler beim Laden der Daten.";
}

export function QueryErrorCard({ error }: { error: unknown }) {
  return (
    <Card className="border-red-400/30 bg-red-400/5">
      <CardContent className="flex items-start gap-3 py-4">
        <AlertTriangle className="size-5 text-red-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-red-400">Fehler beim Laden</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            {errorMessage(error)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

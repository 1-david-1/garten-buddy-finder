import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/** Extracts a readable message from whatever react-query hands us as `error`. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
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

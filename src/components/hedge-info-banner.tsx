import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { HEDGE_BANNER } from "@/lib/consent-texts";

/**
 * Kurzer Info-Banner für Eltern im Eltern-Konto: Heckenschnitt durch Jugendliche.
 * Die Buttons ("Trotzdem erlauben" / "Nicht erlauben") übergibt die aufrufende Karte als children,
 * damit Banner und Entscheidung zusammenstehen.
 */
export function HedgeInfoBanner({ children }: { children?: ReactNode }) {
  return (
    <Alert className="border-amber-400/40 bg-amber-400/10 [&>svg]:text-amber-500" data-testid="hedge-info-banner">
      <ShieldAlert className="size-4" aria-hidden="true" />
      <div>
        <AlertTitle>{HEDGE_BANNER.title}</AlertTitle>
        <AlertDescription className="mt-2 space-y-2">
          <p>{HEDGE_BANNER.intro}</p>
          <ul className="list-disc space-y-0.5 pl-5">
            {HEDGE_BANNER.rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">{HEDGE_BANNER.note}</p>
          <p className="text-xs font-medium">{HEDGE_BANNER.confirm}</p>
          {children}
        </AlertDescription>
      </div>
    </Alert>
  );
}

import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ACTIVITY_BANNERS } from "@/lib/consent-texts";

type RiskyActivity = keyof typeof ACTIVITY_BANNERS;

/**
 * Kurzer Info-Banner für Eltern im Eltern-Konto bei Tätigkeiten mit erhöhtem Risiko (Heckenschnitt,
 * Gartenumgestaltung, Bewässerung). Die Buttons ("Trotzdem erlauben" / "Nicht erlauben") übergibt die aufrufende
 * Karte als children, damit Banner und Entscheidung zusammenstehen.
 */
export function ActivityInfoBanner({ serviceType = "heckenschnitt", children }: { serviceType?: string; children?: ReactNode }) {
  const banner = ACTIVITY_BANNERS[(serviceType in ACTIVITY_BANNERS ? serviceType : "heckenschnitt") as RiskyActivity];
  return (
    <Alert className="border-amber-400/40 bg-amber-400/10 [&>svg]:text-amber-500" data-testid="activity-info-banner">
      <ShieldAlert className="size-4" aria-hidden="true" />
      <div>
        <AlertTitle>{banner.title}</AlertTitle>
        <AlertDescription className="mt-2 space-y-2">
          <p>{banner.intro}</p>
          <ul className="list-disc space-y-0.5 pl-5">
            {banner.rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">{banner.note}</p>
          <p className="text-xs font-medium">{banner.confirm}</p>
          {children}
        </AlertDescription>
      </div>
    </Alert>
  );
}

/** Alter Name, bleibt für bestehende Importe erhalten. */
export const HedgeInfoBanner = ActivityInfoBanner;

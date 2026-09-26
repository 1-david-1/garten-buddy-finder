import { Megaphone } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useChecklist } from "@/lib/use-checklist";

const GROWTH_TIPS = [
  {
    id: "photos",
    label: "Profilfoto und Fotos früherer Arbeiten hochladen",
  },
  {
    id: "bio",
    label: "Aussagekräftige Beschreibung deiner Leistungen schreiben",
  },
  {
    id: "fast-reply",
    label: "Schnell auf Anfragen und Nachrichten antworten (unter 1 Stunde)",
  },
  {
    id: "reviews",
    label: "Nach jedem Auftrag freundlich um eine Bewertung bitten",
  },
  {
    id: "available",
    label: '"Heute verfügbar" aktivieren, wenn du wirklich Zeit hast',
  },
  {
    id: "services",
    label: "Mehrere Leistungsarten anbieten (Rasen, Hecke, Laub, ...)",
  },
  {
    id: "price",
    label: "Fairen, wettbewerbsfähigen Preis festlegen",
  },
  {
    id: "bid",
    label: "Aktiv im Marktplatz auf offene Aufträge bieten, statt zu warten",
  },
];

export function GrowthChecklistWidget({ userId }: { userId: string }) {
  const { checked, toggle } = useChecklist(`growth-checklist:${userId}`);
  const doneCount = GROWTH_TIPS.filter((tip) => checked[tip.id]).length;

  return (
    <div className="flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Megaphone className="size-4 text-primary" />
          <h3 className="font-brand font-semibold">Mehr Kunden gewinnen</h3>
        </div>
        <span className="shrink-0 text-xs font-medium text-muted-foreground">
          {doneCount}/{GROWTH_TIPS.length}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Eine kleine Checkliste, die wirklich mehr Anfragen bringt.
      </p>
      <Progress
        value={(doneCount / GROWTH_TIPS.length) * 100}
        className="mt-3 h-1.5"
      />
      <div className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1">
        {GROWTH_TIPS.map((tip) => (
          <label
            key={tip.id}
            className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1.5 py-1 text-xs transition-colors hover:bg-muted/40"
          >
            <input
              type="checkbox"
              checked={!!checked[tip.id]}
              onChange={() => toggle(tip.id)}
              className="mt-0.5 size-3.5 shrink-0 rounded border-border accent-primary"
            />
            <span
              className={
                checked[tip.id]
                  ? "text-muted-foreground line-through"
                  : "text-foreground"
              }
            >
              {tip.label}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

import { useState } from "react";
import { ClipboardCheck, MapPin } from "lucide-react";
import { useChecklist } from "@/lib/use-checklist";

export interface UpcomingJob {
  id: string;
  serviceType: string;
  description: string | null;
  address: string | null;
  scheduledAt: string | null;
  customerName: string;
}

const PACKING_ITEMS = [
  {
    id: "details",
    label: "Auftragsdetails nochmal gelesen – Adresse, Uhrzeit, Wunsch des Kunden",
  },
  {
    id: "tools",
    label: "Passendes Werkzeug eingepackt (z. B. Rasenmäher, Heckenschere, Harke)",
  },
  { id: "safety", label: "Handschuhe & Schutzausrüstung dabei" },
  { id: "water", label: "Wasser bzw. Verpflegung für dich selbst eingepackt" },
  {
    id: "photo-before",
    label: "Vorher-Foto machen (für Nachweis & spätere Bewertung)",
  },
  {
    id: "contact",
    label: "Handynummer des Kunden griffbereit, falls niemand da ist",
  },
  { id: "invoice", label: "Quittung bzw. Zahlungsbeleg vorbereitet" },
];

function formatWhen(iso: string | null, intlLocale: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(intlLocale, {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PreJobChecklistWidget({
  jobs,
  intlLocale,
}: {
  jobs: UpcomingJob[];
  intlLocale: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const job = jobs[activeIndex];
  const { checked, toggle } = useChecklist(
    job ? `pre-job-checklist:${job.id}` : "pre-job-checklist:none",
  );
  const doneCount = PACKING_ITEMS.filter((item) => checked[item.id]).length;

  if (!job) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <ClipboardCheck className="size-6 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          Sobald ein Auftrag bestätigt ist, siehst du hier vor dem Einsatz
          nochmal alle Details und eine Packliste.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="size-4 text-primary" />
          <h3 className="font-brand font-semibold">Vor dem Einsatz</h3>
        </div>
        <span className="shrink-0 text-xs font-medium text-muted-foreground">
          {doneCount}/{PACKING_ITEMS.length}
        </span>
      </div>

      {jobs.length > 1 && (
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
          {jobs.map((j, i) => (
            <button
              key={j.id}
              type="button"
              onClick={() => setActiveIndex(i)}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                i === activeIndex
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {j.customerName}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 space-y-1.5 rounded-xl border border-border/60 bg-muted/20 p-3 text-xs">
        <p>
          <span className="text-muted-foreground">Kunde: </span>
          <span className="font-medium text-foreground">{job.customerName}</span>
        </p>
        <p>
          <span className="text-muted-foreground">Was wollte der Kunde: </span>
          <span className="font-medium text-foreground">
            {job.serviceType}
            {job.description ? ` – ${job.description}` : ""}
          </span>
        </p>
        <p>
          <span className="text-muted-foreground">Termin: </span>
          <span className="font-medium text-foreground">
            {formatWhen(job.scheduledAt, intlLocale)}
          </span>
        </p>
        <p className="flex items-start gap-1">
          <MapPin className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
          <span className="font-medium text-foreground">
            {job.address ?? "—"}
          </span>
        </p>
      </div>

      <div className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1">
        {PACKING_ITEMS.map((item) => (
          <label
            key={item.id}
            className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1.5 py-1 text-xs transition-colors hover:bg-muted/40"
          >
            <input
              type="checkbox"
              checked={!!checked[item.id]}
              onChange={() => toggle(item.id)}
              className="mt-0.5 size-3.5 shrink-0 rounded border-border accent-primary"
            />
            <span
              className={
                checked[item.id]
                  ? "text-muted-foreground line-through"
                  : "text-foreground"
              }
            >
              {item.label}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

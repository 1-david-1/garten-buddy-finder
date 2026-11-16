"use client";

import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Copy, Eraser, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { getMyRecurringBlocks, saveMyRecurringBlocks } from "@/lib/helper-blocks.functions";
import {
  GRID_HOURS,
  GRID_WEEKDAYS,
  countBlockedHours,
  emptyGrid,
  gridToRules,
  rulesToGrid,
  type BlockGrid,
} from "@/lib/recurring-blocks";

const QUERY_KEY = ["my-recurring-blocks"];

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

interface Props {
  /** "card": Karte für das Profil; "pill": kleiner Button (z. B. im Dashboard) */
  variant?: "card" | "pill";
  pillLabel?: string;
}

export function RecurringBlocksCard({ variant = "card", pillLabel = "Stundenplan & Sperrzeiten" }: Props) {
  const queryClient = useQueryClient();
  const getFn = useServerFn(getMyRecurringBlocks);
  const saveFn = useServerFn(saveMyRecurringBlocks);

  const [open, setOpen] = useState(false);
  const [grid, setGrid] = useState<BlockGrid>(emptyGrid());
  const [label, setLabel] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");

  const blocksQuery = useQuery({ queryKey: QUERY_KEY, queryFn: () => getFn() });

  // Beim Öffnen den gespeicherten Stand ins Formular laden
  useEffect(() => {
    if (!open) return;
    const blocks = blocksQuery.data?.blocks ?? [];
    setGrid(rulesToGrid(blocks));
    setLabel(blocks.find((b) => b.label)?.label ?? "");
    setValidFrom(blocks.find((b) => b.validFrom)?.validFrom?.slice(0, 10) ?? "");
    setValidUntil(blocks.find((b) => b.validUntil)?.validUntil?.slice(0, 10) ?? "");
    // nur beim Öffnen laden - sonst würde ein Hintergrund-Refresh Eingaben überschreiben
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const saveMutation = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          blocks: gridToRules(grid, { label, validFrom: validFrom || null, validUntil: validUntil || null }).map((r) => ({
            weekday: r.weekday,
            startTime: r.startTime,
            endTime: r.endTime,
            label: r.label ?? null,
            validFrom: r.validFrom ?? null,
            validUntil: r.validUntil ?? null,
          })),
        },
      }),
    onSuccess: () => {
      toast.success("Sperrzeiten gespeichert. Nur noch freie Zeiten sind buchbar.");
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setOpen(false);
    },
    onError: (err) => toast.error((err as Error).message),
  });

  // ---- Raster bedienen: anklicken oder mit gedrückter Maus/Finger über mehrere Zellen ziehen ----
  const paintValue = useRef<boolean | null>(null);

  const setCell = (day: number, hour: number, value: boolean) =>
    setGrid((g) => {
      if (g[day][hour] === value) return g;
      return g.map((row, d) => (d === day ? row.map((c, h) => (h === hour ? value : c)) : row));
    });

  const cellFromPoint = (x: number, y: number): { day: number; hour: number } | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-cell]");
    if (!el) return null;
    return { day: Number(el.dataset.day), hour: Number(el.dataset.hour) };
  };

  const toggleDay = (day: number) =>
    setGrid((g) => {
      const allBlocked = g[day].every(Boolean);
      return g.map((row, d) => (d === day ? row.map(() => !allBlocked) : row));
    });

  const copyMondayToWeekdays = () =>
    setGrid((g) => g.map((row, d) => (d >= 1 && d <= 4 ? [...g[0]] : row)));

  const blockedHours = countBlockedHours(grid);
  const savedHours = countBlockedHours(rulesToGrid(blocksQuery.data?.blocks ?? []));

  const dialog = (
    <Dialog open={open} onOpenChange={setOpen}>
      {variant === "pill" ? (
        <DialogTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-2xl border border-glass-border bg-glass px-4 py-2.5 text-sm font-medium backdrop-blur transition-colors hover:bg-muted/60"
          >
            <CalendarClock className="size-4 text-muted-foreground" />
            {pillLabel}
          </button>
        </DialogTrigger>
      ) : (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <CalendarClock className="size-4" />
            {savedHours > 0 ? "Sperrzeiten bearbeiten" : "Stundenplan eintragen"}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Stundenplan & wiederkehrende Sperrzeiten</DialogTitle>
          <DialogDescription>
            Markiere die Zeiten, in denen du jede Woche nicht arbeiten kannst (zum Beispiel Schule). Klicke Felder an oder
            ziehe mit gedrückter Maus bzw. dem Finger darüber. Dann sind nur noch deine freien Zeiten buchbar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div
            className="select-none overflow-x-auto"
            style={{ touchAction: "none" }}
            onPointerMove={(e) => {
              if (paintValue.current === null) return;
              const cell = cellFromPoint(e.clientX, e.clientY);
              if (cell) setCell(cell.day, cell.hour, paintValue.current);
            }}
            onPointerUp={() => {
              paintValue.current = null;
            }}
            onPointerCancel={() => {
              paintValue.current = null;
            }}
            onPointerLeave={() => {
              paintValue.current = null;
            }}
          >
            <table className="w-full min-w-[300px] border-separate border-spacing-1 text-xs">
              <thead>
                <tr>
                  <th className="w-12" />
                  {GRID_WEEKDAYS.map((d, day) => (
                    <th key={d.iso} className="p-0 font-medium">
                      <button
                        type="button"
                        onClick={() => toggleDay(day)}
                        title={`${d.long}: ganzen Tag sperren oder freigeben`}
                        className="w-full rounded-md py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        {d.short}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {GRID_HOURS.map((hour, hourIdx) => (
                  <tr key={hour}>
                    <td className="pr-1 text-right text-muted-foreground">{hh(hour)}</td>
                    {GRID_WEEKDAYS.map((d, day) => {
                      const blocked = grid[day][hourIdx];
                      return (
                        <td key={d.iso} className="p-0">
                          <button
                            type="button"
                            data-cell
                            data-day={day}
                            data-hour={hourIdx}
                            aria-pressed={blocked}
                            aria-label={`${d.long} ${hh(hour)} bis ${hh(hour + 1)}: ${blocked ? "gesperrt" : "frei"}`}
                            onPointerDown={(e) => {
                              e.preventDefault();
                              paintValue.current = !blocked;
                              setCell(day, hourIdx, !blocked);
                            }}
                            onClick={(e) => {
                              // Tastatur (Enter/Leertaste): Mausklicks sind über onPointerDown schon erledigt
                              if (e.detail === 0) setCell(day, hourIdx, !blocked);
                            }}
                            className={cn(
                              "h-7 w-full rounded-md border transition-colors",
                              blocked
                                ? "border-destructive/40 bg-destructive/20 hover:bg-destructive/30"
                                : "border-border/40 bg-muted/30 hover:bg-muted",
                            )}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-3 rounded border border-destructive/40 bg-destructive/20" /> gesperrt
              <span className="ml-2 size-3 rounded border border-border/40 bg-muted/30" /> frei
            </span>
            <span className="ml-auto text-xs font-medium">
              {blockedHours === 0 ? "Keine Sperrzeiten" : `${blockedHours} Stunden pro Woche gesperrt`}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={copyMondayToWeekdays}>
              <Copy className="size-3.5" /> Montag auf Mo–Fr übertragen
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setGrid(emptyGrid())}
              disabled={blockedHours === 0}
            >
              <Eraser className="size-3.5" /> Alles freigeben
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <Label htmlFor="block-label" className="text-xs">
                Bezeichnung (nur für dich sichtbar, optional)
              </Label>
              <Input
                id="block-label"
                value={label}
                maxLength={40}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="z. B. Schule"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="block-from" className="text-xs">
                Gilt ab (optional)
              </Label>
              <Input
                id="block-from"
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="block-until" className="text-xs">
                Gilt bis (optional)
              </Label>
              <Input
                id="block-until"
                type="date"
                value={validUntil}
                min={validFrom || undefined}
                onChange={(e) => setValidUntil(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>Kunden sehen nur, dass diese Zeiten nicht buchbar sind – nicht, warum. Die Bezeichnung bleibt bei dir.</li>
            <li>Bereits gebuchte Termine bleiben bestehen. Die Sperrzeiten gelten für neue Buchungen.</li>
            <li>
              In den Ferien kannst du frei sein: Begrenze den Stundenplan mit „Gilt bis“ oder gib die Zeiten für diese Zeit
              wieder frei.
            </li>
          </ul>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Abbrechen
          </Button>
          <Button type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-2">
            {saveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (variant === "pill") return dialog;

  const summary = (() => {
    if (blocksQuery.isLoading) return "Wird geladen …";
    if (savedHours === 0) return "Noch keine Sperrzeiten eingetragen. Trage zum Beispiel deinen Stundenplan ein.";
    const days = GRID_WEEKDAYS.filter((_, d) => rulesToGrid(blocksQuery.data?.blocks ?? [])[d].some(Boolean))
      .map((d) => d.short)
      .join(", ");
    return `${savedHours} Stunden pro Woche gesperrt (${days}).`;
  })();

  return (
    <Card id="sperrzeiten" className="border-glass-border bg-glass backdrop-blur">
      <CardContent className="space-y-3 pt-5">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <CalendarClock className="size-3.5" />
          Stundenplan & Sperrzeiten
        </p>
        <p className="text-sm text-muted-foreground">{summary}</p>
        <p className="text-xs text-muted-foreground">
          Gesperrte Zeiten sind im Buchungskalender nicht buchbar – Kunden sehen nicht, warum.
        </p>
        {dialog}
      </CardContent>
    </Card>
  );
}

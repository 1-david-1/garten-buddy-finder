/**
 * Anpassbares Dashboard
 *
 * Zeigt eine Liste von Bereichen (Widgets) in einem zweispaltigen Raster und
 * lässt jede Person selbst bestimmen, was sie sieht:
 *  - Bereiche ein- und ausblenden
 *  - Reihenfolge per Ziehen oder mit den Pfeil-Tasten ändern
 *  - halbe oder ganze Breite wählen
 *  - Dichte "Bequem" oder "Kompakt"
 *  - Schnellauswahl: "Alles zeigen", "Nur das Wichtigste", "Zurücksetzen"
 *
 * Die Auswahl wird pro Dashboard-Art und Nutzer im Browser gespeichert
 * (siehe src/lib/dashboard-layout.ts).
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { ArrowDown, ArrowUp, GripVertical, RotateCcw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  defaultLayout,
  isDefaultLayout,
  layoutStorageKey,
  loadLayout,
  moveWidget,
  reconcileLayout,
  reorderWidgets,
  saveLayout,
  setDensity,
  setWidgetVisible,
  setWidgetWidth,
  showAllWidgets,
  showEssentialWidgets,
  type DashboardDensity,
  type DashboardLayout,
  type WidgetMeta,
  type WidgetPref,
  type WidgetWidth,
} from "@/lib/dashboard-layout";

export interface DashboardWidget {
  /** Stabile ID - wird gespeichert, daher nach der Veröffentlichung nicht mehr ändern. */
  id: string;
  /** Name im Anpassen-Panel. */
  title: string;
  /** Eine kurze Erklärung im Anpassen-Panel: Was sehe ich hier? */
  description: string;
  defaultWidth?: WidgetWidth;
  defaultVisible?: boolean;
  /** Gehört zur Ansicht "Nur das Wichtigste". */
  essential?: boolean;
  /** Gibt der Bereich null zurück, wird er (samt Lücke) nicht angezeigt. */
  render: () => ReactNode;
}

const DensityContext = createContext<DashboardDensity>("comfortable");

/** Bereiche können damit z. B. weniger Zeilen anzeigen, wenn "Kompakt" gewählt ist. */
export function useDashboardDensity(): DashboardDensity {
  return useContext(DensityContext);
}

const toMeta = (w: DashboardWidget): WidgetMeta => ({
  id: w.id,
  defaultWidth: w.defaultWidth ?? "half",
  defaultVisible: w.defaultVisible ?? true,
  essential: w.essential ?? false,
});

export function CustomizableDashboard({
  scope,
  widgets,
  title = "Dein Dashboard",
}: {
  /** Name dieses Dashboards, z. B. "customer" - trennt die gespeicherten Einstellungen. */
  scope: string;
  widgets: DashboardWidget[];
  title?: string;
}) {
  const { user } = useAuth();
  const storageKey = layoutStorageKey(scope, user?.id);
  const metas = useMemo(() => widgets.map(toMeta), [widgets]);
  const metasRef = useRef(metas);
  metasRef.current = metas;

  const [layout, setLayout] = useState<DashboardLayout>(() => loadLayout(storageKey, metas));
  const [panelOpen, setPanelOpen] = useState(false);

  // Meldet sich jemand später an oder wechselt das Konto, die passenden Einstellungen laden.
  const loadedKey = useRef(storageKey);
  useEffect(() => {
    if (loadedKey.current === storageKey) return;
    loadedKey.current = storageKey;
    setLayout(loadLayout(storageKey, metasRef.current));
  }, [storageKey]);

  // Abgleich bei jedem Rendern: neue Bereiche tauchen auf, entfernte verschwinden.
  const effective = useMemo(() => reconcileLayout(layout, metas), [layout, metas]);
  const byId = useMemo(() => new Map(widgets.map((w) => [w.id, w])), [widgets]);
  const customized = !isDefaultLayout(effective, metas);

  const commit = (change: (l: DashboardLayout) => DashboardLayout) => {
    const next = change(effective);
    setLayout(next);
    saveLayout(storageKey, next, metas);
  };

  const visible = effective.widgets.filter((p) => p.visible && byId.has(p.id));
  const compact = effective.density === "compact";

  return (
    <DensityContext.Provider value={effective.density}>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-brand text-xl">{title}</h2>
          {customized && (
            <p className="text-xs text-muted-foreground">
              Deine persönliche Ansicht ·{" "}
              <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground"
                onClick={() => commit(() => defaultLayout(metas))}
              >
                Zurücksetzen
              </button>
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => setPanelOpen(true)}>
          <SlidersHorizontal className="size-4" />
          Anpassen
        </Button>
      </div>

      {visible.length === 0 ? (
        <Card className="mt-4 border-glass-border bg-glass backdrop-blur">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Alle Bereiche sind ausgeblendet. Das ist okay – hol dir einfach zurück, was du brauchst.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="sm" onClick={() => commit(showAllWidgets)}>
                Alles anzeigen
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPanelOpen(true)}>
                Anpassen
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div
          className={cn(
            "mt-4 grid grid-cols-1 lg:grid-cols-2",
            compact ? "gap-3" : "gap-5",
          )}
        >
          {visible.map((pref) => {
            const widget = byId.get(pref.id)!;
            return (
              <div
                key={pref.id}
                data-widget={pref.id}
                className={cn("min-w-0 empty:hidden", pref.width === "full" && "lg:col-span-2")}
              >
                {widget.render()}
              </div>
            );
          })}
        </div>
      )}

      <CustomizePanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        layout={effective}
        widgets={byId}
        metas={metas}
        customized={customized}
        onChange={commit}
      />
    </DensityContext.Provider>
  );
}

/* ------------------------------------------------------------------ *
 * Anpassen-Panel
 * ------------------------------------------------------------------ */

function CustomizePanel({
  open,
  onOpenChange,
  layout,
  widgets,
  metas,
  customized,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layout: DashboardLayout;
  widgets: Map<string, DashboardWidget>;
  metas: WidgetMeta[];
  customized: boolean;
  onChange: (change: (l: DashboardLayout) => DashboardLayout) => void;
}) {
  const rows = layout.widgets.filter((p) => widgets.has(p.id));
  const visibleCount = rows.filter((p) => p.visible).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md">
        <SheetHeader className="space-y-1 border-b border-glass-border p-6 pr-12 text-left">
          <SheetTitle className="font-brand text-xl">Dashboard anpassen</SheetTitle>
          <SheetDescription>
            Wähle aus, was du sehen willst, und ordne es so an, wie es für dich passt. Deine Auswahl wird
            auf diesem Gerät gespeichert.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 p-6">
          <section aria-labelledby="dash-quick" className="space-y-2">
            <h3 id="dash-quick" className="text-sm font-medium">
              Schnellauswahl
            </h3>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => onChange(showAllWidgets)}>
                Alles zeigen
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onChange((l) => showEssentialWidgets(l, metas))}
              >
                Nur das Wichtigste
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5"
                disabled={!customized}
                onClick={() => onChange(() => defaultLayout(metas))}
              >
                <RotateCcw className="size-3.5" />
                Zurücksetzen
              </Button>
            </div>
          </section>

          <section aria-labelledby="dash-density" className="space-y-2">
            <h3 id="dash-density" className="text-sm font-medium">
              Darstellung
            </h3>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={layout.density}
              onValueChange={(v) => v && onChange((l) => setDensity(l, v as DashboardDensity))}
              className="justify-start"
              aria-label="Dichte der Darstellung"
            >
              <ToggleGroupItem value="comfortable" className="px-3">
                Bequem
              </ToggleGroupItem>
              <ToggleGroupItem value="compact" className="px-3">
                Kompakt
              </ToggleGroupItem>
            </ToggleGroup>
            <p className="text-xs text-muted-foreground">
              „Kompakt“ zeigt weniger Zeilen pro Bereich und kleinere Abstände.
            </p>
          </section>

          <section aria-labelledby="dash-widgets" className="space-y-2">
            <div className="flex items-baseline justify-between">
              <h3 id="dash-widgets" className="text-sm font-medium">
                Bereiche
              </h3>
              <span className="text-xs text-muted-foreground">
                {visibleCount} von {rows.length} sichtbar
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Zum Sortieren am Griff ziehen oder die Pfeil-Tasten nutzen.
            </p>
            <Reorder.Group
              axis="y"
              as="ul"
              values={rows.map((p) => p.id)}
              onReorder={(ids: string[]) => onChange((l) => reorderWidgets(l, ids))}
              className="space-y-2"
            >
              {rows.map((pref, index) => (
                <WidgetRow
                  key={pref.id}
                  pref={pref}
                  widget={widgets.get(pref.id)!}
                  isFirst={index === 0}
                  isLast={index === rows.length - 1}
                  onMove={(delta) => onChange((l) => moveWidget(l, pref.id, delta))}
                  onVisible={(v) => onChange((l) => setWidgetVisible(l, pref.id, v))}
                  onWidth={(w) => onChange((l) => setWidgetWidth(l, pref.id, w))}
                />
              ))}
            </Reorder.Group>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function WidgetRow({
  pref,
  widget,
  isFirst,
  isLast,
  onMove,
  onVisible,
  onWidth,
}: {
  pref: WidgetPref;
  widget: DashboardWidget;
  isFirst: boolean;
  isLast: boolean;
  onMove: (delta: -1 | 1) => void;
  onVisible: (visible: boolean) => void;
  onWidth: (width: WidgetWidth) => void;
}) {
  const controls = useDragControls();

  return (
    <Reorder.Item
      value={pref.id}
      as="li"
      dragListener={false}
      dragControls={controls}
      className={cn(
        "rounded-xl border border-glass-border bg-glass p-3 backdrop-blur",
        !pref.visible && "opacity-60",
      )}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={`${widget.title} verschieben`}
          onPointerDown={(e) => controls.start(e)}
          className="-ml-1 cursor-grab touch-none rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{widget.title}</p>
          <p className="line-clamp-2 text-xs text-muted-foreground">{widget.description}</p>
        </div>
        <Switch
          checked={pref.visible}
          onCheckedChange={onVisible}
          aria-label={`${widget.title} anzeigen`}
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 pl-7">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={pref.width}
          onValueChange={(v) => v && onWidth(v as WidgetWidth)}
          aria-label={`Breite von ${widget.title}`}
          disabled={!pref.visible}
        >
          <ToggleGroupItem value="half" className="px-2.5 text-xs">
            Halbe Breite
          </ToggleGroupItem>
          <ToggleGroupItem value="full" className="px-2.5 text-xs">
            Ganze Breite
          </ToggleGroupItem>
        </ToggleGroup>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={isFirst}
            aria-label={`${widget.title} nach oben`}
            onClick={() => onMove(-1)}
          >
            <ArrowUp className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={isLast}
            aria-label={`${widget.title} nach unten`}
            onClick={() => onMove(1)}
          >
            <ArrowDown className="size-4" />
          </Button>
        </div>
      </div>
    </Reorder.Item>
  );
}

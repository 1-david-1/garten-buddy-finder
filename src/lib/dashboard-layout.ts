/**
 * Anpassbares Dashboard - reine Layout-Logik (ohne React, daher gut testbar).
 *
 * Ein Dashboard besteht aus "Bereichen" (Widgets). Jede Person kann pro
 * Dashboard festlegen, welche Bereiche sichtbar sind, in welcher
 * Reihenfolge sie stehen und ob sie halbe oder ganze Breite haben.
 *
 * Die Auswahl wird im Browser gespeichert (localStorage), getrennt nach
 * Dashboard-Art und Nutzer. Es ist bewusst keine Datenbank-Migration nötig.
 *
 * Wichtig: Gespeichert wird nur, was die Person selbst geändert hat. Beim
 * Laden wird das gespeicherte Layout mit der aktuellen Bereichsliste
 * abgeglichen (reconcileLayout): neue Bereiche aus späteren Versionen
 * tauchen automatisch auf, entfernte Bereiche verschwinden.
 */

export type WidgetWidth = "half" | "full";
export type DashboardDensity = "comfortable" | "compact";

/** Die Eigenschaften eines Bereichs, die für die Logik relevant sind. */
export interface WidgetMeta {
  id: string;
  defaultWidth: WidgetWidth;
  defaultVisible: boolean;
  /** Gehört zur Ansicht "Nur das Wichtigste". */
  essential: boolean;
}

export interface WidgetPref {
  id: string;
  visible: boolean;
  width: WidgetWidth;
}

export interface DashboardLayout {
  version: 1;
  density: DashboardDensity;
  widgets: WidgetPref[];
}

export const LAYOUT_VERSION = 1 as const;

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem" | "removeItem">;

export function defaultLayout(metas: WidgetMeta[]): DashboardLayout {
  return {
    version: LAYOUT_VERSION,
    density: "comfortable",
    widgets: metas.map((m) => ({
      id: m.id,
      visible: m.defaultVisible,
      width: m.defaultWidth,
    })),
  };
}

const isWidth = (v: unknown): v is WidgetWidth => v === "half" || v === "full";

/**
 * Gleicht ein gespeichertes (unvertrauenswürdiges) Layout mit der aktuellen
 * Bereichsliste ab. Unbekannte oder doppelte Einträge fallen weg, kaputte
 * Werte werden durch Standardwerte ersetzt, neue Bereiche werden hinter
 * ihrem Vorgänger aus der Standard-Reihenfolge eingefügt.
 */
export function reconcileLayout(saved: unknown, metas: WidgetMeta[]): DashboardLayout {
  const base = defaultLayout(metas);
  if (!saved || typeof saved !== "object") return base;
  const s = saved as Partial<DashboardLayout>;
  if (s.version !== LAYOUT_VERSION || !Array.isArray(s.widgets)) return base;

  const known = new Map(metas.map((m) => [m.id, m]));
  const seen = new Set<string>();
  const result: WidgetPref[] = [];

  for (const raw of s.widgets) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Partial<WidgetPref>;
    if (typeof r.id !== "string") continue;
    const meta = known.get(r.id);
    if (!meta || seen.has(r.id)) continue;
    seen.add(r.id);
    result.push({
      id: r.id,
      visible: typeof r.visible === "boolean" ? r.visible : meta.defaultVisible,
      width: isWidth(r.width) ? r.width : meta.defaultWidth,
    });
  }

  metas.forEach((meta, index) => {
    if (seen.has(meta.id)) return;
    const prevId = index > 0 ? metas[index - 1].id : null;
    const at = prevId ? result.findIndex((w) => w.id === prevId) : -1;
    result.splice(at + 1, 0, {
      id: meta.id,
      visible: meta.defaultVisible,
      width: meta.defaultWidth,
    });
    seen.add(meta.id);
  });

  return {
    version: LAYOUT_VERSION,
    density: s.density === "compact" ? "compact" : "comfortable",
    widgets: result,
  };
}

/** Verschiebt einen Bereich um eine Position nach oben (-1) oder unten (+1). */
export function moveWidget(layout: DashboardLayout, id: string, delta: -1 | 1): DashboardLayout {
  const from = layout.widgets.findIndex((w) => w.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= layout.widgets.length) return layout;
  const widgets = [...layout.widgets];
  const [moved] = widgets.splice(from, 1);
  widgets.splice(to, 0, moved);
  return { ...layout, widgets };
}

/**
 * Übernimmt eine neue Reihenfolge (z. B. nach dem Ziehen). Unbekannte IDs
 * werden ignoriert, fehlende bleiben in ihrer bisherigen Reihenfolge am Ende.
 */
export function reorderWidgets(layout: DashboardLayout, orderedIds: string[]): DashboardLayout {
  const byId = new Map(layout.widgets.map((w) => [w.id, w]));
  const used = new Set<string>();
  const widgets: WidgetPref[] = [];
  for (const id of orderedIds) {
    const w = byId.get(id);
    if (!w || used.has(id)) continue;
    used.add(id);
    widgets.push(w);
  }
  for (const w of layout.widgets) if (!used.has(w.id)) widgets.push(w);
  return { ...layout, widgets };
}

function patchWidget(
  layout: DashboardLayout,
  id: string,
  patch: Partial<Omit<WidgetPref, "id">>,
): DashboardLayout {
  if (!layout.widgets.some((w) => w.id === id)) return layout;
  return {
    ...layout,
    widgets: layout.widgets.map((w) => (w.id === id ? { ...w, ...patch } : w)),
  };
}

export const setWidgetVisible = (layout: DashboardLayout, id: string, visible: boolean) =>
  patchWidget(layout, id, { visible });

export const setWidgetWidth = (layout: DashboardLayout, id: string, width: WidgetWidth) =>
  patchWidget(layout, id, { width });

export const setDensity = (layout: DashboardLayout, density: DashboardDensity): DashboardLayout => ({
  ...layout,
  density,
});

export const showAllWidgets = (layout: DashboardLayout): DashboardLayout => ({
  ...layout,
  widgets: layout.widgets.map((w) => ({ ...w, visible: true })),
});

/** Zeigt nur Bereiche, die als "wichtig" markiert sind. */
export function showEssentialWidgets(layout: DashboardLayout, metas: WidgetMeta[]): DashboardLayout {
  const essential = new Set(metas.filter((m) => m.essential).map((m) => m.id));
  return {
    ...layout,
    widgets: layout.widgets.map((w) => ({ ...w, visible: essential.has(w.id) })),
  };
}

export function isDefaultLayout(layout: DashboardLayout, metas: WidgetMeta[]): boolean {
  return JSON.stringify(layout) === JSON.stringify(defaultLayout(metas));
}

/* ------------------------------------------------------------------ *
 * Speicherung
 * ------------------------------------------------------------------ */

export function layoutStorageKey(scope: string, userId: string | null | undefined): string {
  return `gm-dashboard:v${LAYOUT_VERSION}:${scope}:${userId ?? "anon"}`;
}

function browserStorage(): (ReadableStorage & WritableStorage) | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    // Zugriff kann blockiert sein (z. B. strenge Datenschutz-Einstellungen).
    return null;
  }
}

export function loadLayout(
  key: string,
  metas: WidgetMeta[],
  storage: ReadableStorage | null = browserStorage(),
): DashboardLayout {
  if (!storage) return defaultLayout(metas);
  try {
    const raw = storage.getItem(key);
    return reconcileLayout(raw ? JSON.parse(raw) : null, metas);
  } catch {
    return defaultLayout(metas);
  }
}

/** Speichert das Layout; ein unverändertes Standard-Layout wird entfernt. */
export function saveLayout(
  key: string,
  layout: DashboardLayout,
  metas: WidgetMeta[],
  storage: WritableStorage | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    if (isDefaultLayout(layout, metas)) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(layout));
  } catch {
    // Speicher voll oder blockiert - die Auswahl gilt dann nur für diese Sitzung.
  }
}

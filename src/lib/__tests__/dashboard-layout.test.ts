import { describe, expect, it } from "vitest";
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
  type WidgetMeta,
} from "../dashboard-layout";

const metas: WidgetMeta[] = [
  { id: "a", defaultWidth: "full", defaultVisible: true, essential: true },
  { id: "b", defaultWidth: "half", defaultVisible: true, essential: false },
  { id: "c", defaultWidth: "half", defaultVisible: true, essential: true },
];

const ids = (l: { widgets: { id: string }[] }) => l.widgets.map((w) => w.id);

function fakeStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
    removeItem: (k: string) => {
      delete data[k];
    },
  };
}

describe("Dashboard-Layout", () => {
  it("startet mit den Standardwerten", () => {
    const l = defaultLayout(metas);
    expect(ids(l)).toEqual(["a", "b", "c"]);
    expect(l.widgets[0]).toEqual({ id: "a", visible: true, width: "full" });
    expect(l.density).toBe("comfortable");
  });

  it("ergänzt neue Bereiche hinter ihrem Vorgänger und verwirft entfernte", () => {
    const saved = {
      version: 1,
      density: "compact",
      widgets: [
        { id: "c", visible: true, width: "half" },
        { id: "gone", visible: true, width: "half" },
        { id: "a", visible: false, width: "full" },
      ],
    };
    const l = reconcileLayout(saved, metas);
    // "b" ist neu und steht in den Standardwerten hinter "a"
    expect(ids(l)).toEqual(["c", "a", "b"]);
    expect(l.widgets.find((w) => w.id === "a")?.visible).toBe(false);
    expect(l.density).toBe("compact");
  });

  it("ignoriert kaputte oder fremde Daten", () => {
    expect(reconcileLayout("quatsch", metas)).toEqual(defaultLayout(metas));
    expect(reconcileLayout({ version: 99, widgets: [] }, metas)).toEqual(defaultLayout(metas));
    const l = reconcileLayout(
      {
        version: 1,
        density: "huge",
        widgets: [
          { id: "a", visible: "ja", width: "diagonal" },
          { id: "a", visible: false, width: "half" },
          null,
          42,
        ],
      },
      metas,
    );
    expect(l.density).toBe("comfortable");
    expect(ids(l)).toEqual(["a", "b", "c"]);
    expect(l.widgets[0]).toEqual({ id: "a", visible: true, width: "full" });
  });

  it("verschiebt Bereiche und bleibt an den Rändern stehen", () => {
    const l = defaultLayout(metas);
    expect(ids(moveWidget(l, "b", -1))).toEqual(["b", "a", "c"]);
    expect(ids(moveWidget(l, "a", -1))).toEqual(["a", "b", "c"]);
    expect(ids(moveWidget(l, "c", 1))).toEqual(["a", "b", "c"]);
    expect(ids(moveWidget(l, "unbekannt", 1))).toEqual(["a", "b", "c"]);
  });

  it("übernimmt eine neue Reihenfolge, ohne Bereiche zu verlieren", () => {
    const l = defaultLayout(metas);
    expect(ids(reorderWidgets(l, ["c", "a", "b"]))).toEqual(["c", "a", "b"]);
    expect(ids(reorderWidgets(l, ["c", "x", "c"]))).toEqual(["c", "a", "b"]);
  });

  it("blendet aus, ändert Breite und Dichte", () => {
    let l = defaultLayout(metas);
    l = setWidgetVisible(l, "b", false);
    l = setWidgetWidth(l, "c", "full");
    l = setDensity(l, "compact");
    expect(l.widgets.find((w) => w.id === "b")?.visible).toBe(false);
    expect(l.widgets.find((w) => w.id === "c")?.width).toBe("full");
    expect(l.density).toBe("compact");
    expect(setWidgetVisible(l, "nope", false)).toEqual(l);
  });

  it("kennt die Schnellauswahl", () => {
    const l = defaultLayout(metas);
    const essential = showEssentialWidgets(l, metas);
    expect(essential.widgets.map((w) => w.visible)).toEqual([true, false, true]);
    expect(showAllWidgets(essential).widgets.every((w) => w.visible)).toBe(true);
  });

  it("speichert nur Abweichungen vom Standard", () => {
    const storage = fakeStorage();
    const key = layoutStorageKey("customer", "user-1");
    expect(key).toBe("gm-dashboard:v1:customer:user-1");

    saveLayout(key, defaultLayout(metas), metas, storage);
    expect(storage.data[key]).toBeUndefined();

    const changed = setWidgetVisible(defaultLayout(metas), "b", false);
    saveLayout(key, changed, metas, storage);
    expect(storage.data[key]).toBeTruthy();
    expect(isDefaultLayout(changed, metas)).toBe(false);
    expect(loadLayout(key, metas, storage)).toEqual(changed);

    // Zurück auf Standard entfernt den Eintrag wieder
    saveLayout(key, defaultLayout(metas), metas, storage);
    expect(storage.data[key]).toBeUndefined();
  });

  it("verträgt kaputten Speicher", () => {
    const key = "k";
    const broken = fakeStorage({ [key]: "{nicht json" });
    expect(loadLayout(key, metas, broken)).toEqual(defaultLayout(metas));
    expect(loadLayout(key, metas, null)).toEqual(defaultLayout(metas));
    const throwing = {
      setItem() {
        throw new Error("voll");
      },
      removeItem() {
        throw new Error("voll");
      },
    };
    expect(() => saveLayout(key, setWidgetVisible(defaultLayout(metas), "a", false), metas, throwing)).not.toThrow();
  });
});

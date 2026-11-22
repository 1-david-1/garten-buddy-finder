/**
 * Kleine Hilfen für die Dashboard-Grafiken: Euro-Format, Farben, Leistungsnamen.
 * Bewusst keine Komponenten - so bleiben die Grafik-Dateien reine Komponentendateien.
 */

import type { CSSProperties } from "react";
import { BERLIN_TIME_ZONE } from "@/lib/berlin-time";
import { OTHER_SERVICE } from "@/lib/customer-dashboard-data";
import { SERVICE_TYPES } from "@/lib/service-types";

export const euros = (cents: number) =>
  (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/** Farbe eines Auftragsstatus-Bereichs - dieselbe in Ring, Legende und Fortschritt. */
export const GROUP_COLORS = {
  open: "var(--chart-3)",
  planned: "var(--chart-2)",
  done: "var(--chart-1)",
} as const;

/** Trennt das Emoji vom Namen: "🌿 Rasenmähen" -> { emoji: "🌿", name: "Rasenmähen" }. */
export function serviceParts(value: string): { emoji: string; name: string } {
  if (value === OTHER_SERVICE) return { emoji: "➕", name: "Weitere" };
  const label = SERVICE_TYPES.find((s) => s.value === value)?.label;
  if (!label) return { emoji: "🌱", name: value.charAt(0).toUpperCase() + value.slice(1) };
  const [emoji, ...rest] = label.split(" ");
  return { emoji, name: rest.join(" ") || emoji };
}

/** Eine feste, stimmige Farbe je Name (Grün bis Blau), damit Avatare ohne Foto unterscheidbar sind. */
export function tintFor(name: string): CSSProperties {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const hue = 110 + (hash % 120);
  return { backgroundColor: `oklch(0.34 0.07 ${hue})`, color: `oklch(0.9 0.08 ${hue})` };
}

/** "Mi., 19.11." - Wochentag und Tag in deutscher Ortszeit. */
export const formatDayShort = (iso: string) =>
  new Date(iso).toLocaleDateString("de-DE", {
    timeZone: BERLIN_TIME_ZONE,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });

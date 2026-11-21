/**
 * Grafische Bausteine für das Kunden-Dashboard.
 *
 * Alles hier ist reine Darstellung: Die Zahlen kommen fertig aus customer-dashboard-data.ts.
 * Jede Grafik hat eine Textalternative (sichtbare Legende oder sr-only-Text) - Farbe allein
 * trägt nie eine Aussage. Animationen laufen nur einmal beim Erscheinen und entfallen, wenn
 * das Betriebssystem "Bewegung reduzieren" meldet.
 *
 * Farben kommen aus den Basis-Variablen von styles.css (--primary, --chart-1 ... --muted).
 */

import { useEffect, useId, useState, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import { Check, Leaf, Star } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import { BERLIN_TIME_ZONE, berlinParts } from "@/lib/berlin-time";
import { euros, serviceParts } from "@/lib/dashboard-format";
import {
  JOURNEY_STEPS,
  OTHER_SERVICE,
  type BudgetMonth,
  type CalendarDay,
  type GigJourney,
  type ServiceShare,
} from "@/lib/customer-dashboard-data";

/* ------------------------------------------------------------------ *
 * Gemeinsames
 * ------------------------------------------------------------------ */

/** Wird true, sobald die Grafik "einlaufen" darf - sofort, wenn Bewegung reduziert werden soll. */
function useDrawIn(): boolean {
  const reduced = useReducedMotion();
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    if (reduced) return;
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, [reduced]);
  return drawn || !!reduced;
}

const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

export function LegendItem({
  color,
  label,
  value,
  hatched,
  compact,
}: {
  color: string;
  label: string;
  value?: ReactNode;
  hatched?: boolean;
  /** Kleine Legende unter einer Grafik (statt Zeile mit Zahl). */
  compact?: boolean;
}) {
  return (
    <li className={cn("flex items-center", compact ? "gap-1.5 text-[11px]" : "gap-2 text-sm")}>
      <span
        aria-hidden
        className={cn("shrink-0 rounded-[3px]", compact ? "size-2" : "size-2.5", hatched && "hatch-planned")}
        style={hatched ? undefined : { backgroundColor: color }}
      />
      <span className="text-muted-foreground">{label}</span>
      {value !== undefined && <span className="ml-auto font-medium tabular-nums">{value}</span>}
    </li>
  );
}

/* ------------------------------------------------------------------ *
 * Ring: Verteilung in Segmenten, Zahl in der Mitte
 * ------------------------------------------------------------------ */

export interface RingSegment {
  key: string;
  value: number;
  color: string;
}

export function ProgressRing({
  segments,
  size = 128,
  center,
  caption,
}: {
  segments: RingSegment[];
  size?: number;
  center: ReactNode;
  caption?: string;
}) {
  const drawn = useDrawIn();
  const total = segments.reduce((n, s) => n + s.value, 0);
  const visible = segments.filter((s) => s.value > 0);
  // Lücken zwischen Segmenten, damit sie auch ohne Farbunterscheidung getrennt lesbar bleiben
  const gap = visible.length > 1 ? 2.2 : 0;

  let start = 0;
  const arcs = visible.map((s) => {
    const portion = (s.value / total) * 100;
    const arc = { ...s, start, length: Math.max(portion - gap, 0.6) };
    start += portion;
    return arc;
  });

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden className="-rotate-90">
        <circle cx="50" cy="50" r="40" fill="none" stroke="var(--muted)" strokeWidth="11" />
        {arcs.map((a, i) => (
          <circle
            key={a.key}
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke={a.color}
            strokeWidth="11"
            pathLength={100}
            strokeDasharray={`${drawn ? a.length : 0} 100`}
            strokeDashoffset={-(a.start + gap / 2)}
            style={{ transition: `stroke-dasharray 800ms ${EASE_OUT} ${i * 110}ms` }}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-brand text-3xl leading-none tabular-nums">{center}</span>
        {caption && <span className="mt-1 text-[11px] text-muted-foreground">{caption}</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Kleine Balken (Budget auf einen Blick)
 * ------------------------------------------------------------------ */

export function BudgetBars({ months }: { months: BudgetMonth[] }) {
  const drawn = useDrawIn();
  const max = Math.max(1, ...months.map((m) => m.paidCents + m.plannedCents));
  const summary = months
    .filter((m) => m.paidCents + m.plannedCents > 0)
    .map((m) => `${m.title}: ${euros(m.paidCents)} bezahlt, ${euros(m.plannedCents)} geplant`)
    .join("; ");

  return (
    <div>
      <div className="flex h-16 items-end gap-1.5" aria-hidden>
        {months.map((m, i) => {
          const paid = (m.paidCents / max) * 100;
          const planned = (m.plannedCents / max) * 100;
          const empty = m.paidCents + m.plannedCents === 0;
          return (
            <div key={m.key} className="flex h-full min-w-0 flex-1 flex-col justify-end">
              {empty ? (
                <div className="h-0.5 rounded-full bg-muted" />
              ) : (
                <div
                  className="flex flex-col justify-end overflow-hidden rounded-[5px]"
                  style={{
                    height: drawn ? `${paid + planned}%` : "0%",
                    transition: `height 700ms ${EASE_OUT} ${i * 60}ms`,
                  }}
                >
                  {m.plannedCents > 0 && <div className="hatch-planned min-h-1" style={{ flexGrow: planned }} />}
                  {m.paidCents > 0 && <div className="min-h-1 bg-primary" style={{ flexGrow: paid }} />}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-1.5" aria-hidden>
        {months.map((m) => (
          <span
            key={m.key}
            className={cn(
              "min-w-0 flex-1 text-center text-[10px]",
              m.current ? "font-semibold text-foreground" : "text-muted-foreground",
            )}
          >
            {m.label}
          </span>
        ))}
      </div>
      <p className="sr-only">{summary || "In diesem Zeitraum ist noch kein Budget im Spiel."}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Mini-Kalender: zwei Wochen, Termine als Punkte
 * ------------------------------------------------------------------ */

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;
const WEEKDAYS_LONG = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"] as const;
const MONTHS_LONG = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
] as const;

function dayLabel(d: CalendarDay): string {
  const parts: string[] = [];
  if (d.today) parts.push("heute");
  if (d.confirmed > 0) parts.push(d.confirmed === 1 ? "1 bestätigter Termin" : `${d.confirmed} bestätigte Termine`);
  if (d.requested > 0) parts.push(d.requested === 1 ? "1 Anfrage offen" : `${d.requested} Anfragen offen`);
  return `${WEEKDAYS_LONG[d.isoWeekday - 1]}, ${d.day}. ${MONTHS_LONG[d.month - 1]}${parts.length ? `: ${parts.join(", ")}` : ""}`;
}

export function MiniCalendar({ days }: { days: CalendarDay[] }) {
  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground" aria-hidden>
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <ol className="grid grid-cols-7 gap-1" aria-label="Termine der laufenden und der nächsten Woche">
        {days.map((d) => (
          <li
            key={d.key}
            aria-label={dayLabel(d)}
            aria-current={d.today ? "date" : undefined}
            className={cn(
              "flex h-9 flex-col items-center justify-center gap-0.5 rounded-lg text-xs tabular-nums",
              d.today && "bg-primary/15 font-semibold text-foreground ring-1 ring-primary",
              !d.today && d.past && "text-muted-foreground/75",
              !d.today && !d.past && "text-foreground",
            )}
          >
            <span aria-hidden>{d.day}</span>
            <span className="flex h-1.5 items-center gap-0.5" aria-hidden>
              {d.confirmed > 0 && <span className="size-1.5 rounded-full bg-primary" />}
              {d.requested > 0 && <span className="size-1.5 rounded-full border border-primary" />}
            </span>
          </li>
        ))}
      </ol>
      <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground" aria-hidden>
        <li className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-primary" /> bestätigt
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full border border-primary" /> angefragt
        </li>
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Terminkachel (wie ein Abreißkalender)
 * ------------------------------------------------------------------ */

const monthShortFmt = new Intl.DateTimeFormat("de-DE", { timeZone: BERLIN_TIME_ZONE, month: "short" });
const weekdayShortFmt = new Intl.DateTimeFormat("de-DE", { timeZone: BERLIN_TIME_ZONE, weekday: "short" });
const stripDot = (s: string) => s.replace(/\.$/, "");

export function DateTile({ iso }: { iso: string }) {
  const date = new Date(iso);
  const day = berlinParts(date).day;
  return (
    <div
      className="w-[4.5rem] shrink-0 overflow-hidden rounded-xl border border-glass-border bg-card text-center"
      aria-hidden
    >
      <div className="bg-primary py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">
        {stripDot(monthShortFmt.format(date))}
      </div>
      <div className="pt-1.5 font-brand text-3xl leading-none tabular-nums">{day}</div>
      <div className="pb-1.5 pt-1 text-[11px] text-muted-foreground">{stripDot(weekdayShortFmt.format(date))}</div>
    </div>
  );
}

/** Kleine Datumsmarke für Listen (Tag und Wochentag). */
export function DateChip({ iso }: { iso: string }) {
  const date = new Date(iso);
  return (
    <div
      className="flex size-10 shrink-0 flex-col items-center justify-center rounded-lg border border-glass-border bg-card leading-none"
      aria-hidden
    >
      <span className="text-sm font-semibold tabular-nums">{berlinParts(date).day}</span>
      <span className="mt-0.5 text-[10px] text-muted-foreground">{stripDot(weekdayShortFmt.format(date))}</span>
    </div>
  );
}

/** Statt der Terminkachel, wenn ein Einsatz läuft und kein Termin hinterlegt ist. */
export function LiveTile() {
  return (
    <div
      className="relative flex size-[4.5rem] shrink-0 items-center justify-center rounded-xl border border-primary/40 bg-primary/10"
      aria-hidden
    >
      <Leaf className="size-7 text-primary" />
      <span className="absolute right-2 top-2 flex size-2.5">
        <span className="absolute inline-flex size-full rounded-full bg-primary opacity-60 motion-safe:animate-ping" />
        <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Auftragsweg: Angefragt - Bestätigt - Läuft - Erledigt - Bezahlt
 * ------------------------------------------------------------------ */

export function JourneyTrack({
  journey,
  needsAction,
  compact,
  className,
}: {
  journey: GigJourney;
  /** Wartet der Auftrag auf den Kunden? Dann wird der aktuelle Schritt in Bernstein hervorgehoben. */
  needsAction: boolean;
  /** Kompakt: nur der aktuelle Schritt trägt sichtbar einen Namen. */
  compact?: boolean;
  className?: string;
}) {
  const last = JOURNEY_STEPS.length - 1;
  return (
    <ol className={cn("grid grid-cols-5", className)} aria-label="Fortschritt des Auftrags">
      {JOURNEY_STEPS.map((step, i) => {
        const done = i < journey.reached || (journey.finished && i === journey.reached);
        const current = i === journey.reached && !journey.finished;
        const status = done ? "erreicht" : current ? "aktuell" : "noch offen";
        return (
          <li key={step.key} aria-current={current ? "step" : undefined} className="relative flex flex-col items-center">
            {i > 0 && (
              <span
                aria-hidden
                className={cn(
                  "absolute left-0 right-1/2 top-[9px] h-0.5 -translate-y-1/2",
                  i <= journey.reached ? "bg-primary" : "bg-muted-foreground/25",
                )}
              />
            )}
            {i < last && (
              <span
                aria-hidden
                className={cn(
                  "absolute left-1/2 right-0 top-[9px] h-0.5 -translate-y-1/2",
                  i < journey.reached ? "bg-primary" : "bg-muted-foreground/25",
                )}
              />
            )}
            <span className="relative z-10 flex size-[18px] items-center justify-center" aria-hidden>
              {current && needsAction && (
                <span className="absolute inline-flex size-full rounded-full bg-amber-400/50 motion-safe:animate-ping" />
              )}
              <span
                className={cn(
                  "relative flex size-full items-center justify-center rounded-full border-2",
                  done && "border-primary bg-primary text-primary-foreground",
                  current && !needsAction && "border-primary bg-background",
                  current && needsAction && "border-amber-400 bg-background",
                  !done && !current && "border-muted-foreground/35 bg-background",
                )}
              >
                {done && <Check className="size-2.5" strokeWidth={4} />}
                {current && (
                  <span className={cn("size-1.5 rounded-full", needsAction ? "bg-amber-400" : "bg-primary")} />
                )}
              </span>
            </span>
            <span
              className={cn(
                "mt-1.5 text-center text-[10px] leading-tight",
                current ? "font-medium text-foreground" : "text-muted-foreground",
                compact && !current && "sr-only",
              )}
            >
              {step.label}
              <span className="sr-only"> ({status})</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ *
 * Budget je Monat (Balkendiagramm mit Achse und Tooltip)
 * ------------------------------------------------------------------ */

interface ChartRow {
  key: string;
  label: string;
  title: string;
  paid: number;
  planned: number;
  current: boolean;
}

interface SegmentProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  payload?: ChartRow;
}

/** Balkenstück mit abgerundeter Oberkante - nur beim obersten Stück des Stapels. */
function barPath(x: number, y: number, w: number, h: number, radius: number): string {
  const r = Math.min(radius, w / 2, h);
  if (r <= 0) return `M${x},${y}h${w}v${h}h${-w}Z`;
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

const chartConfig = {
  paid: { label: "Bezahlt", color: "var(--primary)" },
  planned: { label: "Geplant", color: "var(--primary)" },
} satisfies ChartConfig;

function MonthTick({
  x = 0,
  y = 0,
  payload,
  rows,
}: {
  x?: number;
  y?: number;
  payload?: { value: string; index: number };
  rows: ChartRow[];
}) {
  const current = payload ? rows[payload.index]?.current : false;
  return (
    <g>
      <text
        x={x}
        y={y + 12}
        textAnchor="middle"
        fontSize={11}
        fontWeight={current ? 700 : 400}
        style={{ fill: current ? "var(--foreground)" : "var(--muted-foreground)" }}
      >
        {payload?.value}
      </text>
      {current && <circle cx={x} cy={y + 22} r={2} style={{ fill: "var(--primary)" }} />}
    </g>
  );
}

function BudgetTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: ChartRow }> }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded-xl border border-glass-border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium">{row.title}</p>
      <p className="flex items-center justify-between gap-4 text-muted-foreground">
        <span>Bezahlt</span>
        <span className="font-medium tabular-nums text-foreground">{euros(row.paid)}</span>
      </p>
      <p className="flex items-center justify-between gap-4 text-muted-foreground">
        <span>Geplant</span>
        <span className="font-medium tabular-nums text-foreground">{euros(row.planned)}</span>
      </p>
    </div>
  );
}

export function BudgetChart({ months }: { months: BudgetMonth[] }) {
  const reduced = useReducedMotion();
  const hatchId = `hatch-${useId().replace(/:/g, "")}`;
  const rows: ChartRow[] = months.map((m) => ({
    key: m.key,
    label: m.label,
    title: m.title,
    paid: m.paidCents / 100,
    planned: m.plannedCents / 100,
    current: m.current,
  }));
  const summary = months
    .filter((m) => m.paidCents + m.plannedCents > 0)
    .map((m) => `${m.title}: ${euros(m.paidCents)} bezahlt, ${euros(m.plannedCents)} geplant`)
    .join("; ");

  const paidShape = (p: SegmentProps) => {
    const { x = 0, y = 0, width = 0, height = 0, payload } = p;
    if (height <= 0) return <g />;
    // Ist nichts Geplantes darüber, schließt der bezahlte Teil den Stapel ab.
    return <path d={barPath(x, y, width, height, payload && payload.planned > 0 ? 0 : 5)} style={{ fill: "var(--primary)" }} />;
  };
  const plannedShape = (p: SegmentProps) => {
    const { x = 0, y = 0, width = 0, height = 0 } = p;
    if (height <= 0) return <g />;
    return (
      <path
        d={barPath(x + 0.5, y + 0.5, Math.max(width - 1, 0), Math.max(height - 1, 0), 5)}
        fill={`url(#${hatchId})`}
        strokeWidth={1}
        style={{ stroke: "var(--primary)" }}
      />
    );
  };

  return (
    <div>
      <ChartContainer config={chartConfig} className="aspect-auto h-48 w-full" aria-hidden>
        <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="24%">
          <defs>
            <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" style={{ fill: "var(--primary)", fillOpacity: 0.14 }} />
              <rect width="2.4" height="6" style={{ fill: "var(--primary)", fillOpacity: 0.75 }} />
            </pattern>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 4" style={{ stroke: "var(--muted-foreground)", strokeOpacity: 0.18 }} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0} height={30} tick={<MonthTick rows={rows} />} />
          <YAxis
            width={52}
            tickLine={false}
            axisLine={false}
            tickCount={4}
            allowDecimals={false}
            tickFormatter={(v: number) => euros(v * 100)}
            tick={{ fontSize: 11, style: { fill: "var(--muted-foreground)" } }}
          />
          <Tooltip cursor={{ style: { fill: "var(--muted)", fillOpacity: 0.4 } }} content={<BudgetTooltip />} />
          <Bar dataKey="paid" stackId="budget" shape={paidShape} isAnimationActive={!reduced} animationDuration={700} />
          <Bar dataKey="planned" stackId="budget" shape={plannedShape} isAnimationActive={!reduced} animationDuration={700} />
        </BarChart>
      </ChartContainer>
      <p className="sr-only">{summary || "In diesem Zeitraum ist noch kein Budget im Spiel."}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Verteilung nach Leistung (ein gegliederter Balken mit Legende)
 * ------------------------------------------------------------------ */

const SERVICE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "oklch(0.72 0.12 20)",
] as const;

export function ServiceBar({ shares }: { shares: ServiceShare[] }) {
  const drawn = useDrawIn();
  const colorOf = (s: ServiceShare, i: number) =>
    s.value === OTHER_SERVICE ? "var(--muted-foreground)" : SERVICE_COLORS[i % SERVICE_COLORS.length];

  return (
    <div className="@container">
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" aria-hidden>
        {shares.map((s, i) => (
          <div
            key={s.value}
            className="h-full rounded-[3px]"
            style={{
              width: drawn ? `${s.share * 100}%` : "0%",
              minWidth: drawn ? 6 : 0,
              backgroundColor: colorOf(s, i),
              opacity: s.value === OTHER_SERVICE ? 0.5 : 1,
              transition: `width 800ms ${EASE_OUT} ${i * 90}ms`,
            }}
          />
        ))}
      </div>
      <ul className="mt-3 grid gap-x-6 gap-y-1.5 @md:grid-cols-2">
        {shares.map((s, i) => {
          const { emoji, name } = serviceParts(s.value);
          return (
            <li key={s.value} className="flex items-center gap-2 text-sm">
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{ backgroundColor: colorOf(s, i), opacity: s.value === OTHER_SERVICE ? 0.5 : 1 }}
              />
              <span aria-hidden>{emoji}</span>
              <span className="min-w-0 truncate text-muted-foreground">{name}</span>
              <span className="ml-auto font-medium tabular-nums">{s.count}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Helfer-Karten: Sterne und Avatar-Farbe
 * ------------------------------------------------------------------ */

/** Bewertung als fünf Sterne, anteilig gefüllt (4,6 = vier ganze und ein fast voller). */
export function RatingStars({ rating }: { rating: number }) {
  const percent = Math.max(0, Math.min(100, (rating / 5) * 100));
  const stars = (cls: string) =>
    Array.from({ length: 5 }, (_, i) => <Star key={i} className={cn("size-3.5 shrink-0", cls)} />);
  return (
    <span
      role="img"
      aria-label={`${rating.toFixed(1).replace(".", ",")} von 5 Sternen`}
      className="relative inline-flex"
    >
      <span className="inline-flex text-muted-foreground/35" aria-hidden>
        {stars("")}
      </span>
      <span className="absolute inset-y-0 left-0 inline-flex overflow-hidden text-amber-400" style={{ width: `${percent}%` }} aria-hidden>
        {stars("fill-current")}
      </span>
    </span>
  );
}

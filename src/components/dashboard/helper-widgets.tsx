/**
 * Grafische Widgets des Helfer-Dashboards. Gleiche Bildsprache wie beim Kunden (dashboard-visuals.tsx),
 * aber mit eigenem Inhalt: Verdienst statt Budget, Anfragen und Einsätze statt Aufträge.
 *
 * Die Rechenlogik steckt in helper-dashboard-data.ts und customer-dashboard-data.ts (beide getestet).
 */

import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarClock, CheckCircle2, ChevronRight, MapPin, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useDashboardDensity } from "@/components/dashboard/customizable-dashboard";
import {
  BudgetChart,
  DateChip,
  DateTile,
  LegendItem,
  LiveTile,
  MiniBars,
  MiniCalendar,
  ProgressRing,
  RatingStars,
  TrendChip,
} from "@/components/dashboard/dashboard-visuals";
import { useBerlinToday } from "@/hooks/use-berlin-today";
import { useI18n } from "@/lib/i18n";
import { formatBerlinTime } from "@/lib/berlin-time";
import { formatDayShort, GROUP_COLORS } from "@/lib/dashboard-format";
import { publicLocationLabel } from "@/lib/gig-location";
import {
  appointmentCalendar,
  pickNextAppointment,
  relativeDay,
  upcomingAppointments,
} from "@/lib/customer-dashboard-data";
import { toGigLike, type AgendaJob, type EarningsMonth } from "@/lib/helper-dashboard-data";

const money = (cents: number, locale: string) =>
  (cents / 100).toLocaleString(locale, { style: "currency", currency: "EUR" });

const CARD = "border-glass-border bg-glass backdrop-blur";

/* ------------------------------------------------------------------ *
 * Kennzahlen: vier Karten, jede mit einer Grafik statt nur einer Zahl
 * ------------------------------------------------------------------ */

export interface HelperStatsData {
  earningsLast7Cents: number;
  earningsTrendPct: number | null;
  completionRate: number | null;
  completedCount: number;
  finishedCount: number;
  avgRating: number | null;
  ratingCount: number;
}

export function HelperStats({
  stats,
  chart,
  locale,
}: {
  stats: HelperStatsData;
  chart: { label: string; euros: number }[];
  locale: string;
}) {
  const { t } = useI18n();
  const rate = stats.completionRate ? Math.min(Math.max(stats.completionRate, 0), 1) : null;

  return (
    <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(13rem,1fr))]">
      <Card className={CARD}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-normal text-muted-foreground">
            {t("dashboard.helper.stat.earnings")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-2xl font-bold tabular-nums">{money(stats.earningsLast7Cents, locale)}</div>
            <TrendChip pct={stats.earningsTrendPct} label={t("dashboard.helper.stat.vsLastWeek")} />
          </div>
          <MiniBars
            className="mt-4"
            values={chart.map((c) => c.euros)}
            labels={chart.map((c) => c.label)}
            format={(v) => `${v} €`}
          />
        </CardContent>
      </Card>

      <Card className={CARD}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-normal text-muted-foreground">
            {t("dashboard.helper.stat.rating")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.avgRating ? (
            <>
              <div className="text-2xl font-bold tabular-nums">{stats.avgRating.toFixed(1).replace(".", ",")}</div>
              <div className="mt-2">
                <RatingStars rating={stats.avgRating} />
              </div>
            </>
          ) : (
            <div className="text-2xl font-bold">—</div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {stats.ratingCount > 0
              ? `${stats.ratingCount} ${t("dashboard.helper.stat.ratingSub")}`
              : t("dashboard.helper.stat.noRatings")}
          </p>
        </CardContent>
      </Card>

      <Card className={CARD}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-normal text-muted-foreground">
            {t("dashboard.helper.stat.completionRate")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rate === null ? (
            <div className="text-2xl font-bold">—</div>
          ) : (
            <div className="flex items-center gap-4">
              <ProgressRing
                size={76}
                centerClassName="text-base"
                center={`${Math.round(rate * 100)}%`}
                segments={[
                  { key: "done", value: rate, color: GROUP_COLORS.done },
                  { key: "rest", value: 1 - rate, color: "var(--muted)" },
                ]}
              />
              <p className="min-w-0 text-xs text-muted-foreground">
                {`${stats.completedCount} / ${stats.finishedCount} ${t("dashboard.helper.stat.completionSub")}`}
              </p>
            </div>
          )}
          {rate === null && (
            <p className="mt-2 text-xs text-muted-foreground">
              {`${stats.completedCount} / ${stats.finishedCount} ${t("dashboard.helper.stat.completionSub")}`}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className={CARD}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-normal text-muted-foreground">
            {t("dashboard.helper.stat.completedTotal")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
            >
              <CheckCircle2 className="size-6" />
            </span>
            <div>
              <div className="text-2xl font-bold tabular-nums">{stats.completedCount}</div>
              <p className="text-xs text-muted-foreground">{t("dashboard.helper.stat.total")}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Verdienst: 7 Tage oder 6 Monate, dazu offene Auszahlungen
 * ------------------------------------------------------------------ */

type Range = "week" | "months";

export function EarningsWidget({
  chart,
  months,
  stats,
  locale,
}: {
  chart: { label: string; euros: number }[];
  months: EarningsMonth[];
  stats: { earningsLast7Cents: number; earningsTrendPct: number | null; pendingPayoutCents: number };
  locale: string;
}) {
  const { t } = useI18n();
  const [range, setRange] = useState<Range>("week");

  const rows = useMemo(
    () =>
      range === "week"
        ? chart.map((c, i) => ({
            key: `${c.label}-${i}`,
            label: c.label,
            title: c.label,
            paidCents: c.euros * 100,
            plannedCents: 0,
            current: i === chart.length - 1,
          }))
        : months.map((m) => ({
            key: m.key,
            label: m.label,
            title: m.title,
            paidCents: m.cents,
            plannedCents: 0,
            current: m.current,
          })),
    [range, chart, months],
  );
  const total = rows.reduce((n, r) => n + r.paidCents, 0);

  return (
    <Card id="earnings-chart" className={`h-full ${CARD}`}>
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="font-brand text-lg">
              {range === "week" ? t("dashboard.helper.chart.title") : "Verdienst im Verlauf"}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {range === "week" ? t("dashboard.helper.chart.sub") : "Netto-Auszahlungen je Monat, die letzten 6 Monate."}
            </p>
          </div>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={range}
            onValueChange={(v) => v && setRange(v as Range)}
            aria-label="Zeitraum des Verdiensts"
          >
            <ToggleGroupItem value="week" className="px-3">
              7 Tage
            </ToggleGroupItem>
            <ToggleGroupItem value="months" className="px-3">
              6 Monate
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-semibold tabular-nums leading-tight">{money(total, locale)}</p>
              {range === "week" && (
                <TrendChip pct={stats.earningsTrendPct} label={t("dashboard.helper.stat.vsLastWeek")} />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {range === "week" ? "ausgezahlt in den letzten 7 Tagen" : "ausgezahlt in 6 Monaten"}
            </p>
          </div>
          {stats.pendingPayoutCents > 0 && (
            <div>
              <p className="text-lg font-semibold tabular-nums leading-tight">
                {money(stats.pendingPayoutCents, locale)}
              </p>
              <p className="text-xs text-muted-foreground">gesichert, wartet auf Freigabe</p>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {total > 0 ? (
          <BudgetChart months={rows} hidePlanned labels={{ paid: "Ausgezahlt", planned: "" }} />
        ) : (
          <p className="rounded-xl border border-dashed border-glass-border p-4 text-sm text-muted-foreground">
            In diesem Zeitraum gab es noch keine Auszahlung. Sobald ein Kunde die Zahlung freigibt, erscheint sie hier.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Auftrags-Status als Ring
 * ------------------------------------------------------------------ */

export function GigStatusWidget({ statuses }: { statuses: string[] }) {
  const compact = useDashboardDensity() === "compact";
  const completed = statuses.filter((s) => s === "completed").length;
  const active = statuses.filter((s) => s === "in_progress" || s === "assigned").length;
  const open = statuses.filter((s) => s === "open" || s === "negotiating").length;
  const counted = completed + active + open;
  const others = statuses.length - counted;

  return (
    <Card className={`h-full ${CARD}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-brand text-lg">
          <Zap className="size-4 text-primary" />
          Auftrags-Status
        </CardTitle>
        <p className="text-sm text-muted-foreground">Letzte {statuses.length} Aufträge</p>
      </CardHeader>
      <CardContent>
        {statuses.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Aufträge.</p>
        ) : (
          <>
            <div className="flex items-center gap-6">
              <ProgressRing
                size={compact ? 96 : 120}
                center={counted}
                caption={counted === 1 ? "Auftrag" : "Aufträge"}
                segments={[
                  { key: "done", value: completed, color: GROUP_COLORS.done },
                  { key: "active", value: active, color: GROUP_COLORS.planned },
                  { key: "open", value: open, color: GROUP_COLORS.open },
                ]}
              />
              <ul className="min-w-0 max-w-44 flex-1 space-y-2">
                <LegendItem color={GROUP_COLORS.done} label="Abgeschlossen" value={completed} />
                <LegendItem color={GROUP_COLORS.planned} label="In Bearbeitung" value={active} />
                <LegendItem color={GROUP_COLORS.open} label="Offen / Verhandlung" value={open} />
              </ul>
            </div>
            {others > 0 && (
              <p className="mt-4 text-xs text-muted-foreground">
                {others === 1 ? "1 weiterer Auftrag ist" : `${others} weitere Aufträge sind`} angefragt oder storniert.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Einsätze: nächster Einsatz, danach, Mini-Kalender
 * ------------------------------------------------------------------ */

interface PendingRequest {
  id: string;
  title: string;
  status: string;
  scheduledAt: string | null;
  budgetCents: number;
}

export function ScheduleWidget({ agenda, requests }: { agenda: AgendaJob[]; requests: PendingRequest[] }) {
  const compact = useDashboardDensity() === "compact";
  const today = useBerlinToday();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- der Tageswechsel ist der Auslöser, nicht ein Wert im Rumpf
  const now = useMemo(() => new Date(), [today]);

  const items = useMemo(() => [...agenda, ...requests].map((i) => toGigLike(i)), [agenda, requests]);
  const next = useMemo(() => pickNextAppointment(items, now), [items, now]);
  const later = useMemo(() => upcomingAppointments(items, now, compact ? 1 : 2), [items, now, compact]);
  const calendar = useMemo(() => appointmentCalendar(items, now), [items, now]);

  const job = next?.source as AgendaJob | undefined;
  const when = next?.scheduled_at ?? null;
  const relative = when ? relativeDay(when) : "";

  return (
    <Card className={CARD}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-brand text-lg">
          <CalendarClock className="size-4 text-primary" />
          Deine Einsätze
        </CardTitle>
        <p className="text-sm text-muted-foreground">Bestätigte Einsätze und offene Anfragen der nächsten zwei Wochen.</p>
      </CardHeader>
      <CardContent>
        <div className="@container">
          <div className="grid gap-x-10 gap-y-6 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
            <div className="min-w-0 space-y-4">
              {!job ? (
                <div className="rounded-xl border border-dashed border-glass-border p-4 text-sm text-muted-foreground">
                  <p>
                    Noch kein bestätigter Einsatz.
                    {requests.length > 0
                      ? ` ${requests.length === 1 ? "Eine Anfrage wartet" : `${requests.length} Anfragen warten`} auf deine Antwort.`
                      : " Sobald du eine Anfrage annimmst, erscheint er hier."}
                  </p>
                  <Button asChild size="sm" variant="outline" className="mt-3 gap-1.5">
                    <Link to="/marketplace">
                      Aufträge finden
                      <ChevronRight className="size-4" />
                    </Link>
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-4">
                    {when ? <DateTile iso={when} /> : <LiveTile />}
                    <div className="min-w-0">
                      <p className="text-2xl font-semibold leading-tight">
                        {job.status === "in_progress" && !when
                          ? "Läuft gerade"
                          : relative || (when ? formatDayShort(when) : "")}
                      </p>
                      {when && (
                        <p className="text-sm text-muted-foreground">
                          {formatDayShort(when)}, {formatBerlinTime(when)} Uhr
                          {job.status === "in_progress" ? " · läuft gerade" : ""}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="rounded-xl border border-glass-border p-3 text-sm">
                    <p className="font-medium">{job.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">bei {job.customerName}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="size-3.5 shrink-0" />
                      {job.address ?? publicLocationLabel(job.district)}
                    </p>
                  </div>
                </>
              )}
            </div>
            <div>
              <MiniCalendar days={calendar} />
              {calendar.every((d) => d.confirmed + d.requested === 0) && (
                <p className="mt-2 text-xs text-muted-foreground">In den nächsten zwei Wochen steht nichts an.</p>
              )}
            </div>
            {job && later.length > 0 && (
              <div className="border-t border-glass-border pt-4 @2xl:col-span-2">
                <p className="mb-3 text-xs text-muted-foreground">Danach</p>
                <ul className="grid gap-x-10 gap-y-3 @xl:grid-cols-2">
                  {later.map((g) => {
                    const s = g.source as AgendaJob;
                    return (
                      <li key={g.id} className="flex items-center gap-3">
                        <DateChip iso={g.scheduled_at!} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{s.title}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {formatDayShort(g.scheduled_at!)}, {formatBerlinTime(g.scheduled_at!)} Uhr · bei{" "}
                            {s.customerName}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Activity,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Heart,
  MapPin,
  MessageSquare,
  Plus,
  RotateCcw,
  Search,
  Star,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { BookingScheduler } from "@/components/booking/booking-scheduler";
import {
  CustomizableDashboard,
  useDashboardDensity,
  type DashboardWidget,
} from "@/components/dashboard/customizable-dashboard";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getHelperBookingInfo } from "@/lib/booking.functions";
import { BOOKING_WINDOW_DAYS, buildSchedule } from "@/lib/booking-slots";
import { useBerlinToday } from "@/hooks/use-berlin-today";
import { useAppNavItems } from "@/lib/use-app-nav";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { BERLIN_TIME_ZONE, formatBerlinDate, formatBerlinTime } from "@/lib/berlin-time";
import { describeGigStatus, TONE_CLASSES, type PaymentState } from "@/lib/gig-status";
import { useStoredState } from "@/lib/use-stored-state";
import { SERVICE_TYPES } from "@/lib/service-types";
import { getAvailableHelpers } from "@/lib/marketplace.functions";
import { createDirectBookingRequest, getMyGigs } from "@/lib/gigs.functions";
import { getMyConversations } from "@/lib/messaging.functions";
import { getMyFavorites, getMyProfile, toggleFavorite } from "@/lib/profile.functions";
import {
  appointmentCalendar,
  countGigGroups,
  deriveCustomerTasks,
  gigJourney,
  monthlyBudget,
  pickNextAppointment,
  relativeDay,
  serviceBreakdown,
  sumBudget,
  upcomingAppointments,
} from "@/lib/customer-dashboard-data";
import {
  BudgetChart,
  DateChip,
  DateTile,
  JourneyTrack,
  LegendItem,
  LiveTile,
  MiniCalendar,
  ProgressRing,
  RatingStars,
  ServiceBar,
} from "@/components/dashboard/dashboard-visuals";
import { euros, formatDayShort, GROUP_COLORS, tintFor } from "@/lib/dashboard-format";

type AgeBadge = "helper_youth" | "helper_adult" | "helper_pro";

interface DisplayHelper {
  id: string;
  name: string;
  title: string | null;
  location: string | null;
  postalCode: string | null;
  rating: number | null;
  reviewCount: number;
  imageUrl: string | null;
  ageBadge: AgeBadge;
  serviceTypes: string[];
  fromPriceCents: number | null;
  bio: string | null;
  availableToday: boolean;
}

const ageBadgeLabel: Record<AgeBadge, string> = {
  helper_youth: "13–17 (mit Zustimmung)",
  helper_adult: "18+",
  helper_pro: "Profi",
};

const serviceLabel = (value: string) =>
  SERVICE_TYPES.find((s) => s.value === value)?.label ?? value;

/* ------------------------------------------------------------------ *
 * Kleine Bausteine
 * ------------------------------------------------------------------ */

function WidgetCard({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="h-full border-glass-border bg-glass backdrop-blur">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 font-brand text-lg">
          {icon}
          {title}
        </CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Loading() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Wird geladen">
      <div className="h-12 animate-pulse rounded-lg bg-muted/30" />
      <div className="h-12 animate-pulse rounded-lg bg-muted/30" />
    </div>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
      <span>Das konnte gerade nicht geladen werden.</span>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Nochmal versuchen
      </Button>
    </div>
  );
}

function EmptyHint({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-glass-border p-4 text-sm text-muted-foreground">
      <p>{children}</p>
      {action}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-primary bg-primary/15 text-primary"
          : "border-glass-border bg-glass text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Bereiche
 * ------------------------------------------------------------------ */

type GigsQuery = ReturnType<typeof useGigsQuery>;

function useGigsQuery() {
  const fn = useServerFn(getMyGigs);
  return useQuery({ queryKey: ["my-gigs"], queryFn: () => fn() });
}

/** "Jetzt" für die Grafiken - wechselt mit dem deutschen Kalendertag, nicht bei jedem Rendern. */
function useDayNow(): Date {
  const today = useBerlinToday();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- der Tageswechsel ist der Auslöser, nicht ein Wert im Rumpf
  return useMemo(() => new Date(), [today]);
}

function AttentionWidget({
  gigsQuery,
  unreadMessages,
}: {
  gigsQuery: GigsQuery;
  unreadMessages: number;
}) {
  const compact = useDashboardDensity() === "compact";
  const limit = compact ? 3 : 5;
  const tasks = useMemo(
    () => deriveCustomerTasks(gigsQuery.data?.gigs ?? [], unreadMessages),
    [gigsQuery.data, unreadMessages],
  );
  const shown = tasks.slice(0, limit);
  const open = tasks.filter((t) => t.tone === "action").length;

  return (
    <WidgetCard
      title="Das ist jetzt zu tun"
      icon={<CheckCircle2 className="size-5 text-primary" />}
      action={
        open > 0 ? (
          <Badge className="border-primary/30 bg-primary/15 text-primary" variant="outline">
            {open} offen
          </Badge>
        ) : undefined
      }
    >
      {gigsQuery.isLoading ? (
        <Loading />
      ) : gigsQuery.isError ? (
        <LoadError onRetry={() => gigsQuery.refetch()} />
      ) : tasks.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-glass-border p-4">
          <CheckCircle2 className="size-6 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-medium">Alles erledigt</p>
            <p className="text-xs text-muted-foreground">Gerade wartet nichts auf dich.</p>
          </div>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {shown.map((task) => (
              <li
                key={task.key}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-glass-border p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{task.title}</p>
                  <p className="text-xs text-muted-foreground">{task.hint}</p>
                </div>
                <Button asChild size="sm" variant={task.tone === "action" ? "default" : "outline"}>
                  <Link to={task.target === "messages" ? "/messages" : "/my-gigs"}>{task.cta}</Link>
                </Button>
              </li>
            ))}
          </ul>
          {tasks.length > shown.length && (
            <p className="mt-3 text-xs text-muted-foreground">
              + {tasks.length - shown.length} weitere –{" "}
              <Link to="/my-gigs" className="underline underline-offset-2 hover:text-foreground">
                alle Aufträge ansehen
              </Link>
            </p>
          )}
        </>
      )}
    </WidgetCard>
  );
}

function GettingStartedWidget({ gigsQuery, profileName }: { gigsQuery: GigsQuery; profileName: string | null }) {
  // Nur für neue Kunden: sobald es einen Auftrag gibt, verschwindet der Bereich von selbst.
  if (!gigsQuery.data || gigsQuery.data.gigs.length > 0) return null;
  const steps = [
    {
      done: !!profileName,
      title: "Profil ausfüllen",
      body: "Ein Name und eine kurze Beschreibung schaffen Vertrauen.",
      to: "/profile" as const,
      cta: "Profil öffnen",
    },
    {
      done: false,
      title: "Auftrag veröffentlichen oder Helfer direkt buchen",
      body: "Beschreibe die Arbeit, wähle einen Stadtteil und lege dein Budget fest – oder buche unten einen Helfer.",
      to: "/create-gig" as const,
      cta: "Auftrag erstellen",
    },
    {
      done: false,
      title: "Termin bestätigen und nach der Arbeit bewerten",
      body: "Das Geld liegt bis zur erledigten Arbeit auf Treuhand – du gibst es nach der Arbeit frei. Der Dienst ist derzeit kostenlos.",
      to: "/my-gigs" as const,
      cta: "Meine Aufträge",
    },
  ];
  return (
    <WidgetCard title="So startest du" icon={<ClipboardList className="size-5 text-primary" />}>
      <ol className="space-y-2">
        {steps.map((step, i) => (
          <li
            key={step.title}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-glass-border p-3"
          >
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <span
                className={cn(
                  "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs",
                  step.done
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-glass-border text-muted-foreground",
                )}
                aria-hidden
              >
                {step.done ? "✓" : i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{step.title}</p>
                <p className="text-xs text-muted-foreground">{step.body}</p>
              </div>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to={step.to}>{step.cta}</Link>
            </Button>
          </li>
        ))}
      </ol>
    </WidgetCard>
  );
}

function NextAppointmentWidget({ gigsQuery }: { gigsQuery: GigsQuery }) {
  const compact = useDashboardDensity() === "compact";
  const next = useMemo(() => pickNextAppointment(gigsQuery.data?.gigs ?? []), [gigsQuery.data]);
  const later = useMemo(
    () => upcomingAppointments(gigsQuery.data?.gigs ?? [], new Date(), compact ? 1 : 2),
    [gigsQuery.data, compact],
  );
  const when = next?.scheduled_at ? new Date(next.scheduled_at) : null;
  const relative = next?.scheduled_at ? relativeDay(next.scheduled_at) : "";

  return (
    <WidgetCard title="Nächster Termin" icon={<CalendarClock className="size-5 text-primary" />}>
      {gigsQuery.isLoading ? (
        <Loading />
      ) : gigsQuery.isError ? (
        <LoadError onRetry={() => gigsQuery.refetch()} />
      ) : !next ? (
        <EmptyHint
          action={
            <Button asChild size="sm" variant="outline">
              <Link to="/create-gig">
                <Plus className="size-4" />
                Auftrag erstellen
              </Link>
            </Button>
          }
        >
          Noch kein Termin geplant. Sobald ein Helfer bestätigt, siehst du ihn hier.
        </EmptyHint>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            {when ? <DateTile iso={next.scheduled_at!} /> : <LiveTile />}
            <div className="min-w-0">
              <p className="text-2xl font-semibold leading-tight">
                {next.status === "in_progress" && !when
                  ? "Läuft gerade"
                  : relative || (next.scheduled_at ? formatDayShort(next.scheduled_at) : "")}
              </p>
              {next.scheduled_at && (
                <p className="text-sm text-muted-foreground">
                  {formatDayShort(next.scheduled_at)}, {formatBerlinTime(next.scheduled_at)} Uhr
                  {next.status === "in_progress" ? " · läuft gerade" : ""}
                </p>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-glass-border p-3 text-sm">
            <p className="font-medium">{next.title}</p>
            {next.helper_name && (
              <p className="mt-0.5 text-xs text-muted-foreground">mit {next.helper_name}</p>
            )}
            {next.address && (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="size-3.5 shrink-0" />
                {next.address}
              </p>
            )}
          </div>
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link to="/my-gigs">
              Details ansehen
              <ChevronRight className="size-4" />
            </Link>
          </Button>
          {later.length > 0 && (
            <div className="border-t border-glass-border pt-4">
              <p className="mb-3 text-xs text-muted-foreground">Danach</p>
              <ul className="space-y-3">
                {later.map((g) => (
                  <li key={g.id} className="flex items-center gap-3">
                    <DateChip iso={g.scheduled_at!} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{g.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatDayShort(g.scheduled_at!)}, {formatBerlinTime(g.scheduled_at!)} Uhr
                        {g.helper_name ? ` · mit ${g.helper_name}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </WidgetCard>
  );
}

function MyGigsWidget({ gigsQuery }: { gigsQuery: GigsQuery }) {
  const compact = useDashboardDensity() === "compact";
  const gigs = gigsQuery.data?.gigs ?? [];
  const groups = useMemo(() => countGigGroups(gigs), [gigs]);
  // Was noch läuft oder auf dich wartet, steht vorn; Abgeschlossenes danach (jeweils in der alten Reihenfolge).
  const listed = gigs.filter((g) => g.status !== "cancelled" && g.status !== "draft");
  const isFinished = (g: (typeof gigs)[number]) => gigJourney(g)?.finished ?? true;
  const recent = [...listed.filter((g) => !isFinished(g)), ...listed.filter(isFinished)].slice(0, compact ? 3 : 4);

  return (
    <WidgetCard
      title="Meine Aufträge"
      icon={<ClipboardList className="size-5 text-primary" />}
      action={
        <Button asChild size="sm" variant="ghost" className="gap-1">
          <Link to="/my-gigs">
            Alle
            <ChevronRight className="size-4" />
          </Link>
        </Button>
      }
    >
      {gigsQuery.isLoading ? (
        <Loading />
      ) : gigsQuery.isError ? (
        <LoadError onRetry={() => gigsQuery.refetch()} />
      ) : gigs.length === 0 ? (
        <EmptyHint
          action={
            <Button asChild size="sm">
              <Link to="/create-gig">
                <Plus className="size-4" />
                Ersten Auftrag erstellen
              </Link>
            </Button>
          }
        >
          Du hast noch keinen Auftrag. Beschreibe, was gemacht werden soll – Helfer in deiner Nähe melden sich.
        </EmptyHint>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            <span className="tabular-nums">{groups.open}</span> offen ·{" "}
            <span className="tabular-nums">{groups.planned}</span> geplant ·{" "}
            <span className="tabular-nums">{groups.done}</span> erledigt
          </p>
          <ul className="space-y-2">
            {recent.map((g) => {
              const info = describeGigStatus(g.status, "customer", {
                paymentState: g.payment_state as PaymentState,
                hasScheduledDate: !!g.scheduled_at,
              });
              const journey = gigJourney(g);
              return (
                <li key={g.id}>
                  <Link
                    to="/my-gigs"
                    className={cn(
                      "block rounded-xl border px-3 py-3 transition-colors hover:bg-glass",
                      info.needsAction ? "border-amber-400/40" : "border-glass-border",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{g.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {g.scheduled_at ? formatBerlinDate(g.scheduled_at) : "Kein Termin"} ·{" "}
                          {euros(g.budget_cents)}
                        </p>
                      </div>
                      <Badge variant="outline" className={cn("shrink-0 text-[11px]", TONE_CLASSES[info.tone])}>
                        {info.label}
                      </Badge>
                    </div>
                    {journey && !journey.finished && (
                      <JourneyTrack
                        className="mt-3"
                        journey={journey}
                        needsAction={info.needsAction}
                        compact={compact}
                      />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </WidgetCard>
  );
}

function OverviewWidget({ gigsQuery }: { gigsQuery: GigsQuery }) {
  const compact = useDashboardDensity() === "compact";
  const now = useDayNow();
  const gigs = useMemo(() => gigsQuery.data?.gigs ?? [], [gigsQuery.data]);
  const groups = useMemo(() => countGigGroups(gigs), [gigs]);
  const calendar = useMemo(() => appointmentCalendar(gigs, now), [gigs, now]);
  const total = groups.open + groups.planned + groups.done;
  // Neue Kunden sehen hier noch nichts - "So startest du" erklärt den Anfang.
  if (gigsQuery.data && total === 0) return null;
  const confirmedDates = calendar.reduce((n, d) => n + d.confirmed, 0);
  const requestedDates = calendar.reduce((n, d) => n + d.requested, 0);

  return (
    <WidgetCard title="Auf einen Blick" icon={<Activity className="size-5 text-primary" />}>
      {gigsQuery.isLoading ? (
        <Loading />
      ) : gigsQuery.isError ? (
        <LoadError onRetry={() => gigsQuery.refetch()} />
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <section aria-labelledby="overview-gigs">
            <h3 id="overview-gigs" className="mb-3 text-xs font-medium text-muted-foreground">
              Aufträge
            </h3>
            <div className="flex items-center gap-5">
              <ProgressRing
                size={compact ? 96 : 120}
                center={total}
                caption={total === 1 ? "Auftrag" : "Aufträge"}
                segments={[
                  { key: "open", value: groups.open, color: GROUP_COLORS.open },
                  { key: "planned", value: groups.planned, color: GROUP_COLORS.planned },
                  { key: "done", value: groups.done, color: GROUP_COLORS.done },
                ]}
              />
              <ul className="min-w-0 max-w-36 flex-1 space-y-2">
                <LegendItem color={GROUP_COLORS.open} label="Offen" value={groups.open} />
                <LegendItem color={GROUP_COLORS.planned} label="Geplant" value={groups.planned} />
                <LegendItem color={GROUP_COLORS.done} label="Erledigt" value={groups.done} />
              </ul>
            </div>
          </section>

          <section
            aria-labelledby="overview-calendar"
            className="border-t border-glass-border pt-5 md:border-l md:border-t-0 md:pl-6 md:pt-0"
          >
            <h3 id="overview-calendar" className="mb-3 text-xs font-medium text-muted-foreground">
              Termine · diese und nächste Woche
            </h3>
            <MiniCalendar days={calendar} />
            {confirmedDates + requestedDates === 0 && (
              <p className="mt-2 text-xs text-muted-foreground">Gerade steht kein Termin an.</p>
            )}
          </section>
        </div>
      )}
    </WidgetCard>
  );
}

function BudgetWidget({ gigsQuery }: { gigsQuery: GigsQuery }) {
  const now = useDayNow();
  const gigs = useMemo(() => gigsQuery.data?.gigs ?? [], [gigsQuery.data]);
  const totals = useMemo(() => sumBudget(gigs), [gigs]);
  const months = useMemo(() => monthlyBudget(gigs, now), [gigs, now]);
  const services = useMemo(() => serviceBreakdown(gigs), [gigs]);
  const hasMoney = months.some((m) => m.paidCents + m.plannedCents > 0);
  // Ohne echte Aufträge (auch ohne stornierte) gibt es nichts zu zeigen.
  if (gigsQuery.data && services.length === 0) return null;

  return (
    <WidgetCard title="Budget im Verlauf" icon={<Wallet className="size-5 text-primary" />}>
      {gigsQuery.isLoading ? (
        <Loading />
      ) : gigsQuery.isError ? (
        <LoadError onRetry={() => gigsQuery.refetch()} />
      ) : (
        // Container-Abfrage statt Bildschirmbreite: halbe Breite stapelt, volle Breite steht nebeneinander.
        <div className="@container">
          <div className="grid gap-x-10 gap-y-6 @2xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] @2xl:content-start">
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 @2xl:col-start-2 @2xl:row-start-1">
              <div>
                <p className="text-xs text-muted-foreground">Insgesamt bezahlt</p>
                <p className="text-2xl font-semibold tabular-nums leading-tight">{euros(totals.paidCents)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Noch geplant</p>
                <p className="text-lg font-semibold tabular-nums leading-tight">{euros(totals.plannedCents)}</p>
              </div>
            </div>

            <div className="@2xl:col-start-1 @2xl:row-span-2 @2xl:row-start-1">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">Drei Monate zurück, zwei voraus</p>
                <ul className="flex gap-4">
                  <LegendItem color="var(--primary)" label="Bezahlt" />
                  <LegendItem color="var(--primary)" label="Geplant" hatched />
                </ul>
              </div>
              {hasMoney ? (
                <BudgetChart months={months} />
              ) : (
                <EmptyHint>
                  In diesem Zeitraum ist noch kein Budget im Spiel. Sobald ein Helfer bestätigt, erscheint es hier.
                </EmptyHint>
              )}
            </div>

            <div className="@2xl:col-start-2 @2xl:row-start-2">
              <p className="mb-2 text-xs text-muted-foreground">Wofür du Helfer buchst</p>
              <ServiceBar shares={services} />
            </div>
          </div>
        </div>
      )}
    </WidgetCard>
  );
}

function MessagesWidget({
  query,
}: {
  query: ReturnType<typeof useConversationsQuery>;
}) {
  const compact = useDashboardDensity() === "compact";
  const conversations = (query.data?.conversations ?? []).slice(0, compact ? 3 : 4);
  const unread = (query.data?.conversations ?? []).reduce((n, c) => n + c.unreadCount, 0);

  return (
    <WidgetCard
      title="Nachrichten"
      icon={<MessageSquare className="size-5 text-primary" />}
      action={
        <Button asChild size="sm" variant="ghost" className="gap-1">
          <Link to="/messages">
            {unread > 0 ? `${unread} neu` : "Alle"}
            <ChevronRight className="size-4" />
          </Link>
        </Button>
      }
    >
      {query.isLoading ? (
        <Loading />
      ) : query.isError ? (
        <LoadError onRetry={() => query.refetch()} />
      ) : conversations.length === 0 ? (
        <EmptyHint>
          Noch keine Unterhaltung. Schreib einem Helfer direkt aus seinem Profil – bevor du buchst.
        </EmptyHint>
      ) : (
        <ul className="space-y-2">
          {conversations.map((c) => (
            <li key={c.id}>
              <Link
                to="/messages/$conversationId"
                params={{ conversationId: c.id }}
                className="flex items-center gap-3 rounded-xl border border-glass-border px-3 py-2.5 transition-colors hover:bg-glass"
              >
                <Avatar className="size-9">
                  <AvatarFallback className="text-xs">
                    {c.otherUser.displayName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-sm", c.unreadCount > 0 ? "font-semibold" : "font-medium")}>
                    {c.otherUser.displayName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.lastMessage ? c.lastMessage.body.replace(/\s+/g, " ") : "Noch keine Nachricht"}
                  </p>
                </div>
                {c.unreadCount > 0 && (
                  <span
                    className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground"
                    aria-label={`${c.unreadCount} ungelesen`}
                  >
                    {c.unreadCount}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

function FavoritesWidget({
  favoritesQuery,
  helpersById,
  onBook,
}: {
  favoritesQuery: ReturnType<typeof useFavoritesQuery>;
  helpersById: Map<string, DisplayHelper>;
  onBook: (helper: DisplayHelper) => void;
}) {
  const compact = useDashboardDensity() === "compact";
  const favorites = (favoritesQuery.data?.favorites ?? []).slice(0, compact ? 3 : 4);

  return (
    <WidgetCard title="Meine Favoriten" icon={<Heart className="size-5 text-primary" />}>
      {favoritesQuery.isLoading ? (
        <Loading />
      ) : favoritesQuery.isError ? (
        <LoadError onRetry={() => favoritesQuery.refetch()} />
      ) : favorites.length === 0 ? (
        <EmptyHint>
          Tippe in der Helfer-Suche auf das Herz, um Helfer zu merken. Hier findest du sie schnell wieder.
        </EmptyHint>
      ) : (
        <ul className="space-y-2">
          {favorites.map((f) => {
            const profile = f.profiles;
            const bookable = helpersById.get(f.helper_id);
            return (
              <li
                key={f.helper_id}
                className="flex items-center gap-3 rounded-xl border border-glass-border px-3 py-2.5"
              >
                <Avatar className="size-9">
                  <AvatarFallback className="text-xs" style={tintFor(profile?.display_name ?? "Helfer")}>
                    {(profile?.display_name ?? "Helfer").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{profile?.display_name ?? "Helfer"}</p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {profile?.city ?? "Ort unbekannt"}
                    {profile?.available_today && (
                      <span className="inline-flex items-center gap-1 text-emerald-400">
                        <span className="size-1.5 rounded-full bg-emerald-500" />
                        Heute verfügbar
                      </span>
                    )}
                  </p>
                </div>
                {bookable ? (
                  <Button size="sm" onClick={() => onBook(bookable)}>
                    Buchen
                  </Button>
                ) : (
                  <Button asChild size="sm" variant="outline">
                    <Link to="/helpers/$helperId" params={{ helperId: f.helper_id }}>
                      Profil
                    </Link>
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </WidgetCard>
  );
}

/* ------------------------------------------------------------------ *
 * Helfer finden (Suche mit gemerkten Filtern)
 * ------------------------------------------------------------------ */

interface SearchFilters {
  category: string;
  location: string;
  minRating: string;
  onlyAvailableToday: boolean;
  sort: "available" | "rating" | "price";
}

const DEFAULT_FILTERS: SearchFilters = {
  category: "all",
  location: "",
  minRating: "0",
  onlyAvailableToday: false,
  sort: "available",
};

function isSearchFilters(v: unknown): v is SearchFilters {
  if (!v || typeof v !== "object") return false;
  const f = v as Record<string, unknown>;
  return (
    typeof f.category === "string" &&
    typeof f.location === "string" &&
    typeof f.minRating === "string" &&
    typeof f.onlyAvailableToday === "boolean" &&
    (f.sort === "available" || f.sort === "rating" || f.sort === "price")
  );
}

function FindHelpersWidget({
  query,
  helpers,
  favoriteIds,
  onToggleFavorite,
  onBook,
}: {
  query: ReturnType<typeof useHelpersQuery>;
  helpers: DisplayHelper[];
  favoriteIds: Set<string>;
  onToggleFavorite: (helperId: string, add: boolean) => void;
  onBook: (helper: DisplayHelper) => void;
}) {
  const { user } = useAuth();
  const compact = useDashboardDensity() === "compact";
  const pageSize = compact ? 9 : 6;
  const [filters, setFilters, resetFilters] = useStoredState<SearchFilters>(
    `gm-helper-search:v1:${user?.id ?? "anon"}`,
    DEFAULT_FILTERS,
    isSearchFilters,
  );
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const patch = (p: Partial<SearchFilters>) => {
    setFilters((f) => ({ ...f, ...p }));
    setVisibleCount(pageSize);
  };
  const filtersActive = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);

  const filtered = useMemo(() => {
    const needle = filters.location.trim().toLowerCase();
    const list = helpers.filter((h) => {
      if (filters.category !== "all" && !h.serviceTypes.includes(filters.category)) return false;
      if (needle && !`${h.location ?? ""} ${h.postalCode ?? ""}`.toLowerCase().includes(needle)) return false;
      if ((h.rating ?? 0) < Number(filters.minRating)) return false;
      if (filters.onlyAvailableToday && !h.availableToday) return false;
      return true;
    });
    const rating = (h: DisplayHelper) => h.rating ?? -1;
    const price = (h: DisplayHelper) => h.fromPriceCents ?? Number.MAX_SAFE_INTEGER;
    return list.sort((a, b) => {
      if (filters.sort === "rating") return rating(b) - rating(a);
      if (filters.sort === "price") return price(a) - price(b);
      return Number(b.availableToday) - Number(a.availableToday) || rating(b) - rating(a);
    });
  }, [helpers, filters]);

  const shown = filtered.slice(0, visibleCount);

  return (
    <div id="helfer-suche" className="scroll-mt-24">
      <WidgetCard
        title="Helfer finden"
        icon={<Search className="size-5 text-primary" />}
        action={
          filtersActive ? (
            <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => { resetFilters(); setVisibleCount(pageSize); }}>
              <RotateCcw className="size-3.5" />
              Filter zurücksetzen
            </Button>
          ) : undefined
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Welche Arbeit soll erledigt werden?">
            <Chip active={filters.category === "all"} onClick={() => patch({ category: "all" })}>
              Alle Leistungen
            </Chip>
            {SERVICE_TYPES.map((s) => (
              <Chip
                key={s.value}
                active={filters.category === s.value}
                onClick={() => patch({ category: filters.category === s.value ? "all" : s.value })}
              >
                {s.label}
              </Chip>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label htmlFor="helper-location" className="mb-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3" /> Ort oder PLZ
              </Label>
              <Input
                id="helper-location"
                placeholder="z. B. Freiburg oder 79100"
                value={filters.location}
                onChange={(e) => patch({ location: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                <Star className="size-3" /> Mindestbewertung
              </Label>
              <Select value={filters.minRating} onValueChange={(v) => patch({ minRating: v })}>
                <SelectTrigger aria-label="Mindestbewertung">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Alle Bewertungen</SelectItem>
                  <SelectItem value="4">4+ Sterne</SelectItem>
                  <SelectItem value="4.5">4,5+ Sterne</SelectItem>
                  <SelectItem value="4.8">4,8+ Sterne</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block text-xs text-muted-foreground">Sortieren nach</Label>
              <Select
                value={filters.sort}
                onValueChange={(v) => patch({ sort: v as SearchFilters["sort"] })}
              >
                <SelectTrigger aria-label="Sortierung">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Heute verfügbar zuerst</SelectItem>
                  <SelectItem value="rating">Beste Bewertung</SelectItem>
                  <SelectItem value="price">Günstigster Preis</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Chip
                active={filters.onlyAvailableToday}
                onClick={() => patch({ onlyAvailableToday: !filters.onlyAvailableToday })}
              >
                <span className="mr-1.5 inline-block size-2 rounded-full bg-emerald-500" />
                Nur heute verfügbar
              </Chip>
            </div>
          </div>

          <p className="text-sm text-muted-foreground" aria-live="polite">
            {query.isLoading ? "Helfer werden geladen …" : `${filtered.length} Helfer gefunden`}
            {filters.category !== "all" && !query.isLoading && (
              <span className="text-xs"> · es erscheinen Helfer, die diese Leistung anbieten</span>
            )}
          </p>

          {query.isError ? (
            <LoadError onRetry={() => query.refetch()} />
          ) : query.isLoading ? (
            <Loading />
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Search className="size-8 text-muted-foreground/50" />
              <p className="max-w-sm text-sm text-muted-foreground">
                Kein passender Helfer gefunden. Lockere die Filter – oder veröffentliche einen Auftrag, dann
                melden sich Helfer bei dir.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {filtersActive && (
                  <Button size="sm" variant="outline" onClick={() => { resetFilters(); setVisibleCount(pageSize); }}>
                    Filter zurücksetzen
                  </Button>
                )}
                <Button asChild size="sm">
                  <Link to="/create-gig">Auftrag erstellen</Link>
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(17rem,1fr))]">
                {shown.map((h) => (
                  <HelperCard
                    key={h.id}
                    helper={h}
                    isFavorite={favoriteIds.has(h.id)}
                    onToggleFavorite={() => onToggleFavorite(h.id, !favoriteIds.has(h.id))}
                    onBook={() => onBook(h)}
                  />
                ))}
              </div>
              {filtered.length > shown.length && (
                <div className="text-center">
                  <Button variant="outline" size="sm" onClick={() => setVisibleCount((n) => n + pageSize)}>
                    Mehr anzeigen ({filtered.length - shown.length} weitere)
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </WidgetCard>
    </div>
  );
}

function HelperCard({
  helper: h,
  isFavorite,
  onToggleFavorite,
  onBook,
}: {
  helper: DisplayHelper;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onBook: () => void;
}) {
  return (
    <Card className="border-glass-border bg-glass transition hover:border-primary/60">
      <CardContent className="flex h-full flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <Avatar className="size-12">
            {h.imageUrl && <AvatarImage src={h.imageUrl} alt={h.name} />}
            <AvatarFallback style={tintFor(h.name)}>{h.name.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold">{h.name}</h3>
            {h.title && <p className="truncate text-sm text-muted-foreground">{h.title}</p>}
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              {h.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3" />
                  {h.location}
                </span>
              )}
              {h.rating !== null ? (
                <span className="inline-flex items-center gap-1.5">
                  <RatingStars rating={h.rating} />
                  <span className="tabular-nums">
                    {h.rating.toFixed(1).replace(".", ",")} ({h.reviewCount})
                  </span>
                </span>
              ) : (
                <span>Noch keine Bewertungen</span>
              )}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-pressed={isFavorite}
            aria-label={isFavorite ? `${h.name} aus Favoriten entfernen` : `${h.name} zu Favoriten hinzufügen`}
            onClick={onToggleFavorite}
          >
            <Heart className={cn("size-4", isFavorite && "fill-primary text-primary")} />
          </Button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {h.availableToday && (
            <Badge className="gap-1 border-emerald-500/30 bg-emerald-500/15 text-xs text-emerald-600 dark:text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Heute verfügbar
            </Badge>
          )}
          <Badge variant="outline" className="text-xs">
            {ageBadgeLabel[h.ageBadge]}
          </Badge>
        </div>

        {h.serviceTypes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {h.serviceTypes.slice(0, 3).map((s) => (
              <Badge key={s} variant="secondary" className="text-xs font-normal">
                {serviceLabel(s)}
              </Badge>
            ))}
            {h.serviceTypes.length > 3 && (
              <Badge variant="secondary" className="text-xs font-normal">
                +{h.serviceTypes.length - 3}
              </Badge>
            )}
          </div>
        )}

        {h.bio && <p className="line-clamp-2 text-sm text-muted-foreground">{h.bio}</p>}

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span className="text-sm font-semibold">
            {h.fromPriceCents !== null ? (
              <>
                <span className="text-xs font-normal text-muted-foreground">Angebote ab </span>
                {euros(h.fromPriceCents)}
              </>
            ) : (
              <span className="text-xs font-normal text-muted-foreground">Preis auf Anfrage</span>
            )}
          </span>
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/helpers/$helperId" params={{ helperId: h.id }}>
                Profil
              </Link>
            </Button>
            <Button size="sm" onClick={onBook}>
              Buchen
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Daten-Abfragen (teilen sich Cache-Schlüssel mit den übrigen Seiten)
 * ------------------------------------------------------------------ */

function useHelpersQuery() {
  const fn = useServerFn(getAvailableHelpers);
  return useQuery({ queryKey: ["marketplace-helpers"], queryFn: () => fn() });
}

function useConversationsQuery() {
  const fn = useServerFn(getMyConversations);
  return useQuery({ queryKey: ["dashboard-conversations"], queryFn: () => fn() });
}

function useFavoritesQuery() {
  const fn = useServerFn(getMyFavorites);
  return useQuery({ queryKey: ["my-favorites"], queryFn: () => fn() });
}

function useProfileQuery() {
  const fn = useServerFn(getMyProfile);
  return useQuery({ queryKey: ["my-profile"], queryFn: () => fn() });
}

/* ------------------------------------------------------------------ *
 * Dashboard
 * ------------------------------------------------------------------ */

export function CustomerDashboard() {
  const { t } = useI18n();
  const { navItems } = useAppNavItems();
  const queryClient = useQueryClient();

  const helpersQuery = useHelpersQuery();
  const gigsQuery = useGigsQuery();
  const conversationsQuery = useConversationsQuery();
  const favoritesQuery = useFavoritesQuery();
  const profileQuery = useProfileQuery();

  const createBookingRequest = useServerFn(createDirectBookingRequest);
  const toggleFavoriteFn = useServerFn(toggleFavorite);

  const [selectedHelper, setSelectedHelper] = useState<DisplayHelper | null>(null);
  const [bookingDayOffset, setBookingDayOffset] = useState(0);

  const bookingMutation = useMutation({
    mutationFn: (input: {
      helperId: string;
      serviceType: string;
      description: string;
      address: string;
      district?: string;
      scheduledAt: string;
      budgetCents: number;
      listingId?: string;
    }) => createBookingRequest({ data: input }),
    onSuccess: () => {
      toast.success("Buchungsanfrage gesendet. Der Helfer muss sie noch bestätigen.");
      setSelectedHelper(null);
      queryClient.invalidateQueries({ queryKey: ["marketplace-helpers"] });
      queryClient.invalidateQueries({ queryKey: ["helper-booking-info"] });
      queryClient.invalidateQueries({ queryKey: ["my-gigs"] });
    },
    onError: (error: unknown) => {
      toast.error(
        error instanceof Error ? error.message : "Buchungsanfrage konnte nicht gesendet werden.",
      );
    },
  });

  const favoriteMutation = useMutation({
    mutationFn: (input: { helperId: string; add: boolean }) => toggleFavoriteFn({ data: input }),
    onSuccess: (_res, vars) => {
      toast.success(vars.add ? "Zu deinen Favoriten hinzugefügt." : "Aus deinen Favoriten entfernt.");
      queryClient.invalidateQueries({ queryKey: ["my-favorites"] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Das hat leider nicht geklappt.");
    },
  });

  // Echte Daten des Helfers für die Buchungsmaske: freie Zeiten, Urlaub, Angebote mit Preis.
  const getBookingInfo = useServerFn(getHelperBookingInfo);
  // Wechselt der Tag (Tab über Nacht offen), werden Kalender und Freizeiten neu berechnet und neu geladen.
  const today = useBerlinToday();
  const bookingInfoQuery = useQuery({
    queryKey: ["helper-booking-info", selectedHelper?.id, today],
    queryFn: () => getBookingInfo({ data: { helperId: selectedHelper!.id } }),
    enabled: !!selectedHelper,
    staleTime: 15_000,
  });
  const bookingInfo = bookingInfoQuery.data;

  const helpers: DisplayHelper[] = useMemo(
    () =>
      (helpersQuery.data?.helpers ?? []).map((h) => ({
        id: h.id,
        name: h.displayName,
        title: h.businessName,
        location: h.city,
        postalCode: h.postalCode,
        rating: h.rating,
        reviewCount: h.reviewCount,
        imageUrl: null,
        ageBadge: h.role,
        serviceTypes: h.serviceTypes,
        fromPriceCents: h.fromPriceCents,
        bio: h.bio,
        availableToday: h.availableToday,
      })),
    [helpersQuery.data],
  );
  const helpersById = useMemo(() => new Map(helpers.map((h) => [h.id, h])), [helpers]);
  const favoriteIds = useMemo(
    () => new Set((favoritesQuery.data?.favorites ?? []).map((f) => f.helper_id)),
    [favoritesQuery.data],
  );

  const openBooking = (helper: DisplayHelper) => {
    setBookingDayOffset(0);
    setSelectedHelper(helper);
  };

  const unreadMessages = (conversationsQuery.data?.conversations ?? []).reduce(
    (n, c) => n + c.unreadCount,
    0,
  );
  const openTasks = deriveCustomerTasks(gigsQuery.data?.gigs ?? [], unreadMessages).filter(
    (task) => task.tone === "action",
  ).length;

  const displayName = profileQuery.data?.profile?.display_name ?? null;
  const firstName = displayName?.trim().split(/\s+/)[0] ?? "";

  const widgets: DashboardWidget[] = [
    {
      id: "attention",
      title: "Das ist jetzt zu tun",
      description: "Gebote prüfen, Termine abstimmen, Bewertungen abgeben und ungelesene Nachrichten.",
      defaultWidth: "full",
      essential: true,
      render: () => <AttentionWidget gigsQuery={gigsQuery} unreadMessages={unreadMessages} />,
    },
    {
      id: "overview",
      title: "Auf einen Blick",
      description: "Deine Aufträge als Ring und ein Mini-Kalender mit deinen Terminen.",
      defaultWidth: "full",
      essential: true,
      render: () => <OverviewWidget gigsQuery={gigsQuery} />,
    },
    {
      id: "getting-started",
      title: "So startest du",
      description: "Drei kurze Schritte zum ersten Auftrag. Verschwindet, sobald du einen Auftrag hast.",
      defaultWidth: "full",
      render: () => <GettingStartedWidget gigsQuery={gigsQuery} profileName={displayName} />,
    },
    {
      id: "next-appointment",
      title: "Nächster Termin",
      description: "Dein nächster bestätigter Einsatz auf einen Blick.",
      essential: true,
      render: () => <NextAppointmentWidget gigsQuery={gigsQuery} />,
    },
    {
      id: "my-gigs",
      title: "Meine Aufträge",
      description: "Wie viele Aufträge offen, geplant und erledigt sind – plus die letzten Einträge.",
      essential: true,
      render: () => <MyGigsWidget gigsQuery={gigsQuery} />,
    },
    {
      id: "budget",
      title: "Budget im Verlauf",
      description: "Bezahlt und geplant je Monat als Diagramm – und wofür du Helfer buchst. Standardmäßig ausgeblendet.",
      defaultWidth: "full",
      defaultVisible: false,
      render: () => <BudgetWidget gigsQuery={gigsQuery} />,
    },
    {
      id: "messages",
      title: "Nachrichten",
      description: "Deine letzten Unterhaltungen. Ungelesene sind markiert.",
      render: () => <MessagesWidget query={conversationsQuery} />,
    },
    {
      id: "favorites",
      title: "Meine Favoriten",
      description: "Helfer, die du dir gemerkt hast – direkt buchbar.",
      render: () => (
        <FavoritesWidget favoritesQuery={favoritesQuery} helpersById={helpersById} onBook={openBooking} />
      ),
    },
    {
      id: "find-helpers",
      title: "Helfer finden",
      description: "Suche nach Leistung, Ort und Bewertung. Deine Filter werden gemerkt.",
      defaultWidth: "full",
      essential: true,
      render: () => (
        <FindHelpersWidget
          query={helpersQuery}
          helpers={helpers}
          favoriteIds={favoriteIds}
          onToggleFavorite={(helperId, add) => favoriteMutation.mutate({ helperId, add })}
          onBook={openBooking}
        />
      ),
    },
  ];

  return (
    <DashboardShell
      title={t("dashboard.nav.dashboard") || "Dashboard"}
      navItems={navItems}
      activeKey="dashboard"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-brand text-2xl">{firstName ? `Hallo, ${firstName}!` : "Hallo!"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {gigsQuery.isLoading
              ? "Dein Überblick wird geladen …"
              : openTasks > 0
                ? openTasks === 1
                  ? "Eine Sache wartet auf dich."
                  : `${openTasks} Dinge warten auf dich.`
                : "Gerade ist nichts offen. Zeit für den nächsten Auftrag?"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="gap-1.5">
            <a href="#helfer-suche">
              <Search className="size-4" />
              Helfer finden
            </a>
          </Button>
          <Button asChild className="gap-1.5">
            <Link to="/create-gig">
              <Plus className="size-4" />
              Auftrag erstellen
            </Link>
          </Button>
        </div>
      </div>

      <CustomizableDashboard scope="customer" widgets={widgets} title="Dein Überblick" />

      <Dialog
        open={!!selectedHelper}
        onOpenChange={(open) => !open && setSelectedHelper(null)}
      >
        <DialogContent className="max-w-3xl overflow-y-auto p-0 sm:max-h-[90vh]">
          <DialogTitle className="sr-only">Termin buchen</DialogTitle>
          {selectedHelper && bookingInfoQuery.isLoading && (
            <p className="p-8 text-center text-sm text-muted-foreground">Verfügbarkeit wird geladen…</p>
          )}
          {selectedHelper && bookingInfoQuery.isError && (
            <p className="p-8 text-center text-sm text-destructive">
              Die Verfügbarkeit konnte nicht geladen werden. Bitte versuche es erneut.
            </p>
          )}
          {selectedHelper && bookingInfo && !bookingInfo.bookable && (
            <div className="p-8 text-center">
              <p className="font-semibold">{selectedHelper.name} ist aktuell nicht buchbar</p>
              <p className="mt-2 text-sm text-muted-foreground">{bookingInfo.reason}</p>
            </div>
          )}
          {selectedHelper && bookingInfo?.bookable && (
            <BookingScheduler
              helper={{
                id: selectedHelper.id,
                name: bookingInfo.helperName || selectedHelper.name,
                title: selectedHelper.title ?? "",
                location: selectedHelper.location ?? "",
                rating: selectedHelper.rating ?? 0,
                reviewCount: selectedHelper.reviewCount,
                imageUrl: selectedHelper.imageUrl ?? "",
                hourlyRate: 0,
              }}
              services={bookingInfo.services}
              weekSchedule={buildSchedule(bookingInfo, bookingDayOffset)}
              onWeekChange={(direction) =>
                setBookingDayOffset((o) =>
                  Math.max(0, Math.min(BOOKING_WINDOW_DAYS - 6, o + (direction === "next" ? 6 : -6))),
                )
              }
              onBookingRequest={(data) => {
                if (bookingMutation.isPending) return;
                bookingMutation.mutate({
                  helperId: data.helperId,
                  serviceType: data.serviceType,
                  description: data.listingId
                    ? "Buchung über „Helfer finden“"
                    : `Anfrage über „Helfer finden“ (Preisvorschlag des Kunden)`,
                  address: data.address,
                  ...(data.district ? { district: data.district } : {}),
                  scheduledAt: data.scheduledAt,
                  budgetCents: data.budgetCents,
                  ...(data.listingId ? { listingId: data.listingId } : {}),
                });
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}

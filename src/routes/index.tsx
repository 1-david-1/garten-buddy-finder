import { createFileRoute, Link } from "@tanstack/react-router";
import type { CSSProperties, ReactNode } from "react";
import {
  BadgeCheck,
  CalendarClock,
  FileEdit,
  Gavel,
  Gift,
  Handshake,
  Lock,
  MessageSquare,
  Receipt,
  ShieldCheck,
  ShoppingBag,
  Star,
} from "lucide-react";
import { SiteNav } from "@/components/site-nav";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ArrowCurve,
  ArrowLoopLeft,
  ArrowLoopRight,
  FloatCard,
  SpinBadge,
  Sprout,
  Squiggle,
  Stamp,
} from "@/components/landing/playful";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Gartenhilfe Freiburg – geprüfte Helfer | GreenMatch" },
      {
        name: "description",
        content:
          "Gartenhilfe in Freiburg: Rasen, Hecke, Beet. Helfer von nebenan, alle per Ausweis geprüft, Jugendliche mit Eltern-Freigabe. Kostenlos.",
      },
      { property: "og:title", content: "Gartenhilfe Freiburg – geprüfte Helfer | GreenMatch" },
      { property: "og:description", content: "Fair. Lokal. Verifiziert." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

/*
 * Design (Startseite): hell, verspielt, mit dicker 3D-Schrift, Hartschatten und handgezeichneten
 * Pfeilen. Palette und Schriften stehen in styles.css (.gm-playful). Die große Geste gehört dem
 * Kopfbereich, alles darunter bleibt ruhiger: ein Farbwechsel pro Abschnitt, gleiche Kontur,
 * leicht gekippte Karten. Bewegung: ein Einstieg im Kopf, schwebende Karten, drehendes Badge.
 */

function Landing() {
  return (
    <div className="gm-playful min-h-screen overflow-x-clip">
      <SiteNav />
      <Hero />
      <Panel />
      <Safety />
      <Trust />
      <Faq />
      <FinalCta />
      <Footer />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Gemeinsame Bausteine                                                */
/* ------------------------------------------------------------------ */

type RotStyle = CSSProperties & { "--gm-rot"?: string };
const rot = (deg: number, extra: CSSProperties = {}): RotStyle => ({ "--gm-rot": `${deg}deg`, ...extra });

const BTN_SUN =
  "gm-btn inline-flex items-center justify-center rounded-2xl bg-[#ffd21f] px-6 py-3.5 text-base font-bold text-[#04301e]";
const BTN_WHITE =
  "gm-btn inline-flex items-center justify-center rounded-2xl bg-white px-6 py-3.5 text-base font-bold text-[#04301e]";
const BTN_DEEP =
  "gm-btn inline-flex w-full items-center justify-center rounded-2xl bg-[#04301e] px-6 py-3.5 text-base font-bold text-white";

function SectionTitle({
  title,
  sub,
  accent = "#ff5a36",
  light = false,
}: {
  title: ReactNode;
  sub?: string;
  accent?: string;
  light?: boolean;
}) {
  return (
    <div className="max-w-2xl">
      <h2 className="font-brand text-4xl leading-[1.02] md:text-6xl">{title}</h2>
      <Squiggle className="mt-3 h-3 w-40" style={{ color: accent }} />
      {sub ? (
        <p className={`mt-4 text-lg ${light ? "text-white/90" : "text-muted-foreground"}`}>{sub}</p>
      ) : null}
    </div>
  );
}

function StatusTag({ status, label }: { status: "live" | "soon"; label: string }) {
  return (
    <span
      className={`inline-block rounded-full border-2 border-[#04301e] px-2.5 py-0.5 text-xs font-bold ${
        status === "live" ? "bg-[#04301e] text-white" : "bg-[#ffd21f] text-[#04301e]"
      }`}
    >
      {label}
    </span>
  );
}

function IconBlob({ children, color = "#ffd21f" }: { children: ReactNode; color?: string }) {
  return (
    <div
      className="mb-4 flex size-14 items-center justify-center rounded-[1.1rem] border-[3px] border-[#04301e] text-[#04301e]"
      style={{ background: color }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Kopfbereich                                                         */
/* ------------------------------------------------------------------ */

function Hero() {
  const { t } = useI18n();
  const { user } = useAuth();

  const cards = (
    <>
      <FloatCard
        variant="leaf"
        rot={-9}
        name={t("lp.card.1.name")}
        job={t("lp.card.1.job")}
        status={t("lp.card.1.status")}
        className="absolute left-0 top-[50%] hidden lg:block"
      />
      <FloatCard
        variant="sun"
        rot={8}
        delay={1}
        name={t("lp.card.2.name")}
        job={t("lp.card.2.job")}
        status={t("lp.card.2.status")}
        className="absolute right-0 top-[4%] hidden lg:block"
      />
    </>
  );

  return (
    <section className="relative isolate z-10 bg-[#087f43] text-white">
      <div className="gm-grid-bg pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
      <div className="relative mx-auto max-w-6xl px-5 pb-36 pt-14 md:pb-48 md:pt-20">
        {cards}
        <ArrowLoopLeft className="pointer-events-none absolute bottom-20 left-[17%] hidden size-28 text-[#ffd21f] lg:block" />
        <ArrowLoopRight className="pointer-events-none absolute right-[11%] top-[40%] hidden size-28 text-[#ffd21f] lg:block" />

        <div className="relative z-10 flex flex-col items-center text-center">
          <span
            className="gm-sticker gm-pop mb-8 inline-flex items-center gap-2 rounded-full border-[3px] border-[#04301e] bg-[#ff5a36] px-4 py-1.5 text-sm font-bold text-white shadow-[3px_3px_0_#04301e]"
            style={rot(-3)}
          >
            <Sprout className="size-5" />
            {t("lp.badge")}
          </span>

          <h1 className="font-brand text-[clamp(2.9rem,9.5vw,7.75rem)] leading-[0.92] [text-wrap:balance]">
            <span className="gm-extrude gm-pop block" style={rot(0)}>
              {t("lp.hero.a")}
            </span>
            <span
              className="gm-extrude gm-pop mt-3 inline-block text-[#ffd21f]"
              style={rot(-2, { animationDelay: "0.15s" })}
            >
              {t("lp.hero.b")}
            </span>
          </h1>

          <p className="mt-10 max-w-xl text-lg font-semibold md:text-xl">{t("lp.hero.sub")}</p>

          <div className="mt-8 flex flex-wrap justify-center gap-4">
            {user ? (
              <Link to="/dashboard" className={BTN_SUN}>
                {t("lp.hero.cta.dashboard")}
              </Link>
            ) : (
              <>
                <Link to="/auth" search={{ mode: "signup", role: "customer" }} className={BTN_SUN}>
                  {t("lp.hero.cta.customer")}
                </Link>
                <Link to="/auth" search={{ mode: "signup", role: "helper" }} className={BTN_WHITE}>
                  {t("lp.hero.cta.helper")}
                </Link>
              </>
            )}
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {[1, 2, 3].map((n) => (
              <span
                key={n}
                className="inline-flex items-center gap-1.5 rounded-full border-2 border-white/70 px-3 py-1 text-sm font-semibold"
              >
                <BadgeCheck className="size-4 text-[#ffd21f]" />
                {t(`lp.hero.chip.${n}`)}
              </span>
            ))}
          </div>
          <p className="mt-5 text-sm font-semibold">
            {t("lp.hero.pilot")}{" "}
            <Link to="/freiburg" className="underline decoration-[#ffd21f] decoration-2 underline-offset-4">
              {t("lp.hero.pilot.link")}
            </Link>
          </p>

          <div className="mt-12 flex flex-wrap justify-center gap-6 lg:hidden">
            <FloatCard
              variant="leaf"
              rot={-6}
              name={t("lp.card.1.name")}
              job={t("lp.card.1.job")}
              status={t("lp.card.1.status")}
            />
            <FloatCard
              variant="sun"
              rot={5}
              delay={1}
              name={t("lp.card.2.name")}
              job={t("lp.card.2.job")}
              status={t("lp.card.2.status")}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Heller Abschnitt, der über den Kopfbereich ragt                     */
/* ------------------------------------------------------------------ */

function Panel() {
  const { t } = useI18n();
  const { user } = useAuth();
  return (
    <div className="relative z-20 -mt-14 rounded-t-[3rem] bg-[#eef8e8]">
      <div className="absolute -top-16 right-5 z-30 md:right-[12%]">
        <Link
          to={user ? "/dashboard" : "/auth"}
          search={user ? undefined : { mode: "signup" }}
          aria-label={t("lp.hero.cta.customer")}
          className="block rounded-full transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-[#04301e]"
        >
          <SpinBadge text={t("lp.badge.spin")}>
            <ArrowCurve className="size-10 text-[#04301e]" />
          </SpinBadge>
        </Link>
      </div>
      <Paths />
      <Check />
      <Ways />
      <FreeAndPay />
      <Levels />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* So läuft es: zwei Seiten, je drei Schritte                          */
/* ------------------------------------------------------------------ */

function Paths() {
  const { t } = useI18n();
  const { user } = useAuth();
  return (
    <section id="how" className="px-5 pb-20 pt-28 md:pt-32">
      <div className="mx-auto max-w-6xl">
        <SectionTitle title={t("lp.paths.title")} sub={t("lp.paths.sub")} />
        <div className="mt-14 grid gap-10 md:grid-cols-2">
          <PathCard
            role="customer"
            tone="sun"
            tilt={-1}
            hasUser={!!user}
            title={t("lp.paths.customer.title")}
            cta={t("lp.paths.customer.cta")}
            steps={[1, 2, 3].map((n) => ({
              title: t(`lp.paths.customer.${n}`),
              body: t(`lp.paths.customer.${n}.body`),
            }))}
          />
          <PathCard
            role="helper"
            tone="white"
            tilt={1}
            hasUser={!!user}
            title={t("lp.paths.helper.title")}
            cta={t("lp.paths.helper.cta")}
            steps={[1, 2, 3].map((n) => ({
              title: t(`lp.paths.helper.${n}`),
              body: t(`lp.paths.helper.${n}.body`),
            }))}
          />
        </div>
      </div>
    </section>
  );
}

function PathCard({
  role,
  tone,
  tilt,
  hasUser,
  title,
  cta,
  steps,
}: {
  role: "customer" | "helper";
  tone: "sun" | "white";
  tilt: number;
  hasUser: boolean;
  title: string;
  cta: string;
  steps: { title: string; body: string }[];
}) {
  return (
    <div
      className={`gm-card flex flex-col rounded-[2rem] p-7 md:p-9 ${tone === "sun" ? "bg-[#ffd21f]" : "bg-white"}`}
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      <h3 className="mb-6 font-brand text-3xl">{title}</h3>
      <ol className="flex-1 space-y-5">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-4">
            <span
              className={`flex size-10 shrink-0 items-center justify-center rounded-full border-[2.5px] border-[#04301e] font-brand text-lg ${
                tone === "sun" ? "bg-white" : "bg-[#ffd21f]"
              }`}
            >
              {i + 1}
            </span>
            <div>
              <p className="font-bold">{s.title}</p>
              <p className="mt-0.5 text-[15px] leading-snug text-[#04301e]/85">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-8">
        {hasUser ? (
          <Link to="/dashboard" className={BTN_DEEP}>
            {cta}
          </Link>
        ) : (
          <Link to="/auth" search={{ mode: "signup", role }} className={BTN_DEEP}>
            {cta}
          </Link>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Alle werden geprüft                                                 */
/* ------------------------------------------------------------------ */

function Check() {
  const { t } = useI18n();
  const cards = [
    { icon: BadgeCheck, n: 1, bg: "#ffffff", color: "#ffd21f", tilt: -1.5 },
    { icon: Lock, n: 2, bg: "#d6f1dc", color: "#ffffff", tilt: 1 },
    { icon: ShieldCheck, n: 3, bg: "#ffe36b", color: "#ffffff", tilt: -0.5 },
  ] as const;
  return (
    <section id="pruefung" className="px-5 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="relative">
          <SectionTitle title={t("lp.check.title")} sub={t("lp.check.sub")} accent="#087f43" />
          <Stamp className="absolute right-2 top-0 hidden size-28 -rotate-12 text-[#087f43] md:block" />
        </div>
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {cards.map(({ icon: Icon, n, bg, color, tilt }) => (
            <div
              key={n}
              className="gm-card gm-sticker rounded-[1.75rem] p-7"
              style={{ ...rot(tilt), background: bg }}
            >
              <IconBlob color={color}>
                <Icon className="size-7" />
              </IconBlob>
              <h3 className="mb-2 font-brand text-xl leading-tight">{t(`lp.check.${n}.title`)}</h3>
              <p className="text-[15px] leading-snug text-[#04301e]/85">{t(`lp.check.${n}.body`)}</p>
            </div>
          ))}
        </div>
        <p className="mt-10">
          <Link
            to="/vermittler"
            className="font-bold underline decoration-[#ff5a36] decoration-[3px] underline-offset-4"
          >
            {t("lp.check.link")}
          </Link>
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Zwei Wege                                                           */
/* ------------------------------------------------------------------ */

function Ways() {
  const { t } = useI18n();
  const badges = [
    { icon: ShoppingBag, key: "fixed" },
    { icon: Gavel, key: "auction" },
    { icon: Handshake, key: "negotiable" },
  ] as const;
  return (
    <section id="ways" className="px-5 py-20">
      <div className="mx-auto max-w-6xl">
        <SectionTitle title={t("lp.ways.title")} sub={t("lp.ways.sub")} accent="#ffd21f" />
        <div className="mt-12 grid gap-10 md:grid-cols-2">
          <div className="gm-card rounded-[2rem] bg-white p-8" style={{ transform: "rotate(-1deg)" }}>
            <IconBlob color="#ffd21f">
              <FileEdit className="size-7" />
            </IconBlob>
            <h3 className="mb-2 font-brand text-2xl">{t("lp.ways.post.title")}</h3>
            <p className="text-[15px] leading-snug text-[#04301e]/85">{t("lp.ways.post.body")}</p>
          </div>
          <div
            className="gm-card rounded-[2rem] bg-[#087f43] p-8 text-white"
            style={{ transform: "rotate(1deg)" }}
          >
            <IconBlob color="#ffffff">
              <ShoppingBag className="size-7" />
            </IconBlob>
            <h3 className="mb-2 font-brand text-2xl">{t("lp.ways.book.title")}</h3>
            <p className="mb-5 text-[15px] leading-snug text-white/95">{t("lp.ways.book.body")}</p>
            <div className="flex flex-wrap gap-2">
              {badges.map(({ icon: Icon, key }) => (
                <span
                  key={key}
                  className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#04301e] bg-[#ffd21f] px-3 py-1 text-xs font-bold text-[#04301e]"
                >
                  <Icon className="size-3.5" />
                  {t(`lp.ways.badge.${key}`)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Kostenlos + Bezahlung                                               */
/* ------------------------------------------------------------------ */

function FreeAndPay() {
  const { t } = useI18n();
  const cards = [
    { key: "cost", icon: Gift, status: "live" },
    { key: "pay", icon: Lock, status: "soon" },
  ] as const;
  return (
    <section id="free" className="bg-[#fff3b5] px-5 py-20">
      <div className="mx-auto max-w-4xl">
        <SectionTitle title={t("lp.free.title")} sub={t("lp.free.sub")} accent="#ff5a36" />
        <div className="mt-12 grid gap-8 md:grid-cols-2">
          {cards.map(({ key, icon: Icon, status }) => (
            <div
              key={key}
              className={`rounded-[2rem] p-8 ${
                status === "live"
                  ? "gm-card bg-white"
                  : "border-[3px] border-dashed border-[#04301e] bg-transparent"
              }`}
            >
              <div className="mb-4 flex items-start justify-between">
                <IconBlob color={status === "live" ? "#ffd21f" : "#ffffff"}>
                  <Icon className="size-7" />
                </IconBlob>
                <StatusTag status={status} label={t(`lp.status.${status}`)} />
              </div>
              <h3 className="mb-2 font-brand text-2xl">{t(`lp.free.${key}.title`)}</h3>
              <p className="text-[15px] leading-snug text-[#04301e]/85">{t(`lp.free.${key}.body`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Drei Helfer-Stufen                                                  */
/* ------------------------------------------------------------------ */

function Levels() {
  const { t } = useI18n();
  const items = [
    { key: "youth", icon: "🌱", bg: "#ffd21f", fg: "#04301e", tilt: -1.5 },
    { key: "adult", icon: "🤝", bg: "#ffffff", fg: "#04301e", tilt: 1 },
    { key: "pro", icon: "🌳", bg: "#04301e", fg: "#ffffff", tilt: -0.5 },
  ] as const;
  return (
    <section id="helpers" className="px-5 pb-28 pt-20">
      <div className="mx-auto max-w-6xl">
        <SectionTitle
          title={
            <>
              {t("lp.levels.title.a")}
              <br />
              {t("lp.levels.title.b")}
            </>
          }
          sub={t("lp.levels.sub")}
          accent="#087f43"
        />
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {items.map((i) => (
            <div
              key={i.key}
              className="gm-card flex flex-col rounded-[1.75rem] p-7"
              style={{ background: i.bg, color: i.fg, transform: `rotate(${i.tilt}deg)` }}
            >
              <div className="mb-4 flex size-14 items-center justify-center rounded-full border-[3px] border-[#04301e] bg-white text-3xl">
                {i.icon}
              </div>
              <h3 className="mb-2 font-brand text-2xl">{t(`lp.levels.${i.key}.title`)}</h3>
              <p className="flex-1 text-[15px] leading-snug opacity-90">{t(`lp.levels.${i.key}.body`)}</p>
              <div className="mt-5 inline-flex w-fit items-center gap-1.5 rounded-full border-2 border-[#04301e] bg-white px-3 py-1 text-xs font-bold text-[#04301e]">
                <BadgeCheck className="size-4 text-[#087f43]" />
                {t(`lp.levels.${i.key}.check`)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Jugendschutz: so läuft ein Auftrag für Jugendliche                  */
/* ------------------------------------------------------------------ */

function Safety() {
  const { t } = useI18n();
  return (
    <section id="safety" className="relative z-10 bg-[#087f43] px-5 py-24 text-white">
      <div className="gm-grid-bg pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative mx-auto max-w-3xl">
        <h2 className="font-brand text-4xl leading-[1.02] md:text-6xl">{t("lp.safety.title")}</h2>
        <Squiggle className="mt-3 h-3 w-40 text-[#ffd21f]" />
        <p className="mt-4 text-lg text-white/95">{t("lp.safety.sub")}</p>

        <ol className="relative mt-12 space-y-5 before:absolute before:bottom-6 before:left-[1.4rem] before:top-6 before:w-1 before:rounded-full before:bg-white/45">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <li key={n} className="relative flex gap-4">
              <span className="relative z-10 flex size-12 shrink-0 items-center justify-center rounded-full border-[3px] border-[#04301e] bg-[#ffd21f] font-brand text-xl text-[#04301e]">
                {n}
              </span>
              <div className="gm-card-sm flex-1 rounded-2xl bg-white p-5 text-[#04301e]">
                <h3 className="font-bold">{t(`lp.safety.${n}.title`)}</h3>
                <p className="mt-1 text-[15px] leading-snug text-[#04301e]/85">{t(`lp.safety.${n}.body`)}</p>
              </div>
            </li>
          ))}
        </ol>

        <p className="mt-10 text-[15px] leading-snug text-white/95">{t("lp.safety.note")}</p>
        <div className="mt-6">
          <Link to="/eltern-info" className={BTN_SUN}>
            {t("lp.footer.parents")}
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Vertrauen: ehrlich getrennt in "Live" und "Bald"                    */
/* ------------------------------------------------------------------ */

// Hier umschalten, sobald ein Feature wirklich fertig ist (live <-> soon).
const TRUST_ITEMS = [
  { key: "verify", icon: BadgeCheck, status: "live" },
  { key: "youth", icon: ShieldCheck, status: "live" },
  { key: "chat", icon: MessageSquare, status: "live" },
  { key: "reviews", icon: Star, status: "live" },
  { key: "calendar", icon: CalendarClock, status: "live" },
  { key: "escrow", icon: Lock, status: "soon" },
  { key: "invoice", icon: Receipt, status: "soon" },
] as const;

function Trust() {
  const { t } = useI18n();
  const tilts = [-1, 0.8, -0.6, 1, -0.8, 0.6, -1];
  return (
    <section id="trust" className="bg-[#eef8e8] px-5 py-24">
      <div className="mx-auto max-w-6xl">
        <SectionTitle title={t("lp.trust.title")} sub={t("lp.trust.sub")} accent="#ff5a36" />
        <div className="mt-12 grid gap-7 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST_ITEMS.map(({ key, icon: Icon, status }, idx) => (
            <div
              key={key}
              className={`rounded-[1.5rem] p-6 ${
                status === "live"
                  ? "gm-card-sm bg-white"
                  : "border-[2.5px] border-dashed border-[#04301e] bg-transparent"
              }`}
              style={{ transform: `rotate(${tilts[idx]}deg)` }}
            >
              <div className="mb-4 flex items-start justify-between">
                <div
                  className={`flex size-11 items-center justify-center rounded-full border-[2.5px] border-[#04301e] ${
                    status === "live" ? "bg-[#ffd21f]" : "bg-white"
                  }`}
                >
                  <Icon className="size-5 text-[#04301e]" />
                </div>
                <StatusTag status={status} label={t(`lp.status.${status}`)} />
              </div>
              <h3 className="mb-1 font-brand text-lg leading-tight">{t(`lp.trust.${key}.title`)}</h3>
              <p className="text-[15px] leading-snug text-[#04301e]/85">{t(`lp.trust.${key}.body`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* FAQ                                                                 */
/* ------------------------------------------------------------------ */

function Faq() {
  const { t } = useI18n();
  return (
    <section id="faq" className="bg-white px-5 py-24">
      <div className="mx-auto max-w-3xl">
        <h2 className="font-brand text-4xl leading-[1.02] md:text-6xl">{t("lp.faq.title")}</h2>
        <Squiggle className="mt-3 h-3 w-40 text-[#ffd21f]" />
        <Accordion type="single" collapsible className="mt-10 w-full">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((n) => (
            <AccordionItem
              key={n}
              value={`q${n}`}
              className="mb-4 rounded-2xl border-[2.5px] border-[#04301e] bg-white px-5 shadow-[4px_4px_0_#04301e] last:border-b-[2.5px] data-[state=open]:bg-[#fff3b5]"
            >
              <AccordionTrigger className="text-left text-base font-bold hover:no-underline">
                {t(`lp.faq.${n}.q`)}
              </AccordionTrigger>
              <AccordionContent className="text-[15px] leading-relaxed text-[#04301e]/90">
                {t(`lp.faq.${n}.a`)}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        <p className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm font-bold">
          {[
            { to: "/vermittler", label: t("lp.footer.verm") },
            { to: "/datenschutz", label: t("lp.footer.privacy") },
            { to: "/eltern-info", label: t("lp.footer.parents") },
          ].map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="underline decoration-[#ff5a36] decoration-[3px] underline-offset-4"
            >
              {l.label}
            </Link>
          ))}
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Abschluss + Footer                                                  */
/* ------------------------------------------------------------------ */

function FinalCta() {
  const { t } = useI18n();
  const { user } = useAuth();
  return (
    <section className="bg-white px-5 pb-24">
      <div className="gm-grid-bg relative mx-auto max-w-5xl overflow-hidden rounded-[3rem] border-[3px] border-[#04301e] bg-[#087f43] px-6 py-16 text-center text-white shadow-[8px_8px_0_#04301e] md:py-20">
        <Sprout className="pointer-events-none absolute left-6 top-6 size-14 text-[#ffd21f]" />
        <Sprout className="pointer-events-none absolute bottom-6 right-6 size-14 -scale-x-100 text-[#ffd21f]" />
        <h2 className="gm-extrude-sm mx-auto max-w-3xl font-brand text-4xl leading-[1.02] [text-wrap:balance] md:text-6xl">
          {t("lp.cta.title")}
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-lg font-semibold">{t("lp.cta.sub")}</p>
        <div className="mt-9 flex flex-wrap justify-center gap-4">
          {user ? (
            <Link to="/dashboard" className={BTN_SUN}>
              {t("lp.hero.cta.dashboard")}
            </Link>
          ) : (
            <>
              <Link to="/auth" search={{ mode: "signup", role: "customer" }} className={BTN_SUN}>
                {t("lp.hero.cta.customer")}
              </Link>
              <Link to="/auth" search={{ mode: "signup", role: "helper" }} className={BTN_WHITE}>
                {t("lp.hero.cta.helper")}
              </Link>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const { t } = useI18n();
  const links = [
    { href: "/#how", label: t("nav.how") },
    { href: "/#helpers", label: t("nav.helpers") },
    { href: "/#safety", label: t("nav.trust") },
    { href: "/#faq", label: t("nav.faq") },
  ];
  const linkClass = "underline-offset-4 hover:underline hover:decoration-[#ffd21f] hover:decoration-2";
  return (
    <footer className="bg-[#04301e] text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-12 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="font-brand text-3xl text-[#ffd21f]">
            GreenMatch<span className="text-white">.</span>
          </div>
          <p className="mt-2 text-sm text-white/85">{t("lp.footer.tag")}</p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold md:max-w-xl md:justify-end">
          {links.map((l) => (
            <a key={l.href} href={l.href} className={linkClass}>
              {l.label}
            </a>
          ))}
          <Link to="/vermittler" className={linkClass}>
            {t("lp.footer.verm")}
          </Link>
          <Link to="/eltern-info" className={linkClass}>
            {t("lp.footer.parents")}
          </Link>
          <Link to="/freiburg" className={linkClass}>
            {t("lp.footer.freiburg")}
          </Link>
          <Link to="/datenschutz" className={linkClass}>
            {t("lp.footer.privacy")}
          </Link>
        </nav>
      </div>
      <div className="border-t border-white/20 px-5 py-5 text-center text-xs text-white/80">
        <p>© {new Date().getFullYear()} GreenMatch</p>
        <p className="mx-auto mt-1 max-w-3xl">
          {t("lp.footer.purpose")}{" "}
          <Link to="/vermittler" className="underline">
            {t("lp.footer.verm")}
          </Link>
        </p>
      </div>
    </footer>
  );
}

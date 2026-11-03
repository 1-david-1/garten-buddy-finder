import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type CSSProperties, type ReactNode } from "react";
import {
  BadgeCheck,
  CalendarClock,
  Camera,
  Gavel,
  Handshake,
  Heart,
  Lock,
  MessageSquare,
  Receipt,
  ShieldCheck,
  ShoppingBag,
  Star,
  type LucideIcon,
} from "lucide-react";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
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
  Stamp,
  Underlined,
} from "@/components/landing/playful";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Gartenhilfe Freiburg – der Marktplatz | GreenMatch" },
      {
        name: "description",
        content:
          "Der Marktplatz für Gartenhilfe in Freiburg: Leistungen zum Festpreis buchen, bei Auktionen bieten, Preise verhandeln oder Aufträge ausschreiben. Alle per Ausweis geprüft, Jugendliche mit Eltern-Freigabe. Kostenlos.",
      },
      { property: "og:title", content: "Gartenhilfe Freiburg – der Marktplatz | GreenMatch" },
      {
        property: "og:description",
        content: "Buchen, bieten, verhandeln: der Marktplatz für Gartenhilfe in Freiburg.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

/*
 * Design (Startseite): hell, verspielt, mit dicker 3D-Schrift, Hartschatten und handgezeichneten
 * Pfeilen. Palette und Schriften stehen in styles.css (.gm-playful). Die große Geste gehört dem
 * Kopfbereich, alles darunter bleibt ruhiger.
 *
 * Abwechslung statt Kartenwand: jeder Abschnitt hat eine eigene Form (Reiter mit großen Ziffern,
 * Angebots-Zettel, gestufte Zeilen, eine geteilte Tafel, Zeitleiste ohne Kästen, Stempel mit
 * Ausblick). Die wellige Unterstreichung gibt es nur an zwei Wörtern und sie füllt dann das
 * ganze Wort (siehe <Underlined>).
 */

function Landing() {
  return (
    <div className="gm-playful min-h-screen overflow-x-clip">
      <SiteNav />
      <Hero />
      <Panel />
      <Safety />
      <Money />
      <Faq />
      <FinalCta />
      <SiteFooter />
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
  "gm-btn inline-flex w-full items-center justify-center rounded-2xl bg-[#04301e] px-6 py-3.5 text-base font-bold text-white md:w-auto";

function SectionTitle({
  title,
  sub,
  light = false,
}: {
  title: ReactNode;
  sub?: string;
  light?: boolean;
}) {
  return (
    <div className="max-w-2xl">
      <h2 className="font-brand text-4xl leading-[1.05] md:text-6xl">{title}</h2>
      {sub ? (
        <p className={`mt-5 text-lg ${light ? "text-white/90" : "text-muted-foreground"}`}>{sub}</p>
      ) : null}
    </div>
  );
}

/** Setzt die wellige Unterstreichung unter genau das Wort `mark` innerhalb von `text`. */
function Marked({ text, mark, color }: { text: string; mark: string; color?: string }) {
  const i = text.indexOf(mark);
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <Underlined color={color}>{mark}</Underlined>
      {text.slice(i + mark.length)}
    </>
  );
}

function SoonTag({ label }: { label: string }) {
  return (
    <span className="inline-block shrink-0 rounded-full border-2 border-[#04301e] bg-[#ffd21f] px-2.5 py-0.5 text-xs font-bold text-[#04301e]">
      {label}
    </span>
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
      <Market />
      <Levels />
      <Verify />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* So läuft es: Reiter für beide Seiten, je drei Schritte              */
/* ------------------------------------------------------------------ */

function Paths() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [side, setSide] = useState<"customer" | "helper">("customer");
  const isCustomer = side === "customer";

  return (
    <section id="how" className="px-5 pb-20 pt-28 md:pt-32">
      <div className="mx-auto max-w-6xl">
        <SectionTitle
          title={<Marked text={t("lp.paths.title")} mark={t("lp.paths.title.mark")} color="#ff5a36" />}
          sub={t("lp.paths.sub")}
        />

        <div role="tablist" aria-label={t("lp.paths.title")} className="mt-10 flex flex-wrap gap-3">
          {(["customer", "helper"] as const).map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              id={`path-tab-${r}`}
              aria-selected={side === r}
              aria-controls="path-panel"
              onClick={() => setSide(r)}
              className={`gm-btn rounded-2xl px-5 py-3 text-base font-bold text-[#04301e] ${
                side === r ? "bg-[#ffd21f]" : "bg-white"
              }`}
            >
              {t(`lp.paths.${r}.title`)}
            </button>
          ))}
        </div>

        <div
          id="path-panel"
          role="tabpanel"
          aria-labelledby={`path-tab-${side}`}
          className={`gm-card mt-8 rounded-[2rem] p-7 md:p-10 ${isCustomer ? "bg-[#ffd21f]" : "bg-white"}`}
        >
          <ol className="grid gap-9 md:grid-cols-3 md:gap-12">
            {[1, 2, 3].map((n) => (
              <li key={`${side}-${n}`}>
                <span
                  className={`block font-brand text-7xl leading-none [text-shadow:3px_3px_0_#04301e] ${
                    isCustomer ? "text-white" : "text-[#ffd21f]"
                  }`}
                  aria-hidden="true"
                >
                  {n}
                </span>
                <p className="mt-4 text-lg font-bold leading-snug">{t(`lp.paths.${side}.${n}`)}</p>
                <p className="mt-1.5 text-[15px] leading-snug text-[#04301e]/85">
                  {t(`lp.paths.${side}.${n}.body`)}
                </p>
              </li>
            ))}
          </ol>
          <div className="mt-10">
            {user ? (
              <Link to="/dashboard" className={BTN_DEEP}>
                {t(`lp.paths.${side}.cta`)}
              </Link>
            ) : (
              <Link to="/auth" search={{ mode: "signup", role: side }} className={BTN_DEEP}>
                {t(`lp.paths.${side}.cta`)}
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Marktplatz: drei Angebotsarten als Zettel, Ausschreiben, Extras     */
/* ------------------------------------------------------------------ */

function ListingTag({
  icon: Icon,
  type,
  bg,
  tilt,
}: {
  icon: LucideIcon;
  type: "fixed" | "auction" | "negotiable";
  bg: string;
  tilt: number;
}) {
  const { t } = useI18n();
  return (
    <div
      className="gm-card flex flex-col rounded-[1.75rem]"
      style={{ background: bg, transform: `rotate(${tilt}deg)` }}
    >
      <div className="flex-1 p-6">
        <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#04301e] bg-white px-3 py-1 text-xs font-bold">
          <Icon className="size-3.5" />
          {t(`lp.market.${type}.label`)}
        </span>
        <h3 className="mt-4 font-brand text-2xl leading-tight">{t(`lp.market.${type}.title`)}</h3>
        <p className="mt-2 text-[15px] leading-snug text-[#04301e]/85">{t(`lp.market.${type}.how`)}</p>
      </div>
      <div className="flex items-end justify-between gap-3 border-t-[3px] border-dashed border-[#04301e] px-6 py-4">
        <span className="font-brand text-3xl leading-none">{t(`lp.market.${type}.price`)}</span>
        <span className="text-right text-sm font-semibold">{t(`lp.market.${type}.note`)}</span>
      </div>
    </div>
  );
}

function Market() {
  const { t } = useI18n();
  const extras = [
    { key: "photos", icon: Camera },
    { key: "favorites", icon: Heart },
    { key: "chat", icon: MessageSquare },
    { key: "date", icon: CalendarClock },
    { key: "reviews", icon: Star },
  ] as const;
  return (
    <section id="ways" className="px-5 py-20">
      <div className="mx-auto max-w-6xl">
        <SectionTitle title={t("lp.market.title")} sub={t("lp.market.sub")} />

        <div className="mt-12 grid gap-9 md:grid-cols-3">
          <ListingTag icon={ShoppingBag} type="fixed" bg="#ffffff" tilt={-1.5} />
          <ListingTag icon={Gavel} type="auction" bg="#ffd21f" tilt={1} />
          <ListingTag icon={Handshake} type="negotiable" bg="#d6f1dc" tilt={-0.8} />
        </div>
        <p className="mt-6 text-sm font-semibold text-[#04301e]/70">{t("lp.market.example")}</p>

        <div className="mt-14 flex flex-col items-start gap-8 rounded-[2rem] border-[3px] border-dashed border-[#04301e] p-7 md:flex-row md:items-center md:justify-between md:p-10">
          <div className="max-w-xl">
            <h3 className="font-brand text-2xl leading-tight md:text-3xl">{t("lp.market.post.title")}</h3>
            <p className="mt-3 text-[17px] leading-snug">{t("lp.market.post.body")}</p>
          </div>
          <div className="flex items-center gap-3" aria-hidden="true">
            {[
              { price: "35 €", bg: "#ffffff", deg: -6 },
              { price: "42 €", bg: "#ffd21f", deg: 4 },
              { price: "48 €", bg: "#d6f1dc", deg: -3 },
            ].map((b) => (
              <span
                key={b.price}
                className="flex size-20 items-center justify-center rounded-full border-[3px] border-[#04301e] font-brand text-lg shadow-[3px_3px_0_#04301e]"
                style={{ background: b.bg, transform: `rotate(${b.deg}deg)` }}
              >
                {b.price}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-14">
          <h3 className="font-brand text-xl">{t("lp.market.more.title")}</h3>
          <ul className="mt-5 grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
            {extras.map(({ key, icon: Icon }) => (
              <li key={key} className="flex gap-3">
                <Icon className="mt-0.5 size-6 shrink-0 text-[#087f43]" />
                <div>
                  <p className="font-bold">{t(`lp.market.more.${key}.title`)}</p>
                  <p className="mt-0.5 text-[15px] leading-snug text-[#04301e]/85">
                    {t(`lp.market.more.${key}.body`)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Drei Helfer-Stufen als gestufte Zeilen                              */
/* ------------------------------------------------------------------ */

function Levels() {
  const { t } = useI18n();
  const items = [
    { key: "youth", icon: "🌱", bg: "#fff3b5", fg: "#04301e" },
    { key: "adult", icon: "🤝", bg: "#ffffff", fg: "#04301e" },
    { key: "pro", icon: "🌳", bg: "#04301e", fg: "#ffffff" },
  ] as const;
  return (
    <section id="helpers" className="px-5 py-20">
      <div className="mx-auto max-w-6xl">
        <SectionTitle title={t("lp.levels.title")} sub={t("lp.levels.sub")} />
        <div className="gm-card mt-12 overflow-hidden rounded-[2rem]">
          {items.map((i, idx) => (
            <div
              key={i.key}
              className={`grid items-start gap-5 p-7 md:grid-cols-[auto_1fr_15rem] md:gap-8 md:p-9 ${
                idx > 0 ? "border-t-[3px] border-[#04301e]" : ""
              }`}
              style={{ background: i.bg, color: i.fg }}
            >
              <div className="flex size-14 items-center justify-center rounded-full border-[3px] border-[#04301e] bg-white text-3xl">
                {i.icon}
              </div>
              <div>
                <h3 className="font-brand text-2xl">{t(`lp.levels.${i.key}.title`)}</h3>
                <p className="mt-2 max-w-2xl text-[15px] leading-snug opacity-90">
                  {t(`lp.levels.${i.key}.body`)}
                </p>
              </div>
              <div className="flex w-fit items-start gap-1.5 rounded-2xl border-2 border-[#04301e] bg-white px-3 py-1.5 text-xs font-bold text-[#04301e] md:justify-self-end">
                <BadgeCheck className="mt-px size-4 shrink-0 text-[#087f43]" />
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
/* Alle werden geprüft: eine geteilte Tafel statt drei Karten          */
/* ------------------------------------------------------------------ */

function Verify() {
  const { t } = useI18n();
  const cols = [
    { icon: BadgeCheck, n: 1 },
    { icon: Lock, n: 2 },
    { icon: ShieldCheck, n: 3 },
  ] as const;
  return (
    <section id="pruefung" className="px-5 pb-28 pt-20">
      <div className="mx-auto max-w-6xl">
        <div className="relative">
          <SectionTitle title={t("lp.check.title")} sub={t("lp.check.sub")} />
          <Stamp className="absolute right-2 top-0 hidden size-28 -rotate-12 text-[#087f43] md:block" />
        </div>
        <div className="gm-card mt-12 grid overflow-hidden rounded-[2rem] bg-white md:grid-cols-3">
          {cols.map(({ icon: Icon, n }) => (
            <div
              key={n}
              className="border-t-[3px] border-dashed border-[#04301e] p-7 first:border-t-0 md:border-l-[3px] md:border-t-0 md:p-8 md:first:border-l-0"
            >
              <Icon className="mb-4 size-9 text-[#087f43]" />
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
/* Jugendschutz: Zeitleiste ohne Kästen                                */
/* ------------------------------------------------------------------ */

function Safety() {
  const { t } = useI18n();
  return (
    <section id="safety" className="relative z-10 bg-[#087f43] px-5 py-24 text-white">
      <div className="gm-grid-bg pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative mx-auto max-w-3xl">
        <SectionTitle
          light
          title={<Marked text={t("lp.safety.title")} mark={t("lp.safety.title.mark")} color="#ffd21f" />}
          sub={t("lp.safety.sub")}
        />

        <ol className="relative mt-12 space-y-9 before:absolute before:bottom-6 before:left-[1.4rem] before:top-6 before:w-1 before:rounded-full before:bg-white/45">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <li key={n} className="relative flex gap-5">
              <span className="relative z-10 flex size-12 shrink-0 items-center justify-center rounded-full border-[3px] border-[#04301e] bg-[#ffd21f] font-brand text-xl text-[#04301e]">
                {n}
              </span>
              <div className="pt-1">
                <h3 className="text-lg font-bold">{t(`lp.safety.${n}.title`)}</h3>
                <p className="mt-1 text-[15px] leading-snug text-white/90">{t(`lp.safety.${n}.body`)}</p>
              </div>
            </li>
          ))}
        </ol>

        <p className="mt-12 text-[15px] leading-snug text-white/95">{t("lp.safety.note")}</p>
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
/* Geld: Stempel "0 €" und ehrlicher Ausblick auf das, was kommt        */
/* ------------------------------------------------------------------ */

// Hier umschalten bzw. entfernen, sobald ein Punkt wirklich fertig ist.
const NEXT_ITEMS = [
  { key: "escrow", icon: Lock },
  { key: "invoice", icon: Receipt },
] as const;

function Money() {
  const { t } = useI18n();
  return (
    <section id="free" className="bg-[#fff3b5] px-5 py-24">
      <div className="mx-auto grid max-w-5xl items-center gap-12 md:grid-cols-[auto_1fr]">
        <div
          className="gm-sticker mx-auto flex size-48 flex-col items-center justify-center rounded-full border-[3px] border-[#04301e] bg-[#ff5a36] text-center text-white shadow-[6px_6px_0_#04301e] md:size-56"
          style={rot(-6)}
          aria-hidden="true"
        >
          <span className="gm-extrude-sm font-brand text-6xl leading-none md:text-7xl">0&nbsp;€</span>
          <span className="mt-3 max-w-[8rem] text-sm font-bold leading-tight">{t("lp.free.sticker")}</span>
        </div>
        <div>
          <SectionTitle title={t("lp.free.title")} sub={t("lp.free.sub")} />
          <div className="mt-10">
            <p className="mb-3 font-brand text-lg">{t("lp.free.next")}</p>
            <ul className="space-y-3">
              {NEXT_ITEMS.map(({ key, icon: Icon }) => (
                <li
                  key={key}
                  className="flex items-start gap-4 rounded-2xl border-[2.5px] border-dashed border-[#04301e] p-4"
                >
                  <Icon className="mt-0.5 size-6 shrink-0" />
                  <div className="flex-1">
                    <p className="font-bold">{t(`lp.next.${key}.title`)}</p>
                    <p className="text-[15px] leading-snug text-[#04301e]/85">{t(`lp.next.${key}.body`)}</p>
                  </div>
                  <SoonTag label={t("lp.status.soon")} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* FAQ                                                                 */
/* ------------------------------------------------------------------ */

// Reihenfolge der Fragen (Nummern aus i18n). 12 = Wie funktionieren Festpreis, Auktion, Verhandlung?
const FAQ_ORDER = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

function Faq() {
  const { t } = useI18n();
  return (
    <section id="faq" className="bg-white px-5 py-24">
      <div className="mx-auto max-w-3xl">
        <SectionTitle title={t("lp.faq.title")} />
        <Accordion type="single" collapsible className="mt-10 w-full">
          {FAQ_ORDER.map((n) => (
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

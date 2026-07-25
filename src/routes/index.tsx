import { createFileRoute, Link } from "@tanstack/react-router";
import { forwardRef, useRef, type RefObject } from "react";
import { SiteNav } from "@/components/site-nav";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { useHeroAnimation } from "@/hooks/use-hero-animation";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GreenMatch — Gartenhilfe aus der Nachbarschaft" },
      {
        name: "description",
        content:
          "Marktplatz für Gartenhilfe im DACH-Raum. Jugendliche, Nachbarn und Profi-Gärtner – JArbSchG-konform, mit Treuhand & §35a-Rechnung.",
      },
      { property: "og:title", content: "GreenMatch — Gartenhilfe aus der Nachbarschaft" },
      { property: "og:description", content: "Rechtssicher. Fair. Lokal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav />
      <Hero />
      <Features />
      <Flow />
      <Cta />
      <footer className="border-t border-glass-border py-8 text-center text-xs text-muted-foreground">
        <p>
          © {new Date().getFullYear()} GreenMatch · {t("hero.legal.jarbschg")} ·{" "}
          {t("hero.legal.pstg")}
        </p>
      </footer>
    </div>
  );
}

function Hero() {
  const { t } = useI18n();
  const sectionRef = useRef<HTMLElement>(null);
  const perspectiveRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLDivElement>(null);
  const sheenRef = useRef<HTMLDivElement>(null);
  const negotiationRef = useRef<HTMLDivElement>(null);
  const escrowRef = useRef<HTMLDivElement>(null);
  const floatJobsRef = useRef<HTMLDivElement>(null);
  const floatPricesRef = useRef<HTMLDivElement>(null);

  useHeroAnimation({
    section: sectionRef,
    perspective: perspectiveRef,
    phone: phoneRef,
    sheen: sheenRef,
    negotiationCard: negotiationRef,
    escrowCard: escrowRef,
    floatingCards: [floatJobsRef, floatPricesRef],
  });

  return (
    <section ref={sectionRef} className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,var(--emerald-soft),transparent_60%)]" />
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:grid-cols-2 md:py-24">
        <div className="flex flex-col justify-center text-center md:text-left">
          <span className="mb-4 inline-block w-fit rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-primary md:mx-0 mx-auto">
            {t("hero.badge")}
          </span>
          <h1 className="font-brand text-5xl leading-[1.05] tracking-tight md:text-6xl">
            {t("hero.title.a")}
            <br />
            <span className="font-serif-italic text-primary">{t("hero.title.b")}</span>
          </h1>
          <p className="mt-6 max-w-lg text-lg text-muted-foreground md:mx-0 mx-auto">
            {t("hero.sub")}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3 md:justify-start">
            <Button asChild size="lg">
              <Link to="/auth">{t("hero.cta.primary")}</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/auth">{t("hero.cta.secondary")}</Link>
            </Button>
          </div>
        </div>

        <PhoneMockup
          t={t}
          perspectiveRef={perspectiveRef}
          phoneRef={phoneRef}
          sheenRef={sheenRef}
          negotiationRef={negotiationRef}
          escrowRef={escrowRef}
          floatJobsRef={floatJobsRef}
          floatPricesRef={floatPricesRef}
        />
      </div>
    </section>
  );
}

function PhoneMockup({
  t,
  perspectiveRef,
  phoneRef,
  sheenRef,
  negotiationRef,
  escrowRef,
  floatJobsRef,
  floatPricesRef,
}: {
  t: (k: string) => string;
  perspectiveRef: RefObject<HTMLDivElement | null>;
  phoneRef: RefObject<HTMLDivElement | null>;
  sheenRef: RefObject<HTMLDivElement | null>;
  negotiationRef: RefObject<HTMLDivElement | null>;
  escrowRef: RefObject<HTMLDivElement | null>;
  floatJobsRef: RefObject<HTMLDivElement | null>;
  floatPricesRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    // Perspective wrapper — required for real 3D depth on the tilt below.
    <div
      ref={perspectiveRef}
      className="relative mx-auto w-full max-w-[340px]"
      style={{ perspective: "1500px" }}
    >
      {/* Floating glass cards (desktop only, positioned around phone) */}
      <FloatingCard
        ref={floatJobsRef}
        className="absolute -left-6 top-10 hidden w-44 md:block"
        title={t("hero.float.jobs.title")}
        body={t("hero.float.jobs.body")}
      />
      <FloatingCard
        ref={floatPricesRef}
        className="absolute -right-6 bottom-16 hidden w-44 md:block"
        title={t("hero.float.prices.title")}
        body={t("hero.float.prices.body")}
      />

      {/* Titanium bezel — tilt target, needs preserve-3d for real depth */}
      <div
        ref={phoneRef}
        className="relative rounded-[3rem] bg-[#52525B] p-[3px] shadow-2xl will-change-transform [transform-style:preserve-3d]"
      >
        {/* Inner titanium trim ring */}
        <div className="relative overflow-hidden rounded-[2.85rem] bg-[#3a3a42] p-[10px]">
          {/* Volume buttons (left side) */}
          <div className="absolute -left-[3px] top-24 h-8 w-[3px] rounded-l bg-[#52525B]" />
          <div className="absolute -left-[3px] top-36 h-12 w-[3px] rounded-l bg-[#52525B]" />
          <div className="absolute -left-[3px] top-52 h-12 w-[3px] rounded-l bg-[#52525B]" />
          {/* Power slider (right side) */}
          <div className="absolute -right-[3px] top-32 h-16 w-[3px] rounded-r bg-[#52525B]" />

          {/* Screen */}
          <div className="relative overflow-hidden rounded-[2.4rem] border border-white/5 bg-background">
            {/* Dynamic Island notch with green pulse dot */}
            <div className="absolute left-1/2 top-2.5 z-20 flex h-7 w-28 -translate-x-1/2 items-center justify-end gap-1.5 rounded-full bg-black px-3">
              <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_var(--color-primary)]" />
            </div>

            {/* Static glass glare (always on, pure CSS — no JS dependency) */}
            <div
              className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-br from-white/10 via-transparent to-transparent"
              style={{ clipPath: "polygon(0 0, 60% 0, 30% 100%, 0 100%)" }}
            />

            {/* Cursor-tracked light sheen — JS-driven, additive only (opacity 0 by default via CSS) */}
            <div ref={sheenRef} className="card-sheen" />

            {/* Screen content */}
            <div className="aspect-[9/19.5] w-full bg-gradient-to-b from-emerald-soft to-transparent px-4 pb-5 pt-12">
              <div className="mb-3 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                <span>09:41</span>
                <span>●●●●●</span>
              </div>
              <div className="mb-3 font-brand text-lg text-primary">GreenMatch</div>

              {/* Negotiation card */}
              <div
                ref={negotiationRef}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      {t("hero.phone.bid.title")}
                    </div>
                    <div className="mt-1 inline-block rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-primary">
                      {t("hero.phone.bid.badge.new")}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-primary">
                    {t("hero.phone.bid.rate")}
                  </div>
                </div>
                <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-medium text-primary">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  {t("hero.phone.bid.status")}
                </div>
              </div>

              {/* Escrow card */}
              <div
                ref={escrowRef}
                className="mt-3 rounded-2xl border border-primary/40 bg-primary/10 p-3"
              >
                <div className="font-mono text-[10px] uppercase tracking-widest text-primary">
                  {t("hero.phone.escrow")}
                </div>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  {t("hero.phone.escrow.amount")}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const FloatingCard = forwardRef<
  HTMLDivElement,
  { className?: string; title: string; body: string }
>(function FloatingCard({ className, title, body }, ref) {
  return (
    <div
      ref={ref}
      className={`rounded-2xl border border-white/10 bg-white/[0.06] p-4 shadow-lg backdrop-blur-xl ${className ?? ""}`}
    >
      <div className="font-mono text-[10px] uppercase tracking-widest text-primary">{title}</div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
});

function Features() {
  const { t } = useI18n();
  const items = [
    { key: "youth", accent: "🌱" },
    { key: "adult", accent: "🤝" },
    { key: "pro", accent: "🌳" },
  ];
  return (
    <section id="helpers" className="mx-auto max-w-6xl px-4 py-20">
      <h2 className="mb-12 text-center font-brand text-4xl">
        {t("features.title").split(".")[0]}.
        <span className="font-serif-italic text-primary">
          {" "}
          {t("features.title").split(".")[1]}.
        </span>
      </h2>
      <div className="grid gap-6 md:grid-cols-3">
        {items.map((i) => (
          <div
            key={i.key}
            className="rounded-3xl border border-glass-border bg-glass p-6 backdrop-blur"
          >
            <div className="mb-4 text-3xl">{i.accent}</div>
            <h3 className="mb-2 text-xl font-semibold">{t(`features.${i.key}.title`)}</h3>
            <p className="text-sm text-muted-foreground">{t(`features.${i.key}.body`)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Flow() {
  const { t } = useI18n();
  return (
    <section id="how" className="border-y border-glass-border bg-card/40 py-20">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="mb-12 text-center font-brand text-4xl">{t("flow.title")}</h2>
        <div className="grid gap-8 md:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-primary/40 bg-primary/10 font-brand text-xl text-primary">
                {n}
              </div>
              <h3 className="mb-1 text-lg font-semibold">{t(`flow.${n}`)}</h3>
              <p className="text-sm text-muted-foreground">{t(`flow.${n}.body`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Cta() {
  const { t } = useI18n();
  return (
    <section className="mx-auto max-w-3xl px-4 py-24 text-center">
      <h2 className="font-brand text-4xl md:text-5xl">
        {t("cta.title").split("?")[0]}
        <span className="font-serif-italic text-primary">?</span>
      </h2>
      <Button asChild size="lg" className="mt-8">
        <Link to="/auth">{t("cta.button")}</Link>
      </Button>
    </section>
  );
}

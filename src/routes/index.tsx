import { createFileRoute, Link } from "@tanstack/react-router";
import { forwardRef, useRef, type ReactNode, type RefObject } from "react";
import {
  BadgeCheck,
  CalendarClock,
  FileEdit,
  Gavel,
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
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useHeroAnimation } from "@/hooks/use-hero-animation";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GreenMatch — Gartenhilfe aus der Nachbarschaft" },
      {
        name: "description",
        content:
          "Nachbarschaftliche Gartenhilfe: Gartenbesitzer finden Helfer von nebenan – Jugendliche mit Zustimmung der Eltern, Nachbarn und Profi-Gärtner. Auftrag ausschreiben oder Angebot buchen, mit Chat, Bewertungen und Verifizierung.",
      },
      { property: "og:title", content: "GreenMatch — Gartenhilfe aus der Nachbarschaft" },
      { property: "og:description", content: "Fair. Lokal. Verifiziert." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav />
      <Hero />
      <Paths />
      <Ways />
      <Levels />
      <Trust />
      <Faq />
      <FinalCta />
      <Footer />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */

function Hero() {
  const { t } = useI18n();
  const { user } = useAuth();
  const sectionRef = useRef<HTMLElement>(null);
  const perspectiveRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLDivElement>(null);
  const sheenRef = useRef<HTMLDivElement>(null);
  const negotiationRef = useRef<HTMLDivElement>(null);
  const verifiedRef = useRef<HTMLDivElement>(null);
  const floatJobsRef = useRef<HTMLDivElement>(null);
  const floatPricesRef = useRef<HTMLDivElement>(null);

  useHeroAnimation({
    section: sectionRef,
    perspective: perspectiveRef,
    phone: phoneRef,
    sheen: sheenRef,
    negotiationCard: negotiationRef,
    escrowCard: verifiedRef,
    floatingCards: [floatJobsRef, floatPricesRef],
  });

  return (
    <section ref={sectionRef} className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,var(--emerald-soft),transparent_60%)]" />
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:grid-cols-2 md:py-24">
        <div className="flex flex-col justify-center text-center md:text-left">
          <span className="mx-auto mb-4 inline-block w-fit rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-primary md:mx-0">
            {t("lp.badge")}
          </span>
          <h1 className="font-brand text-5xl leading-[1.05] tracking-tight md:text-6xl">
            {t("lp.hero.a")}
            <br />
            <span className="font-serif-italic text-primary">{t("lp.hero.b")}</span>
          </h1>
          <p className="mx-auto mt-6 max-w-lg text-lg text-muted-foreground md:mx-0">
            {t("lp.hero.sub")}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3 md:justify-start">
            {user ? (
              <Button asChild size="lg">
                <Link to="/dashboard">{t("lp.hero.cta.dashboard")}</Link>
              </Button>
            ) : (
              <>
                <Button asChild size="lg">
                  <Link to="/auth" search={{ mode: "signup", role: "customer" }}>
                    {t("lp.hero.cta.customer")}
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/auth" search={{ mode: "signup", role: "helper" }}>
                    {t("lp.hero.cta.helper")}
                  </Link>
                </Button>
              </>
            )}
          </div>
          {!user && (
            <p className="mt-4 text-xs text-muted-foreground">{t("lp.hero.note")}</p>
          )}
        </div>

        <PhoneMockup
          t={t}
          perspectiveRef={perspectiveRef}
          phoneRef={phoneRef}
          sheenRef={sheenRef}
          negotiationRef={negotiationRef}
          verifiedRef={verifiedRef}
          floatJobsRef={floatJobsRef}
          floatPricesRef={floatPricesRef}
        />
      </div>
    </section>
  );
}

type DivRef = RefObject<HTMLDivElement | null>;

function PhoneMockup({
  t,
  perspectiveRef,
  phoneRef,
  sheenRef,
  negotiationRef,
  verifiedRef,
  floatJobsRef,
  floatPricesRef,
}: {
  t: (k: string) => string;
  perspectiveRef: DivRef;
  phoneRef: DivRef;
  sheenRef: DivRef;
  negotiationRef: DivRef;
  verifiedRef: DivRef;
  floatJobsRef: DivRef;
  floatPricesRef: DivRef;
}) {
  return (
    <div
      ref={perspectiveRef}
      className="relative mx-auto w-full max-w-[340px]"
      style={{ perspective: "1500px" }}
    >
      <FloatingCard
        ref={floatJobsRef}
        className="absolute -left-6 top-10 hidden w-44 md:block"
        title={t("lp.float.jobs.title")}
        body={t("lp.float.jobs.body")}
      />
      <FloatingCard
        ref={floatPricesRef}
        className="absolute -right-6 bottom-16 hidden w-44 md:block"
        title={t("lp.float.prices.title")}
        body={t("lp.float.prices.body")}
      />

      <div
        ref={phoneRef}
        className="relative rounded-[3rem] bg-[#52525B] p-[3px] shadow-2xl will-change-transform [transform-style:preserve-3d]"
      >
        <div className="relative overflow-hidden rounded-[2.85rem] bg-[#3a3a42] p-[10px]">
          <div className="absolute -left-[3px] top-24 h-8 w-[3px] rounded-l bg-[#52525B]" />
          <div className="absolute -left-[3px] top-36 h-12 w-[3px] rounded-l bg-[#52525B]" />
          <div className="absolute -left-[3px] top-52 h-12 w-[3px] rounded-l bg-[#52525B]" />
          <div className="absolute -right-[3px] top-32 h-16 w-[3px] rounded-r bg-[#52525B]" />

          <div className="relative overflow-hidden rounded-[2.4rem] border border-white/5 bg-background">
            <div className="absolute left-1/2 top-2.5 z-20 flex h-7 w-28 -translate-x-1/2 items-center justify-end gap-1.5 rounded-full bg-black px-3">
              <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_var(--color-primary)]" />
            </div>
            <div
              className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-br from-white/10 via-transparent to-transparent"
              style={{ clipPath: "polygon(0 0, 60% 0, 30% 100%, 0 100%)" }}
            />
            <div ref={sheenRef} className="card-sheen" />

            <div className="aspect-[9/19.5] w-full bg-gradient-to-b from-emerald-soft to-transparent px-4 pb-5 pt-12">
              <div className="mb-3 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                <span>09:41</span>
                <span>●●●●●</span>
              </div>
              <div className="mb-3 font-brand text-lg text-primary">GreenMatch</div>

              <div
                ref={negotiationRef}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      {t("lp.phone.bid.title")}
                    </div>
                    <div className="mt-1 inline-block rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-primary">
                      {t("lp.phone.bid.badge")}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-primary">
                    {t("lp.phone.bid.rate")}
                  </div>
                </div>
                <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-medium text-primary">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  {t("lp.phone.bid.status")}
                </div>
              </div>

              <div
                ref={verifiedRef}
                className="mt-3 rounded-2xl border border-primary/40 bg-primary/10 p-3"
              >
                <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-primary">
                  <BadgeCheck className="size-3.5" />
                  {t("lp.phone.verified")}
                </div>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  {t("lp.phone.verified.body")}
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

/* ------------------------------------------------------------------ */
/* Zwei Seiten: Wer bist du? Was passiert nach dem Klick?              */
/* ------------------------------------------------------------------ */

function Paths() {
  const { t } = useI18n();
  const { user } = useAuth();
  return (
    <section id="how" className="border-y border-glass-border bg-card/40 py-20">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="mb-3 text-center font-brand text-4xl">{t("lp.paths.title")}</h2>
        <p className="mb-12 text-center text-muted-foreground">{t("lp.paths.sub")}</p>
        <div className="grid gap-6 md:grid-cols-2">
          <PathCard
            role="customer"
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
  hasUser,
  title,
  cta,
  steps,
}: {
  role: "customer" | "helper";
  hasUser: boolean;
  title: string;
  cta: string;
  steps: { title: string; body: string }[];
}) {
  return (
    <div className="flex flex-col rounded-3xl border border-glass-border bg-glass p-8 backdrop-blur">
      <h3 className="mb-6 font-brand text-2xl">{title}</h3>
      <ol className="flex-1 space-y-5">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 font-brand text-primary">
              {i + 1}
            </span>
            <div>
              <p className="font-semibold">{s.title}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <Button asChild size="lg" className="mt-8 w-full" variant={role === "customer" ? "default" : "outline"}>
        {hasUser ? (
          <Link to="/dashboard">{cta}</Link>
        ) : (
          <Link to="/auth" search={{ mode: "signup", role }}>
            {cta}
          </Link>
        )}
      </Button>
    </div>
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
    <section id="ways" className="mx-auto max-w-6xl px-4 py-20">
      <h2 className="mb-3 text-center font-brand text-4xl">{t("lp.ways.title")}</h2>
      <p className="mb-12 text-center text-muted-foreground">{t("lp.ways.sub")}</p>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-3xl border border-glass-border bg-glass p-8 backdrop-blur">
          <IconBubble>
            <FileEdit className="size-6" />
          </IconBubble>
          <h3 className="mb-2 text-xl font-semibold">{t("lp.ways.post.title")}</h3>
          <p className="text-sm text-muted-foreground">{t("lp.ways.post.body")}</p>
        </div>
        <div className="rounded-3xl border border-glass-border bg-glass p-8 backdrop-blur">
          <IconBubble>
            <ShoppingBag className="size-6" />
          </IconBubble>
          <h3 className="mb-2 text-xl font-semibold">{t("lp.ways.book.title")}</h3>
          <p className="mb-4 text-sm text-muted-foreground">{t("lp.ways.book.body")}</p>
          <div className="flex flex-wrap gap-2 text-[11px]">
            {badges.map(({ icon: Icon, key }) => (
              <span
                key={key}
                className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-primary"
              >
                <Icon className="size-3" />
                {t(`lp.ways.badge.${key}`)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function IconBubble({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Drei Helfer-Stufen                                                  */
/* ------------------------------------------------------------------ */

function Levels() {
  const { t } = useI18n();
  const items = [
    { key: "youth", accent: "🌱" },
    { key: "adult", accent: "🤝" },
    { key: "pro", accent: "🌳" },
  ] as const;
  return (
    <section id="helpers" className="border-y border-glass-border bg-card/40 py-20">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="mb-3 text-center font-brand text-4xl">
          {t("lp.levels.title.a")}{" "}
          <span className="font-serif-italic text-primary">{t("lp.levels.title.b")}</span>
        </h2>
        <p className="mb-12 text-center text-muted-foreground">{t("lp.levels.sub")}</p>
        <div className="grid gap-6 md:grid-cols-3">
          {items.map((i) => (
            <div
              key={i.key}
              className="flex flex-col rounded-3xl border border-glass-border bg-glass p-6 backdrop-blur"
            >
              <div className="mb-4 text-3xl">{i.accent}</div>
              <h3 className="mb-2 text-xl font-semibold">{t(`lp.levels.${i.key}.title`)}</h3>
              <p className="flex-1 text-sm text-muted-foreground">{t(`lp.levels.${i.key}.body`)}</p>
              <div className="mt-5 inline-flex w-fit items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary">
                <BadgeCheck className="size-3.5" />
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
/* Vertrauen: ehrlich getrennt in "Live" und "Bald"                    */
/* ------------------------------------------------------------------ */

// Hier umschalten, sobald ein Feature wirklich fertig ist (live <-> soon).
const TRUST_ITEMS = [
  { key: "verify", icon: BadgeCheck, status: "live" },
  { key: "youth", icon: ShieldCheck, status: "live" },
  { key: "chat", icon: MessageSquare, status: "live" },
  { key: "reviews", icon: Star, status: "live" },
  { key: "escrow", icon: Lock, status: "soon" },
  { key: "invoice", icon: Receipt, status: "soon" },
  { key: "calendar", icon: CalendarClock, status: "soon" },
] as const;

function Trust() {
  const { t } = useI18n();
  return (
    <section id="trust" className="mx-auto max-w-6xl px-4 py-20">
      <h2 className="mb-3 text-center font-brand text-4xl">{t("lp.trust.title")}</h2>
      <p className="mb-12 text-center text-muted-foreground">{t("lp.trust.sub")}</p>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {TRUST_ITEMS.map(({ key, icon: Icon, status }) => (
          <div
            key={key}
            className={`rounded-3xl border p-6 backdrop-blur ${
              status === "live"
                ? "border-glass-border bg-glass"
                : "border-dashed border-glass-border bg-transparent"
            }`}
          >
            <div className="mb-4 flex items-center justify-between">
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-full border ${
                  status === "live"
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-glass-border text-muted-foreground"
                }`}
              >
                <Icon className="size-5" />
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                  status === "live"
                    ? "bg-primary/15 text-primary"
                    : "border border-amber-400/40 text-amber-400"
                }`}
              >
                {t(`lp.status.${status}`)}
              </span>
            </div>
            <h3 className="mb-1 text-base font-semibold">{t(`lp.trust.${key}.title`)}</h3>
            <p className="text-sm text-muted-foreground">{t(`lp.trust.${key}.body`)}</p>
          </div>
        ))}
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
    <section id="faq" className="border-y border-glass-border bg-card/40 py-20">
      <div className="mx-auto max-w-3xl px-4">
        <h2 className="mb-10 text-center font-brand text-4xl">{t("lp.faq.title")}</h2>
        <Accordion type="single" collapsible className="w-full">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <AccordionItem key={n} value={`q${n}`}>
              <AccordionTrigger className="text-left">{t(`lp.faq.${n}.q`)}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                {t(`lp.faq.${n}.a`)}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
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
  const [head, ...rest] = t("lp.cta.title").split("?");
  return (
    <section className="mx-auto max-w-3xl px-4 py-24 text-center">
      <h2 className="font-brand text-4xl md:text-5xl">
        {head}
        {rest.length > 0 && <span className="font-serif-italic text-primary">?</span>}
      </h2>
      <p className="mt-4 text-muted-foreground">{t("lp.cta.sub")}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {user ? (
          <Button asChild size="lg">
            <Link to="/dashboard">{t("lp.hero.cta.dashboard")}</Link>
          </Button>
        ) : (
          <>
            <Button asChild size="lg">
              <Link to="/auth" search={{ mode: "signup", role: "customer" }}>
                {t("lp.hero.cta.customer")}
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/auth" search={{ mode: "signup", role: "helper" }}>
                {t("lp.hero.cta.helper")}
              </Link>
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

function Footer() {
  const { t } = useI18n();
  const links = [
    { href: "/#how", label: t("nav.how") },
    { href: "/#helpers", label: t("nav.helpers") },
    { href: "/#trust", label: t("nav.trust") },
    { href: "/#faq", label: t("nav.faq") },
  ];
  return (
    <footer className="border-t border-glass-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="font-brand text-xl text-primary">
            GreenMatch<span className="text-foreground">.</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t("lp.footer.tag")}</p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="hover:text-foreground">
              {l.label}
            </a>
          ))}
        </nav>
      </div>
      <div className="border-t border-glass-border py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} GreenMatch
      </div>
    </footer>
  );
}

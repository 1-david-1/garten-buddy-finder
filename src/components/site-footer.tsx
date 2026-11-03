import { Link } from "@tanstack/react-router";
import { RuixenGradientFooter } from "@/components/ui/ruixen-gradient-footer";
import { TextHoverEffect } from "@/components/ui/text-hover-effect";
import { useI18n } from "@/lib/i18n";

/**
 * Gemeinsame Fußzeile für Startseite und öffentliche Informationsseiten.
 * Heller Seitenhintergrund (Mintpapier), dunkle neutrale Schrift - keine grüne Schrift und kein Karo-Muster.
 * Der Farbverlauf steigt erst am Seitenende von unten auf (Scroll-Effekt) und nutzt die Markenfarben.
 */

// Von unten (0) nach oben (1): Tiefgrün → Laubgrün → Mint → Sonnenblume → Orange → Tomate → ausblendend
const GREENMATCH_STOPS = [
  { offset: 0, color: "#04301e" },
  { offset: 0.18, color: "#087f43" },
  { offset: 0.3, color: "#7fcf9f" },
  { offset: 0.42, color: "#fffdf0" },
  { offset: 0.58, color: "#ffd21f" },
  { offset: 0.7, color: "#ff9a1f" },
  { offset: 0.82, color: "#ff5a36" },
  { offset: 1, color: "#ff5a3600" },
];

// Hover-Verlauf der großen Wortmarke: nur warme Markenfarben (gut lesbar auf hellem Grund)
const WORDMARK_COLORS = ["#ffc400", "#ff9a1f", "#ff5a36", "#ff7a00", "#ffc400"];

export function SiteFooter() {
  const { t } = useI18n();
  const anchors = [
    { href: "/#how", label: t("nav.how") },
    { href: "/#helpers", label: t("nav.helpers") },
    { href: "/#safety", label: t("nav.trust") },
    { href: "/#faq", label: t("nav.faq") },
  ];
  const linkClass =
    "underline-offset-4 hover:underline hover:decoration-[#ff9a1f] hover:decoration-2 focus-visible:underline focus-visible:decoration-[#ff9a1f] focus-visible:decoration-2";

  return (
    <RuixenGradientFooter gradientHeight="60vh" minReveal={0} className="border-t-[3px] border-neutral-900">
      <div className="mx-auto max-w-6xl px-5 pt-12 text-neutral-900">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="font-brand text-3xl text-neutral-900">
              GreenMatch<span className="text-[#ff5a36]">.</span>
            </p>
            <p className="mt-2 text-sm text-neutral-700">{t("lp.footer.tag")}</p>
          </div>
          <nav
            aria-label="Footer"
            className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold md:max-w-xl md:justify-end"
          >
            {anchors.map((l) => (
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

        {/* Große Wortmarke: nur Dekoration, der Name steht schon oben im Text */}
        <div className="mx-auto mt-8 hidden h-40 max-w-3xl select-none md:block lg:h-52" aria-hidden="true">
          <TextHoverEffect
            text="GreenMatch"
            fontSize={44}
            duration={0.2}
            colors={WORDMARK_COLORS}
            strokeClassName="stroke-neutral-400"
            strokeWidth={0.5}
          />
        </div>

        <div className="mt-8 pb-6 text-center text-xs text-neutral-700">
          <p>© {new Date().getFullYear()} GreenMatch</p>
          <p className="mx-auto mt-1 max-w-3xl">
            {t("lp.footer.purpose")}{" "}
            <Link to="/vermittler" className="underline">
              {t("lp.footer.verm")}
            </Link>
          </p>
        </div>
      </div>
    </RuixenGradientFooter>
  );
}

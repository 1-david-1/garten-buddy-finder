import DoodleCrewFooter, { type CrewMember, type DoodleKind, type FooterColumn } from "@/components/ui/doodle-crew-footer";
import { useI18n } from "@/lib/i18n";

/**
 * Gemeinsame Fußzeile für Startseite und öffentliche Informationsseiten ("Doodle Crew").
 * Farben: Sonnenblumen-Gelb als Papier, fast schwarze Tinte, Tomaten-Akzent.
 * Bewusst keine grüne Schrift und kein Karo-Muster.
 */
const PALETTE = { background: "#ffe36b", ink: "#141414", accent: "#ff5a36" };
const DISPLAY_FONT = '"Bricolage Grotesque", "Arial Black", "Helvetica Neue", Arial, sans-serif';
const TEXT_FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
const DOODLES: DoodleKind[] = ["heart", "star", "sparkle", "sandwich", "star", "heart", "plane"];

// Wortmarke GREENMATCH: G0 R1 E2 E3 N4 M5 A6 T7 C8 H9
function crewFor(locale: "de" | "en"): CrewMember[] {
  const says =
    locale === "de"
      ? {
          yeti: "Hunger! Gibt's Kuchen?",
          bird: "Piep! Hier wird geharkt.",
          mushroom: "Ich bin ein Pilz, kein Unkraut!",
          kid: "Von hier oben sehe ich alle Beete!",
          cat: "Miau. Schöner Garten.",
        }
      : {
          yeti: "Hungry! Any cake?",
          bird: "Tweet! Raking in progress.",
          mushroom: "I'm a mushroom, not a weed!",
          kid: "From up here I can see every bed!",
          cat: "Meow. Nice garden.",
        };
  return [
    { kind: "yeti", letter: 0, seat: "front", offset: -0.32, name: "Bruno", says: says.yeti },
    { kind: "bird", letter: 1, seat: "top", offset: 0.02, name: "Pip", says: says.bird },
    { kind: "mushroom", letter: 3, seat: "front", offset: 0.12, scale: 0.95, name: "Morel", says: says.mushroom },
    { kind: "kid", letter: 5, seat: "top", offset: -0.05, name: "Juno", says: says.kid },
    { kind: "cat", letter: 8, seat: "front", offset: 0.42, flip: true, name: "Patch", says: says.cat },
  ];
}

export function SiteFooter() {
  const { t, locale } = useI18n();

  const columns: FooterColumn[] = [
    {
      title: locale === "de" ? "Entdecken" : "Explore",
      links: [
        { label: t("nav.how"), href: "/#how" },
        { label: t("nav.helpers"), href: "/#helpers" },
        { label: t("nav.trust"), href: "/#safety" },
        { label: t("nav.faq"), href: "/#faq" },
      ],
    },
    {
      title: locale === "de" ? "Vertrauen" : "Trust",
      links: [
        { label: t("lp.footer.verm"), href: "/vermittler" },
        { label: t("lp.footer.parents"), href: "/eltern-info" },
        { label: t("lp.footer.privacy"), href: "/datenschutz" },
      ],
    },
    {
      title: locale === "de" ? "Region" : "Region",
      links: [{ label: t("lp.footer.freiburg"), href: "/freiburg" }],
    },
  ];

  return (
    <DoodleCrewFooter
      wordmark="GREENMATCH"
      brand="GreenMatch"
      blurb={t("lp.footer.purpose")}
      tagline={t("lp.footer.tag")}
      columns={columns}
      actions={[]}
      copyright={`© ${new Date().getFullYear()} GreenMatch`}
      legal={[
        { label: t("lp.footer.privacy"), href: "/datenschutz" },
        { label: t("lp.footer.verm"), href: "/vermittler" },
      ]}
      socials={[]}
      backToTopLabel={locale === "de" ? "Nach oben" : "Back to top"}
      crew={crewFor(locale)}
      doodles={DOODLES}
      doodleCount={10}
      palette={PALETTE}
      fontFamily={DISPLAY_FONT}
      serifFamily={TEXT_FONT}
      height="680px"
    />
  );
}

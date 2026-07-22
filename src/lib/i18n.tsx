import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Locale = "de" | "en";

type Dict = Record<string, string>;

const de: Dict = {
  "nav.how": "So funktioniert's",
  "nav.helpers": "Für Helfer",
  "nav.signin": "Anmelden",
  "nav.signup": "Konto erstellen",
  "nav.dashboard": "Dashboard",
  "nav.signout": "Abmelden",

  "hero.badge": "DACH · Nachbarschaft · Garten",
  "hero.title.a": "Nachbarschaftliche",
  "hero.title.b": "Gartenhilfe",
  "hero.title.c": "Genau bei dir um die Ecke.",
  "hero.sub":
    "GreenMatch verbindet Gartenbesitzer mit jungen Helfern, Nachbarn und Profi-Gärtnern – rechtssicher, fair bezahlt und ohne Papierkram.",
  "hero.cta.primary": "Helfer finden",
  "hero.cta.secondary": "Als Helfer starten",
  "hero.legal.jarbschg": "JArbSchG-konform",
  "hero.legal.pstg": "PStTG-Monitoring",
  "hero.legal.eStg": "§35a EStG absetzbar",
  "hero.phone.bid.title": "Rasenmähen",
  "hero.phone.bid.rate": "18€/h",
  "hero.phone.bid.badge.new": "Ich bin neu",
  "hero.phone.bid.status": "Ich arbeite heute",
  "hero.phone.escrow": "ESCROW · GESICHERT",
  "hero.phone.escrow.amount": "€35,00 geschützt",
  "hero.float.jobs.title": "Kurzzeit-Jobs",
  "hero.float.jobs.body": "Aufträge ab 1 Stunde – flexibel und lokal.",
  "hero.float.prices.title": "Preise verhandelbar",
  "hero.float.prices.body": "Biete, chatte, einigt euch – direkt in der App.",

  "auth.fullName": "Vollständiger Name",
  "auth.role": "Ich möchte…",
  "auth.role.helper": "Als Helfer arbeiten",
  "auth.role.customer": "Einen Helfer finden",

  "features.title": "Ein Marktplatz. Drei Wege zu helfen.",
  "features.youth.title": "Jugendliche (13–17)",
  "features.youth.body":
    "Taschengeld verdienen, geschützt durch das Jugendarbeitsschutzgesetz. Maximal 2h/Tag, 08–18 Uhr, nur leichte Arbeit.",
  "features.adult.title": "Nachbarn (18+)",
  "features.adult.body":
    "Gelegenheits-Hilfe unter Nachbarn. Wir überwachen automatisch die PStTG-Schwellen.",
  "features.pro.title": "Profi-Gärtner",
  "features.pro.body": "Mit Gewerbeschein & USt-IdNr. Kunden bekommen §35a EStG-fähige Rechnungen.",

  "flow.title": "So einfach geht's",
  "flow.1": "Auftrag posten",
  "flow.1.body": "Rasenmähen, Hecke schneiden, Unkraut jäten – in unter 60 Sekunden.",
  "flow.2": "Angebote erhalten",
  "flow.2.body": "Lokale Helfer bieten. Chat & Preis verhandeln direkt in der App.",
  "flow.3": "Sicher bezahlen",
  "flow.3.body": "Geld liegt auf Treuhand. Freigabe nach getaner Arbeit.",

  "cta.title": "Bereit für einen schöneren Garten?",
  "cta.button": "Jetzt kostenlos loslegen",

  "auth.title": "Willkommen bei GreenMatch",
  "auth.subtitle": "Melde dich an oder erstelle ein Konto.",
  "auth.email": "E-Mail",
  "auth.password": "Passwort",
  "auth.signin": "Anmelden",
  "auth.signup": "Registrieren",
  "auth.google": "Mit Google fortfahren",
  "auth.or": "oder",
  "auth.toggleToSignup": "Neu hier? Konto erstellen",
  "auth.toggleToSignin": "Schon dabei? Anmelden",

  "onboarding.title": "Willkommen! Wie möchtest du GreenMatch nutzen?",
  "onboarding.role.customer": "Ich brauche Hilfe im Garten",
  "onboarding.role.customer.desc": "Aufträge posten, Helfer buchen.",
  "onboarding.role.helper_youth": "Ich bin 13–17 und möchte Taschengeld verdienen",
  "onboarding.role.helper_youth.desc": "Nach JArbSchG geschützt.",
  "onboarding.role.helper_adult": "Ich möchte in meiner Nachbarschaft helfen (18+)",
  "onboarding.role.helper_adult.desc": "Gelegenheits-Basis.",
  "onboarding.role.helper_pro": "Ich bin Profi-Gärtner / Gewerbe",
  "onboarding.role.helper_pro.desc": "Mit Gewerbeschein & USt-IdNr.",
  "onboarding.displayName": "Anzeigename",
  "onboarding.city": "Stadt",
  "onboarding.postal": "Postleitzahl",
  "onboarding.birthdate": "Geburtsdatum",
  "onboarding.businessName": "Firmenname",
  "onboarding.vatId": "USt-IdNr.",
  "onboarding.guardianEmail": "E-Mail eines Elternteils",
  "onboarding.submit": "Loslegen",
  "onboarding.back": "Zurück",

  "dashboard.customer.title": "Meine Aufträge",
  "dashboard.helper.title": "Meine Helfer-Zentrale",
  "dashboard.empty": "Noch nichts hier. Bald geht's los.",
  "common.loading": "Lädt…",

  "dashboard.nav.section": "Übersicht",
  "dashboard.nav.dashboard": "Dashboard",
  "dashboard.nav.orders": "Aufträge",
  "dashboard.nav.earnings": "Verdienst",

  "dashboard.helper.greeting": "Willkommen zurück",
  "dashboard.helper.available": "Ich arbeite heute",
  "dashboard.helper.unavailable": "Heute Pause",

  "dashboard.helper.stat.earnings": "Verdienst (7 Tage)",
  "dashboard.helper.stat.vsLastWeek": "vs. letzte Woche",
  "dashboard.helper.stat.rating": "Bewertung",
  "dashboard.helper.stat.ratingSub": "Bewertungen",
  "dashboard.helper.stat.noRatings": "Noch keine Bewertungen",
  "dashboard.helper.stat.completionRate": "Erfolgsquote",
  "dashboard.helper.stat.completionSub": "abgeschlossen",
  "dashboard.helper.stat.completedTotal": "Abgeschlossene Aufträge",
  "dashboard.helper.stat.total": "insgesamt",

  "dashboard.helper.chart.title": "Verdienst diese Woche",
  "dashboard.helper.chart.sub": "Netto-Auszahlungen der letzten 7 Tage.",

  "dashboard.helper.pstg.title": "Steuer-Monitor (PStTG)",
  "dashboard.helper.pstg.sub": "Meldepflicht ab 25 Transaktionen oder 1.800 € Jahresumsatz.",
  "dashboard.helper.pstg.locked": "Auszahlungen pausiert – bitte Steuer-ID hinterlegen.",
  "dashboard.helper.pstg.taxIdLabel": "Steuer-ID",
  "dashboard.helper.pstg.taxIdSubmit": "Bestätigen",

  "dashboard.helper.orders.title": "Letzte Aufträge",
  "dashboard.helper.orders.sub": "Klicke auf einen Auftrag für Details.",
  "dashboard.helper.orders.empty": "Noch keine Aufträge.",
  "dashboard.helper.orders.col.title": "Auftrag",
  "dashboard.helper.orders.col.customer": "Kunde",
  "dashboard.helper.orders.col.date": "Termin",
  "dashboard.helper.orders.col.amount": "Betrag",
  "dashboard.helper.orders.col.status": "Status",

  "dashboard.helper.detail.title": "Auftragsdetails",
  "dashboard.helper.detail.customer": "Kunde",
  "dashboard.helper.detail.date": "Termin",
  "dashboard.helper.detail.address": "Adresse",
  "dashboard.helper.detail.amount": "Budget",

  "dashboard.helper.youth.title": "Jugendschutz aktiv",
  "dashboard.helper.youth.banner":
    "Als Jugendliche/r gelten besondere Regeln: max. 2 Stunden/Tag zwischen 08:00–18:00 Uhr, keine schweren Maschinen. Ein vollständiger Kalender mit automatischer Prüfung folgt in Kürze.",

  "dashboard.helper.error.title": "Dashboard konnte nicht geladen werden",
  "dashboard.helper.error.body": "Bitte lade die Seite neu oder versuche es später erneut.",
  "dashboard.helper.error.generic": "Das hat nicht geklappt. Bitte erneut versuchen.",

  "status.draft": "Entwurf",
  "status.open": "Offen",
  "status.negotiating": "In Verhandlung",
  "status.assigned": "Zugewiesen",
  "status.in_progress": "In Bearbeitung",
  "status.completed": "Abgeschlossen",
  "status.cancelled": "Storniert",
};

const en: Dict = {
  "nav.how": "How it works",
  "nav.helpers": "For helpers",
  "nav.signin": "Sign in",
  "nav.signup": "Create account",
  "nav.dashboard": "Dashboard",
  "nav.signout": "Sign out",

  "hero.badge": "DACH · Neighborhood · Garden",
  "hero.title.a": "Neighborhood",
  "hero.title.b": "garden help",
  "hero.title.c": "Right around your corner.",
  "hero.sub":
    "GreenMatch connects garden owners with young helpers, neighbors and pro gardeners — legally safe, fairly paid, no paperwork.",
  "hero.cta.primary": "Find a helper",
  "hero.cta.secondary": "Become a helper",
  "hero.legal.jarbschg": "Youth-labor compliant",
  "hero.legal.pstg": "PStTG monitored",
  "hero.legal.eStg": "§35a EStG deductible",
  "hero.phone.bid.title": "Lawn mowing",
  "hero.phone.bid.rate": "€18/h",
  "hero.phone.bid.badge.new": "I'm new",
  "hero.phone.bid.status": "Working today",
  "hero.phone.escrow": "ESCROW · SECURED",
  "hero.phone.escrow.amount": "€35.00 protected",
  "hero.float.jobs.title": "Short jobs",
  "hero.float.jobs.body": "Bookings from 1 hour – flexible and local.",
  "hero.float.prices.title": "Negotiable prices",
  "hero.float.prices.body": "Bid, chat, agree – right in the app.",

  "auth.fullName": "Full name",
  "auth.role": "I want to…",
  "auth.role.helper": "Work as a helper",
  "auth.role.customer": "Find a helper",

  "features.title": "One marketplace. Three ways to help.",
  "features.youth.title": "Teens (13–17)",
  "features.youth.body":
    "Earn pocket money, protected by youth-labor law. Max 2h/day, 8am–6pm, light work only.",
  "features.adult.title": "Neighbors (18+)",
  "features.adult.body":
    "Casual help between neighbors. We monitor tax-reporting thresholds automatically.",
  "features.pro.title": "Pro gardeners",
  "features.pro.body": "Registered business with VAT ID. Customers get tax-deductible invoices.",

  "flow.title": "How it works",
  "flow.1": "Post a job",
  "flow.1.body": "Mow the lawn, trim hedges, weed beds — in under a minute.",
  "flow.2": "Get offers",
  "flow.2.body": "Local helpers bid. Chat and negotiate right in the app.",
  "flow.3": "Pay safely",
  "flow.3.body": "Funds sit in escrow. Released when the job is done.",

  "cta.title": "Ready for a nicer garden?",
  "cta.button": "Get started free",

  "auth.title": "Welcome to GreenMatch",
  "auth.subtitle": "Sign in or create an account.",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.signin": "Sign in",
  "auth.signup": "Sign up",
  "auth.google": "Continue with Google",
  "auth.or": "or",
  "auth.toggleToSignup": "New here? Create account",
  "auth.toggleToSignin": "Already registered? Sign in",

  "onboarding.title": "Welcome! How do you want to use GreenMatch?",
  "onboarding.role.customer": "I need help in my garden",
  "onboarding.role.customer.desc": "Post jobs, book helpers.",
  "onboarding.role.helper_youth": "I'm 13–17 and want to earn pocket money",
  "onboarding.role.helper_youth.desc": "Protected by youth-labor law.",
  "onboarding.role.helper_adult": "I want to help around my neighborhood (18+)",
  "onboarding.role.helper_adult.desc": "Casual basis.",
  "onboarding.role.helper_pro": "I'm a professional gardener / business",
  "onboarding.role.helper_pro.desc": "With trade license & VAT ID.",
  "onboarding.displayName": "Display name",
  "onboarding.city": "City",
  "onboarding.postal": "Postal code",
  "onboarding.birthdate": "Date of birth",
  "onboarding.businessName": "Business name",
  "onboarding.vatId": "VAT ID",
  "onboarding.guardianEmail": "Parent's email",
  "onboarding.submit": "Get started",
  "onboarding.back": "Back",

  "dashboard.customer.title": "My jobs",
  "dashboard.helper.title": "My helper hub",
  "dashboard.empty": "Nothing here yet. Coming soon.",
  "common.loading": "Loading…",

  "dashboard.nav.section": "Overview",
  "dashboard.nav.dashboard": "Dashboard",
  "dashboard.nav.orders": "Orders",
  "dashboard.nav.earnings": "Earnings",

  "dashboard.helper.greeting": "Welcome back",
  "dashboard.helper.available": "Working today",
  "dashboard.helper.unavailable": "Off today",

  "dashboard.helper.stat.earnings": "Earnings (7 days)",
  "dashboard.helper.stat.vsLastWeek": "vs last week",
  "dashboard.helper.stat.rating": "Rating",
  "dashboard.helper.stat.ratingSub": "reviews",
  "dashboard.helper.stat.noRatings": "No reviews yet",
  "dashboard.helper.stat.completionRate": "Success rate",
  "dashboard.helper.stat.completionSub": "completed",
  "dashboard.helper.stat.completedTotal": "Completed jobs",
  "dashboard.helper.stat.total": "total",

  "dashboard.helper.chart.title": "Earnings this week",
  "dashboard.helper.chart.sub": "Net payouts over the last 7 days.",

  "dashboard.helper.pstg.title": "Tax monitor (PStTG)",
  "dashboard.helper.pstg.sub":
    "Reporting duty kicks in at 25 transactions or €1,800 yearly turnover.",
  "dashboard.helper.pstg.locked": "Payouts paused — please add your tax ID.",
  "dashboard.helper.pstg.taxIdLabel": "Tax ID",
  "dashboard.helper.pstg.taxIdSubmit": "Confirm",

  "dashboard.helper.orders.title": "Recent jobs",
  "dashboard.helper.orders.sub": "Click a job to see details.",
  "dashboard.helper.orders.empty": "No jobs yet.",
  "dashboard.helper.orders.col.title": "Job",
  "dashboard.helper.orders.col.customer": "Customer",
  "dashboard.helper.orders.col.date": "Date",
  "dashboard.helper.orders.col.amount": "Amount",
  "dashboard.helper.orders.col.status": "Status",

  "dashboard.helper.detail.title": "Job details",
  "dashboard.helper.detail.customer": "Customer",
  "dashboard.helper.detail.date": "Date",
  "dashboard.helper.detail.address": "Address",
  "dashboard.helper.detail.amount": "Budget",

  "dashboard.helper.youth.title": "Youth protection active",
  "dashboard.helper.youth.banner":
    "As a minor, special rules apply: max. 2 hours/day between 08:00–18:00, no heavy machinery. A full compliance calendar is coming soon.",

  "dashboard.helper.error.title": "Couldn't load dashboard",
  "dashboard.helper.error.body": "Please reload the page or try again later.",
  "dashboard.helper.error.generic": "That didn't work. Please try again.",

  "status.draft": "Draft",
  "status.open": "Open",
  "status.negotiating": "Negotiating",
  "status.assigned": "Assigned",
  "status.in_progress": "In progress",
  "status.completed": "Completed",
  "status.cancelled": "Cancelled",
};

const dicts: Record<Locale, Dict> = { de, en };

type Ctx = { locale: Locale; setLocale: (l: Locale) => void; t: (k: string) => string };
const I18nCtx = createContext<Ctx | null>(null);

const STORAGE_KEY = "greenmatch.locale";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("de");

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (saved === "de" || saved === "en") setLocaleState(saved);
  }, []);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, l);
  };

  const t = (k: string) => dicts[locale][k] ?? k;
  return <I18nCtx.Provider value={{ locale, setLocale, t }}>{children}</I18nCtx.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nCtx);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}

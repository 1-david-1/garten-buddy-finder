import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Star, MapPin, Search, SlidersHorizontal } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { BookingScheduler } from "@/components/booking/booking-scheduler";
import { DashboardShell, type DashboardNavItem } from "@/components/dashboard/dashboard-shell";
import { useI18n } from "@/lib/i18n";
import { BarChart3, Mail } from "lucide-react";
import { getAvailableHelpers } from "@/lib/marketplace.functions";

// ---------------------------------------------------------------------------
// Einheitliche Anzeige-Form für die Helfer-Karten. Zwei Quellen fließen hier
// zusammen:
//  1. Demo-Profile (fest hinterlegt, dienen als Seed/Beispieldaten, damit die
//     Suche auch ganz am Anfang - ohne echte Registrierungen - nicht leer ist)
//  2. Echte Helfer, live aus der Datenbank geladen (jeder Account mit einer
//     Helfer-Rolle) - das war vorher komplett unangebunden.
// Beide werden gemeinsam angezeigt und gemeinsam gefiltert.
// ---------------------------------------------------------------------------
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
  hourlyRate: number | null; // Cent
  ageBadge: AgeBadge;
  categories: string[];
  bio: string | null;
  isDemo: boolean;
}

interface DemoHelper {
  id: string;
  name: string;
  title: string;
  location: string;
  postalCode: string;
  rating: number;
  reviewCount: number;
  imageUrl: string;
  hourlyRate: number; // Cent
  ageBadge: AgeBadge;
  categories: string[];
  bio: string;
}

const demoHelpers: DemoHelper[] = [
  {
    id: "sample-1",
    name: "Lukas Berger",
    title: "Rasen & Hecken-Profi",
    location: "Freiburg",
    postalCode: "79098",
    rating: 4.9,
    reviewCount: 34,
    imageUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&h=300&fit=crop",
    hourlyRate: 2800,
    ageBadge: "helper_pro",
    categories: ["Rasenmähen", "Heckenschnitt"],
    bio: "Selbstständiger Gärtner mit eigener Ausrüstung, 6 Jahre Erfahrung.",
  },
  {
    id: "sample-2",
    name: "Mara Schneider",
    title: "Beete & Unkraut",
    location: "Freiburg",
    postalCode: "79100",
    rating: 4.7,
    reviewCount: 19,
    imageUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=300&h=300&fit=crop",
    hourlyRate: 1800,
    ageBadge: "helper_adult",
    categories: ["Unkraut jäten", "Blumenbeete"],
    bio: "Zuverlässig, flexibel am Wochenende verfügbar.",
  },
  {
    id: "sample-3",
    name: "Finn Vogel",
    title: "Laub & Gartenhilfe",
    location: "Emmendingen",
    postalCode: "79312",
    rating: 4.6,
    reviewCount: 8,
    imageUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300&h=300&fit=crop",
    hourlyRate: 1200,
    ageBadge: "helper_youth",
    categories: ["Laub entfernen", "Gartenarbeit allgemein"],
    bio: "Schüler, hilft nachmittags und am Wochenende - mit Zustimmung der Eltern.",
  },
  {
    id: "sample-4",
    name: "Petra Lang",
    title: "Gartendesign & Pflege",
    location: "Freiburg",
    postalCode: "79104",
    rating: 5.0,
    reviewCount: 52,
    imageUrl: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=300&h=300&fit=crop",
    hourlyRate: 3500,
    ageBadge: "helper_pro",
    categories: ["Gartenarbeit allgemein", "Blumenbeete"],
    bio: "Gewerblich angemeldet, Referenzen auf Anfrage.",
  },
  {
    id: "sample-5",
    name: "Jonas Wolf",
    title: "Rasenmäh-Service",
    location: "Denzlingen",
    postalCode: "79211",
    rating: 4.4,
    reviewCount: 5,
    imageUrl: "https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=300&h=300&fit=crop",
    hourlyRate: 1500,
    ageBadge: "helper_adult",
    categories: ["Rasenmähen"],
    bio: "Kurzfristig verfügbar, eigenes Werkzeug vorhanden.",
  },
  {
    id: "sample-6",
    name: "Hannah Fischer",
    title: "Heckenschnitt & Hilfe",
    location: "Freiburg",
    postalCode: "79106",
    rating: 4.8,
    reviewCount: 27,
    imageUrl: "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=300&h=300&fit=crop",
    hourlyRate: 2200,
    ageBadge: "helper_adult",
    categories: ["Heckenschnitt", "Laub entfernen"],
    bio: "Bringt eigene Gartenschere und Leiter mit.",
  },
];

const categories = [
  "Rasenmähen",
  "Heckenschnitt",
  "Unkraut jäten",
  "Blumenbeete",
  "Laub entfernen",
  "Gartenarbeit allgemein",
];

const ageBadgeLabel: Record<AgeBadge, string> = {
  helper_youth: "13-17 (mit Zustimmung)",
  helper_adult: "18+",
  helper_pro: "Profi",
};

export function CustomerDashboard() {
  const { t } = useI18n();

  const getHelpers = useServerFn(getAvailableHelpers);
  const helpersQuery = useQuery({ queryKey: ["marketplace-helpers"], queryFn: () => getHelpers() });

  const [category, setCategory] = useState<string>("all");
  const [location, setLocation] = useState("");
  const [minRating, setMinRating] = useState<string>("0");
  const [maxPrice, setMaxPrice] = useState([50]);
  const [selectedHelper, setSelectedHelper] = useState<DisplayHelper | null>(null);

  const navItems: DashboardNavItem[] = [
    {
      key: "dashboard",
      label: t("dashboard.nav.dashboard"),
      href: "/dashboard",
      icon: <BarChart3 className="size-4" />,
    },
    { key: "inbox", label: "Postfach", href: "/inbox", icon: <Mail className="size-4" /> },
  ];

  // Demo-Profile (Seed-Daten) + echte, aus der Datenbank geladene Helfer -
  // beide werden zu derselben Form gemappt und gemeinsam angezeigt.
  const allHelpers: DisplayHelper[] = useMemo(() => {
    const demo: DisplayHelper[] = demoHelpers.map((h) => ({ ...h, isDemo: true }));
    const real: DisplayHelper[] = (helpersQuery.data?.helpers ?? []).map((h) => ({
      id: h.id,
      name: h.displayName,
      title: h.businessName,
      location: h.city,
      postalCode: h.postalCode,
      rating: h.rating,
      reviewCount: h.reviewCount,
      imageUrl: null,
      hourlyRate: null,
      ageBadge: h.role,
      categories: [],
      bio: h.bio,
      isDemo: false,
    }));
    return [...demo, ...real];
  }, [helpersQuery.data]);

  const filtered = useMemo(() => {
    return allHelpers.filter((h) => {
      // Kategorie: nur ausschließen, wenn wir überhaupt Kategorien für diesen
      // Helfer kennen (echte Helfer haben aktuell noch keine hinterlegt).
      if (category !== "all" && h.categories.length > 0 && !h.categories.includes(category))
        return false;
      if (
        location.trim() &&
        !`${h.location ?? ""} ${h.postalCode ?? ""}`
          .toLowerCase()
          .includes(location.trim().toLowerCase())
      )
        return false;
      if ((h.rating ?? 0) < Number(minRating)) return false;
      // Preis: nur ausschließen, wenn ein Stundensatz bekannt ist.
      if (h.hourlyRate !== null && h.hourlyRate / 100 > maxPrice[0]) return false;
      return true;
    });
  }, [allHelpers, category, location, minRating, maxPrice]);

  return (
    <DashboardShell
      title={t("dashboard.customer.title") || "Helfer finden"}
      navItems={navItems}
      activeKey="dashboard"
    >
      <h1 className="font-brand text-2xl">{t("dashboard.customer.title") || "Helfer finden"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Filtere nach Kategorie, Ort, Bewertung und Preis - wie bei einer Hotelsuche.
      </p>

      {/* Filterleiste */}
      <Card className="mt-6 border-glass-border bg-glass backdrop-blur">
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label className="mb-1.5 flex items-center gap-1 text-xs text-muted-foreground">
              <SlidersHorizontal className="size-3" /> Kategorie
            </Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Alle Kategorien" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Kategorien</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-1.5 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3" /> Ort / PLZ
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="z. B. Freiburg oder 79100"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label className="mb-1.5 flex items-center gap-1 text-xs text-muted-foreground">
              <Star className="size-3" /> Mindestbewertung
            </Label>
            <Select value={minRating} onValueChange={setMinRating}>
              <SelectTrigger>
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
            <Label className="mb-1.5 block text-xs text-muted-foreground">
              Max. Preis: {maxPrice[0]} €/Std.
            </Label>
            <Slider
              min={10}
              max={50}
              step={5}
              value={maxPrice}
              onValueChange={setMaxPrice}
              className="mt-3"
            />
          </div>
        </CardContent>
      </Card>

      {/* Ergebnisliste */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.length === 0 ? (
          <div className="col-span-full flex flex-col items-center gap-2 py-16 text-center">
            <Search className="size-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              Keine Helfer gefunden. Versuch es mit weniger Filtern.
            </p>
          </div>
        ) : (
          filtered.map((h) => (
            <Card
              key={h.id}
              className="border-glass-border bg-glass backdrop-blur transition hover:border-primary/60"
            >
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <Avatar className="h-14 w-14">
                    {h.imageUrl && <AvatarImage src={h.imageUrl} alt={h.name} />}
                    <AvatarFallback>{h.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="truncate font-semibold">{h.name}</h3>
                      <Badge variant="outline" className="shrink-0 text-xs">
                        {ageBadgeLabel[h.ageBadge]}
                      </Badge>
                    </div>
                    {h.title && <p className="text-sm text-muted-foreground">{h.title}</p>}
                    <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      {h.location && (
                        <>
                          <MapPin className="size-3" /> {h.location}
                          <span className="mx-1">·</span>
                        </>
                      )}
                      {h.rating !== null ? (
                        <>
                          <Star className="size-3 fill-amber-400 text-amber-400" />
                          {h.rating.toFixed(1)} ({h.reviewCount})
                        </>
                      ) : (
                        <span>Noch keine Bewertungen</span>
                      )}
                    </div>
                  </div>
                </div>

                {h.bio && <p className="mt-3 text-sm text-muted-foreground">{h.bio}</p>}

                {h.categories.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {h.categories.map((c) => (
                      <Badge key={c} variant="secondary" className="text-xs font-normal">
                        {c}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="mt-4 flex items-center justify-between">
                  <span className="text-lg font-semibold">
                    {h.hourlyRate !== null ? (
                      <>
                        {(h.hourlyRate / 100).toFixed(0)} €
                        <span className="text-sm font-normal text-muted-foreground">/Std.</span>
                      </>
                    ) : (
                      <span className="text-sm font-normal text-muted-foreground">
                        Preis auf Anfrage
                      </span>
                    )}
                  </span>
                  <Button size="sm" onClick={() => setSelectedHelper(h)}>
                    Jetzt buchen
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={!!selectedHelper} onOpenChange={(open) => !open && setSelectedHelper(null)}>
        <DialogContent className="max-w-3xl overflow-y-auto p-0 sm:max-h-[90vh]">
          <DialogTitle className="sr-only">Termin buchen</DialogTitle>
          {selectedHelper && (
            <BookingScheduler
              helper={{
                id: selectedHelper.id,
                name: selectedHelper.name,
                title: selectedHelper.title ?? "",
                location: selectedHelper.location ?? "",
                rating: selectedHelper.rating ?? 0,
                reviewCount: selectedHelper.reviewCount,
                imageUrl: selectedHelper.imageUrl ?? "",
                hourlyRate: selectedHelper.hourlyRate ?? 0,
              }}
              onBookingRequest={() => {
                // TODO: an echte Gig-Erstellung anbinden (supabase.from("gigs").insert(...))
                setSelectedHelper(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}

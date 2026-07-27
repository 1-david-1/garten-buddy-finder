import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import {
  BarChart3,
  Mail,
  Plus,
  PlusCircle,
  Search,
  Calendar,
  MapPin,
  Euro,
  Clock,
  ChevronLeft,
} from "lucide-react";
import { DashboardShell, type DashboardNavItem } from "@/components/dashboard/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createGig } from "@/lib/gigs.functions";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/create-gig")({
  component: CreateGigPage,
});

const SERVICE_TYPES = [
  { value: "rasenmähen", label: "🌿 Rasenmähen" },
  { value: "heckenschnitt", label: "✂️ Heckenschnitt" },
  { value: "unkraut", label: "🌱 Unkraut jäten" },
  { value: "blumenbeete", label: "🌸 Blumenbeete pflegen" },
  { value: "laub", label: "🍂 Laub entfernen" },
  { value: "baumpflege", label: "🌳 Baumpflege" },
  { value: "gartendesign", label: "🎨 Gartendesign / Umgestaltung" },
  { value: "bewässerung", label: "💧 Bewässerungsanlage" },
  { value: "sonstiges", label: "🔧 Sonstiges" },
];

const AGE_GROUPS = [
  {
    value: "helper_youth",
    label: "Jugendliche (13–17)",
    desc: "Leichte Arbeit, max. 2h/Tag, Mo–Fr 08–18 Uhr",
  },
  { value: "helper_adult", label: "Nachbarn (18+)", desc: "Gelegenheitshelfer" },
  { value: "helper_pro", label: "Profi-Gärtner", desc: "Gewerblich, mit Rechnung" },
];

function CreateGigPage() {
  const navigate = useNavigate();
  const createGigFn = useServerFn(createGig);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [budgetEuros, setBudgetEuros] = useState("");
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("10:00");
  const [durationHours, setDurationHours] = useState("2");
  const [allowedAgeGroups, setAllowedAgeGroups] = useState<string[]>([
    "helper_youth",
    "helper_adult",
    "helper_pro",
  ]);

  const mutation = useMutation({
    mutationFn: () =>
      createGigFn({
        data: {
          title,
          description,
          serviceType,
          budgetCents: Math.round(parseFloat(budgetEuros) * 100),
          address,
          postalCode,
          scheduledAt: scheduledDate
            ? new Date(`${scheduledDate}T${scheduledTime}`).toISOString()
            : null,
          durationMinutes: Math.round(parseFloat(durationHours) * 60),
          allowedAgeGroups,
        },
      }),
    onSuccess: () => {
      toast.success("Auftrag erfolgreich erstellt!");
      navigate({ to: "/my-gigs" });
    },
    onError: (err) => {
      toast.error((err as Error).message || "Fehler beim Erstellen des Auftrags");
    },
  });

  const toggleAgeGroup = (val: string) => {
    setAllowedAgeGroups((prev) =>
      prev.includes(val) ? prev.filter((g) => g !== val) : [...prev, val],
    );
  };

  const navItems: DashboardNavItem[] = [
    {
      key: "dashboard",
      label: "Dashboard",
      href: "/dashboard",
      icon: <BarChart3 className="size-4" />,
    },
    { key: "inbox", label: "Postfach", href: "/inbox", icon: <Mail className="size-4" /> },
    {
      key: "my-gigs",
      label: "Meine Aufträge",
      href: "/my-gigs",
      icon: <Search className="size-4" />,
    },
    {
      key: "create-gig",
      label: "Auftrag erstellen",
      href: "/create-gig",
      icon: <Plus className="size-4" />,
    },
  ];

  return (
    <DashboardShell title="Auftrag erstellen" navItems={navItems} activeKey="create-gig">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/my-gigs">
            <ChevronLeft className="size-4 mr-1" />
            Zurück
          </Link>
        </Button>
        <div>
          <h1 className="font-brand text-2xl">Neuen Auftrag erstellen</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Beschreibe was du brauchst – Helfer in deiner Nähe machen ein Angebot.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Hauptformular */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-glass-border bg-glass backdrop-blur">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground font-bold">
                  1
                </span>
                Auftragsdetails
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="title" className="text-sm">
                  Titel *
                </Label>
                <Input
                  id="title"
                  placeholder="z. B. Rasen mähen und Hecke schneiden"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1"
                  required
                />
              </div>

              <div>
                <Label htmlFor="serviceType" className="text-sm">
                  Leistungsart *
                </Label>
                <Select value={serviceType} onValueChange={setServiceType}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Wähle eine Kategorie" />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_TYPES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="description" className="text-sm">
                  Beschreibung
                </Label>
                <Textarea
                  id="description"
                  placeholder="Beschreibe genau was zu tun ist, Besonderheiten, benötigtes Werkzeug…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 min-h-[100px]"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-glass-border bg-glass backdrop-blur">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground font-bold">
                  2
                </span>
                Ort & Termin
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="address" className="text-sm flex items-center gap-1">
                    <MapPin className="size-3" /> Adresse *
                  </Label>
                  <Input
                    id="address"
                    placeholder="Musterstraße 42"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="postalCode" className="text-sm">
                    Postleitzahl *
                  </Label>
                  <Input
                    id="postalCode"
                    placeholder="79100"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="scheduledDate" className="text-sm flex items-center gap-1">
                    <Calendar className="size-3" /> Wunschtermin
                  </Label>
                  <Input
                    id="scheduledDate"
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="mt-1"
                    min={new Date().toISOString().split("T")[0]}
                  />
                </div>
                <div>
                  <Label htmlFor="scheduledTime" className="text-sm">
                    Uhrzeit
                  </Label>
                  <Input
                    id="scheduledTime"
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="durationHours" className="text-sm flex items-center gap-1">
                  <Clock className="size-3" /> Voraussichtliche Dauer (Stunden)
                </Label>
                <Select value={durationHours} onValueChange={setDurationHours}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["1", "1.5", "2", "2.5", "3", "4", "5", "6", "8"].map((h) => (
                      <SelectItem key={h} value={h}>
                        {h} Stunden
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="border-glass-border bg-glass backdrop-blur">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground font-bold">
                  3
                </span>
                Budget & Helfer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="budget" className="text-sm flex items-center gap-1">
                  <Euro className="size-3" /> Maximalbudget (€) *
                </Label>
                <div className="relative mt-1">
                  <Euro className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    id="budget"
                    type="number"
                    placeholder="25"
                    min="5"
                    step="1"
                    value={budgetEuros}
                    onChange={(e) => setBudgetEuros(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Helfer können auch niedrigere Angebote machen.
                </p>
              </div>

              <div>
                <Label className="text-sm">Erlaubte Helfertypen</Label>
                <div className="mt-2 space-y-3">
                  {AGE_GROUPS.map((ag) => (
                    <div key={ag.value} className="flex items-start gap-3">
                      <Checkbox
                        id={ag.value}
                        checked={allowedAgeGroups.includes(ag.value)}
                        onCheckedChange={() => toggleAgeGroup(ag.value)}
                        className="mt-0.5"
                      />
                      <div>
                        <label
                          htmlFor={ag.value}
                          className="text-sm font-medium cursor-pointer leading-none"
                        >
                          {ag.label}
                        </label>
                        <p className="text-xs text-muted-foreground mt-0.5">{ag.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Seitenleiste */}
        <div className="space-y-4">
          <Card className="border-primary/30 bg-primary/5 backdrop-blur sticky top-24">
            <CardContent className="pt-5 space-y-4">
              <h3 className="font-semibold text-sm">Zusammenfassung</h3>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Titel</span>
                  <span className="font-medium truncate max-w-[140px]">{title || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Leistung</span>
                  <span className="font-medium">
                    {SERVICE_TYPES.find((s) => s.value === serviceType)?.label || "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">PLZ</span>
                  <span className="font-medium">{postalCode || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Termin</span>
                  <span className="font-medium">
                    {scheduledDate
                      ? new Date(scheduledDate).toLocaleDateString("de-DE")
                      : "Flexibel"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Dauer</span>
                  <span className="font-medium">{durationHours} Std.</span>
                </div>
                <div className="flex justify-between border-t border-primary/20 pt-2">
                  <span className="text-muted-foreground">Maximalbudget</span>
                  <span className="font-bold text-primary">
                    {budgetEuros ? `${budgetEuros} €` : "—"}
                  </span>
                </div>
              </div>

              <Button
                className="w-full"
                onClick={() => mutation.mutate()}
                disabled={
                  mutation.isPending ||
                  !title.trim() ||
                  !serviceType ||
                  !budgetEuros ||
                  !address.trim() ||
                  !postalCode.trim() ||
                  allowedAgeGroups.length === 0
                }
              >
                {mutation.isPending ? (
                  "Wird erstellt…"
                ) : (
                  <>
                    <PlusCircle className="size-4 mr-2" />
                    Auftrag veröffentlichen
                  </>
                )}
              </Button>

              <p className="text-[11px] text-muted-foreground text-center">
                Der Auftrag ist sofort sichtbar. Du kannst ihn jederzeit löschen.
              </p>
            </CardContent>
          </Card>

          <Card className="border-glass-border bg-glass backdrop-blur">
            <CardContent className="pt-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Plattform-Schutz
              </p>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li className="flex items-start gap-1.5">
                  <span className="text-primary mt-0.5">✓</span>
                  Geld liegt auf Treuhand bis Abnahme
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-primary mt-0.5">✓</span>
                  JArbSchG-Prüfung für Jugendliche
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-primary mt-0.5">✓</span>
                  §35a-Rechnung optional
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-primary mt-0.5">✓</span>
                  Bewertungssystem nach Abschluss
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardShell>
  );
}

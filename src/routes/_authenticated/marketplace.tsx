import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Mail,
  ClipboardList,
  Wallet,
  Search,
  MapPin,
  Calendar,
  Euro,
  Clock,
  Filter,
  Send,
  CheckCircle2,
} from "lucide-react";
import {
  DashboardShell,
  type DashboardNavItem,
} from "@/components/dashboard/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getAvailableGigs } from "@/lib/gigs.functions";
import { createBid, getMyBids } from "@/lib/negotiations.functions";
import { toast } from "sonner";
import { formatEuros } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/marketplace")({
  component: MarketplacePage,
});

const SERVICE_LABELS: Record<string, string> = {
  rasenmähen: "🌿 Rasenmähen",
  heckenschnitt: "✂️ Heckenschnitt",
  unkraut: "🌱 Unkraut jäten",
  blumenbeete: "🌸 Blumenbeete",
  laub: "🍂 Laub entfernen",
  baumpflege: "🌳 Baumpflege",
  gartendesign: "🎨 Gartendesign",
  bewässerung: "💧 Bewässerung",
  sonstiges: "🔧 Sonstiges",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `vor ${days} Tag${days > 1 ? "en" : ""}`;
  if (hours > 0) return `vor ${hours} Std.`;
  if (mins > 0) return `vor ${mins} Min.`;
  return "gerade eben";
}

function MarketplacePage() {
  const queryClient = useQueryClient();
  const [locationFilter, setLocationFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [selectedGig, setSelectedGig] = useState<any | null>(null);
  const [bidAmount, setBidAmount] = useState("");
  const [bidMessage, setBidMessage] = useState("");
  const [activeTab, setActiveTab] = useState<"browse" | "my-bids">("browse");

  const getGigsFn = useServerFn(getAvailableGigs);
  const createBidFn = useServerFn(createBid);
  const getMyBidsFn = useServerFn(getMyBids);

  const gigsQuery = useQuery({
    queryKey: ["available-gigs"],
    queryFn: () => getGigsFn(),
  });
  const myBidsQuery = useQuery({
    queryKey: ["my-bids"],
    queryFn: () => getMyBidsFn(),
    enabled: activeTab === "my-bids",
  });

  const bidMutation = useMutation({
    mutationFn: () =>
      createBidFn({
        data: {
          gigId: selectedGig!.id,
          bidCents: Math.round(parseFloat(bidAmount) * 100),
          message: bidMessage,
        },
      }),
    onSuccess: () => {
      toast.success("Angebot erfolgreich abgegeben!");
      queryClient.invalidateQueries({ queryKey: ["available-gigs"] });
      queryClient.invalidateQueries({ queryKey: ["my-bids"] });
      setSelectedGig(null);
      setBidAmount("");
      setBidMessage("");
    },
    onError: (err) =>
      toast.error((err as Error).message || "Fehler beim Abgeben des Angebots"),
  });

  const navItems: DashboardNavItem[] = [
    {
      key: "dashboard",
      label: "Dashboard",
      href: "/dashboard",
      icon: <BarChart3 className="size-4" />,
    },
    {
      key: "inbox",
      label: "Postfach",
      href: "/inbox",
      icon: <Mail className="size-4" />,
    },
    {
      key: "marketplace",
      label: "Aufträge finden",
      href: "/marketplace",
      icon: <Search className="size-4" />,
    },
    {
      key: "orders",
      label: "Meine Aufträge",
      href: "/gigs",
      icon: <ClipboardList className="size-4" />,
    },
    {
      key: "earnings",
      label: "Verdienst",
      href: "/earnings",
      icon: <Wallet className="size-4" />,
    },
  ];

  const gigs = gigsQuery.data?.gigs ?? [];

  const filteredGigs = gigs.filter((gig: any) => {
    if (serviceFilter !== "all" && gig.service_type !== serviceFilter)
      return false;
    if (locationFilter.trim()) {
      const loc =
        `${gig.postal_code ?? ""} ${gig.profiles?.city ?? ""}`.toLowerCase();
      if (!loc.includes(locationFilter.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <DashboardShell
      title="Aufträge finden"
      navItems={navItems}
      activeKey="marketplace"
    >
      <div className="mb-6">
        <h1 className="font-brand text-2xl">Offene Aufträge</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Finde Aufträge in deiner Nähe und gib dein Angebot ab.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab("browse")}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            activeTab === "browse"
              ? "bg-primary text-primary-foreground"
              : "bg-glass border border-glass-border text-muted-foreground hover:text-foreground"
          }`}
        >
          Alle Aufträge
          {filteredGigs.length > 0 && (
            <span className="ml-1.5 rounded-full bg-primary-foreground/20 px-1.5 text-[10px]">
              {filteredGigs.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("my-bids")}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            activeTab === "my-bids"
              ? "bg-primary text-primary-foreground"
              : "bg-glass border border-glass-border text-muted-foreground hover:text-foreground"
          }`}
        >
          Meine Angebote
        </button>
      </div>

      {activeTab === "browse" && (
        <>
          {/* Filter */}
          <Card className="border-glass-border bg-glass backdrop-blur mb-6">
            <CardContent className="pt-4 pb-4 grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                  <Filter className="size-3" /> Leistungsart
                </Label>
                <Select value={serviceFilter} onValueChange={setServiceFilter}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle Leistungen</SelectItem>
                    {Object.entries(SERVICE_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                  <MapPin className="size-3" /> Ort / PLZ
                </Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    className="pl-8 h-9"
                    placeholder="z. B. Freiburg oder 79100"
                    value={locationFilter}
                    onChange={(e) => setLocationFilter(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Gig-Liste */}
          {gigsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Lädt Aufträge…
            </p>
          ) : filteredGigs.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Search className="size-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                {gigs.length === 0
                  ? "Noch keine offenen Aufträge in deiner Nähe."
                  : "Keine Aufträge gefunden. Versuche andere Filter."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredGigs.map((gig: any) => (
                <Card
                  key={gig.id}
                  className="border-glass-border bg-glass backdrop-blur cursor-pointer transition hover:border-primary/50 hover:shadow-[0_0_0_1px_hsl(var(--primary)/0.3)]"
                  onClick={() => {
                    setSelectedGig(gig);
                    setBidAmount(String(gig.budget_cents / 100));
                  }}
                >
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xl">
                        {SERVICE_LABELS[gig.service_type]?.split(" ")[0] ??
                          "🔧"}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-semibold leading-snug">
                              {gig.title}
                            </h3>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {SERVICE_LABELS[gig.service_type] ??
                                gig.service_type}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-base font-bold text-primary">
                              {formatEuros(gig.budget_cents)}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              Budget
                            </p>
                          </div>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <MapPin className="size-3" />
                            {gig.postal_code}
                            {gig.profiles?.city
                              ? ` · ${gig.profiles.city}`
                              : ""}
                          </span>
                          {gig.scheduled_at && (
                            <span className="flex items-center gap-1">
                              <Calendar className="size-3" />
                              {new Date(gig.scheduled_at).toLocaleDateString(
                                "de-DE",
                              )}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Clock className="size-3" />
                            {gig.duration_minutes / 60}h
                          </span>
                          <span className="text-muted-foreground/50">
                            {timeAgo(gig.created_at)}
                          </span>
                        </div>

                        {gig.description && (
                          <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                            {gig.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Avatar className="size-6">
                          <AvatarFallback className="text-[9px] bg-muted">
                            {(gig.profiles?.display_name ?? "K")
                              .slice(0, 1)
                              .toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-xs text-muted-foreground">
                          {gig.profiles?.display_name ?? "Kunde"}
                        </span>
                      </div>
                      <Badge
                        variant="outline"
                        className="text-[10px] border-blue-400/30 text-blue-400 bg-blue-400/10"
                      >
                        {gig.status === "open" ? "Offen" : "In Verhandlung"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === "my-bids" && (
        <div className="space-y-3">
          {myBidsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Lädt…
            </p>
          ) : !myBidsQuery.data?.negotiations?.length ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Send className="size-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                Du hast noch keine Angebote abgegeben.
              </p>
            </div>
          ) : (
            myBidsQuery.data.negotiations.map((neg: any) => (
              <Card
                key={neg.id}
                className="border-glass-border bg-glass backdrop-blur"
              >
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold truncate">
                        {neg.gigs?.title ?? "Auftrag"}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Kunde: {neg.gigs?.profiles?.display_name ?? "—"}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-base font-bold text-primary">
                        {formatEuros(neg.counter_bid_cents ?? neg.bid_cents)}
                      </p>
                      {neg.counter_bid_cents && (
                        <p className="text-[10px] text-muted-foreground">
                          Gegenangebot vom Kunden
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={
                        neg.status === "accepted"
                          ? "border-emerald-400/40 text-emerald-400 text-[10px]"
                          : neg.status === "declined"
                            ? "border-red-400/40 text-red-400 text-[10px]"
                            : neg.status === "countered"
                              ? "border-amber-400/40 text-amber-400 text-[10px]"
                              : "border-muted-foreground/40 text-muted-foreground text-[10px]"
                      }
                    >
                      {neg.status === "pending" && "Warte auf Antwort"}
                      {neg.status === "countered" && "Gegenangebot eingegangen"}
                      {neg.status === "accepted" && "✓ Akzeptiert"}
                      {neg.status === "declined" && "✗ Abgelehnt"}
                      {neg.status === "withdrawn" && "Zurückgezogen"}
                    </Badge>

                    {neg.gigs?.scheduled_at && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="size-3" />
                        {new Date(neg.gigs.scheduled_at).toLocaleDateString(
                          "de-DE",
                        )}
                      </span>
                    )}
                  </div>

                  {neg.message && (
                    <p className="mt-2 text-xs text-muted-foreground bg-muted/30 rounded p-2 italic">
                      „{neg.message}"
                    </p>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Bid Dialog */}
      <Dialog
        open={!!selectedGig}
        onOpenChange={(open) => !open && setSelectedGig(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Angebot abgeben</DialogTitle>
            <DialogDescription>{selectedGig?.title}</DialogDescription>
          </DialogHeader>

          {selectedGig && (
            <div className="space-y-4">
              {/* Auftrag Info */}
              <div className="rounded-xl border border-glass-border bg-glass/50 p-4 space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="size-3.5" />
                    {selectedGig.postal_code}
                    {selectedGig.profiles?.city
                      ? `, ${selectedGig.profiles.city}`
                      : ""}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="size-3.5" />
                    {selectedGig.duration_minutes / 60}h geplant
                  </div>
                  {selectedGig.scheduled_at && (
                    <div className="flex items-center gap-1.5">
                      <Calendar className="size-3.5" />
                      {new Date(selectedGig.scheduled_at).toLocaleDateString(
                        "de-DE",
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-primary font-medium">
                    <Euro className="size-3.5" />
                    Budget: {formatEuros(selectedGig.budget_cents)}
                  </div>
                </div>
                {selectedGig.description && (
                  <p className="text-muted-foreground pt-2 border-t border-glass-border">
                    {selectedGig.description}
                  </p>
                )}
              </div>

              {/* Bid Betrag */}
              <div>
                <Label htmlFor="bid-amount" className="text-sm font-medium">
                  Dein Angebot (€) *
                </Label>
                <div className="relative mt-1">
                  <Euro className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    id="bid-amount"
                    type="number"
                    placeholder={String(selectedGig.budget_cents / 100)}
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    className="pl-9"
                    min="1"
                    step="0.50"
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Budget des Kunden: {formatEuros(selectedGig.budget_cents)}. Du
                  kannst weniger verlangen.
                </p>
              </div>

              {/* Nachricht */}
              <div>
                <Label htmlFor="bid-message" className="text-sm font-medium">
                  Kurznachricht (optional)
                </Label>
                <Textarea
                  id="bid-message"
                  placeholder="Stelle dich kurz vor, beschreibe deine Erfahrung…"
                  value={bidMessage}
                  onChange={(e) => setBidMessage(e.target.value)}
                  className="mt-1"
                  rows={3}
                />
              </div>

              {/* Plattform-Fee Hinweis */}
              {bidAmount && !isNaN(parseFloat(bidAmount)) && (
                <div className="rounded-lg border border-glass-border bg-glass/50 p-3 text-xs space-y-1">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Dein Angebot</span>
                    <span>{parseFloat(bidAmount).toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Plattform-Gebühr (10%)</span>
                    <span>-{(parseFloat(bidAmount) * 0.1).toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between font-semibold text-primary border-t border-glass-border pt-1">
                    <span>Du erhältst</span>
                    <span>{(parseFloat(bidAmount) * 0.9).toFixed(2)} €</span>
                  </div>
                </div>
              )}

              <Button
                className="w-full"
                onClick={() => bidMutation.mutate()}
                disabled={
                  bidMutation.isPending ||
                  !bidAmount ||
                  parseFloat(bidAmount) <= 0
                }
              >
                {bidMutation.isPending ? (
                  "Wird gesendet…"
                ) : (
                  <>
                    <Send className="size-4 mr-2" />
                    Angebot abschicken
                  </>
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}

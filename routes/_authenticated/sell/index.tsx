import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Package,
  Plus,
  Pencil,
  Trash2,
  Play,
  Pause,
  Gavel,
  Inbox,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { useAppNavItems } from "@/lib/use-app-nav";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatEuros } from "@/lib/utils";
import { QueryErrorCard } from "@/components/query-error-card";
import { SERVICE_TYPES } from "@/lib/service-types";
import {
  getMyServiceListings,
  deleteServiceListing,
  publishServiceListing,
  unpublishServiceListing,
  endAuction,
  getReceivedOffers,
  acceptOffer,
  rejectOffer,
  counterOffer,
  type ServiceListing,
  type ServiceOffer,
} from "@/lib/service-listings.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/sell/")({
  component: SellDashboard,
});

const STATUS_LABELS: Record<ServiceListing["status"], string> = {
  draft: "Entwurf",
  active: "Aktiv",
  sold: "Verkauft",
  expired: "Beendet",
  cancelled: "Storniert",
};

const STATUS_COLORS: Record<ServiceListing["status"], string> = {
  draft: "text-muted-foreground border-muted/30 bg-muted/10",
  active: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
  sold: "text-primary border-primary/30 bg-primary/10",
  expired: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  cancelled: "text-red-400 border-red-400/30 bg-red-400/10",
};

function serviceTypeLabel(value: string) {
  return SERVICE_TYPES.find((s) => s.value === value)?.label ?? value;
}

function SellDashboard() {
  const { navItems } = useAppNavItems();
  const queryClient = useQueryClient();
  const [counterOfferId, setCounterOfferId] = useState<string | null>(null);
  const [counterAmount, setCounterAmount] = useState("");

  const getMyListingsFn = useServerFn(getMyServiceListings);
  const deleteListingFn = useServerFn(deleteServiceListing);
  const publishFn = useServerFn(publishServiceListing);
  const unpublishFn = useServerFn(unpublishServiceListing);
  const endAuctionFn = useServerFn(endAuction);
  const getReceivedOffersFn = useServerFn(getReceivedOffers);
  const acceptOfferFn = useServerFn(acceptOffer);
  const rejectOfferFn = useServerFn(rejectOffer);
  const counterOfferFn = useServerFn(counterOffer);

  const listingsQuery = useQuery({
    queryKey: ["my-service-listings"],
    queryFn: () => getMyListingsFn(),
  });

  const offersQuery = useQuery({
    queryKey: ["received-offers"],
    queryFn: () => getReceivedOffersFn(),
  });

  const invalidateListings = () =>
    queryClient.invalidateQueries({ queryKey: ["my-service-listings"] });
  const invalidateOffers = () =>
    queryClient.invalidateQueries({ queryKey: ["received-offers"] });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteListingFn({ data: id }),
    onSuccess: () => {
      toast.success("Angebot gelöscht");
      invalidateListings();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const publishMutation = useMutation({
    mutationFn: (id: string) => publishFn({ data: id }),
    onSuccess: () => {
      toast.success("Angebot veröffentlicht");
      invalidateListings();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const unpublishMutation = useMutation({
    mutationFn: (id: string) => unpublishFn({ data: id }),
    onSuccess: () => {
      toast.success("Angebot pausiert");
      invalidateListings();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const endAuctionMutation = useMutation({
    mutationFn: (id: string) => endAuctionFn({ data: id }),
    onSuccess: (result) => {
      if (result.gigId) {
        toast.success("Auktion abgeschlossen — Auftrag wurde erstellt!");
      } else if (result.reserveNotMet) {
        toast.info("Auktion beendet — Mindestpreis wurde nicht erreicht.");
      } else {
        toast.info("Auktion beendet — es gab keine Gebote.");
      }
      invalidateListings();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const acceptMutation = useMutation({
    mutationFn: (offerId: string) => acceptOfferFn({ data: offerId }),
    onSuccess: () => {
      toast.success("Angebot angenommen — Auftrag wurde erstellt!");
      invalidateOffers();
      invalidateListings();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const rejectMutation = useMutation({
    mutationFn: (offerId: string) => rejectOfferFn({ data: offerId }),
    onSuccess: () => {
      toast.success("Angebot abgelehnt");
      invalidateOffers();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const counterMutation = useMutation({
    mutationFn: ({ offerId, cents }: { offerId: string; cents: number }) =>
      counterOfferFn({ data: { offerId, amountCents: cents } }),
    onSuccess: () => {
      toast.success("Gegenangebot gesendet");
      invalidateOffers();
      setCounterOfferId(null);
      setCounterAmount("");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const listings = listingsQuery.data ?? [];
  const offers = offersQuery.data ?? [];
  const pendingOffers = offers.filter(
    (o) => o.status === "pending" || o.status === "countered",
  );

  return (
    <DashboardShell title="Meine Angebote" navItems={navItems} activeKey="sell">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-brand text-2xl">Meine Angebote</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Erstelle und verwalte deine Leistungsangebote im Marktplatz.
          </p>
        </div>
        <Button asChild>
          <Link to="/sell/create">
            <Plus className="size-4 mr-2" />
            Neues Angebot
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="listings">
        <TabsList className="mb-4">
          <TabsTrigger value="listings">Angebote</TabsTrigger>
          <TabsTrigger value="offers">
            Erhaltene Angebote{" "}
            {pendingOffers.length > 0 && (
              <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary font-semibold">
                {pendingOffers.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="listings">
          {listingsQuery.isError ? (
            <QueryErrorCard error={listingsQuery.error} />
          ) : listingsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Lädt…</p>
          ) : listings.length === 0 ? (
            <Card className="border-glass-border bg-glass backdrop-blur">
              <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                <Package className="size-10 text-muted-foreground/40" />
                <h3 className="font-semibold">Noch keine Angebote</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Erstelle dein erstes Leistungsangebot und erreiche Kunden
                  direkt im Marktplatz.
                </p>
                <Button asChild className="mt-2">
                  <Link to="/sell/create">
                    <Plus className="size-4 mr-2" />
                    Erstes Angebot erstellen
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {listings.map((listing) => {
                const auctionEnded =
                  listing.listingType === "auction" &&
                  listing.status === "active" &&
                  listing.auctionEndTime &&
                  new Date(listing.auctionEndTime).getTime() < Date.now();

                return (
                  <Card
                    key={listing.id}
                    className="border-glass-border bg-glass backdrop-blur"
                  >
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h3 className="font-semibold truncate">
                              {listing.title}
                            </h3>
                            <Badge
                              variant="outline"
                              className={`shrink-0 text-[11px] ${STATUS_COLORS[listing.status]}`}
                            >
                              {STATUS_LABELS[listing.status]}
                            </Badge>
                            {auctionEnded && (
                              <Badge
                                variant="outline"
                                className="shrink-0 text-[11px] text-amber-400 border-amber-400/30 bg-amber-400/10"
                              >
                                Auktion abgelaufen
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span>{serviceTypeLabel(listing.serviceType)}</span>
                            <span>
                              {listing.listingType === "auction"
                                ? `Aktuell: ${formatEuros(listing.currentPriceCents ?? listing.startPriceCents)}`
                                : formatEuros(listing.priceCents)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                          {auctionEnded && (
                            <Button
                              size="sm"
                              onClick={() =>
                                endAuctionMutation.mutate(listing.id)
                              }
                              disabled={endAuctionMutation.isPending}
                            >
                              <Gavel className="size-3.5 mr-1" />
                              Auktion abschließen
                            </Button>
                          )}
                          {listing.status === "draft" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => publishMutation.mutate(listing.id)}
                              disabled={publishMutation.isPending}
                            >
                              <Play className="size-3.5 mr-1" />
                              Veröffentlichen
                            </Button>
                          )}
                          {listing.status === "active" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                unpublishMutation.mutate(listing.id)
                              }
                              disabled={unpublishMutation.isPending}
                            >
                              <Pause className="size-3.5 mr-1" />
                              Pausieren
                            </Button>
                          )}
                          {(listing.status === "draft" ||
                            listing.status === "active") && (
                            <Button size="sm" variant="outline" asChild>
                              <Link
                                to="/sell/edit/$id"
                                params={{ id: listing.id }}
                              >
                                <Pencil className="size-3.5 mr-1" />
                                Bearbeiten
                              </Link>
                            </Button>
                          )}
                          {listing.status !== "sold" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-400 hover:text-red-400"
                              onClick={() => deleteMutation.mutate(listing.id)}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="offers">
          {offersQuery.isError ? (
            <QueryErrorCard error={offersQuery.error} />
          ) : offersQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Lädt…</p>
          ) : offers.length === 0 ? (
            <Card className="border-glass-border bg-glass backdrop-blur">
              <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                <Inbox className="size-10 text-muted-foreground/40" />
                <h3 className="font-semibold">Noch keine Angebote erhalten</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Sobald Kunden auf deine verhandelbaren Angebote reagieren,
                  siehst du sie hier.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {offers.map((offer) => (
                <OfferCard
                  key={offer.id}
                  offer={offer}
                  isCountering={counterOfferId === offer.id}
                  counterAmount={counterAmount}
                  onStartCounter={() => setCounterOfferId(offer.id)}
                  onCancelCounter={() => setCounterOfferId(null)}
                  onCounterAmountChange={setCounterAmount}
                  onSubmitCounter={() =>
                    counterMutation.mutate({
                      offerId: offer.id,
                      cents: Math.round(
                        parseFloat(counterAmount.replace(",", ".")) * 100,
                      ),
                    })
                  }
                  onAccept={() => acceptMutation.mutate(offer.id)}
                  onReject={() => rejectMutation.mutate(offer.id)}
                  isBusy={
                    acceptMutation.isPending ||
                    rejectMutation.isPending ||
                    counterMutation.isPending
                  }
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </DashboardShell>
  );
}

function OfferCard({
  offer,
  isCountering,
  counterAmount,
  onStartCounter,
  onCancelCounter,
  onCounterAmountChange,
  onSubmitCounter,
  onAccept,
  onReject,
  isBusy,
}: {
  offer: ServiceOffer;
  isCountering: boolean;
  counterAmount: string;
  onStartCounter: () => void;
  onCancelCounter: () => void;
  onCounterAmountChange: (v: string) => void;
  onSubmitCounter: () => void;
  onAccept: () => void;
  onReject: () => void;
  isBusy: boolean;
}) {
  const isActionable =
    offer.status === "pending" || offer.status === "countered";

  return (
    <Card className="border-glass-border bg-glass backdrop-blur">
      <CardContent className="pt-4 pb-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium">
              {offer.listingTitle ?? "Angebot"}
            </p>
            <p className="text-xs text-muted-foreground">
              von {offer.offererName ?? "Kunde"}
            </p>
          </div>
          <p className="text-lg font-bold text-primary">
            {formatEuros(offer.amountCents)}
          </p>
        </div>

        {offer.message && (
          <p className="text-sm text-muted-foreground bg-muted/30 rounded-lg p-2">
            „{offer.message}"
          </p>
        )}

        <Badge
          variant="outline"
          className={
            offer.status === "accepted"
              ? "border-emerald-400/40 text-emerald-400"
              : offer.status === "rejected" || offer.status === "withdrawn"
                ? "border-red-400/40 text-red-400"
                : offer.status === "countered"
                  ? "border-amber-400/40 text-amber-400"
                  : "border-muted-foreground/40 text-muted-foreground"
          }
        >
          {offer.status === "pending" && "Ausstehend"}
          {offer.status === "countered" && "Gegenangebot gesendet"}
          {offer.status === "accepted" && "Angenommen"}
          {offer.status === "rejected" && "Abgelehnt"}
          {offer.status === "withdrawn" && "Zurückgezogen"}
        </Badge>

        {isActionable && (
          <div className="flex gap-2 flex-wrap">
            {isCountering ? (
              <div className="flex gap-2 w-full">
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="Betrag (€)"
                  value={counterAmount}
                  onChange={(e) => onCounterAmountChange(e.target.value)}
                  className="h-8 text-sm"
                />
                <Button size="sm" variant="outline" onClick={onCancelCounter}>
                  Abbrechen
                </Button>
                <Button
                  size="sm"
                  onClick={onSubmitCounter}
                  disabled={!counterAmount || isBusy}
                >
                  Senden
                </Button>
              </div>
            ) : (
              <>
                <Button size="sm" onClick={onAccept} disabled={isBusy}>
                  <CheckCircle2 className="size-3.5 mr-1" />
                  Annehmen
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onStartCounter}
                  disabled={isBusy}
                >
                  Gegenangebot
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={onReject}
                  disabled={isBusy}
                >
                  <XCircle className="size-3.5 mr-1" />
                  Ablehnen
                </Button>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

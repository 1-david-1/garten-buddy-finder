import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Mail,
  ShoppingBag,
  MapPin,
  Clock,
  Gavel,
  ChevronLeft,
} from "lucide-react";
import {
  DashboardShell,
  type DashboardNavItem,
} from "@/components/dashboard/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatEuros } from "@/lib/utils";
import { SERVICE_TYPES } from "@/lib/service-types";
import { useAuth } from "@/lib/auth";
import { QueryErrorCard } from "@/components/query-error-card";
import {
  getServiceListingById,
  getAuctionBids,
  placeAuctionBid,
  purchaseServiceListing,
  makeOffer,
  endAuction,
} from "@/lib/service-listings.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/service-listings/$id")({
  component: ServiceListingDetailPage,
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
    key: "service-listings",
    label: "Service-Angebote",
    href: "/service-listings",
    icon: <ShoppingBag className="size-4" />,
  },
];

function serviceTypeLabel(value: string) {
  return SERVICE_TYPES.find((s) => s.value === value)?.label ?? value;
}

function formatTimeRemaining(endTime: string | null): string {
  if (!endTime) return "";
  const diffMs = new Date(endTime).getTime() - Date.now();
  if (diffMs <= 0) return "Auktion beendet";
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 1)
    return `${Math.max(1, Math.floor(diffMs / (1000 * 60)))} Minuten verbleibend`;
  if (hours < 24) return `${hours} Stunden verbleibend`;
  return `${Math.floor(hours / 24)} Tage verbleibend`;
}

function ServiceListingDetailPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [bidDialogOpen, setBidDialogOpen] = useState(false);
  const [bidAmount, setBidAmount] = useState("");
  const [offerDialogOpen, setOfferDialogOpen] = useState(false);
  const [offerAmount, setOfferAmount] = useState("");
  const [offerMessage, setOfferMessage] = useState("");
  const [hasTriedAutoEnd, setHasTriedAutoEnd] = useState(false);

  const getListingFn = useServerFn(getServiceListingById);
  const getBidsFn = useServerFn(getAuctionBids);
  const placeBidFn = useServerFn(placeAuctionBid);
  const purchaseFn = useServerFn(purchaseServiceListing);
  const makeOfferFn = useServerFn(makeOffer);
  const endAuctionFn = useServerFn(endAuction);

  const listingQuery = useQuery({
    queryKey: ["service-listing", id],
    queryFn: () => getListingFn({ data: id }),
  });

  const listing = listingQuery.data;
  const isAuction = listing?.listingType === "auction";

  const bidsQuery = useQuery({
    queryKey: ["auction-bids", id],
    queryFn: () => getBidsFn({ data: id }),
    enabled: !!isAuction,
  });

  const auctionEnded =
    isAuction && listing?.status === "active" && listing.auctionEndTime
      ? new Date(listing.auctionEndTime).getTime() < Date.now()
      : false;

  const endAuctionMutation = useMutation({
    mutationFn: () => endAuctionFn({ data: id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-listing", id] });
      queryClient.invalidateQueries({ queryKey: ["auction-bids", id] });
    },
  });

  // Auto-close ended auctions once, when viewed (idempotent server-side).
  useEffect(() => {
    if (auctionEnded && !hasTriedAutoEnd) {
      setHasTriedAutoEnd(true);
      endAuctionMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auctionEnded, hasTriedAutoEnd]);

  const purchaseMutation = useMutation({
    mutationFn: (buyNow: boolean) =>
      purchaseFn({ data: { listingId: id, buyNow } }),
    onSuccess: () => {
      toast.success("Kauf abgeschlossen! Der Auftrag wurde erstellt.");
      navigate({ to: "/my-gigs" });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const bidMutation = useMutation({
    mutationFn: (cents: number) =>
      placeBidFn({ data: { listingId: id, amountCents: cents } }),
    onSuccess: () => {
      toast.success("Gebot abgegeben!");
      setBidDialogOpen(false);
      setBidAmount("");
      queryClient.invalidateQueries({ queryKey: ["service-listing", id] });
      queryClient.invalidateQueries({ queryKey: ["auction-bids", id] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const offerMutation = useMutation({
    mutationFn: (input: { cents: number; message: string }) =>
      makeOfferFn({
        data: {
          listingId: id,
          amountCents: input.cents,
          message: input.message,
        },
      }),
    onSuccess: () => {
      toast.success("Angebot gesendet!");
      setOfferDialogOpen(false);
      setOfferAmount("");
      setOfferMessage("");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  if (listingQuery.isLoading) {
    return (
      <DashboardShell
        title="Angebot"
        navItems={navItems}
        activeKey="service-listings"
      >
        <p className="text-sm text-muted-foreground">Lädt…</p>
      </DashboardShell>
    );
  }

  if (listingQuery.isError) {
    return (
      <DashboardShell
        title="Angebot"
        navItems={navItems}
        activeKey="service-listings"
      >
        <QueryErrorCard error={listingQuery.error} />
      </DashboardShell>
    );
  }

  if (!listing) {
    return (
      <DashboardShell
        title="Angebot"
        navItems={navItems}
        activeKey="service-listings"
      >
        <p className="text-sm text-muted-foreground">
          Dieses Angebot existiert nicht (mehr).
        </p>
      </DashboardShell>
    );
  }

  const isOwner = user?.id === listing.helperId;
  const minNextBid =
    (listing.currentPriceCents ?? listing.startPriceCents ?? 0) +
    (listing.minBidIncrementCents ?? 50);

  return (
    <DashboardShell
      title={listing.title}
      navItems={navItems}
      activeKey="service-listings"
    >
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link to="/service-listings">
          <ChevronLeft className="size-4 mr-1" />
          Zurück zum Marktplatz
        </Link>
      </Button>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <Card className="border-glass-border bg-glass backdrop-blur">
            <CardContent className="pt-5 pb-5 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <h1 className="font-brand text-2xl">{listing.title}</h1>
                <Badge variant="outline">
                  {listing.listingType === "fixed_price" && "Festpreis"}
                  {listing.listingType === "auction" && "Auktion"}
                  {listing.listingType === "negotiable" && "Verhandelbar"}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span>{serviceTypeLabel(listing.serviceType)}</span>
                {listing.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3.5" />
                    {listing.location}
                  </span>
                )}
                {listing.helperName && (
                  <span>Anbieter: {listing.helperName}</span>
                )}
              </div>
              {listing.description && (
                <p className="text-sm text-muted-foreground whitespace-pre-line pt-2 border-t border-glass-border">
                  {listing.description}
                </p>
              )}
            </CardContent>
          </Card>

          {isAuction && (
            <Card className="border-glass-border bg-glass backdrop-blur">
              <CardContent className="pt-5 pb-5">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Gavel className="size-4" />
                  Gebote ({bidsQuery.data?.length ?? 0})
                </h3>
                {bidsQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">Lädt…</p>
                ) : !bidsQuery.data || bidsQuery.data.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Noch keine Gebote.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {bidsQuery.data.map((bid) => (
                      <div
                        key={bid.id}
                        className="flex items-center justify-between text-sm py-1.5 border-b border-glass-border last:border-0"
                      >
                        <span className="text-muted-foreground">
                          {bid.bidderName ?? "Bieter"}
                        </span>
                        <span className="font-medium">
                          {formatEuros(bid.amountCents)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div>
          <Card className="border-glass-border bg-glass backdrop-blur sticky top-4">
            <CardContent className="pt-5 pb-5 space-y-4">
              {listing.status !== "active" ? (
                <div>
                  <Badge variant="outline" className="mb-2">
                    {listing.status === "sold" && "Verkauft"}
                    {listing.status === "expired" && "Beendet"}
                    {listing.status === "draft" && "Entwurf"}
                    {listing.status === "cancelled" && "Storniert"}
                  </Badge>
                  <p className="text-sm text-muted-foreground">
                    Dieses Angebot ist nicht mehr verfügbar.
                  </p>
                </div>
              ) : isOwner ? (
                <div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Das ist dein eigenes Angebot.
                  </p>
                  <Button asChild variant="outline" className="w-full">
                    <Link to="/sell/edit/$id" params={{ id: listing.id }}>
                      Bearbeiten
                    </Link>
                  </Button>
                </div>
              ) : (
                <>
                  {isAuction ? (
                    <>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Aktuelles Gebot
                        </p>
                        <p className="text-2xl font-bold text-primary">
                          {formatEuros(
                            listing.currentPriceCents ??
                              listing.startPriceCents,
                          )}
                        </p>
                      </div>
                      {listing.auctionEndTime && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="size-3.5" />
                          {formatTimeRemaining(listing.auctionEndTime)}
                        </p>
                      )}
                      {!auctionEnded && (
                        <Button
                          className="w-full"
                          onClick={() => setBidDialogOpen(true)}
                        >
                          Gebot abgeben
                        </Button>
                      )}
                      {listing.buyNowPriceCents && !auctionEnded && (
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => purchaseMutation.mutate(true)}
                          disabled={purchaseMutation.isPending}
                        >
                          Sofort kaufen für{" "}
                          {formatEuros(listing.buyNowPriceCents)}
                        </Button>
                      )}
                    </>
                  ) : (
                    <>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          {listing.listingType === "negotiable"
                            ? "Richtpreis"
                            : "Preis"}
                        </p>
                        <p className="text-2xl font-bold text-primary">
                          {formatEuros(listing.priceCents)}
                        </p>
                      </div>
                      <Button
                        className="w-full"
                        onClick={() => purchaseMutation.mutate(false)}
                        disabled={purchaseMutation.isPending}
                      >
                        Jetzt kaufen
                      </Button>
                      {listing.listingType === "negotiable" && (
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => setOfferDialogOpen(true)}
                        >
                          Angebot machen
                        </Button>
                      )}
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={bidDialogOpen} onOpenChange={setBidDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gebot abgeben</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Mindestgebot: {formatEuros(minNextBid)}
            </p>
            <div>
              <Label htmlFor="bid-amount">Dein Gebot (€)</Label>
              <Input
                id="bid-amount"
                type="text"
                inputMode="decimal"
                placeholder={(minNextBid / 100).toString().replace(".", ",")}
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                const cents = Math.round(
                  parseFloat(bidAmount.replace(",", ".")) * 100,
                );
                bidMutation.mutate(cents);
              }}
              disabled={!bidAmount || bidMutation.isPending}
            >
              Gebot abgeben
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={offerDialogOpen} onOpenChange={setOfferDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Angebot machen</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="offer-amount">Dein Angebot (€)</Label>
              <Input
                id="offer-amount"
                type="text"
                inputMode="decimal"
                placeholder="30,00"
                value={offerAmount}
                onChange={(e) => setOfferAmount(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="offer-message">Nachricht (optional)</Label>
              <Textarea
                id="offer-message"
                value={offerMessage}
                onChange={(e) => setOfferMessage(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                const cents = Math.round(
                  parseFloat(offerAmount.replace(",", ".")) * 100,
                );
                offerMutation.mutate({ cents, message: offerMessage });
              }}
              disabled={!offerAmount || offerMutation.isPending}
            >
              Angebot senden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}

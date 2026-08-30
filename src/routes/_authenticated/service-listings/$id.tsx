import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Clock, Gavel, ChevronLeft, BadgeCheck } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { useAppNavItems } from "@/lib/use-app-nav";
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
  purchaseWithSchedule,
} from "@/lib/service-listings.functions";
import { startConversation } from "@/lib/messaging.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/service-listings/$id")({
  component: ServiceListingDetailPage,
});

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
  const { navItems } = useAppNavItems();
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [bidDialogOpen, setBidDialogOpen] = useState(false);
  const [bidAmount, setBidAmount] = useState("");
  const [offerDialogOpen, setOfferDialogOpen] = useState(false);
  const [offerAmount, setOfferAmount] = useState("");
  const [offerMessage, setOfferMessage] = useState("");
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [bookingStart, setBookingStart] = useState("");
  const [bookingEnd, setBookingEnd] = useState("");
  const [bookingMessage, setBookingMessage] = useState("");
  const [hasTriedAutoEnd, setHasTriedAutoEnd] = useState(false);
  const [activePhoto, setActivePhoto] = useState(0);

  const getListingFn = useServerFn(getServiceListingById);
  const getBidsFn = useServerFn(getAuctionBids);
  const placeBidFn = useServerFn(placeAuctionBid);
  const purchaseFn = useServerFn(purchaseServiceListing);
  const purchaseWithScheduleFn = useServerFn(purchaseWithSchedule);
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

  const bookingMutation = useMutation({
    mutationFn: () =>
      purchaseWithScheduleFn({
        data: {
          listingId: id,
          scheduledAt: new Date(bookingStart).toISOString(),
          scheduledEnd: bookingEnd ? new Date(bookingEnd).toISOString() : undefined,
          message: bookingMessage,
        },
      }),
    onSuccess: () => {
      toast.success("Anfrage gesendet – der Helfer wird benachrichtigt");
      setBookingDialogOpen(false);
      navigate({ to: "/my-gigs" });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const startConversationFn = useServerFn(startConversation);
  const messageSellerMutation = useMutation({
    mutationFn: () =>
      startConversationFn({
        data: { otherUserId: listing!.helperId, listingId: id },
      }),
    onSuccess: (result) => {
      navigate({
        to: "/messages/$conversationId",
        params: { conversationId: result.conversationId },
      });
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
          {listing.photos.length > 0 && (
            <div className="space-y-2">
              <div className="aspect-video overflow-hidden rounded-2xl border border-glass-border">
                <img
                  src={listing.photos[activePhoto] ?? listing.photos[0]}
                  alt={listing.title}
                  className="h-full w-full object-cover"
                />
              </div>
              {listing.photos.length > 1 && (
                <div className="flex gap-2">
                  {listing.photos.map((url, i) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => setActivePhoto(i)}
                      className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border transition ${
                        i === activePhoto
                          ? "border-primary"
                          : "border-glass-border opacity-70 hover:opacity-100"
                      }`}
                    >
                      <img
                        src={url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
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
                  <Link
                    to="/helpers/$helperId"
                    params={{ helperId: listing.helperId }}
                    className="underline decoration-dotted underline-offset-2 hover:text-primary"
                  >
                    <span>Anbieter: {listing.helperName}</span>
                    {listing.helperVerifiedAt && (
                      <span className="inline-flex items-center gap-1 text-primary">
                        <BadgeCheck className="size-4" aria-hidden="true" />
                        <span>Verifiziert</span>
                      </span>
                    )}
                  </Link>
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
                        onClick={() => setBookingDialogOpen(true)}
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
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => messageSellerMutation.mutate()}
                    disabled={messageSellerMutation.isPending}
                  >
                    Nachricht an Verkäufer
                  </Button>
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

      <Dialog open={bookingDialogOpen} onOpenChange={setBookingDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buchungsanfrage</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="booking-start">Wann? (Datum & Uhrzeit) *</Label>
              <Input
                id="booking-start"
                type="datetime-local"
                value={bookingStart}
                onChange={(e) => setBookingStart(e.target.value)}
                className="mt-1"
                required
              />
            </div>
            <div>
              <Label htmlFor="booking-end">Bis wann? (Optional)</Label>
              <Input
                id="booking-end"
                type="datetime-local"
                value={bookingEnd}
                onChange={(e) => setBookingEnd(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="booking-message">Nachricht an den Helfer (Optional)</Label>
              <Textarea
                id="booking-message"
                placeholder="Hallo, ich bräuchte Hilfe bei..."
                value={bookingMessage}
                onChange={(e) => setBookingMessage(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => bookingMutation.mutate()}
              disabled={!bookingStart || bookingMutation.isPending}
            >
              Buchungsanfrage senden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}

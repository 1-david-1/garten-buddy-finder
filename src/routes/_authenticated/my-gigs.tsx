import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Search,
  MapPin,
  Calendar,
  Euro,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  Users,
  Star,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { useAppNavItems } from "@/lib/use-app-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getMyGigs, completeGig } from "@/lib/gigs.functions";
import {
  getNegotiationsForGig,
  counterBid,
  acceptBid as acceptNegBid,
  declineBid,
} from "@/lib/negotiations.functions";
import { createReview } from "@/lib/reviews.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/my-gigs")({
  component: MyGigsPage,
});

const STATUS_COLORS: Record<string, string> = {
  open: "text-blue-400 border-blue-400/30 bg-blue-400/10",
  negotiating: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  assigned: "text-purple-400 border-purple-400/30 bg-purple-400/10",
  in_progress: "text-orange-400 border-orange-400/30 bg-orange-400/10",
  completed: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
  cancelled: "text-red-400 border-red-400/30 bg-red-400/10",
  draft: "text-muted-foreground border-muted/30 bg-muted/10",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Offen",
  negotiating: "In Verhandlung",
  assigned: "Zugewiesen",
  in_progress: "In Bearbeitung",
  completed: "Abgeschlossen",
  cancelled: "Storniert",
  draft: "Entwurf",
};

function formatEuros(cents: number) {
  return (cents / 100).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
  });
}

function MyGigsPage() {
  const queryClient = useQueryClient();
  const [selectedGig, setSelectedGig] = useState<string | null>(null);
  const [reviewGig, setReviewGig] = useState<{
    id: string;
    helperId: string;
    helperName: string;
  } | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [counterAmount, setCounterAmount] = useState("");
  const [counterNegId, setCounterNegId] = useState<string | null>(null);

  const getMyGigsFn = useServerFn(getMyGigs);
  const getNegotiationsFn = useServerFn(getNegotiationsForGig);
  const completeGigFn = useServerFn(completeGig);
  const counterBidFn = useServerFn(counterBid);
  const acceptBidFn = useServerFn(acceptNegBid);
  const declineBidFn = useServerFn(declineBid);
  const createReviewFn = useServerFn(createReview);

  const gigsQuery = useQuery({
    queryKey: ["my-gigs"],
    queryFn: () => getMyGigsFn(),
  });

  const selectedGigData = gigsQuery.data?.gigs.find(
    (g) => g.id === selectedGig,
  );

  const negotiationsQuery = useQuery({
    queryKey: ["negotiations", selectedGig],
    queryFn: () => getNegotiationsFn({ data: { gigId: selectedGig! } }),
    enabled: !!selectedGig,
  });

  const completeMutation = useMutation({
    mutationFn: (gigId: string) => completeGigFn({ data: { gigId } }),
    onSuccess: () => {
      toast.success("Auftrag als abgeschlossen markiert!");
      queryClient.invalidateQueries({ queryKey: ["my-gigs"] });
      setSelectedGig(null);
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const counterMutation = useMutation({
    mutationFn: ({ negId, cents }: { negId: string; cents: number }) =>
      counterBidFn({ data: { negotiationId: negId, counterBidCents: cents } }),
    onSuccess: () => {
      toast.success("Gegenangebot gesendet!");
      queryClient.invalidateQueries({
        queryKey: ["negotiations", selectedGig],
      });
      setCounterNegId(null);
      setCounterAmount("");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const declineMutation = useMutation({
    mutationFn: (negId: string) =>
      declineBidFn({ data: { negotiationId: negId } }),
    onSuccess: () => {
      toast.success("Angebot abgelehnt");
      queryClient.invalidateQueries({
        queryKey: ["negotiations", selectedGig],
      });
      queryClient.invalidateQueries({ queryKey: ["my-gigs"] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const reviewMutation = useMutation({
    mutationFn: () =>
      createReviewFn({
        data: {
          gigId: reviewGig!.id,
          helperId: reviewGig!.helperId,
          rating: reviewRating,
          comment: reviewComment,
        },
      }),
    onSuccess: () => {
      toast.success("Bewertung abgegeben!");
      setReviewGig(null);
      setReviewRating(5);
      setReviewComment("");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const { navItems } = useAppNavItems();

  const gigs = gigsQuery.data?.gigs ?? [];
  const activeGigs = gigs.filter(
    (g) => !["completed", "cancelled"].includes(g.status),
  );
  const pastGigs = gigs.filter((g) =>
    ["completed", "cancelled"].includes(g.status),
  );

  return (
    <DashboardShell
      title="Meine Aufträge"
      navItems={navItems}
      activeKey="my-gigs"
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-brand text-2xl">Meine Aufträge</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Verwalte deine Aufträge und bearbeite eingehende Angebote.
          </p>
        </div>
        <Button asChild>
          <Link to="/create-gig">
            <Plus className="size-4 mr-2" />
            Neuer Auftrag
          </Link>
        </Button>
      </div>

      {gigsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Lädt…</p>
      ) : gigs.length === 0 ? (
        <Card className="border-glass-border bg-glass backdrop-blur">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Search className="size-10 text-muted-foreground/40" />
            <h3 className="font-semibold">Noch keine Aufträge</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Erstelle deinen ersten Auftrag und erhalte Angebote von Helfern in
              deiner Nähe.
            </p>
            <Button asChild className="mt-2">
              <Link to="/create-gig">
                <Plus className="size-4 mr-2" />
                Ersten Auftrag erstellen
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="active">
          <TabsList className="mb-4">
            <TabsTrigger value="active">
              Aktiv{" "}
              {activeGigs.length > 0 && (
                <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary font-semibold">
                  {activeGigs.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="past">Abgeschlossen / Storniert</TabsTrigger>
          </TabsList>

          <TabsContent value="active">
            <div className="space-y-3">
              {activeGigs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Keine aktiven Aufträge.
                </p>
              ) : (
                activeGigs.map((gig) => (
                  <GigCard
                    key={gig.id}
                    gig={gig}
                    onSelect={setSelectedGig}
                    onComplete={() => completeMutation.mutate(gig.id)}
                    isCompleting={completeMutation.isPending}
                    onReview={(helperId, helperName) =>
                      setReviewGig({ id: gig.id, helperId, helperName })
                    }
                  />
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="past">
            <div className="space-y-3">
              {pastGigs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Noch keine abgeschlossenen Aufträge.
                </p>
              ) : (
                pastGigs.map((gig) => (
                  <GigCard
                    key={gig.id}
                    gig={gig}
                    onSelect={setSelectedGig}
                    onComplete={() => {}}
                    isCompleting={false}
                    onReview={(helperId, helperName) =>
                      setReviewGig({ id: gig.id, helperId, helperName })
                    }
                  />
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      )}

      {/* Gig Details + Negotiations Dialog */}
      <Dialog
        open={!!selectedGig}
        onOpenChange={(open) => !open && setSelectedGig(null)}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedGigData?.title ?? "Auftragsdetails"}
            </DialogTitle>
            <DialogDescription>
              Angebote verwalten und Auftrag abschließen
            </DialogDescription>
          </DialogHeader>

          {selectedGigData && (
            <div className="space-y-4">
              {/* Gig-Info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="size-3.5" />
                  {selectedGigData.address ?? "—"},{" "}
                  {selectedGigData.postal_code}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="size-3.5" />
                  {selectedGigData.scheduled_at
                    ? new Date(selectedGigData.scheduled_at).toLocaleDateString(
                        "de-DE",
                      )
                    : "Flexibel"}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Euro className="size-3.5" />
                  Budget: {formatEuros(selectedGigData.budget_cents)}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="size-3.5" />
                  {selectedGigData.duration_minutes / 60} Stunden
                </div>
              </div>

              {selectedGigData.description && (
                <p className="text-sm text-muted-foreground rounded-lg border border-glass-border bg-glass/50 p-3">
                  {selectedGigData.description}
                </p>
              )}

              {/* Angebote */}
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                  <Users className="size-4 text-primary" />
                  Eingehende Angebote
                  {(negotiationsQuery.data?.negotiations?.length ?? 0) > 0 && (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] text-primary font-bold">
                      {negotiationsQuery.data?.negotiations?.length}
                    </span>
                  )}
                </h3>

                {negotiationsQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">
                    Lädt Angebote…
                  </p>
                ) : !negotiationsQuery.data?.negotiations?.length ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Noch keine Angebote eingegangen.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {negotiationsQuery.data.negotiations.map((neg: any) => (
                      <div
                        key={neg.id}
                        className="rounded-xl border border-glass-border bg-glass p-4 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <Avatar className="size-9">
                              <AvatarFallback className="bg-primary/15 text-primary text-xs">
                                {(neg.profiles?.display_name ?? "?")
                                  .slice(0, 2)
                                  .toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium">
                                {neg.profiles?.display_name ?? "Helfer"}
                              </p>
                              {neg.profiles?.city && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <MapPin className="size-3" />
                                  {neg.profiles.city}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-primary">
                              {formatEuros(
                                neg.counter_bid_cents ?? neg.bid_cents,
                              )}
                            </p>
                            {neg.counter_bid_cents && (
                              <p className="text-xs text-muted-foreground line-through">
                                Ursprgl.: {formatEuros(neg.bid_cents)}
                              </p>
                            )}
                          </div>
                        </div>

                        {neg.message && (
                          <p className="text-sm text-muted-foreground bg-muted/30 rounded-lg p-2">
                            „{neg.message}"
                          </p>
                        )}

                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={
                              neg.status === "accepted"
                                ? "border-emerald-400/40 text-emerald-400"
                                : neg.status === "declined"
                                  ? "border-red-400/40 text-red-400"
                                  : neg.status === "countered"
                                    ? "border-amber-400/40 text-amber-400"
                                    : "border-muted-foreground/40 text-muted-foreground"
                            }
                          >
                            {neg.status === "pending" && "Ausstehend"}
                            {neg.status === "countered" && "Gegenangebot läuft"}
                            {neg.status === "accepted" && "Akzeptiert"}
                            {neg.status === "declined" && "Abgelehnt"}
                            {neg.status === "withdrawn" && "Zurückgezogen"}
                          </Badge>
                        </div>

                        {neg.status === "pending" ||
                        neg.status === "countered" ? (
                          <div className="flex gap-2 flex-wrap">
                            {counterNegId === neg.id ? (
                              <div className="flex gap-2 w-full">
                                <Input
                                  type="number"
                                  placeholder="Betrag (€)"
                                  value={counterAmount}
                                  onChange={(e) =>
                                    setCounterAmount(e.target.value)
                                  }
                                  className="h-8 text-sm"
                                />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setCounterNegId(null)}
                                >
                                  Abbrechen
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    counterMutation.mutate({
                                      negId: neg.id,
                                      cents: Math.round(
                                        parseFloat(counterAmount) * 100,
                                      ),
                                    })
                                  }
                                  disabled={
                                    !counterAmount || counterMutation.isPending
                                  }
                                >
                                  Senden
                                </Button>
                              </div>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setCounterNegId(neg.id)}
                                >
                                  Gegenangebot
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => declineMutation.mutate(neg.id)}
                                  disabled={declineMutation.isPending}
                                >
                                  <XCircle className="size-3.5 mr-1" />
                                  Ablehnen
                                </Button>
                              </>
                            )}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Auftrag abschließen */}
              {["assigned", "in_progress"].includes(selectedGigData.status) && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                  <h4 className="text-sm font-semibold text-emerald-400 mb-2">
                    Arbeit erledigt?
                  </h4>
                  <p className="text-xs text-muted-foreground mb-3">
                    Bestätige den Abschluss, um die Zahlung aus dem
                    Treuhandkonto freizugeben.
                  </p>
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => completeMutation.mutate(selectedGigData.id)}
                    disabled={completeMutation.isPending}
                  >
                    <CheckCircle2 className="size-4 mr-2" />
                    Auftrag abschließen & Zahlung freigeben
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Review Dialog */}
      <Dialog
        open={!!reviewGig}
        onOpenChange={(open) => !open && setReviewGig(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bewertung abgeben</DialogTitle>
            <DialogDescription>
              Bewerte die Arbeit von {reviewGig?.helperName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-sm">Bewertung</Label>
              <div className="flex gap-2 mt-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setReviewRating(star)}
                    className={`text-2xl transition-transform hover:scale-110 ${
                      star <= reviewRating
                        ? "text-amber-400"
                        : "text-muted-foreground/30"
                    }`}
                  >
                    ★
                  </button>
                ))}
                <span className="ml-2 text-sm text-muted-foreground self-center">
                  {reviewRating}/5
                </span>
              </div>
            </div>

            <div>
              <Label htmlFor="review-comment" className="text-sm">
                Kommentar (optional)
              </Label>
              <Textarea
                id="review-comment"
                placeholder="Wie war die Arbeit? Was hat besonders gut geklappt?"
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                className="mt-1"
                rows={3}
              />
            </div>

            <Button
              className="w-full"
              onClick={() => reviewMutation.mutate()}
              disabled={reviewMutation.isPending}
            >
              <Star className="size-4 mr-2" />
              {reviewMutation.isPending
                ? "Wird gespeichert…"
                : "Bewertung senden"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}

function GigCard({
  gig,
  onSelect,
  onComplete,
  isCompleting,
  onReview,
}: {
  gig: any;
  onSelect: (id: string) => void;
  onComplete: () => void;
  isCompleting: boolean;
  onReview: (helperId: string, helperName: string) => void;
}) {
  const statusClass = STATUS_COLORS[gig.status] ?? STATUS_COLORS.draft;
  const statusLabel = STATUS_LABELS[gig.status] ?? gig.status;

  return (
    <Card
      className="border-glass-border bg-glass backdrop-blur cursor-pointer transition hover:border-primary/40"
      onClick={() => onSelect(gig.id)}
    >
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold truncate">{gig.title}</h3>
              <Badge
                variant="outline"
                className={`shrink-0 text-[11px] ${statusClass}`}
              >
                {statusLabel}
              </Badge>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="size-3" />
                {gig.address ? `${gig.address}, ` : ""}
                {gig.postal_code ?? "—"}
              </span>
              {gig.scheduled_at && (
                <span className="flex items-center gap-1">
                  <Calendar className="size-3" />
                  {new Date(gig.scheduled_at).toLocaleDateString("de-DE")}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Euro className="size-3" />
                {formatEuros(gig.budget_cents)}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="size-3" />
                {gig.duration_minutes / 60}h
              </span>
            </div>
          </div>

          <div
            className="flex items-center gap-2 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            {gig.status === "completed" && gig.assigned_helper_id && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => onReview(gig.assigned_helper_id, "Helfer")}
              >
                <Star className="size-3 mr-1" />
                Bewerten
              </Button>
            )}
            <ChevronRight className="size-4 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

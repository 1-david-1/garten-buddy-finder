import { SafetyActions } from "@/components/safety-actions";
import { SafetyAbortButton } from "@/components/safety-abort-button";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { getMyGigs, completeGig, proposeGigDate, type GigReviewRef } from "@/lib/gigs.functions";
import {
  getNegotiationsForGig,
  counterBid,
  acceptBid as acceptNegBid,
  declineBid,
} from "@/lib/negotiations.functions";
import { createReview, updateReview, getGigReview } from "@/lib/reviews.functions";
import { startConversation } from "@/lib/messaging.functions";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { describeGigStatus, describePayment, TONE_CLASSES, type PaymentState } from "@/lib/gig-status";
import { isPaymentReleasable } from "@/lib/partners";
import { publicLocationLabel } from "@/lib/gig-location";
import { berlinDateTimeLocalValue, formatBerlinDate } from "@/lib/berlin-time";
import { toastForPayout } from "@/lib/payout-toast";

/** Auftrag aus getMyGigs: Zeile aus der Datenbank plus Zahlungsstatus, Name des Helfers und Bewertungs-Richtungen */
type MyGig = Tables<"gigs"> & {
  payment_state?: string | null;
  helper_name?: string | null;
  reviews?: GigReviewRef[] | null;
};

export const Route = createFileRoute("/_authenticated/my-gigs")({
  component: MyGigsPage,
  validateSearch: (search: Record<string, unknown>): {
    gig?: string;
    tab?: "active" | "past";
  } => ({
    ...(typeof search.gig === "string" ? { gig: search.gig } : {}),
    ...(search.tab === "past" || search.tab === "active" ? { tab: search.tab } : {}),
  }),
});

function formatEuros(cents: number) {
  return (cents / 100).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
  });
}

function MyGigsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { gig: searchGig, tab: searchTab } = Route.useSearch();
  const [selectedGig, setSelectedGig] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>(searchTab === "past" ? "past" : "active");
  const [reviewGig, setReviewGig] = useState<{
    id: string;
    helperId: string;
    helperName: string;
    title?: string;
  } | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [counterAmount, setCounterAmount] = useState("");
  const [counterNegId, setCounterNegId] = useState<string | null>(null);
  const [dateProposal, setDateProposal] = useState("");
  const [isEditingReview, setIsEditingReview] = useState(false);
  const [isLoadingReview, setIsLoadingReview] = useState(false);

  const getMyGigsFn = useServerFn(getMyGigs);
  const getNegotiationsFn = useServerFn(getNegotiationsForGig);
  const completeGigFn = useServerFn(completeGig);
  const proposeDateFn = useServerFn(proposeGigDate);
  const counterBidFn = useServerFn(counterBid);
  const acceptBidFn = useServerFn(acceptNegBid);
  const declineBidFn = useServerFn(declineBid);
  const createReviewFn = useServerFn(createReview);
  const updateReviewFn = useServerFn(updateReview);
  const getGigReviewFn = useServerFn(getGigReview);

  const gigsQuery = useQuery({
    queryKey: ["my-gigs"],
    queryFn: () => getMyGigsFn(),
  });

  const activeReviewGigIdRef = useRef<string | null>(null);
  const handleReview = useCallback(
    async (helperId: string, helperName: string, gigId: string, gigTitle?: string) => {
      activeReviewGigIdRef.current = gigId;
      setReviewGig({ id: gigId, helperId, helperName, title: gigTitle });
      setReviewRating(5);
      setReviewComment("");
      setIsEditingReview(false);
      setIsLoadingReview(true);
      try {
        const reviewData = await getGigReviewFn({ data: { gigId } });
        if (activeReviewGigIdRef.current !== gigId) return;
        const existingReview = reviewData.review;

        if (existingReview) {
          setReviewRating(existingReview.rating);
          setReviewComment(existingReview.comment ?? "");
          setIsEditingReview(true);
        }
      } catch {
        if (activeReviewGigIdRef.current === gigId) {
          setReviewGig(null);
          toast.error("Bewertung konnte nicht geladen werden.");
        }
      } finally {
        if (activeReviewGigIdRef.current === gigId) {
          setIsLoadingReview(false);
        }
      }
    },
    [getGigReviewFn],
  );

  // Wenn ein Auftrag per Search-Param kommt (?gig=ID&tab=past), direkt zum
  // passenden Bereich wechseln und die Bewertung bzw. den Auftrag oeffnen.
  useEffect(() => {
    if (searchTab === "past" || searchTab === "active") {
      setActiveTab(searchTab);
    }
  }, [searchTab]);

  const handledDeepLinkRef = useRef<string | null>(null);
  useEffect(() => {
    if (!searchGig) {
      handledDeepLinkRef.current = null;
      return;
    }
    if (handledDeepLinkRef.current === searchGig || !gigsQuery.data) return;

    const gig = gigsQuery.data.gigs.find((g) => g.id === searchGig);
    if (!gig) {
      if (!gigsQuery.isFetching) {
        handledDeepLinkRef.current = searchGig;
        navigate({ to: "/my-gigs", search: {}, replace: true });
      }
      return;
    }

    handledDeepLinkRef.current = searchGig;
    const isUnpaidCompleted = gig.status === "completed" && isPaymentReleasable(gig.payment_state);
    const isPast = ["completed", "cancelled"].includes(gig.status) && !isUnpaidCompleted;
    if (isPast) {
      setActiveTab("past");
    }

    if (gig.status === "completed" && gig.assigned_helper_id && !isUnpaidCompleted) {
      void handleReview(gig.assigned_helper_id, gig.helper_name ?? "Helfer", gig.id, gig.title);
    } else {
      setSelectedGig(gig.id);
    }

    // Search-Params entfernen, damit ein Reload nicht nochmal triggert
    navigate({ to: "/my-gigs", search: {}, replace: true });
  }, [searchGig, gigsQuery.data, gigsQuery.isFetching, handleReview, navigate]);

  const selectedGigData = gigsQuery.data?.gigs.find(
    (g) => g.id === selectedGig,
  );

  const negotiationsQuery = useQuery({
    queryKey: ["negotiations", selectedGig],
    queryFn: () => getNegotiationsFn({ data: { gigId: selectedGig! } }),
    enabled: !!selectedGig,
  });

  // Vor dem Freigeben der Zahlung wird immer nachgefragt (Geld lässt sich nicht zurückholen)
  const [confirmGigId, setConfirmGigId] = useState<string | null>(null);

  const completeMutation = useMutation({
    mutationFn: (gigId: string) => completeGigFn({ data: { gigId } }),
    onSuccess: (res) => {
      toastForPayout(res.payout, res.newlyCompleted);
      queryClient.invalidateQueries({ queryKey: ["my-gigs"] });
      queryClient.invalidateQueries({ queryKey: ["my-partners"] });
      setConfirmGigId(null);
      setSelectedGig(null);
    },
    onError: (err) => {
      toast.error((err as Error).message);
      setConfirmGigId(null);
      // Nach einem Fehler den tatsächlichen Stand laden - nichts bleibt veraltet stehen
      queryClient.invalidateQueries({ queryKey: ["my-gigs"] });
    },
  });

  const proposeDateMutation = useMutation({
    mutationFn: (input: { gigId: string; scheduledAt: string }) =>
      proposeDateFn({ data: input }),
    onSuccess: (res) => {
      toast.success("Terminvorschlag gesendet!");
      if (res?.guardian) toast.info(res.guardian.message);
      queryClient.invalidateQueries({ queryKey: ["my-gigs"] });
      setDateProposal("");
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

  const acceptMutation = useMutation({
    mutationFn: (negId: string) =>
      acceptBidFn({ data: { negotiationId: negId } }),
    onSuccess: (res) => {
      toast.success("Gebot angenommen! Der Helfer wurde zugewiesen.");
      if (res?.guardian) toast.info(res.guardian.message);
      queryClient.invalidateQueries({
        queryKey: ["negotiations", selectedGig],
      });
      queryClient.invalidateQueries({ queryKey: ["my-gigs"] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const startConversationFn = useServerFn(startConversation);
  const messageMutation = useMutation({
    mutationFn: (input: { helperId: string; gigId: string }) =>
      startConversationFn({
        data: { otherUserId: input.helperId, gigId: input.gigId },
      }),
    onSuccess: (result) => {
      navigate({
        to: "/messages/$conversationId",
        params: { conversationId: result.conversationId },
      });
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
    mutationFn: (vars: { gigId: string; rating: number; comment: string; isEditing: boolean }) => {
      const payload = {
        gigId: vars.gigId,
        rating: vars.rating,
        comment: vars.comment,
      };
      return vars.isEditing
        ? updateReviewFn({ data: payload })
        : createReviewFn({ data: payload });
    },
    onSuccess: (res, vars) => {
      toast.success(vars.isEditing ? "Bewertung aktualisiert!" : "Bewertung abgegeben!");
      activeReviewGigIdRef.current = null;
      setReviewGig(null);
      setReviewRating(5);
      setReviewComment("");
      setIsEditingReview(false);
      // Cache sofort aktualisieren und im Hintergrund neu laden, damit der Bewertungs-Button im Dashboard sofort verschwindet
      queryClient.setQueryData(
        ["my-gigs"],
        (old: Awaited<ReturnType<typeof getMyGigsFn>> | undefined) => {
          if (!old) return old;
          return {
            ...old,
            gigs: old.gigs.map((g) => {
              if (g.id !== vars.gigId) return g;
              const existing = Array.isArray(g.reviews) ? g.reviews : [];
              if (existing.some((r) => r.direction === "customer_to_helper")) {
                return g;
              }
              return {
                ...g,
                reviews: [...existing, { id: res.review.id, direction: "customer_to_helper" }],
              };
            }),
          };
        },
      );
      queryClient.invalidateQueries({ queryKey: ["my-gigs"] });
      queryClient.invalidateQueries({ queryKey: ["marketplace-helpers"] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const { navItems } = useAppNavItems();

  const gigs = gigsQuery.data?.gigs ?? [];
  // Ein abgeschlossener Auftrag mit noch nicht freigegebener Zahlung wartet auf dich und bleibt deshalb unter "Aktiv".
  const awaitsPayment = (g: MyGig) => g.status === "completed" && isPaymentReleasable(g.payment_state);
  const activeGigs = gigs.filter(
    (g) => !["completed", "cancelled"].includes(g.status) || awaitsPayment(g),
  );
  const pastGigs = gigs.filter(
    (g) => ["completed", "cancelled"].includes(g.status) && !awaitsPayment(g),
  );
  const confirmGig = gigs.find((g) => g.id === confirmGigId) ?? null;

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
        <Tabs value={activeTab} onValueChange={setActiveTab}>
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
                    onComplete={() => setConfirmGigId(gig.id)}
                    isCompleting={completeMutation.isPending}
                    onReview={(helperId, helperName) =>
                      handleReview(helperId, helperName, gig.id, gig.title)
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
                      handleReview(helperId, helperName, gig.id, gig.title)
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
                  {selectedGigData.address
                    ? `${selectedGigData.address}, ${selectedGigData.postal_code ?? ""}`
                    : publicLocationLabel(selectedGigData.district)}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="size-3.5" />
                  {selectedGigData.scheduled_at
                    ? formatBerlinDate(selectedGigData.scheduled_at)
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

              {selectedGigData.status === "pending_helper" && !selectedGigData.scheduled_at && (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
                  <h4 className="text-sm font-semibold text-primary">Terminvorschlag senden</h4>
                  <p className="text-xs text-muted-foreground">
                    Der Helfer hat den Preis akzeptiert. Wähle nun einen Termin aus,
                    damit der Helfer diesen bestätigen kann.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      type="datetime-local"
                      min={berlinDateTimeLocalValue(new Date())}
                      value={dateProposal}
                      onChange={(e) => setDateProposal(e.target.value)}
                      className="h-9 text-sm"
                    />
                    <Button
                      size="sm"
                      disabled={!dateProposal || proposeDateMutation.isPending}
                      onClick={() =>
                        proposeDateMutation.mutate({
                          gigId: selectedGigData.id,
                          scheduledAt: new Date(dateProposal).toISOString(),
                        })
                      }
                    >
                      Senden
                    </Button>
                  </div>
                </div>
              )}

              {selectedGigData.assigned_helper_id && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    messageMutation.mutate({
                      helperId: selectedGigData.assigned_helper_id!,
                      gigId: selectedGigData.id,
                    })
                  }
                  disabled={messageMutation.isPending}
                >
                  Nachricht an Helfer
                </Button>
              )}

              {selectedGigData.assigned_helper_id && (
                <div className="space-y-3 rounded-xl border border-glass-border p-3">
                  <p className="text-xs text-muted-foreground">Sicherheit</p>
                  <SafetyActions
                    userId={selectedGigData.assigned_helper_id}
                    userName={selectedGigData.helper_name ?? "Helfer"}
                    gigId={selectedGigData.id}
                  />
                  {(selectedGigData.status === "pending_helper" ||
                    selectedGigData.status === "assigned" ||
                    selectedGigData.status === "in_progress") && (
                    <SafetyAbortButton
                      gigId={selectedGigData.id}
                      onDone={() => queryClient.invalidateQueries({ queryKey: ["my-gigs"] })}
                    />
                  )}
                </div>
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
                    {negotiationsQuery.data.negotiations.map((neg) => (
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

                        {neg.status === "countered" && (
                          <div className="space-y-2">
                            <p className="text-xs text-muted-foreground">
                              Dein Gegenangebot liegt beim Helfer. Er kann es annehmen oder ein neues Gebot machen.
                            </p>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => declineMutation.mutate(neg.id)}
                              disabled={declineMutation.isPending}
                            >
                              <XCircle className="size-3.5 mr-1" />
                              Verhandlung beenden
                            </Button>
                          </div>
                        )}
                        {neg.status === "pending" ? (
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
                                  onClick={() => acceptMutation.mutate(neg.id)}
                                  disabled={acceptMutation.isPending}
                                >
                                  Annehmen
                                </Button>
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
              {(["assigned", "in_progress"].includes(selectedGigData.status) || awaitsPayment(selectedGigData)) && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                  <h4 className="text-sm font-semibold text-emerald-400 mb-2">
                    {selectedGigData.status === "completed" ? "Zahlung noch nicht freigegeben" : "Arbeit erledigt?"}
                  </h4>
                  <p className="text-xs text-muted-foreground mb-3">
                    {selectedGigData.status === "completed"
                      ? "Der Auftrag ist abgeschlossen. Gib die Zahlung jetzt frei, damit der Helfer sein Geld bekommt."
                      : "Bestätige den Abschluss, damit der Auftrag als erledigt gilt, die Zahlung an den Helfer freigegeben wird und ihr euch gegenseitig bewerten könnt."}
                  </p>
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => setConfirmGigId(selectedGigData.id)}
                    disabled={completeMutation.isPending}
                  >
                    <CheckCircle2 className="size-4 mr-2" />
                    {selectedGigData.status === "completed" ? "Zahlung freigeben" : "Auftrag abschließen & Zahlung freigeben"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bestätigung vor der Freigabe der Zahlung */}
      <AlertDialog
        open={!!confirmGig}
        onOpenChange={(open) => !open && !completeMutation.isPending && setConfirmGigId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmGig?.status === "completed" ? "Zahlung freigeben?" : "Auftrag abschließen und Zahlung freigeben?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmGig?.status === "completed"
                ? `Die Zahlung für „${confirmGig?.title}“ (${formatEuros(confirmGig?.budget_cents ?? 0)}) geht an ${confirmGig?.helper_name ?? "den Helfer"}.`
                : `Bestätige nur, wenn „${confirmGig?.title}“ erledigt ist. Die Zahlung (${formatEuros(confirmGig?.budget_cents ?? 0)}) wird danach an ${confirmGig?.helper_name ?? "den Helfer"} freigegeben.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={completeMutation.isPending}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              disabled={completeMutation.isPending}
              onClick={(e) => {
                // Dialog bleibt offen, bis das Ergebnis da ist (Doppelklick-sicher)
                e.preventDefault();
                if (confirmGig) completeMutation.mutate(confirmGig.id);
              }}
            >
              {completeMutation.isPending ? "Wird freigegeben …" : "Ja, freigeben"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Review Dialog */}
      <Dialog
        open={!!reviewGig}
        onOpenChange={(open) => {
          if (!open) {
            activeReviewGigIdRef.current = null;
            setReviewGig(null);
            setIsLoadingReview(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isEditingReview ? "Bewertung bearbeiten" : "Bewertung abgeben"}
            </DialogTitle>
            <DialogDescription>
              {reviewGig?.title
                ? `„${reviewGig.title}“ – Bewerte die Arbeit von ${reviewGig.helperName}`
                : `Bewerte die Arbeit von ${reviewGig?.helperName}`}
            </DialogDescription>
          </DialogHeader>

          {isLoadingReview ? (
            <p className="text-sm text-muted-foreground py-4">Lädt…</p>
          ) : (
            <div className="space-y-4">
              <div>
                <Label className="text-sm">Bewertung</Label>
                <div className="flex gap-2 mt-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
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
                onClick={() =>
                  reviewGig &&
                  reviewMutation.mutate({
                    gigId: reviewGig.id,
                    rating: reviewRating,
                    comment: reviewComment,
                    isEditing: isEditingReview,
                  })
                }
                disabled={reviewMutation.isPending}
              >
                <Star className="size-4 mr-2" />
                {reviewMutation.isPending
                  ? "Wird gespeichert…"
                  : isEditingReview
                    ? "Bewertung aktualisieren"
                    : "Bewertung senden"}
              </Button>
            </div>
          )}
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
  gig: MyGig;
  onSelect: (id: string) => void;
  onComplete: () => void;
  isCompleting: boolean;
  onReview: (helperId: string, helperName: string) => void;
}) {
  const paymentState = gig.payment_state as PaymentState;
  const info = describeGigStatus(gig.status, "customer", { paymentState, hasScheduledDate: !!gig.scheduled_at });
  const payment = describePayment(paymentState, "customer");
  const canComplete =
    ["assigned", "in_progress"].includes(gig.status) || (gig.status === "completed" && isPaymentReleasable(paymentState));
  const hasCustomerReview =
    Array.isArray(gig.reviews) && gig.reviews.some((r) => r.direction === "customer_to_helper");

  return (
    <Card
      className={`border-glass-border bg-glass backdrop-blur cursor-pointer transition hover:border-primary/40 ${
        info.needsAction ? "border-amber-400/40" : ""
      }`}
      onClick={() => onSelect(gig.id)}
    >
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold truncate">{gig.title}</h3>
              <Badge variant="outline" className={`shrink-0 text-[11px] ${TONE_CLASSES[info.tone]}`}>
                {info.label}
              </Badge>
              {payment && gig.status !== "cancelled" && (
                <Badge variant="outline" className={`shrink-0 text-[11px] ${TONE_CLASSES[payment.tone]}`}>
                  {payment.label}
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {gig.helper_name && <span>Helfer: {gig.helper_name}</span>}
              <span className="flex items-center gap-1">
                <MapPin className="size-3" />
                {gig.address ? `${gig.address}, ${gig.postal_code ?? ""}` : publicLocationLabel(gig.district)}
              </span>
              {gig.scheduled_at && (
                <span className="flex items-center gap-1">
                  <Calendar className="size-3" />
                  {formatBerlinDate(gig.scheduled_at)}
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

            {info.next && (
              <p
                className={`rounded-md px-2.5 py-1.5 text-xs ${
                  info.needsAction ? "bg-amber-400/10 text-amber-300" : "bg-muted/40 text-muted-foreground"
                }`}
              >
                {info.next}
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2" onClick={(e) => e.stopPropagation()}>
            {canComplete && (
              <Button
                size="sm"
                className="h-7 bg-emerald-600 text-xs hover:bg-emerald-700"
                onClick={onComplete}
                disabled={isCompleting}
              >
                <CheckCircle2 className="size-3 mr-1" />
                {gig.status === "completed" ? "Zahlung freigeben" : "Abschließen"}
              </Button>
            )}
            {gig.status === "completed" && gig.assigned_helper_id && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => onReview(gig.assigned_helper_id!, gig.helper_name ?? "Helfer")}
              >
                <Star className="size-3 mr-1" />
                {hasCustomerReview ? "Bewertung bearbeiten" : "Bewerten"}
              </Button>
            )}
            <ChevronRight className="size-4 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

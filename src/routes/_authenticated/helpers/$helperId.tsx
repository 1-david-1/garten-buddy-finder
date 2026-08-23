import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  BadgeCheck,
  MapPin,
  MessageSquare,
  Star,
  ImageOff,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { useAppNavItems } from "@/lib/use-app-nav";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QueryErrorCard } from "@/components/query-error-card";
import { useAuth } from "@/lib/auth";
import { getHelperProfile } from "@/lib/profile.functions";
import { startConversation } from "@/lib/messaging.functions";
import { formatEuros } from "@/lib/utils";
import { SERVICE_TYPES } from "@/lib/service-types";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/helpers/$helperId")({
  component: HelperProfilePage,
});

function serviceTypeLabel(value: string) {
  return SERVICE_TYPES.find((s) => s.value === value)?.label ?? value;
}

const ROLE_LABELS: Record<string, string> = {
  helper_youth: "Jugendlicher Helfer",
  helper_adult: "Nachbarschaftshilfe",
  helper_pro: "Profi-Gärtner",
};

function StarRating({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`size-3.5 ${n <= Math.round(value) ? "fill-primary text-primary" : "text-muted-foreground/30"}`}
        />
      ))}
    </div>
  );
}

function HelperProfilePage() {
  const { navItems } = useAppNavItems();
  const { helperId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showAllReviews, setShowAllReviews] = useState(false);

  const getProfileFn = useServerFn(getHelperProfile);
  const profileQuery = useQuery({
    queryKey: ["helper-profile", helperId],
    queryFn: () => getProfileFn({ data: { helperId } }),
  });

  const startConversationFn = useServerFn(startConversation);
  const messageMutation = useMutation({
    mutationFn: () => startConversationFn({ data: { otherUserId: helperId } }),
    onSuccess: (result) => {
      navigate({
        to: "/messages/$conversationId",
        params: { conversationId: result.conversationId },
      });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  if (profileQuery.isLoading) {
    return (
      <DashboardShell
        title="Helferprofil"
        navItems={navItems}
        activeKey="service-listings"
      >
        <p className="text-sm text-muted-foreground">Lädt…</p>
      </DashboardShell>
    );
  }

  if (profileQuery.isError) {
    return (
      <DashboardShell
        title="Helferprofil"
        navItems={navItems}
        activeKey="service-listings"
      >
        <QueryErrorCard error={profileQuery.error} />
      </DashboardShell>
    );
  }

  const data = profileQuery.data;
  if (!data?.profile) {
    return (
      <DashboardShell
        title="Helferprofil"
        navItems={navItems}
        activeKey="service-listings"
      >
        <p className="text-sm text-muted-foreground">
          Dieses Profil existiert nicht.
        </p>
      </DashboardShell>
    );
  }

  const { profile, roles, reviews, avgRating, reviewCount, activeListings } =
    data;
  const isOwnProfile = user?.id === helperId;
  const visibleReviews = showAllReviews ? reviews : reviews.slice(0, 3);

  return (
    <DashboardShell
      title={profile.display_name || "Helferprofil"}
      navItems={navItems}
      activeKey="service-listings"
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <Card className="border-glass-border bg-glass backdrop-blur">
            <CardContent className="pt-5 pb-5 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="font-brand text-2xl">
                      {profile.display_name}
                    </h1>
                    {profile.verified_at && (
                      <Badge
                        variant="outline"
                        className="border-primary/40 text-primary flex items-center gap-1"
                      >
                        <BadgeCheck className="size-3.5" />
                        Verifiziert
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                    {roles.map((r) => (
                      <span key={r}>{ROLE_LABELS[r] ?? r}</span>
                    ))}
                    {profile.city && (
                      <span className="flex items-center gap-1">
                        <MapPin className="size-3.5" />
                        {profile.city}
                      </span>
                    )}
                  </div>
                </div>
                {avgRating !== null && (
                  <div className="text-right">
                    <div className="flex items-center gap-1.5 justify-end">
                      <StarRating value={avgRating} />
                      <span className="text-sm font-semibold">
                        {avgRating.toFixed(1)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {reviewCount} Bewertungen
                    </p>
                  </div>
                )}
              </div>

              {profile.business_name && (
                <p className="text-sm text-muted-foreground">
                  {profile.business_name}
                </p>
              )}
              {profile.bio && (
                <p className="text-sm text-muted-foreground whitespace-pre-line pt-2 border-t border-glass-border">
                  {profile.bio}
                </p>
              )}
            </CardContent>
          </Card>

          {activeListings.length > 0 && (
            <Card className="border-glass-border bg-glass backdrop-blur">
              <CardContent className="pt-5 pb-5">
                <h3 className="font-semibold mb-3">Aktive Angebote</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {activeListings.map((listing) => (
                    <Link
                      key={listing.id}
                      to="/service-listings/$id"
                      params={{ id: listing.id }}
                      className="flex gap-3 rounded-xl border border-glass-border bg-glass/50 p-3 transition hover:border-primary/40"
                    >
                      <div className="size-14 shrink-0 overflow-hidden rounded-lg bg-muted/30">
                        {listing.photos?.[0] ? (
                          <img
                            src={listing.photos[0]}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                            <ImageOff className="size-5" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {listing.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {serviceTypeLabel(listing.service_type)}
                        </p>
                        <p className="text-sm font-semibold text-primary mt-0.5">
                          {formatEuros(
                            listing.price_cents ??
                              listing.current_price_cents ??
                              listing.start_price_cents,
                          )}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-glass-border bg-glass backdrop-blur">
            <CardContent className="pt-5 pb-5">
              <h3 className="font-semibold mb-3">Bewertungen</h3>
              {reviews.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Noch keine Bewertungen.
                </p>
              ) : (
                <div className="space-y-3">
                  {visibleReviews.map((review, i) => (
                    <div
                      key={i}
                      className="border-b border-glass-border pb-3 last:border-0 last:pb-0"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">
                          {review.profiles?.display_name ?? "Kunde"}
                        </span>
                        <StarRating value={review.rating} />
                      </div>
                      {review.comment && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {review.comment}
                        </p>
                      )}
                    </div>
                  ))}
                  {reviews.length > 3 && !showAllReviews && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAllReviews(true)}
                    >
                      Alle {reviews.length} Bewertungen anzeigen
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="border-glass-border bg-glass backdrop-blur sticky top-4">
            <CardContent className="pt-5 pb-5 space-y-4">
              <div>
                <p className="text-xs text-muted-foreground">
                  Vertrauens-Score
                </p>
                <p className="text-2xl font-bold text-primary">
                  {profile.trust_score}
                </p>
              </div>
              {!isOwnProfile && (
                <Button
                  className="w-full"
                  onClick={() => messageMutation.mutate()}
                  disabled={messageMutation.isPending}
                >
                  <MessageSquare className="size-4 mr-2" />
                  Nachricht schreiben
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardShell>
  );
}

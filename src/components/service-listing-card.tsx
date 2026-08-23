import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Gavel,
  Handshake,
  Tag,
  MapPin,
  Clock,
  ImageOff,
  BadgeCheck,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ServiceListing } from "@/lib/service-listings.functions";
import { postalCodeProximity } from "@/lib/service-listings.functions";
import { formatEuros } from "@/lib/utils";
import { SERVICE_TYPES } from "@/lib/service-types";

const LISTING_TYPE_LABELS: Record<ServiceListing["listingType"], string> = {
  fixed_price: "Festpreis",
  auction: "Auktion",
  negotiable: "Verhandelbar",
};

const LISTING_TYPE_ICONS: Record<ServiceListing["listingType"], ReactNode> = {
  fixed_price: <Tag className="size-3" />,
  auction: <Gavel className="size-3" />,
  negotiable: <Handshake className="size-3" />,
};

function serviceTypeLabel(value: string) {
  return SERVICE_TYPES.find((s) => s.value === value)?.label ?? value;
}

function auctionTimeRemaining(endTime: string | null) {
  if (!endTime) return null;
  const diffMs = new Date(endTime).getTime() - Date.now();
  if (diffMs <= 0) return "Auktion beendet";
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 1)
    return `${Math.max(1, Math.floor(diffMs / (1000 * 60)))} Min. verbleibend`;
  if (hours < 24) return `${hours} Std. verbleibend`;
  return `${Math.floor(hours / 24)} Tage verbleibend`;
}

export function ServiceListingCard({
  listing,
  nearPostalCode,
}: {
  listing: ServiceListing;
  /** Wenn gesetzt, wird bei guter PLZ-Übereinstimmung ein Nähe-Hinweis gezeigt. */
  nearPostalCode?: string;
}) {
  const proximity = nearPostalCode
    ? postalCodeProximity(listing.postalCode, nearPostalCode)
    : 0;
  const priceLabel =
    listing.listingType === "auction"
      ? formatEuros(listing.currentPriceCents ?? listing.startPriceCents ?? 0)
      : formatEuros(listing.priceCents ?? 0);

  return (
    <Link to="/service-listings/$id" params={{ id: listing.id }}>
      <Card className="border-glass-border bg-glass backdrop-blur transition hover:border-primary/40 h-full overflow-hidden">
        {listing.photos.length > 0 ? (
          <img
            src={listing.photos[0]}
            alt={listing.title}
            className="aspect-video w-full object-cover"
          />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center bg-muted/30 text-muted-foreground/40">
            <ImageOff className="size-8" />
          </div>
        )}
        <CardContent className="pt-4 pb-4 flex flex-col gap-3 h-full">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold leading-snug line-clamp-2">
              {listing.title}
            </h3>
            <Badge
              variant="outline"
              className="shrink-0 flex items-center gap-1 text-[11px]"
            >
              {LISTING_TYPE_ICONS[listing.listingType]}
              {LISTING_TYPE_LABELS[listing.listingType]}
            </Badge>
          </div>

          <p className="text-xs text-muted-foreground">
            {serviceTypeLabel(listing.serviceType)}
          </p>

          {listing.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {listing.description}
            </p>
          )}

          <div className="mt-auto space-y-1.5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-bold text-primary">
                {priceLabel}
              </span>
              {listing.listingType === "auction" && (
                <span className="text-xs text-muted-foreground">
                  aktuelles Gebot
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {listing.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="size-3" />
                  {listing.location}
                </span>
              )}
              {listing.listingType === "auction" && listing.auctionEndTime && (
                <span className="flex items-center gap-1">
                  <Clock className="size-3" />
                  {auctionTimeRemaining(listing.auctionEndTime)}
                </span>
              )}
              {proximity >= 2 && (
                <span className="flex items-center gap-1 text-primary">
                  <MapPin className="size-3" />
                  in deiner Nähe
                </span>
              )}
            </div>

            {listing.helperName && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <span>von {listing.helperName}</span>
                {listing.helperVerifiedAt && (
                  <span
                    className="inline-flex items-center gap-0.5 text-primary"
                    title="Verifiziert"
                  >
                    <BadgeCheck className="size-3.5" aria-hidden="true" />
                    <span className="sr-only">Verifiziert</span>
                  </span>
                )}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

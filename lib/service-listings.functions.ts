import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchProfilesByIds } from "@/lib/profile-lookup";

export type ListingType = "fixed_price" | "auction" | "negotiable";
export type ListingStatus =
  "draft" | "active" | "sold" | "expired" | "cancelled";
export type OfferStatus =
  "pending" | "accepted" | "rejected" | "countered" | "withdrawn";

export interface ServiceListingInput {
  title: string;
  description: string;
  serviceType: string;
  listingType: ListingType;
  priceCents: number | null;
  startPriceCents: number | null;
  reservePriceCents: number | null;
  buyNowPriceCents: number | null;
  auctionEndTime: string | null;
  minBidIncrementCents: number | null;
  location: string;
  postalCode: string;
  photos: string[];
}

export interface ServiceListing {
  id: string;
  helperId: string;
  title: string;
  description: string | null;
  serviceType: string;
  listingType: ListingType;
  priceCents: number | null;
  startPriceCents: number | null;
  currentPriceCents: number | null;
  reservePriceCents: number | null;
  buyNowPriceCents: number | null;
  auctionEndTime: string | null;
  minBidIncrementCents: number | null;
  status: ListingStatus;
  location: string | null;
  postalCode: string | null;
  photos: string[];
  createdAt: string;
  updatedAt: string;
  helperName?: string | null;
  helperVerifiedAt?: string | null;
}

export interface AuctionBid {
  id: string;
  listingId: string;
  bidderId: string;
  amountCents: number;
  createdAt: string;
  bidderName?: string | null;
}

export interface ServiceOffer {
  id: string;
  listingId: string;
  offererId: string;
  amountCents: number;
  message: string | null;
  status: OfferStatus;
  createdAt: string;
  updatedAt: string;
  offererName?: string | null;
  listingTitle?: string | null;
}

// ---------------------------------------------------------------------------
// Mapping helpers (snake_case DB rows -> camelCase app types)
// ---------------------------------------------------------------------------

// Minimal shapes for the raw rows we map — avoids depending on the generated
// Database["public"]["Tables"][...] types directly so this stays readable.
type ListingRow = {
  id: string;
  helper_id: string;
  title: string;
  description: string | null;
  service_type: string;
  listing_type: ListingType;
  price_cents: number | null;
  start_price_cents: number | null;
  current_price_cents: number | null;
  reserve_price_cents: number | null;
  buy_now_price_cents: number | null;
  auction_end_time: string | null;
  min_bid_increment_cents: number | null;
  status: ListingStatus;
  location: string | null;
  postal_code: string | null;
  photos: string[] | null;
  created_at: string;
  updated_at: string;
  profiles?: { display_name: string | null; verified_at: string | null } | null;
};

function mapListing(row: ListingRow): ServiceListing {
  return {
    id: row.id,
    helperId: row.helper_id,
    title: row.title,
    description: row.description,
    serviceType: row.service_type,
    listingType: row.listing_type,
    priceCents: row.price_cents,
    startPriceCents: row.start_price_cents,
    currentPriceCents: row.current_price_cents,
    reservePriceCents: row.reserve_price_cents,
    buyNowPriceCents: row.buy_now_price_cents,
    auctionEndTime: row.auction_end_time,
    minBidIncrementCents: row.min_bid_increment_cents,
    status: row.status,
    location: row.location,
    postalCode: row.postal_code,
    photos: row.photos ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    helperName: row.profiles?.display_name ?? null,
    helperVerifiedAt: row.profiles?.verified_at ?? null,
  };
}

type BidRow = {
  id: string;
  listing_id: string;
  bidder_id: string;
  amount_cents: number;
  created_at: string;
  profiles?: { display_name: string | null } | null;
};

function mapBid(row: BidRow): AuctionBid {
  return {
    id: row.id,
    listingId: row.listing_id,
    bidderId: row.bidder_id,
    amountCents: row.amount_cents,
    createdAt: row.created_at,
    bidderName: row.profiles?.display_name ?? null,
  };
}

type OfferRow = {
  id: string;
  listing_id: string;
  offerer_id: string;
  amount_cents: number;
  message: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  profiles?: { display_name: string | null } | null;
  service_listings?: { title: string | null } | null;
};

function mapOffer(row: OfferRow): ServiceOffer {
  return {
    id: row.id,
    listingId: row.listing_id,
    offererId: row.offerer_id,
    amountCents: row.amount_cents,
    message: row.message,
    status: row.status as OfferStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    offererName: row.profiles?.display_name ?? null,
    listingTitle: row.service_listings?.title ?? null,
  };
}

/**
 * Validates a listing's fields for the given listing type. Pure function so
 * it can be unit tested and reused for both create and publish.
 */
export function validateListingInput(data: ServiceListingInput): string | null {
  if (!data.title.trim()) return "Bitte gib einen Titel an.";
  if (!data.serviceType) return "Bitte wähle eine Leistungsart aus.";

  if (data.listingType === "fixed_price" || data.listingType === "negotiable") {
    if (!data.priceCents || data.priceCents <= 0) {
      return "Bitte gib einen Preis größer als 0€ an.";
    }
  }

  if (data.listingType === "auction") {
    if (!data.startPriceCents || data.startPriceCents <= 0) {
      return "Bitte gib einen Startpreis größer als 0€ an.";
    }
    if (!data.auctionEndTime) {
      return "Bitte gib ein Enddatum für die Auktion an.";
    }
    if (new Date(data.auctionEndTime).getTime() <= Date.now()) {
      return "Das Auktionsende muss in der Zukunft liegen.";
    }
    if (
      data.reservePriceCents !== null &&
      data.reservePriceCents < data.startPriceCents
    ) {
      return "Der Mindestpreis darf nicht unter dem Startpreis liegen.";
    }
    if (
      data.buyNowPriceCents !== null &&
      data.buyNowPriceCents <= data.startPriceCents
    ) {
      return "Der Sofortkauf-Preis muss über dem Startpreis liegen.";
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Erstellt ein neues Leistungsangebot. Wird standardmäßig sofort
 * veröffentlicht (status "active"); publish=false speichert es als Entwurf.
 */
export const createServiceListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (data: ServiceListingInput & { publish?: boolean; id?: string }) => data,
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const validationError = validateListingInput(data);
    if (data.publish !== false && validationError) {
      throw new Error(validationError);
    }

    const { data: listing, error } = await supabase
      .from("service_listings")
      .insert({
        // Vom Client vorab generierte ID (crypto.randomUUID()), damit Fotos
        // schon vor dem Speichern in den richtigen Storage-Ordner
        // hochgeladen werden können. Fällt sonst auf den DB-Default zurück.
        ...(data.id ? { id: data.id } : {}),
        helper_id: userId,
        title: data.title,
        description: data.description || null,
        service_type: data.serviceType,
        listing_type: data.listingType,
        price_cents: data.priceCents,
        start_price_cents: data.startPriceCents,
        current_price_cents:
          data.listingType === "auction" ? data.startPriceCents : null,
        reserve_price_cents: data.reservePriceCents,
        buy_now_price_cents: data.buyNowPriceCents,
        auction_end_time: data.auctionEndTime,
        min_bid_increment_cents: data.minBidIncrementCents ?? 50,
        location: data.location || null,
        postal_code: data.postalCode || null,
        photos: data.photos ?? [],
        status: data.publish === false ? "draft" : "active",
      })
      .select()
      .single();

    if (error) throw error;
    return mapListing(listing as ListingRow);
  });

export interface ServiceListingFilters {
  serviceType?: string;
  listingType?: ListingType;
  search?: string;
  /** PLZ des Suchenden, für eine grobe "Nähe"-Sortierung (siehe postalCodeProximity). */
  nearPostalCode?: string;
}

/**
 * Grobe Näherungs-Sortierung nach Postleitzahl-Präfix, OHNE echte
 * Geo-Koordinaten (die stehen uns nicht zur Verfügung). Deutsche PLZ sind
 * hierarchisch aufgebaut — je mehr führende Ziffern übereinstimmen, desto
 * näher liegen zwei Orte typischerweise. Das ist keine Kilometer-genaue
 * Entfernung, aber eine ehrliche, ohne externe Geocoding-Daten
 * berechenbare Näherung. Rückgabe: 0 (keine Übereinstimmung/fehlende PLZ)
 * bis 5 (identische PLZ).
 */
export function postalCodeProximity(
  a: string | null,
  b: string | null,
): number {
  if (!a || !b) return 0;
  let matched = 0;
  for (let i = 0; i < Math.min(a.length, b.length, 5); i++) {
    if (a[i] !== b[i]) break;
    matched++;
  }
  return matched;
}

/**
 * Öffentliche Suche/Browse-Ansicht: nur aktive Angebote.
 */
export const getServiceListings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((filters: ServiceListingFilters | undefined) => filters ?? {})
  .handler(async ({ context, data: filters }) => {
    const { supabase } = context;

    let query = supabase
      .from("service_listings")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (filters.serviceType) {
      query = query.eq("service_type", filters.serviceType);
    }
    if (filters.listingType) {
      query = query.eq("listing_type", filters.listingType);
    }
    if (filters.search) {
      query = query.ilike("title", `%${filters.search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    const profiles = await fetchProfilesByIds(
      supabase,
      (data ?? []).map((listing) => listing.helper_id),
    );
    const listings = (data as ListingRow[]).map((row) => {
      const profile = profiles.get(row.helper_id);
      return mapListing({
        ...row,
        profiles: profile
          ? {
              display_name: profile.displayName,
              verified_at: profile.verifiedAt,
            }
          : null,
      });
    });

    if (filters.nearPostalCode) {
      const near = filters.nearPostalCode;
      return listings
        .map((l) => ({
          listing: l,
          score: postalCodeProximity(l.postalCode, near),
        }))
        .sort((a, b) => b.score - a.score)
        .map((x) => x.listing);
    }

    return listings;
  });

/**
 * Eigene Angebote (alle Status) für das Verkäufer-Dashboard.
 */
export const getMyServiceListings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data, error } = await supabase
      .from("service_listings")
      .select("*")
      .eq("helper_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data as ListingRow[]).map(mapListing);
  });

/**
 * Details zu einem einzelnen Angebot (RLS erlaubt aktive Angebote für alle,
 * eigene Angebote unabhängig vom Status).
 */
export const getServiceListingById = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const { supabase } = context;

    const { data, error } = await supabase
      .from("service_listings")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    const profiles = await fetchProfilesByIds(supabase, [data.helper_id]);
    const profile = profiles.get(data.helper_id);
    return mapListing({
      ...(data as ListingRow),
      profiles: profile
        ? {
            display_name: profile.displayName,
            verified_at: profile.verifiedAt,
          }
        : null,
    });
  });

export const updateServiceListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { id: string; data: Partial<ServiceListingInput> }) => input,
  )
  .handler(async ({ context, data: input }) => {
    const { supabase } = context;
    const d = input.data;

    const patch: {
      title?: string;
      description?: string | null;
      service_type?: string;
      price_cents?: number | null;
      start_price_cents?: number | null;
      reserve_price_cents?: number | null;
      buy_now_price_cents?: number | null;
      auction_end_time?: string | null;
      min_bid_increment_cents?: number | null;
      location?: string | null;
      postal_code?: string | null;
      photos?: string[];
    } = {};
    if (d.title !== undefined) patch.title = d.title;
    if (d.description !== undefined) patch.description = d.description || null;
    if (d.serviceType !== undefined) patch.service_type = d.serviceType;
    if (d.priceCents !== undefined) patch.price_cents = d.priceCents;
    if (d.startPriceCents !== undefined)
      patch.start_price_cents = d.startPriceCents;
    if (d.reservePriceCents !== undefined)
      patch.reserve_price_cents = d.reservePriceCents;
    if (d.buyNowPriceCents !== undefined)
      patch.buy_now_price_cents = d.buyNowPriceCents;
    if (d.auctionEndTime !== undefined)
      patch.auction_end_time = d.auctionEndTime;
    if (d.minBidIncrementCents !== undefined)
      patch.min_bid_increment_cents = d.minBidIncrementCents;
    if (d.location !== undefined) patch.location = d.location || null;
    if (d.postalCode !== undefined) patch.postal_code = d.postalCode || null;
    if (d.photos !== undefined) patch.photos = d.photos;

    const { data: listing, error } = await supabase
      .from("service_listings")
      .update(patch)
      .eq("id", input.id)
      .select()
      .single();

    if (error) throw error;
    return mapListing(listing as ListingRow);
  });

export const deleteServiceListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const { supabase } = context;

    const { data: existing, error: fetchError } = await supabase
      .from("service_listings")
      .select("status")
      .eq("id", id)
      .single();
    if (fetchError) throw fetchError;
    if (existing.status === "sold") {
      throw new Error("Verkaufte Angebote können nicht gelöscht werden.");
    }

    const { error } = await supabase
      .from("service_listings")
      .delete()
      .eq("id", id);
    if (error) throw error;
    return { success: true };
  });

/**
 * Entwurf veröffentlichen (draft -> active). Validiert die Pflichtfelder
 * für den jeweiligen Angebotstyp erneut serverseitig.
 */
export const publishServiceListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const { supabase } = context;

    const { data: existing, error: fetchError } = await supabase
      .from("service_listings")
      .select("*")
      .eq("id", id)
      .single();
    if (fetchError) throw fetchError;

    const row = existing as ListingRow;
    const validationError = validateListingInput({
      title: row.title,
      description: row.description ?? "",
      serviceType: row.service_type,
      listingType: row.listing_type,
      priceCents: row.price_cents,
      startPriceCents: row.start_price_cents,
      reservePriceCents: row.reserve_price_cents,
      buyNowPriceCents: row.buy_now_price_cents,
      auctionEndTime: row.auction_end_time,
      minBidIncrementCents: row.min_bid_increment_cents,
      location: row.location ?? "",
      postalCode: row.postal_code ?? "",
      photos: row.photos ?? [],
    });
    if (validationError) throw new Error(validationError);

    const { data: listing, error } = await supabase
      .from("service_listings")
      .update({ status: "active" })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return mapListing(listing as ListingRow);
  });

/**
 * Aktives Angebot pausieren (active -> draft). Bei Auktionen mit bereits
 * platzierten Geboten nicht erlaubt, um Bieter nicht im Regen stehen zu lassen.
 */
export const unpublishServiceListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const { supabase } = context;

    const { count, error: countError } = await supabase
      .from("auction_bids")
      .select("id", { count: "exact", head: true })
      .eq("listing_id", id);
    if (countError) throw countError;
    if (count && count > 0) {
      throw new Error(
        "Auktionen mit Geboten können nicht mehr pausiert werden.",
      );
    }

    const { data: listing, error } = await supabase
      .from("service_listings")
      .update({ status: "draft" })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return mapListing(listing as ListingRow);
  });

// ---------------------------------------------------------------------------
// Auctions
// ---------------------------------------------------------------------------

export const getAuctionBids = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((listingId: string) => listingId)
  .handler(async ({ context, data: listingId }) => {
    const { supabase } = context;

    const { data, error } = await supabase
      .from("auction_bids")
      .select("*")
      .eq("listing_id", listingId)
      .order("amount_cents", { ascending: false });

    if (error) throw error;
    const profiles = await fetchProfilesByIds(
      supabase,
      (data ?? []).map((bid) => bid.bidder_id),
    );
    return (data as BidRow[]).map((row) => {
      const profile = profiles.get(row.bidder_id);
      return mapBid({
        ...row,
        profiles: profile
          ? {
              display_name: profile.displayName,
            }
          : null,
      });
    });
  });

/**
 * Gebot auf eine Auktion abgeben. Läuft über die place_auction_bid()
 * Datenbankfunktion, da das Erhöhen von current_price_cents durch den
 * Bieter (nicht den Verkäufer) über normale RLS-Policies nicht möglich ist.
 */
export const placeAuctionBid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { listingId: string; amountCents: number }) => input)
  .handler(async ({ context, data: input }) => {
    const { supabase } = context;

    const { data, error } = await supabase.rpc("place_auction_bid", {
      p_listing_id: input.listingId,
      p_amount_cents: input.amountCents,
    });

    if (error) throw error;
    return mapBid(data as BidRow);
  });

/**
 * Auktion abschließen (nach Ablauf der Endzeit). Kann von jedem ausgelöst
 * werden (z.B. beim Aufrufen der Detailseite) — die Funktion selbst ist
 * idempotent und wirkt nur auf noch aktive, bereits abgelaufene Auktionen.
 */
export const endAuction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((listingId: string) => listingId)
  .handler(async ({ context, data: listingId }) => {
    const { supabase } = context;

    const { data, error } = await supabase.rpc("end_auction_listing", {
      p_listing_id: listingId,
    });
    if (error) throw error;

    const result = Array.isArray(data) ? data[0] : data;
    return {
      ended: !!result?.ended,
      winnerId: result?.winner_id ?? null,
      winningBidCents: result?.winning_bid_cents ?? null,
      reserveNotMet: !!result?.reserve_not_met,
      gigId: result?.gig_id ?? null,
    };
  });

// ---------------------------------------------------------------------------
// Offers (negotiable / fixed-price listings)
// ---------------------------------------------------------------------------

export const makeOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { listingId: string; amountCents: number; message: string }) =>
      input,
  )
  .handler(async ({ context, data: input }) => {
    const { supabase, userId } = context;

    if (input.amountCents <= 0) {
      throw new Error("Das Angebot muss größer als 0€ sein.");
    }

    const { data, error } = await supabase
      .from("offers")
      .insert({
        listing_id: input.listingId,
        offerer_id: userId,
        amount_cents: input.amountCents,
        message: input.message || null,
      })
      .select()
      .single();

    if (error) throw error;
    return mapOffer(data as OfferRow);
  });

/**
 * Angebote, die auf ein eigenes Listing eingegangen sind (Verkäufer-Sicht).
 */
export const getOffersForListing = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((listingId: string) => listingId)
  .handler(async ({ context, data: listingId }) => {
    const { supabase } = context;

    const { data, error } = await supabase
      .from("offers")
      .select("*")
      .eq("listing_id", listingId)
      .order("amount_cents", { ascending: false });

    if (error) throw error;
    const profiles = await fetchProfilesByIds(
      supabase,
      (data ?? []).map((offer) => offer.offerer_id),
    );
    return (data as OfferRow[]).map((row) => {
      const profile = profiles.get(row.offerer_id);
      return mapOffer({
        ...row,
        profiles: profile
          ? {
              display_name: profile.displayName,
            }
          : null,
      });
    });
  });

/**
 * Eigene abgegebene Angebote (Käufer-Sicht).
 */
export const getMyOffers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data, error } = await supabase
      .from("offers")
      .select("*, service_listings(title)")
      .eq("offerer_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data as OfferRow[]).map(mapOffer);
  });

/**
 * Angebote, die auf die eigenen Listings eingegangen sind, über alle
 * Listings hinweg (Verkäufer-Postfach).
 */
export const getReceivedOffers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: ownListings, error: listingsError } = await supabase
      .from("service_listings")
      .select("id")
      .eq("helper_id", userId);
    if (listingsError) throw listingsError;

    const listingIds = (ownListings ?? []).map((l) => l.id);
    if (listingIds.length === 0) return [];

    const { data, error } = await supabase
      .from("offers")
      .select("*, service_listings(title)")
      .in("listing_id", listingIds)
      .order("created_at", { ascending: false });

    if (error) throw error;
    const profiles = await fetchProfilesByIds(
      supabase,
      (data ?? []).map((offer) => offer.offerer_id),
    );
    return (data as OfferRow[]).map((row) => {
      const profile = profiles.get(row.offerer_id);
      return mapOffer({
        ...row,
        profiles: profile
          ? {
              display_name: profile.displayName,
            }
          : null,
      });
    });
  });

export const counterOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { offerId: string; amountCents: number }) => input)
  .handler(async ({ context, data: input }) => {
    const { supabase } = context;

    if (input.amountCents <= 0) {
      throw new Error("Das Gegenangebot muss größer als 0€ sein.");
    }

    const { data, error } = await supabase
      .from("offers")
      .update({ amount_cents: input.amountCents, status: "countered" })
      .eq("id", input.offerId)
      .select()
      .single();

    if (error) throw error;
    return mapOffer(data as OfferRow);
  });

export const rejectOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((offerId: string) => offerId)
  .handler(async ({ context, data: offerId }) => {
    const { supabase } = context;

    const { data, error } = await supabase
      .from("offers")
      .update({ status: "rejected" })
      .eq("id", offerId)
      .select()
      .single();

    if (error) throw error;
    return mapOffer(data as OfferRow);
  });

export const withdrawOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((offerId: string) => offerId)
  .handler(async ({ context, data: offerId }) => {
    const { supabase } = context;

    const { data, error } = await supabase
      .from("offers")
      .update({ status: "withdrawn" })
      .eq("id", offerId)
      .select()
      .single();

    if (error) throw error;
    return mapOffer(data as OfferRow);
  });

/**
 * Angebot annehmen: erstellt Gig + Escrow und markiert das Listing als
 * verkauft. Läuft über die accept_service_offer() Datenbankfunktion, da der
 * Verkäufer hier einen Gig im Namen des Käufers (offerer) anlegt.
 */
export const acceptOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((offerId: string) => offerId)
  .handler(async ({ context, data: offerId }) => {
    const { supabase } = context;

    const { data, error } = await supabase.rpc("accept_service_offer", {
      p_offer_id: offerId,
    });

    if (error) throw error;
    return data;
  });

// ---------------------------------------------------------------------------
// Purchase
// ---------------------------------------------------------------------------

/**
 * Angebot kaufen: Festpreis/Verhandlungspreis direkt, oder Sofortkauf-Preis
 * bei einer Auktion. Läuft über die purchase_service_listing()
 * Datenbankfunktion, da der Käufer einen Gig anlegt, der auf einen anderen
 * Nutzer (den Verkäufer) verweist.
 */
export const purchaseServiceListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { listingId: string; buyNow?: boolean }) => input)
  .handler(async ({ context, data: input }) => {
    const { supabase } = context;

    const { data, error } = await supabase.rpc("purchase_service_listing", {
      p_listing_id: input.listingId,
      p_buy_now: input.buyNow ?? false,
    });

    if (error) throw error;
    return data;
  });

/**
 * Gemeinsame Eingabe-Schemas für Server-Functions.
 *
 * Hintergrund: `.validator((data: Foo) => data)` prüft nur zur Compile-Zeit. Ein Angreifer ruft die
 * RPC-Endpunkte direkt auf und kann beliebige Werte senden (negative Beträge, 10-MB-Texte,
 * ungültige IDs). Deshalb laufen alle Eingaben zur Laufzeit durch Zod.
 *
 * Bewusst ohne Server-only-Imports, damit die Datei auch in *.functions.ts (Client-Bundle) genutzt
 * werden kann.
 */
import { z } from "zod";
import { SERVICE_TYPES } from "@/lib/service-types";

export const uuidSchema = z.string().uuid();

const DEFAULT_ZOD_MESSAGE =
  /^(Expected|Invalid|String must|Number must|Array must|Required|Too |Unrecognized|Input not)/;

/**
 * Prüft Eingaben zur Laufzeit. Bei Fehlern wird eine verständliche deutsche Meldung geworfen
 * (eigene Meldungen der Schemas werden durchgereicht, Zod-Standardtexte nicht).
 */
export function parseInput<S extends z.ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const first = result.error.issues[0];
  const custom = first && !DEFAULT_ZOD_MESSAGE.test(first.message) ? first.message : null;
  throw new Error(custom ?? "Ungültige Eingabe. Bitte prüfe deine Angaben.");
}

/** Höchstbetrag für Einzelbeträge in Cent (50.000 €) - schützt vor Überläufen und Unsinnswerten. */
export const MAX_AMOUNT_CENTS = 5_000_000;

export const centsSchema = z.number().int().min(1).max(MAX_AMOUNT_CENTS);

const serviceTypeValues = SERVICE_TYPES.map((t) => t.value) as [string, ...string[]];
export const serviceTypeSchema = z.enum(serviceTypeValues);

export const helperRoleSchema = z.enum(["helper_youth", "helper_adult", "helper_pro"]);

/** Deutsche Postleitzahl (5 Ziffern). */
export const postalCodeSchema = z.string().trim().regex(/^\d{5}$/, "Bitte eine gültige PLZ (5 Ziffern) angeben.");

export const isoDateTimeSchema = z.string().datetime();

// ---------------------------------------------------------------------------
// Aufträge
// ---------------------------------------------------------------------------

export const gigInputSchema = z.object({
  title: z.string().trim().min(1, "Bitte gib einen Titel an.").max(150),
  description: z.string().trim().max(5000),
  serviceType: serviceTypeSchema,
  budgetCents: centsSchema,
  address: z.string().trim().min(1, "Bitte gib eine Adresse an.").max(250),
  postalCode: postalCodeSchema,
  scheduledAt: isoDateTimeSchema.nullable(),
  durationMinutes: z.number().int().min(15).max(12 * 60),
  allowedAgeGroups: z.array(helperRoleSchema).min(1).max(3),
  safetyConfirmed: z.boolean(),
});

export const directBookingSchema = z.object({
  helperId: uuidSchema,
  serviceType: serviceTypeSchema,
  description: z.string().trim().max(5000),
  address: z.string().trim().min(1).max(250),
  scheduledAt: isoDateTimeSchema,
  budgetCents: centsSchema,
  /** Angebot des Helfers, das gebucht wird: Preis und Leistung kommen dann vom Angebot, nicht vom Browser */
  listingId: uuidSchema.optional(),
});

export const gigIdSchema = z.object({ gigId: uuidSchema });

export const gigStatusSchema = z.object({
  gigId: uuidSchema,
  status: z.enum(["draft", "open", "negotiating", "assigned", "in_progress", "completed", "cancelled"]),
});

export const proposeDateSchema = z.object({ gigId: uuidSchema, scheduledAt: isoDateTimeSchema });

export const assignHelperSchema = z.object({ gigId: uuidSchema, helperId: uuidSchema });

export const cancelGigSchema = z.object({
  gigId: uuidSchema,
  // Leerer Grund wird im Handler mit freundlicher Meldung abgelehnt.
  reason: z.string().trim().max(500),
});

// ---------------------------------------------------------------------------
// Gebote
// ---------------------------------------------------------------------------

export const negotiationInputSchema = z.object({
  gigId: uuidSchema,
  bidCents: centsSchema,
  message: z.string().trim().max(1000).optional(),
});

export const counterBidSchema = z.object({ negotiationId: uuidSchema, counterBidCents: centsSchema });

export const negotiationIdSchema = z.object({ negotiationId: uuidSchema });

/** Helfer macht nach einem Gegenangebot ein neues Gebot (gleiche Verhandlung, neuer Preis). */
export const rebidSchema = z.object({
  negotiationId: uuidSchema,
  bidCents: centsSchema,
  message: z.string().trim().max(1000).optional(),
});

// ---------------------------------------------------------------------------
// Bewertungen, Profile, Benachrichtigungen
// ---------------------------------------------------------------------------

export const reviewInputSchema = z.object({
  gigId: uuidSchema,
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional(),
});

export const helperIdSchema = z.object({ helperId: uuidSchema });

export const customerIdSchema = z.object({ customerId: uuidSchema });

export const reviewsForGigSchema = z.object({
  gigId: uuidSchema,
  direction: z.enum(["customer_to_helper", "helper_to_customer"]).optional(),
});

export const toggleFavoriteSchema = z.object({ helperId: uuidSchema, add: z.boolean() });

export const notificationPrefsSchema = z
  .object({
    enabled: z.boolean().optional(),
    newBid: z.boolean().optional(),
    bidUpdates: z.boolean().optional(),
    gigUpdates: z.boolean().optional(),
  })
  .strict();

export const markNotificationsReadSchema = z.object({
  notificationId: uuidSchema.optional(),
  all: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Leistungsangebote (Inserate)
// ---------------------------------------------------------------------------

// Felder, die der Client als null ODER weglässt senden darf; im Ergebnis immer number | null.
const nullableCents = z
  .number()
  .int()
  .min(0)
  .max(MAX_AMOUNT_CENTS)
  .nullish()
  .transform((v) => v ?? null);

export const serviceListingInputSchema = z.object({
  title: z.string().trim().max(150),
  description: z.string().trim().max(5000),
  serviceType: z.string().trim().max(60),
  listingType: z.enum(["fixed_price", "auction", "negotiable"]),
  priceCents: nullableCents,
  startPriceCents: nullableCents,
  reservePriceCents: nullableCents,
  buyNowPriceCents: nullableCents,
  // Bewusst nur Länge geprüft: das genaue Format prüft validateListingInput / die Datenbank.
  auctionEndTime: z
    .string()
    .trim()
    .max(40)
    .nullish()
    .transform((v) => v || null),
  minBidIncrementCents: z
    .number()
    .int()
    .min(1)
    .max(MAX_AMOUNT_CENTS)
    .nullish()
    .transform((v) => v ?? null),
  location: z.string().trim().max(250),
  postalCode: z.string().trim().max(10),
  photos: z.array(z.string().trim().max(1000)).max(12).default([]),
});

export const createServiceListingSchema = serviceListingInputSchema.extend({
  publish: z.boolean().optional(),
  id: uuidSchema.optional(),
});

export const updateServiceListingSchema = z.object({
  id: uuidSchema,
  data: serviceListingInputSchema.partial(),
});

const serviceListingFiltersObject = z.object({
  serviceType: z.string().trim().max(60).optional(),
  listingType: z.enum(["fixed_price", "auction", "negotiable"]).optional(),
  search: z.string().trim().max(100).optional(),
  nearPostalCode: z.string().trim().max(10).optional(),
});

export const serviceListingFiltersSchema = serviceListingFiltersObject
  .optional()
  .transform((v) => v ?? ({} as z.infer<typeof serviceListingFiltersObject>));

export const listingIdSchema = uuidSchema;
export const offerIdSchema = uuidSchema;

export const makeOfferSchema = z.object({
  listingId: uuidSchema,
  amountCents: centsSchema,
  message: z.string().trim().max(1000),
});

export const listingAmountSchema = z.object({ listingId: uuidSchema, amountCents: centsSchema });

export const offerAmountSchema = z.object({ offerId: uuidSchema, amountCents: centsSchema });

export const buyListingSchema = z.object({ listingId: uuidSchema, buyNow: z.boolean().optional() });

export const purchaseWithScheduleSchema = z.object({
  listingId: uuidSchema,
  scheduledAt: isoDateTimeSchema,
  scheduledEnd: isoDateTimeSchema.optional(),
  message: z.string().trim().max(1000).optional(),
});

export const respondToBookingSchema = z.object({ gigId: uuidSchema, accept: z.boolean() });

// Server-only: Eltern-Freigabe für Angebote und Gebote Jugendlicher im Marktplatz.
// Nur aus Server-Function-Handlern importieren (per dynamischem `await import(...)`).
//
// Ablauf:
//   - Angebot veröffentlichen (kind "listing"): Das Angebot bleibt Entwurf, die Eltern bekommen eine
//     Anfrage (Mail + Eltern-Konto). Mit ihrer Freigabe wird es veröffentlicht.
//   - Gebot abgeben (kind "bid"): Das Gebot wird erst nach der Freigabe der Eltern wirklich abgegeben.
// Die Datenbank erzwingt dasselbe (Trigger/Policy in 20261024000100_youth_offer_approvals.sql).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { emailTemplate, escapeHtml, getSiteUrl, sendEmail } from "@/lib/server/email.server";
import { notifyUserByEmail } from "@/lib/server/notifications.server";
import {
  formatEuro,
  guardianRecipients,
  loadJobDetails,
  maskEmail,
  serviceLabel,
  VerificationError,
} from "@/lib/server/verification.server";

export const OFFER_APPROVAL_VALID_DAYS = 7;

/** Wird geworfen, wenn die Eltern erst gefragt werden müssen (Meldung geht an das Kind). */
export class OfferApprovalRequired extends Error {}

export interface GuardianOfferItem {
  approvalId: string;
  kind: "listing" | "bid";
  status: "pending" | "approved" | "declined" | "expired";
  createdAt: string;
  expiresAt: string | null;
  title: string;
  activity: string;
  description: string | null;
  location: string | null;
  /** Angebot: Preis-Beschreibung, Gebot: das gebotene Geld */
  priceLabel: string;
  /** Nur Gebot: Nachricht des Kindes an den Auftraggeber */
  message: string | null;
  /** Nur Gebot: Auftraggeber */
  customerName: string | null;
  customerVerified: boolean | null;
  /** Nur Gebot: Termin */
  when: string | null;
  /** Nur Angebot: Anzahl der Fotos */
  photoCount: number;
}

// ---------------------------------------------------------------------------
// Gemeinsame Voraussetzungen
// ---------------------------------------------------------------------------

async function isYouth(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).some((r) => r.role === "helper_youth");
}
export { isYouth as isYouthUser };

async function loadChildContext(userId: string) {
  const [{ data: profile }, { data: priv }, { data: link }] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("display_name, verified_at, verification_method, suspended_at")
      .eq("id", userId)
      .maybeSingle(),
    supabaseAdmin.from("profile_private").select("guardian_email").eq("id", userId).maybeSingle(),
    supabaseAdmin
      .from("guardian_links")
      .select("guardian_user_id, paused_at")
      .eq("child_id", userId)
      .eq("status", "active")
      .maybeSingle(),
  ]);
  if (profile?.suspended_at) {
    throw new OfferApprovalRequired("Dein Konto ist derzeit gesperrt. Bitte wende dich an das GreenMatch-Team.");
  }
  if (!profile?.verified_at || profile.verification_method !== "guardian_consent") {
    throw new OfferApprovalRequired("Zuerst musst du dich verifizieren (Profil → Verifizierung).");
  }
  if (!link?.guardian_user_id) {
    throw new OfferApprovalRequired(
      "Dir fehlt noch ein Eltern-Konto. Deine Eltern müssen es anlegen (Profil → Verifizierung).",
    );
  }
  if (link.paused_at) {
    throw new OfferApprovalRequired("Deine Eltern haben dein Konto pausiert. Bitte sprich mit ihnen.");
  }
  const recipients = await guardianRecipients(link.guardian_user_id, priv?.guardian_email);
  if (recipients.length === 0) {
    throw new OfferApprovalRequired("Es ist keine E-Mail-Adresse deiner Eltern hinterlegt.");
  }
  return {
    childName: profile.display_name?.trim() || "Ihr Kind",
    guardianUserId: link.guardian_user_id,
    recipients,
  };
}

function expiresAt(): string {
  return new Date(Date.now() + OFFER_APPROVAL_VALID_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

async function sendApprovalMail(input: {
  approvalId: string;
  recipients: string[];
  childName: string;
  badge: string;
  heading: string;
  intro: string;
  rows: { label: string; value: string }[];
  cta: string;
}) {
  const url = `${getSiteUrl()}/eltern?angebot=${input.approvalId}`;
  const html = emailTemplate({
    badge: input.badge,
    heading: input.heading,
    greeting: "Liebe Erziehungsberechtigte,",
    previewText: input.heading,
    bodyLines: [input.intro],
    infoTable: input.rows,
    ctaLabel: input.cta,
    ctaUrl: url,
    footer: `Es passiert nichts, solange Sie nicht ausdrücklich zustimmen (Anfrage gültig für ${OFFER_APPROVAL_VALID_DAYS} Tage).`,
  });
  await Promise.all(input.recipients.map((to) => sendEmail({ to, subject: input.heading, html })));
}

// ---------------------------------------------------------------------------
// Angebot (service_listings) veröffentlichen
// ---------------------------------------------------------------------------

type ListingRowLite = {
  id: string;
  helper_id: string;
  title: string;
  description: string | null;
  service_type: string;
  listing_type: string;
  price_cents: number | null;
  start_price_cents: number | null;
  reserve_price_cents: number | null;
  buy_now_price_cents: number | null;
  auction_end_time: string | null;
  location: string | null;
  postal_code: string | null;
  photos: string[] | null;
};

const LISTING_COLUMNS =
  "id, helper_id, title, description, service_type, listing_type, price_cents, start_price_cents, reserve_price_cents, buy_now_price_cents, auction_end_time, location, postal_code, photos";

function listingSnapshot(l: ListingRowLite) {
  return {
    title: l.title,
    description: l.description ?? "",
    serviceType: l.service_type,
    listingType: l.listing_type,
    price: l.price_cents,
    startPrice: l.start_price_cents,
    reservePrice: l.reserve_price_cents,
    buyNowPrice: l.buy_now_price_cents,
    auctionEnd: l.auction_end_time,
    location: l.location ?? "",
    postalCode: l.postal_code ?? "",
    photos: l.photos ?? [],
  };
}

function listingPriceLabel(l: ListingRowLite): string {
  if (l.listing_type === "auction") {
    const parts = [`Auktion ab ${formatEuro(l.start_price_cents ?? 0)}`];
    if (l.buy_now_price_cents) parts.push(`Sofortkauf ${formatEuro(l.buy_now_price_cents)}`);
    return parts.join(", ");
  }
  const base = l.price_cents != null ? formatEuro(l.price_cents) : "Preis nach Absprache";
  return l.listing_type === "negotiable" ? `${base} (Verhandlungsbasis)` : base;
}

/**
 * Jugendliche/r möchte ein Angebot veröffentlichen: legt die Anfrage an die Eltern an (oder meldet,
 * dass sie schon gestellt ist) und wirft OfferApprovalRequired mit einer Meldung für das Kind.
 * Liegt bereits eine gültige Freigabe vor, passiert nichts (die Veröffentlichung darf weiterlaufen).
 */
export async function ensureListingApproval(userId: string, listingId: string): Promise<void> {
  if (!(await isYouth(userId))) return;
  const ctx = await loadChildContext(userId);

  const { data: listing } = await supabaseAdmin
    .from("service_listings")
    .select(LISTING_COLUMNS)
    .eq("id", listingId)
    .eq("helper_id", userId)
    .maybeSingle();
  if (!listing) throw new OfferApprovalRequired("Angebot nicht gefunden.");
  const l = listing as unknown as ListingRowLite;

  const { data: existing } = await supabaseAdmin
    .from("youth_offer_approvals")
    .select("id, status, expires_at, snapshot")
    .eq("kind", "listing")
    .eq("listing_id", listingId)
    .in("status", ["approved", "pending"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.status === "approved") return;
  if (existing?.status === "pending" && existing.expires_at && new Date(existing.expires_at) > new Date()) {
    throw new OfferApprovalRequired(
      "Deine Eltern wurden schon gefragt. Sobald sie dein Angebot in ihrem Eltern-Konto freigeben, wird es veröffentlicht.",
    );
  }

  await supabaseAdmin
    .from("youth_offer_approvals")
    .update({ status: "cancelled", decided_at: new Date().toISOString() })
    .eq("kind", "listing")
    .eq("listing_id", listingId)
    .eq("status", "pending");

  const { data: created, error } = await supabaseAdmin
    .from("youth_offer_approvals")
    .insert({
      child_id: userId,
      kind: "listing",
      listing_id: listingId,
      status: "pending",
      expires_at: expiresAt(),
      snapshot: listingSnapshot(l),
    })
    .select("id")
    .single();
  if (error || !created) throw error ?? new Error("insert_failed");

  const e = escapeHtml;
  await sendApprovalMail({
    approvalId: created.id,
    recipients: ctx.recipients,
    childName: ctx.childName,
    badge: "Jugendschutz & Angebotsfreigabe",
    heading: `${ctx.childName} möchte ein Angebot veröffentlichen`,
    intro: `<strong>${e(ctx.childName)}</strong> möchte bei GreenMatch das folgende Angebot einstellen. Es wird erst veröffentlicht, wenn Sie es im Eltern-Konto freigeben. Bitte prüfen Sie die Angaben gemeinsam mit Ihrem Kind:`,
    rows: [
      { label: "Titel", value: e(l.title) },
      { label: "Tätigkeit", value: e(serviceLabel(l.service_type)) },
      ...(l.description ? [{ label: "Beschreibung", value: e(l.description) }] : []),
      { label: "Preis", value: e(listingPriceLabel(l)) },
      { label: "Ort", value: e([l.postal_code, l.location].filter(Boolean).join(" ") || "—") },
    ],
    cta: "Angebot im Eltern-Konto prüfen",
  });

  throw new OfferApprovalRequired(
    `Wir haben deine Eltern per E-Mail um Freigabe gebeten (${ctx.recipients.map(maskEmail).join(", ")}). Dein Angebot wird veröffentlicht, sobald sie im Eltern-Konto zustimmen.`,
  );
}

// ---------------------------------------------------------------------------
// Gebot auf einen Auftrag
// ---------------------------------------------------------------------------

/**
 * Jugendliche/r möchte ein Gebot abgeben: Das Gebot wird NICHT abgegeben, sondern den Eltern vorgelegt.
 * Wirft immer OfferApprovalRequired (Meldung für das Kind) oder VerificationError bei Problemen.
 */
export async function requestBidApproval(
  userId: string,
  input: { gigId: string; bidCents: number; message: string | null },
): Promise<never> {
  const ctx = await loadChildContext(userId);
  const job = await loadJobDetails(input.gigId);
  if (!job) throw new OfferApprovalRequired("Auftrag nicht gefunden.");
  if (!["open", "negotiating"].includes(job.gigStatus)) {
    throw new OfferApprovalRequired("Auf diesen Auftrag kann nicht mehr geboten werden.");
  }

  const { data: dup } = await supabaseAdmin
    .from("youth_offer_approvals")
    .select("id")
    .eq("kind", "bid")
    .eq("child_id", userId)
    .eq("gig_id", input.gigId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (dup) {
    throw new OfferApprovalRequired(
      "Deine Eltern wurden für dieses Gebot schon gefragt. Sobald sie im Eltern-Konto zustimmen, wird es abgegeben.",
    );
  }
  await supabaseAdmin
    .from("youth_offer_approvals")
    .update({ status: "cancelled", decided_at: new Date().toISOString() })
    .eq("kind", "bid")
    .eq("child_id", userId)
    .eq("gig_id", input.gigId)
    .eq("status", "pending");

  const { data: created, error } = await supabaseAdmin
    .from("youth_offer_approvals")
    .insert({
      child_id: userId,
      kind: "bid",
      gig_id: input.gigId,
      bid_cents: input.bidCents,
      message: input.message,
      status: "pending",
      expires_at: expiresAt(),
      snapshot: { title: job.title, activity: job.activity, description: job.description, location: job.location, when: job.when },
    })
    .select("id")
    .single();
  if (error || !created) throw error ?? new Error("insert_failed");

  const e = escapeHtml;
  await sendApprovalMail({
    approvalId: created.id,
    recipients: ctx.recipients,
    childName: ctx.childName,
    badge: "Jugendschutz & Gebotsfreigabe",
    heading: `${ctx.childName} möchte ein Gebot abgeben`,
    intro: `<strong>${e(ctx.childName)}</strong> möchte auf den folgenden Auftrag ein Gebot abgeben. Das Gebot wird erst abgegeben, wenn Sie es im Eltern-Konto freigeben. Bitte besprechen Sie es gemeinsam:`,
    rows: [
      { label: "Auftrag", value: `${e(job.activity)} – ${e(job.title)}` },
      ...(job.description ? [{ label: "Beschreibung", value: e(job.description) }] : []),
      { label: "Auftraggeber", value: `${e(job.customerName)} (${job.customerVerified ? "Identität geprüft" : "nicht verifiziert"})` },
      { label: "Ort", value: e(job.location) },
      { label: "Termin", value: e(job.when) },
      { label: "Gebot", value: formatEuro(input.bidCents) },
      ...(input.message ? [{ label: "Nachricht", value: e(input.message) }] : []),
    ],
    cta: "Gebot im Eltern-Konto prüfen",
  });

  throw new OfferApprovalRequired(
    `Dein Gebot ist noch nicht abgegeben: Wir haben deine Eltern per E-Mail um Freigabe gebeten (${ctx.recipients.map(maskEmail).join(", ")}). Sobald sie im Eltern-Konto zustimmen, wird es abgegeben.`,
  );
}

// ---------------------------------------------------------------------------
// Entscheidung der Eltern
// ---------------------------------------------------------------------------

export async function decideOfferAsGuardian(
  guardianUserId: string,
  approvalId: string,
  decision: "approve" | "decline" | "revoke",
): Promise<{ state: "approved" | "declined" }> {
  const { data: a } = await supabaseAdmin
    .from("youth_offer_approvals")
    .select("*")
    .eq("id", approvalId)
    .maybeSingle();
  if (!a) throw new VerificationError("invalid_request");

  const { data: link } = await supabaseAdmin
    .from("guardian_links")
    .select("id, paused_at")
    .eq("child_id", a.child_id)
    .eq("guardian_user_id", guardianUserId)
    .eq("status", "active")
    .maybeSingle();
  if (!link) throw new VerificationError("forbidden");

  const nowIso = new Date().toISOString();

  if (decision === "revoke") {
    // Zurückziehen: nur freigegebene Angebote (Gebote sind nach Abgabe beim Auftraggeber)
    if (a.kind !== "listing" || a.status !== "approved") throw new VerificationError("not_approved");
    await supabaseAdmin
      .from("youth_offer_approvals")
      .update({ status: "declined", decided_at: nowIso, decided_by: guardianUserId })
      .eq("id", a.id);
    await supabaseAdmin
      .from("service_listings")
      .update({ status: "draft" })
      .eq("id", a.listing_id!)
      .eq("status", "active");
    await notifyChild(a.child_id, a.kind, titleOf(a), false, true);
    return { state: "declined" };
  }

  if (a.status !== "pending") throw new VerificationError("already_decided");
  if (a.expires_at && new Date(a.expires_at) < new Date()) {
    await supabaseAdmin.from("youth_offer_approvals").update({ status: "expired", decided_at: nowIso }).eq("id", a.id);
    throw new VerificationError("expired");
  }

  if (decision === "decline") {
    await supabaseAdmin
      .from("youth_offer_approvals")
      .update({ status: "declined", decided_at: nowIso, decided_by: guardianUserId })
      .eq("id", a.id);
    await notifyChild(a.child_id, a.kind, titleOf(a), false, false);
    return { state: "declined" };
  }

  // approve
  if (link.paused_at) throw new VerificationError("account_paused");
  if (a.kind === "listing") {
    const { data: listing } = await supabaseAdmin
      .from("service_listings")
      .select(LISTING_COLUMNS)
      .eq("id", a.listing_id!)
      .maybeSingle();
    if (!listing) throw new VerificationError("offer_gone");
    // Hat das Kind das Angebot seit der Anfrage geändert, haben die Eltern die neuen Angaben nicht gesehen.
    if (JSON.stringify(listingSnapshot(listing as unknown as ListingRowLite)) !== JSON.stringify(a.snapshot)) {
      await supabaseAdmin.from("youth_offer_approvals").update({ status: "cancelled", decided_at: nowIso }).eq("id", a.id);
      throw new VerificationError("offer_changed");
    }
    await supabaseAdmin
      .from("youth_offer_approvals")
      .update({ status: "approved", decided_at: nowIso, decided_by: guardianUserId })
      .eq("id", a.id);
    // Service-Role: der Datenbank-Trigger lässt die Veröffentlichung jetzt zu (Freigabe liegt vor).
    const { error } = await supabaseAdmin
      .from("service_listings")
      .update({ status: "active" })
      .eq("id", a.listing_id!)
      .eq("status", "draft");
    if (error) throw error;
  } else {
    await placeApprovedBid(a);
    await supabaseAdmin
      .from("youth_offer_approvals")
      .update({ status: "approved", decided_at: nowIso, decided_by: guardianUserId })
      .eq("id", a.id);
  }
  await notifyChild(a.child_id, a.kind, titleOf(a), true, false);
  return { state: "approved" };
}

type ApprovalRow = {
  id: string;
  child_id: string;
  kind: string;
  gig_id: string | null;
  listing_id: string | null;
  bid_cents: number | null;
  message: string | null;
  snapshot: unknown;
};

function titleOf(a: ApprovalRow): string {
  const s = (a.snapshot ?? {}) as { title?: string };
  return s.title || (a.kind === "bid" ? "Gebot" : "Angebot");
}

/** Gibt das freigegebene Gebot ab (Service-Role) und informiert den Auftraggeber. */
async function placeApprovedBid(a: ApprovalRow): Promise<void> {
  const job = a.gig_id ? await loadJobDetails(a.gig_id) : null;
  if (!job || !["open", "negotiating"].includes(job.gigStatus)) throw new VerificationError("offer_gone");
  if (a.bid_cents == null) throw new VerificationError("invalid_request");

  // Läuft schon eine Verhandlung (z. B. Gegenangebot des Kunden), wird sie fortgesetzt statt ein zweites
  // Gebot anzulegen.
  const { data: running } = await supabaseAdmin
    .from("negotiations")
    .select("id")
    .eq("gig_id", a.gig_id!)
    .eq("helper_id", a.child_id)
    .in("status", ["pending", "countered"])
    .maybeSingle();
  if (running) {
    const { error } = await supabaseAdmin
      .from("negotiations")
      .update({ bid_cents: a.bid_cents, counter_bid_cents: null, message: a.message, status: "pending" })
      .eq("id", running.id);
    if (error) throw error;
  } else {
    const { error } = await supabaseAdmin.from("negotiations").insert({
      gig_id: a.gig_id!,
      helper_id: a.child_id,
      bid_cents: a.bid_cents,
      message: a.message,
      status: "pending",
    });
    if (error) throw error;
  }
  await supabaseAdmin.from("gigs").update({ status: "negotiating" }).eq("id", a.gig_id!).eq("status", "open");

  const { data: child } = await supabaseAdmin.from("profiles").select("display_name").eq("id", a.child_id).maybeSingle();
  const name = child?.display_name?.trim() || "Ein Helfer";
  const amount = formatEuro(a.bid_cents);
  await notifyUserByEmail({
    userId: job.customerId,
    category: "new_bid",
    subject: `Neues Gebot für "${job.title}"`,
    html: emailTemplate({
      heading: "Du hast ein neues Gebot erhalten",
      bodyLines: [`${escapeHtml(name)} hat ${amount} für deinen Auftrag „${escapeHtml(job.title)}“ geboten.`],
      ctaLabel: "Gebot ansehen",
      ctaPath: "/my-gigs",
    }),
    inApp: { title: "Neues Gebot erhalten", body: `${name} hat ${amount} für „${job.title}“ geboten.`, link: "/my-gigs" },
  });
}

async function notifyChild(childId: string, kind: string, title: string, approved: boolean, revoked: boolean) {
  const what = kind === "bid" ? "dein Gebot" : "dein Angebot";
  const heading = approved
    ? `Deine Eltern haben ${what} freigegeben`
    : revoked
      ? `Deine Eltern haben die Freigabe für ${what} zurückgezogen`
      : `Deine Eltern haben ${what} nicht freigegeben`;
  const body = approved
    ? kind === "bid"
      ? `Das Gebot für „${escapeHtml(title)}“ wurde abgegeben.`
      : `„${escapeHtml(title)}“ ist jetzt veröffentlicht.`
    : `„${escapeHtml(title)}“ wurde nicht ${revoked ? "mehr " : ""}freigegeben. Sprich am besten mit deinen Eltern darüber.`;
  await notifyUserByEmail({
    userId: childId,
    category: "gig_updates",
    subject: heading,
    html: emailTemplate({
      heading,
      bodyLines: [body],
      ctaLabel: kind === "bid" ? "Zum Marktplatz" : "Zu meinen Angeboten",
      ctaPath: kind === "bid" ? "/marketplace" : "/sell",
    }),
    inApp: { title: heading, body: title, link: kind === "bid" ? "/marketplace" : "/sell" },
  });
}

// ---------------------------------------------------------------------------
// Eltern-Konto: Übersicht
// ---------------------------------------------------------------------------

export async function listOffersForChild(childId: string): Promise<GuardianOfferItem[]> {
  const { data: rows } = await supabaseAdmin
    .from("youth_offer_approvals")
    .select("*")
    .eq("child_id", childId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(25);

  const items: GuardianOfferItem[] = [];
  for (const a of rows ?? []) {
    const status: GuardianOfferItem["status"] =
      a.status === "pending" && a.expires_at && new Date(a.expires_at) < new Date()
        ? "expired"
        : (a.status as GuardianOfferItem["status"]);

    if (a.kind === "listing") {
      const s = (a.snapshot ?? {}) as {
        title?: string; description?: string; serviceType?: string; listingType?: string;
        price?: number | null; startPrice?: number | null; buyNowPrice?: number | null;
        location?: string; postalCode?: string; photos?: string[];
      };
      const asRow = {
        listing_type: s.listingType ?? "fixed_price",
        price_cents: s.price ?? null,
        start_price_cents: s.startPrice ?? null,
        buy_now_price_cents: s.buyNowPrice ?? null,
      } as ListingRowLite;
      items.push({
        approvalId: a.id,
        kind: "listing",
        status,
        createdAt: a.created_at,
        expiresAt: a.expires_at,
        title: s.title ?? "Angebot",
        activity: serviceLabel(s.serviceType ?? ""),
        description: s.description?.trim() || null,
        location: [s.postalCode, s.location].filter(Boolean).join(" ") || null,
        priceLabel: listingPriceLabel(asRow),
        message: null,
        customerName: null,
        customerVerified: null,
        when: null,
        photoCount: (s.photos ?? []).length,
      });
    } else {
      const job = a.gig_id ? await loadJobDetails(a.gig_id) : null;
      const s = (a.snapshot ?? {}) as { title?: string; activity?: string; description?: string | null; location?: string; when?: string };
      items.push({
        approvalId: a.id,
        kind: "bid",
        status,
        createdAt: a.created_at,
        expiresAt: a.expires_at,
        title: job?.title ?? s.title ?? "Auftrag",
        activity: job?.activity ?? s.activity ?? "",
        description: (job?.description ?? s.description) || null,
        location: job?.location ?? s.location ?? null,
        priceLabel: a.bid_cents != null ? formatEuro(a.bid_cents) : "—",
        message: a.message,
        customerName: job?.customerName ?? null,
        customerVerified: job ? job.customerVerified : null,
        when: job?.when ?? s.when ?? null,
        photoCount: 0,
      });
    }
  }
  return items;
}

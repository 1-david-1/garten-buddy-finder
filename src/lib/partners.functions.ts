import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachGigLocations, GIG_PUBLIC_COLUMNS } from "@/lib/gig-location";
import { fetchProfilesByIds } from "@/lib/profile-lookup";
import {
  summarizePartners,
  type PartnerEscrowRow,
  type PartnerGigRow,
  type PartnerRelation,
  type PartnerSummary,
} from "@/lib/partners";
import { isActiveStatus } from "@/lib/gig-status";
import { parseInput, partnerIdSchema } from "@/lib/validation";

async function relationOf(supabase: { from: (t: "user_roles") => any }, userId: string): Promise<PartnerRelation> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const isHelper = ((data ?? []) as { role: string }[]).some((r) => String(r.role).startsWith("helper_"));
  // Helfer arbeiten für KUNDEN; wer nur Auftraggeber ist, arbeitet mit HELFERN.
  return isHelper ? "customers" : "helpers";
}

/**
 * Die Menschen, mit denen du zusammenarbeitest - für das Unterfenster in der Seitenleiste und die Übersicht.
 * Helfer sehen ihre Kunden, Auftraggeber ihre Helfer. Es werden nur Name, Stadt und Verifizierung geliefert
 * (keine Postleitzahl, keine Adresse).
 */
export const getMyPartners = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ relation: PartnerRelation; partners: PartnerSummary[] }> => {
    const { supabase, userId } = context;
    const relation = await relationOf(supabase as never, userId);

    const mine = relation === "customers" ? "assigned_helper_id" : "customer_id";
    const { data: gigRows, error } = await supabase
      .from("gigs")
      .select("id, customer_id, assigned_helper_id, status, scheduled_at, budget_cents, updated_at")
      .eq(mine, userId)
      .not("assigned_helper_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    const gigs = (gigRows ?? []) as PartnerGigRow[];

    const { data: escrowRows } = await supabase
      .from("escrow_transactions")
      .select("gig_id, state, bid_cents")
      .in("gig_id", gigs.map((g) => g.id));
    const escrows = (escrowRows ?? []).map((e) => ({ gig_id: e.gig_id, state: String(e.state), bid_cents: e.bid_cents })) as PartnerEscrowRow[];

    const partnerIds = gigs.map((g) => (relation === "customers" ? g.customer_id : g.assigned_helper_id));
    const profiles = await fetchProfilesByIds(supabase, partnerIds);
    const people = new Map(
      [...profiles.values()].map((p) => [p.id, { name: p.displayName, city: p.city, verified: !!p.verifiedAt }]),
    );

    return { relation, partners: summarizePartners(gigs, escrows, relation, people) };
  });

export interface PartnerGig {
  id: string;
  title: string;
  status: string;
  /** Deine Rolle bei diesem Auftrag */
  myRole: "customer" | "helper";
  scheduledAt: string | null;
  durationMinutes: number;
  budgetCents: number;
  district: string | null;
  /** Genaue Adresse - nur, wenn du sie sehen darfst (Auftraggeber; Helfer erst nach der Zusage) */
  address: string | null;
  paymentState: string | null;
  paidOutAt: string | null;
  updatedAt: string;
}

export interface PartnerDetail {
  partner: { id: string; name: string; city: string | null; verified: boolean };
  /** Mit dieser Person bist du als ... unterwegs */
  relation: PartnerRelation;
  conversationId: string | null;
  totals: { activeCount: number; completedCount: number; paidCents: number; awaitingPaymentCents: number };
  gigs: PartnerGig[];
}

/** Alle Aufträge zwischen dir und einer Person - mit Zahlungsstatus, Terminen und (wo erlaubt) der Adresse. */
export const getPartnerDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => parseInput(partnerIdSchema, data))
  .handler(async ({ context, data }): Promise<PartnerDetail> => {
    const { supabase, userId } = context;
    const partnerId = data.partnerId;

    // Beide Richtungen: du als Auftraggeber oder als Helfer (die IDs sind per Schema geprüfte UUIDs)
    const { data: gigRows, error } = await supabase
      .from("gigs")
      .select(GIG_PUBLIC_COLUMNS)
      .or(
        `and(customer_id.eq.${userId},assigned_helper_id.eq.${partnerId}),and(customer_id.eq.${partnerId},assigned_helper_id.eq.${userId})`,
      )
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    if (!gigRows || gigRows.length === 0) {
      throw new Error("Mit dieser Person gibt es noch keine gemeinsamen Aufträge.");
    }

    // Die Adresse liefert die Datenbank nur, wo du sie sehen darfst (gig_locations, siehe Adressschutz).
    const withLocations = await attachGigLocations(supabase, gigRows);

    const { data: escrowRows } = await supabase
      .from("escrow_transactions")
      .select("gig_id, state, bid_cents, paid_out_at")
      .in("gig_id", withLocations.map((g) => g.id));
    const escrowByGig = new Map((escrowRows ?? []).map((e) => [e.gig_id, e]));

    const profiles = await fetchProfilesByIds(supabase, [partnerId]);
    const profile = profiles.get(partnerId);

    // Unterhaltung zwischen euch (neueste), falls vorhanden
    const { data: convo } = await supabase
      .from("conversations" as never)
      .select("id")
      .or(
        `and(participant_a.eq.${userId},participant_b.eq.${partnerId}),and(participant_a.eq.${partnerId},participant_b.eq.${userId})`,
      )
      .order("last_message_at", { ascending: false })
      .limit(1);
    const conversationId = ((convo ?? []) as unknown as { id: string }[])[0]?.id ?? null;

    const gigs: PartnerGig[] = withLocations.map((g) => {
      const escrow = escrowByGig.get(g.id);
      return {
        id: g.id,
        title: g.title,
        status: g.status,
        myRole: g.customer_id === userId ? "customer" : "helper",
        scheduledAt: g.scheduled_at,
        durationMinutes: g.duration_minutes,
        budgetCents: g.budget_cents,
        district: g.district,
        address: g.address,
        paymentState: escrow ? String(escrow.state) : null,
        paidOutAt: escrow?.paid_out_at ?? null,
        updatedAt: g.updated_at,
      };
    });

    // Anstehende zuerst (nach Termin), danach Abgeschlossene (neueste zuerst)
    gigs.sort((a, b) => {
      const aa = isActiveStatus(a.status) ? 0 : 1;
      const bb = isActiveStatus(b.status) ? 0 : 1;
      if (aa !== bb) return aa - bb;
      if (aa === 0) return (a.scheduledAt ?? "9999") < (b.scheduledAt ?? "9999") ? -1 : 1;
      return a.updatedAt < b.updatedAt ? 1 : -1;
    });

    const totals = gigs.reduce(
      (t, g) => {
        if (isActiveStatus(g.status)) t.activeCount += 1;
        if (g.status === "completed") {
          t.completedCount += 1;
          if (g.paymentState === "paid_out") t.paidCents += g.budgetCents;
          else if (g.paymentState && g.paymentState !== "cancelled") t.awaitingPaymentCents += g.budgetCents;
        }
        return t;
      },
      { activeCount: 0, completedCount: 0, paidCents: 0, awaitingPaymentCents: 0 },
    );

    const relation: PartnerRelation = gigs.some((g) => g.myRole === "helper") && !gigs.some((g) => g.myRole === "customer")
      ? "customers"
      : "helpers";

    return {
      partner: {
        id: partnerId,
        name: profile?.displayName?.trim() || (relation === "customers" ? "Kunde" : "Helfer"),
        city: profile?.city ?? null,
        verified: !!profile?.verifiedAt,
      },
      relation,
      conversationId,
      totals,
      gigs,
    };
  });

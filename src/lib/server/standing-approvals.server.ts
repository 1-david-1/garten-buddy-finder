// Server-only: Dauerfreigaben der Eltern (weniger Nachfragen).
// Nur aus Server-Function-Handlern importieren (per dynamischem `await import(...)`).
//
// Die Eltern können bei einer Freigabe (oder später im Eltern-Konto) festlegen:
//   - "Für diesen Auftrag nicht mehr fragen"       -> scope "gig"
//   - "Für diesen Auftraggeber immer erlauben"      -> scope "customer"
// Dann werden Gebote und die Auftrags-Freigabe automatisch erteilt, und die Eltern bekommen nur noch eine
// Info-Mail. Baumpflege, gefährliche Geräte, die Uhrzeit-/Dauer-Regeln und die Sperren der Datenbank gelten
// unverändert weiter. Jede Dauerfreigabe kann jederzeit widerrufen werden.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { StandingApproval } from "@/lib/approval-coverage";
import { requiresParentAcknowledgement } from "@/lib/hedge-rules";
import { VerificationError } from "@/lib/server/verification.server";

export type RememberChoice = "none" | "gig" | "customer";

export interface StandingApprovalItem {
  id: string;
  childId: string;
  scope: "customer" | "gig";
  customerId: string | null;
  customerName: string | null;
  gigId: string | null;
  gigTitle: string | null;
  acknowledgesRisky: boolean;
  createdAt: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type StandingRow = {
  id: string;
  guardian_user_id: string;
  child_id: string;
  scope: "customer" | "gig";
  customer_id: string | null;
  gig_id: string | null;
  acknowledges_risky: boolean;
  created_at: string;
};

async function activeLink(childId: string) {
  const { data } = await supabaseAdmin
    .from("guardian_links")
    .select("guardian_user_id, paused_at")
    .eq("child_id", childId)
    .eq("status", "active")
    .maybeSingle();
  return data;
}

/**
 * Gilt für dieses Kind, diesen Auftraggeber und diesen Auftrag eine Dauerfreigabe?
 * Nur solange die Verknüpfung mit den Eltern aktiv und nicht pausiert ist und der Auftraggeber nicht gesperrt ist.
 */
export async function findStandingApproval(
  childId: string,
  customerId: string,
  gigId: string,
): Promise<StandingApproval | null> {
  if (!UUID.test(customerId) || !UUID.test(gigId)) return null;
  const link = await activeLink(childId);
  if (!link || link.paused_at) return null;

  const { data: customer } = await supabaseAdmin
    .from("profiles")
    .select("suspended_at")
    .eq("id", customerId)
    .maybeSingle();
  if (!customer || customer.suspended_at) return null;

  const { data: rows } = await supabaseAdmin
    .from("guardian_standing_approvals")
    .select("id, guardian_user_id, child_id, scope, customer_id, gig_id, acknowledges_risky, created_at")
    .eq("child_id", childId)
    .eq("guardian_user_id", link.guardian_user_id)
    .is("revoked_at", null)
    .or(`gig_id.eq.${gigId},customer_id.eq.${customerId}`);

  const list = (rows ?? []) as unknown as StandingRow[];
  // Eine Auftrags-Freigabe hat Vorrang vor der für den Auftraggeber
  const row = list.find((r) => r.scope === "gig" && r.gig_id === gigId) ?? list.find((r) => r.scope === "customer" && r.customer_id === customerId);
  if (!row) return null;
  return { scope: row.scope, customerId: row.customer_id, gigId: row.gig_id, acknowledgesRisky: row.acknowledges_risky };
}

/** Merkt sich die Wahl der Eltern bei einer Freigabe ("remember"). */
export async function rememberDecision(input: {
  guardianUserId: string;
  childId: string;
  gigId: string;
  customerId: string;
  serviceType: string;
  remember: RememberChoice;
}): Promise<void> {
  if (input.remember === "none") return;
  const link = await activeLink(input.childId);
  if (!link || link.guardian_user_id !== input.guardianUserId) throw new VerificationError("forbidden");
  const risky = requiresParentAcknowledgement(input.serviceType);

  if (input.remember === "gig") {
    const { data: existing } = await supabaseAdmin
      .from("guardian_standing_approvals")
      .select("id, acknowledges_risky")
      .eq("child_id", input.childId)
      .eq("scope", "gig")
      .eq("gig_id", input.gigId)
      .is("revoked_at", null)
      .maybeSingle();
    if (existing) {
      if (risky && !existing.acknowledges_risky) {
        await supabaseAdmin.from("guardian_standing_approvals").update({ acknowledges_risky: true }).eq("id", existing.id);
      }
      return;
    }
    const { error } = await supabaseAdmin.from("guardian_standing_approvals").insert({
      guardian_user_id: input.guardianUserId,
      child_id: input.childId,
      scope: "gig",
      gig_id: input.gigId,
      acknowledges_risky: risky,
    });
    if (error) throw error;
    return;
  }

  await setCustomerStanding({
    guardianUserId: input.guardianUserId,
    childId: input.childId,
    customerId: input.customerId,
    acknowledgesRisky: risky,
  });
}

/** Dauerfreigabe für einen Auftraggeber anlegen oder erweitern (Eltern-Konto). */
export async function setCustomerStanding(input: {
  guardianUserId: string;
  childId: string;
  customerId: string;
  acknowledgesRisky: boolean;
}): Promise<void> {
  const link = await activeLink(input.childId);
  if (!link || link.guardian_user_id !== input.guardianUserId) throw new VerificationError("forbidden");
  if (input.customerId === input.childId) throw new VerificationError("invalid_request");

  const { data: customer } = await supabaseAdmin
    .from("profiles")
    .select("id, suspended_at")
    .eq("id", input.customerId)
    .maybeSingle();
  if (!customer || customer.suspended_at) throw new VerificationError("invalid_request");

  const { data: existing } = await supabaseAdmin
    .from("guardian_standing_approvals")
    .select("id, acknowledges_risky")
    .eq("child_id", input.childId)
    .eq("scope", "customer")
    .eq("customer_id", input.customerId)
    .is("revoked_at", null)
    .maybeSingle();

  if (existing) {
    // Der Haken für Tätigkeiten mit erhöhtem Risiko wird gesetzt oder entfernt, so wie die Eltern es jetzt wünschen
    if (existing.acknowledges_risky !== input.acknowledgesRisky) {
      await supabaseAdmin
        .from("guardian_standing_approvals")
        .update({ acknowledges_risky: input.acknowledgesRisky })
        .eq("id", existing.id);
    }
    return;
  }
  const { error } = await supabaseAdmin.from("guardian_standing_approvals").insert({
    guardian_user_id: input.guardianUserId,
    child_id: input.childId,
    scope: "customer",
    customer_id: input.customerId,
    acknowledges_risky: input.acknowledgesRisky,
  });
  if (error) throw error;
}

/** Dauerfreigabe widerrufen. Danach werden die Eltern wieder wie gewohnt gefragt. */
export async function revokeStandingApproval(guardianUserId: string, id: string): Promise<void> {
  const { data: row } = await supabaseAdmin
    .from("guardian_standing_approvals")
    .select("id, guardian_user_id, revoked_at")
    .eq("id", id)
    .maybeSingle();
  if (!row || row.guardian_user_id !== guardianUserId) throw new VerificationError("forbidden");
  if (row.revoked_at) return;
  const { error } = await supabaseAdmin
    .from("guardian_standing_approvals")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** Aktive Dauerfreigaben eines Kindes für das Eltern-Konto. */
export async function listStandingApprovals(guardianUserId: string, childId: string): Promise<StandingApprovalItem[]> {
  const { data } = await supabaseAdmin
    .from("guardian_standing_approvals")
    .select("id, guardian_user_id, child_id, scope, customer_id, gig_id, acknowledges_risky, created_at")
    .eq("guardian_user_id", guardianUserId)
    .eq("child_id", childId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as unknown as StandingRow[];
  if (rows.length === 0) return [];

  const gigIds = [...new Set(rows.map((r) => r.gig_id).filter((v): v is string => !!v))];
  const { data: gigs } = gigIds.length
    ? await supabaseAdmin.from("gigs").select("id, title, customer_id").in("id", gigIds)
    : { data: [] as { id: string; title: string; customer_id: string }[] };
  const customerIds = [
    ...new Set([
      ...rows.map((r) => r.customer_id).filter((v): v is string => !!v),
      ...(gigs ?? []).map((g) => g.customer_id),
    ]),
  ];
  const { data: profiles } = customerIds.length
    ? await supabaseAdmin.from("profiles").select("id, display_name").in("id", customerIds)
    : { data: [] as { id: string; display_name: string | null }[] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name?.trim() || "Auftraggeber"]));
  const gigById = new Map((gigs ?? []).map((g) => [g.id, g]));

  return rows.map((r) => {
    const gig = r.gig_id ? gigById.get(r.gig_id) : null;
    const customerId = r.customer_id ?? gig?.customer_id ?? null;
    return {
      id: r.id,
      childId: r.child_id,
      scope: r.scope,
      customerId,
      customerName: customerId ? (nameById.get(customerId) ?? null) : null,
      gigId: r.gig_id,
      gigTitle: gig?.title ?? null,
      acknowledgesRisky: r.acknowledges_risky,
      createdAt: r.created_at,
    };
  });
}

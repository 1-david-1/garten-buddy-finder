// Server-only: Wird ein Auftrag, ein Gebot oder eine Buchung abgelehnt, storniert oder nicht freigegeben,
// müssen ALLE Seiten davon erfahren: Kunde, Helfer und - bei Jugendlichen - die Eltern.
// Dieses Modul bündelt (1) das Freigeben des Auftrags, wenn der Helfer ausfällt, und (2) die Benachrichtigungen.
// Nur aus Server-Function-Handlern importieren (dynamisch).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { emailTemplate, escapeHtml } from "@/lib/server/email.server";
import { notifyUserByEmail } from "@/lib/server/notifications.server";

export async function isYouthUser(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).some((r) => r.role === "helper_youth");
}

async function displayName(userId: string, fallback: string): Promise<string> {
  const { data } = await supabaseAdmin.from("profiles").select("display_name").eq("id", userId).maybeSingle();
  return data?.display_name?.trim() || fallback;
}

export type RefusalOutcome = "reopened" | "cancelled" | "none";

/**
 * Der zugewiesene Helfer fällt aus (Eltern lehnen ab / ziehen die Freigabe zurück): Der Auftrag bleibt nicht
 * im Schwebezustand "wartet auf Helfer", sondern
 *  - war der Preis über ein Gebot vereinbart: geht zurück auf "offen" (andere Helfer können bieten),
 *  - war es eine Direktbuchung: wird abgebrochen (der Kunde wollte genau diesen Helfer).
 */
export async function releaseGigAfterRefusal(gigId: string, helperId: string): Promise<RefusalOutcome> {
  const { data: gig } = await supabaseAdmin
    .from("gigs")
    .select("id, status, assigned_helper_id")
    .eq("id", gigId)
    .maybeSingle();
  if (!gig || gig.assigned_helper_id !== helperId || !["pending_helper", "assigned"].includes(gig.status)) {
    return "none";
  }

  const { data: accepted } = await supabaseAdmin
    .from("negotiations")
    .select("id")
    .eq("gig_id", gigId)
    .eq("helper_id", helperId)
    .eq("status", "accepted");

  let outcome: RefusalOutcome;
  if ((accepted ?? []).length > 0) {
    await supabaseAdmin
      .from("negotiations")
      .update({ status: "withdrawn" })
      .eq("gig_id", gigId)
      .eq("helper_id", helperId)
      .eq("status", "accepted");
    await supabaseAdmin.from("gigs").update({ status: "open", assigned_helper_id: null }).eq("id", gigId);
    outcome = "reopened";
  } else {
    await supabaseAdmin
      .from("gigs")
      .update({
        status: "cancelled",
        cancellation_reason: "Die Eltern des Helfers haben den Auftrag nicht freigegeben.",
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", gigId);
    outcome = "cancelled";
  }
  // Noch nicht bezahlter Zahlungsvorgang entfällt.
  await supabaseAdmin.from("escrow_transactions").delete().eq("gig_id", gigId).eq("state", "pending");
  return outcome;
}

/** Die Eltern haben nicht zugestimmt: Der Kunde erfährt, dass der Helfer den Auftrag nicht übernehmen kann. */
export async function notifyCustomerGuardianRefused(input: {
  customerId: string;
  title: string;
  outcome: RefusalOutcome;
}) {
  const t = escapeHtml(input.title);
  const next =
    input.outcome === "reopened"
      ? "Dein Auftrag ist wieder offen, andere Helfer können dir ein Gebot machen."
      : input.outcome === "cancelled"
        ? "Die Buchung wurde deshalb abgebrochen. Du kannst einen anderen Helfer buchen."
        : "";
  await notifyUserByEmail({
    userId: input.customerId,
    category: "gig_updates",
    subject: `Der Helfer kann den Auftrag nicht übernehmen: ${input.title}`,
    html: emailTemplate({
      heading: "Der Helfer kann den Auftrag nicht übernehmen",
      bodyLines: [
        `Für „${t}“ liegt leider keine Freigabe der Eltern des jugendlichen Helfers vor. ${next}`,
      ],
      ctaLabel: "Zu meinen Aufträgen",
      ctaPath: "/my-gigs",
    }),
    inApp: {
      title: "Helfer kann den Auftrag nicht übernehmen",
      body: `„${input.title}“: keine Freigabe der Eltern. ${next}`,
      link: "/my-gigs",
    },
  });
}

export type GuardianRefusalKind = "bid" | "booking" | "cancel";

/**
 * Eltern informieren, wenn jemand anderes (Kunde oder das Kind selbst) etwas ablehnt, zurückzieht oder
 * storniert, das ihr Kind betrifft. Passiert nichts, wenn der Helfer kein Jugendlicher mit Eltern-Konto ist.
 */
export async function notifyGuardiansAboutRefusal(input: {
  childId: string;
  title: string;
  by: "customer" | "helper";
  kind: GuardianRefusalKind;
  reason?: string | null;
}) {
  const { data: link } = await supabaseAdmin
    .from("guardian_links")
    .select("guardian_user_id")
    .eq("child_id", input.childId)
    .eq("status", "active")
    .maybeSingle();
  if (!link?.guardian_user_id) return;

  const child = await displayName(input.childId, "Ihr Kind");
  const t = escapeHtml(input.title);
  const c = escapeHtml(child);
  const reason = input.reason?.trim() ? ` Grund: ${escapeHtml(input.reason.trim())}` : "";

  let heading: string;
  let body: string;
  if (input.by === "customer") {
    heading = input.kind === "cancel" ? "Ein Auftrag Ihres Kindes wurde storniert" : "Ein Gebot Ihres Kindes wurde abgelehnt";
    body =
      input.kind === "cancel"
        ? `Der Auftraggeber hat „${t}“ storniert (Helfer: ${c}).${reason}`
        : `Der Auftraggeber hat das Gebot von ${c} für „${t}“ abgelehnt.`;
  } else {
    heading =
      input.kind === "cancel"
        ? "Ihr Kind hat einen Auftrag storniert"
        : input.kind === "booking"
          ? "Ihr Kind hat eine Buchungsanfrage abgelehnt"
          : "Ihr Kind hat ein Gebot zurückgezogen";
    body =
      input.kind === "cancel"
        ? `${c} hat „${t}“ storniert.${reason}`
        : input.kind === "booking"
          ? `${c} hat die Buchungsanfrage für „${t}“ abgelehnt.`
          : `${c} hat das Gebot für „${t}“ zurückgezogen.`;
  }

  await notifyUserByEmail({
    userId: link.guardian_user_id,
    category: "gig_updates",
    subject: heading,
    html: emailTemplate({
      badge: "Eltern-Konto",
      heading,
      bodyLines: [body],
      ctaLabel: "Zum Eltern-Konto",
      ctaPath: "/eltern",
    }),
    inApp: { title: heading, body: input.title, link: "/eltern" },
  });
}

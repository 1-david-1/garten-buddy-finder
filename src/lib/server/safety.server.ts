// Server-only: Sperren verhängen, Betroffene und Eltern informieren, Sicherheits-Abbruch melden.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { emailTemplate, sendEmail } from "@/lib/server/email.server";
import { notifyUserByEmail } from "@/lib/server/notifications.server";
import { escapeHtml } from "@/lib/server/verification.server";

const KIND_LABEL: Record<string, string> = {
  review_hold: "vorübergehend gesperrt, solange eine Prüfung läuft",
  job_ban: "für Aufträge gesperrt (erstellen, veröffentlichen, annehmen, bieten)",
  communication_ban: "für Nachrichten und neue Kontakte gesperrt",
  youth_profile: "als Minderjährigenprofil gesperrt",
  account: "vollständig gesperrt",
  permanent: "dauerhaft gesperrt",
};

async function guardianEmailsOf(childId: string): Promise<string[]> {
  const { data: link } = await supabaseAdmin
    .from("guardian_links")
    .select("guardian_user_id")
    .eq("child_id", childId)
    .eq("status", "active")
    .maybeSingle();
  if (!link?.guardian_user_id) return [];
  const { data } = await supabaseAdmin.auth.admin.getUserById(link.guardian_user_id);
  return data?.user?.email ? [data.user.email] : [];
}

/**
 * Verhängt eine Sperre. Die betroffene Person erhält eine verständliche Information; bei
 * Minderjährigenprofilen werden auch die Eltern informiert. Den internen Grund nennen wir nicht,
 * damit keine Untersuchung gefährdet wird.
 */
export async function applyRestriction(input: {
  userId: string;
  kind: string;
  reason?: string;
  actorId: string;
}) {
  const { error } = await supabaseAdmin.from("account_restrictions").insert({
    user_id: input.userId,
    kind: input.kind,
    reason: input.reason || null,
    source: "team",
    created_by: input.actorId,
  });
  if (error) throw error;

  const label = KIND_LABEL[input.kind] ?? "eingeschränkt";
  await notifyUserByEmail({
    userId: input.userId,
    category: "gig_updates",
    subject: "Dein GreenMatch-Konto wurde eingeschränkt",
    html: emailTemplate({
      heading: "Dein Konto wurde eingeschränkt",
      bodyLines: [
        `Dein Konto ist derzeit ${label}.`,
        "Aus Sicherheitsgründen nennen wir hier keine Einzelheiten. Wenn du Fragen hast oder die Einschränkung für einen Irrtum hältst, melde dich bitte beim GreenMatch-Team.",
      ],
    }),
    inApp: { title: "Dein Konto wurde eingeschränkt", body: `Dein Konto ist derzeit ${label}.` },
  });

  const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", input.userId);
  if ((roles ?? []).some((r) => r.role === "helper_youth")) {
    const [{ data: child }, recipients] = await Promise.all([
      supabaseAdmin.from("profiles").select("display_name").eq("id", input.userId).maybeSingle(),
      guardianEmailsOf(input.userId),
    ]);
    const name = child?.display_name?.trim() || "Ihr Kind";
    await Promise.all(
      recipients.map((to) =>
        sendEmail({
          to,
          subject: `Das GreenMatch-Konto von ${name} wurde eingeschränkt`,
          html: emailTemplate({
            heading: "Konto Ihres Kindes eingeschränkt",
            bodyLines: [
              `Das Konto von <strong>${escapeHtml(name)}</strong> ist derzeit ${label}.`,
              "Bei Fragen wenden Sie sich bitte an das GreenMatch-Team. Bei akuter Gefahr: Notruf 112.",
            ],
            ctaLabel: "Zum Eltern-Konto",
            ctaPath: "/eltern",
            footer: "Sie erhalten diese E-Mail, weil Ihr Kind bei GreenMatch mit Ihrem Eltern-Konto verknüpft ist.",
          }),
        }),
      ),
    );
  }
}

/** Informiert nach einem Sicherheits-Abbruch die andere Seite und - bei Jugendlichen - die Eltern. */
export async function notifySafetyAbort(input: {
  gig: { id: string; title: string; customer_id: string; assigned_helper_id: string | null };
  actorId: string;
}) {
  const { gig, actorId } = input;
  const otherId = actorId === gig.customer_id ? gig.assigned_helper_id : gig.customer_id;
  const title = escapeHtml(gig.title);

  // Echtzeit-Hinweis ans Team (nur IDs, keine Details), falls ein Alert-Webhook eingerichtet ist.
  const { sendSecurityAlert } = await import("@/lib/server/alert.server");
  await sendSecurityAlert("Sicherheits-Abbruch eines Auftrags", { gig_id: gig.id, abgebrochen_von: actorId });

  if (otherId) {
    await notifyUserByEmail({
      userId: otherId,
      category: "gig_updates",
      subject: `Auftrag abgebrochen: ${gig.title}`,
      html: emailTemplate({
        heading: "Ein Auftrag wurde abgebrochen",
        bodyLines: [`„${title}“ wurde aus Sicherheitsgründen abgebrochen.`],
      }),
      inApp: { title: "Auftrag abgebrochen", body: gig.title },
    });
  }

  if (gig.assigned_helper_id) {
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", gig.assigned_helper_id);
    if ((roles ?? []).some((r) => r.role === "helper_youth")) {
      const [{ data: child }, recipients] = await Promise.all([
        supabaseAdmin.from("profiles").select("display_name").eq("id", gig.assigned_helper_id).maybeSingle(),
        guardianEmailsOf(gig.assigned_helper_id),
      ]);
      const name = child?.display_name?.trim() || "Ihr Kind";
      await Promise.all(
        recipients.map((to) =>
          sendEmail({
            to,
            subject: `Sicherheitsabbruch: ${name} – ${gig.title}`,
            html: emailTemplate({
              heading: "Auftrag aus Sicherheitsgründen abgebrochen",
              bodyLines: [
                `Der Auftrag „${title}“ wurde aus Sicherheitsgründen abgebrochen (${actorId === gig.assigned_helper_id ? "von Ihrem Kind" : "vom Auftraggeber"}).`,
                "Bitte sprechen Sie mit Ihrem Kind. Im Eltern-Konto können Sie den Auftraggeber melden oder blockieren und das Konto pausieren. Bei akuter Gefahr: Notruf 112.",
              ],
              ctaLabel: "Zum Eltern-Konto",
              ctaPath: "/eltern",
              footer: "Sie erhalten diese E-Mail, weil Ihr Kind bei GreenMatch mit Ihrem Eltern-Konto verknüpft ist.",
            }),
          }),
        ),
      );
    }
  }
}

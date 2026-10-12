import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminAuth } from "@/lib/admin-middleware";

/**
 * Admin: Ausweisprüfung (Erwachsene, Profis, Auftraggeber).
 * Das Team sieht die geschwärzte Ausweiskopie über einen kurzlebigen Link, prüft Name, Geburtsdatum
 * und Wohnort und entscheidet. Danach wird die Kopie gelöscht; gespeichert bleiben nur
 * Prüfergebnis (profiles.verified_at), Prüfdatum und Prüfverfahren (verification_method).
 */

const BUCKET = "verification-docs";

type StoredDocuments = { files?: Record<string, string>; deletedAt?: string };

export interface IdentityVerificationItem {
  requestId: string;
  userId: string;
  displayName: string;
  city: string | null;
  roles: string[];
  note: string | null;
  submittedAt: string;
  document: { url: string | null; isPdf: boolean } | null;
}

export const listIdentityVerifications = createServerFn({ method: "GET" })
  .middleware([requireAdminAuth])
  .handler(async (): Promise<{ items: IdentityVerificationItem[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: requests, error } = await supabaseAdmin
      .from("verification_requests")
      .select("id, user_id, created_at, note, documents")
      .eq("kind", "identity")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (error) throw error;

    const items: IdentityVerificationItem[] = [];
    for (const r of requests ?? []) {
      const docs = (r.documents ?? {}) as StoredDocuments;
      const path = docs.files?.identity_id;
      const [{ data: profile }, { data: roles }, signed] = await Promise.all([
        supabaseAdmin.from("profiles").select("display_name, city").eq("id", r.user_id).maybeSingle(),
        supabaseAdmin.from("user_roles").select("role").eq("user_id", r.user_id),
        path ? supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, 600) : Promise.resolve(null),
      ]);
      items.push({
        requestId: r.id,
        userId: r.user_id,
        displayName: profile?.display_name?.trim() || "—",
        city: profile?.city ?? null,
        roles: (roles ?? []).map((x) => x.role),
        note: r.note,
        submittedAt: r.created_at,
        document: path
          ? { url: signed?.data?.signedUrl ?? null, isPdf: path.toLowerCase().endsWith(".pdf") }
          : null,
      });
    }
    return { items };
  });

export const decideIdentityVerification = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        requestId: z.string().uuid(),
        decision: z.enum(["approve", "reject"]),
        reason: z.string().trim().max(300).optional(),
        /** Prüfer bestätigt: keine Ausweisnummer/MRZ/Anschrift sichtbar (Pflicht bei Freigabe) */
        redactionChecked: z.boolean().optional(),
        /** Ausweisnummer, MRZ o. ä. sichtbar -> Ablehnung mit Standardgrund, Kopie wird gelöscht */
        unredacted: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { emailTemplate } = await import("@/lib/server/email.server");
    const { notifyUserByEmail } = await import("@/lib/server/notifications.server");

    const { data: request } = await supabaseAdmin
      .from("verification_requests")
      .select("id, user_id, status, documents")
      .eq("id", data.requestId)
      .eq("kind", "identity")
      .maybeSingle();
    if (!request || request.status !== "pending") throw new Error("not_pending");
    if (data.decision === "approve" && !data.redactionChecked) throw new Error("redaction_not_checked");
    if (data.decision === "reject" && data.unredacted) {
      data.reason =
        "Auf der Kopie sind nicht benötigte Angaben sichtbar (z. B. Ausweisnummer, Seriennummer, maschinenlesbare Zone oder Anschrift). Bitte schwärze sie dauerhaft und lade die Kopie erneut hoch.";
    }
    if (data.decision === "reject" && !data.reason) throw new Error("reason_required");

    const nowIso = new Date().toISOString();
    if (data.decision === "approve") {
      // Prüfergebnis, Prüfdatum und Prüfverfahren - mehr bleibt nicht gespeichert.
      const { error } = await supabaseAdmin
        .from("profiles")
        .update({ verified_at: nowIso, verification_method: "admin_review" })
        .eq("id", request.user_id);
      if (error) throw error;
    }

    const { error: updateError } = await supabaseAdmin
      .from("verification_requests")
      .update({
        status: data.decision === "approve" ? "approved" : "declined",
        decided_at: nowIso,
        note: data.decision === "reject" ? data.reason : null,
      })
      .eq("id", request.id);
    if (updateError) throw updateError;

    // Datensparsames Prüfergebnis: nur Status, geprüfte Rolle, Altersstatus, Datum, Verfahren.
    const [{ data: roleRows }, { data: guardianRow }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("role").eq("user_id", request.user_id),
      supabaseAdmin
        .from("guardian_links")
        .select("id")
        .eq("guardian_user_id", request.user_id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle(),
    ]);
    const checkedRole = guardianRow ? "guardian" : ((roleRows ?? [])[0]?.role ?? null);
    await supabaseAdmin.from("verification_results").upsert(
      {
        user_id: request.user_id,
        status: data.decision === "approve" ? "verified" : "rejected",
        checked_role: checkedRole,
        age_status: "adult",
        checked_at: nowIso,
        method: "id_document_review",
        document_deleted_at: nowIso,
      },
      { onConflict: "user_id" },
    );

    // Ausweiskopie löschen (Datensparsamkeit) - bei Freigabe UND Ablehnung.
    const docs = (request.documents ?? {}) as StoredDocuments;
    const paths = Object.values(docs.files ?? {});
    if (paths.length > 0) {
      const { error: removeError } = await supabaseAdmin.storage.from(BUCKET).remove(paths);
      if (!removeError) {
        await supabaseAdmin
          .from("verification_requests")
          .update({ documents: { deletedAt: nowIso } })
          .eq("id", request.id);
      }
    }

    await context.supabase.rpc("log_admin_action", {
      _action: data.decision === "approve" ? "user.verify" : "user.verify_rejected",
      _target_type: "user",
      _target_id: request.user_id,
      _metadata: null,
    });

    const approved = data.decision === "approve";
    await notifyUserByEmail({
      userId: request.user_id,
      category: "gig_updates",
      subject: approved ? "Deine Ausweisprüfung ist abgeschlossen" : "Ausweisprüfung: bitte erneut einreichen",
      html: emailTemplate({
        heading: approved ? "Du bist verifiziert" : "Wir konnten dich noch nicht verifizieren",
        bodyLines: approved
          ? [
              "Wir haben deine Identitäts- und Altersdaten anhand deines Ausweises geprüft. Die hochgeladene Kopie wurde gelöscht; gespeichert bleiben nur Ergebnis, Prüfdatum und Prüfverfahren.",
              "Wichtig: Die Ausweisprüfung bedeutet nicht, dass eine Person vollständig auf ihre Zuverlässigkeit oder persönliche Eignung geprüft wurde.",
            ]
          : [
              `Leider hat die Prüfung nicht geklappt: ${data.reason}`,
              "Du kannst eine neue Kopie hochladen. Die alte Kopie wurde gelöscht.",
            ],
        ctaLabel: "Zum Profil",
        ctaPath: "/profile",
      }),
      inApp: {
        title: approved ? "Du bist verifiziert" : "Ausweisprüfung nicht bestanden",
        body: approved ? undefined : data.reason,
        link: "/profile",
      },
    });
    return { ok: true as const };
  });

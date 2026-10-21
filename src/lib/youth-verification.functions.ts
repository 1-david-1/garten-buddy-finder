import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdminAuth } from "@/lib/admin-middleware";

/**
 * Verifizierung Jugendlicher (13-17) über Unterlagen:
 * Einverständniserklärung der Eltern + Ausweise (Eltern und Kind, je Vorder-/Rückseite).
 * Das Team prüft und verifiziert; erst dann gelten die Sperren für Jugendliche als aufgehoben.
 * Zusätzlich ist ein verknüpftes Eltern-Konto Pflicht (siehe guardian.functions.ts): ohne aktive
 * Verknüpfung kann nicht freigegeben werden.
 */

export const YOUTH_DOC_BUCKET = "verification-docs";
export const YOUTH_DOC_KEYS = [
  "consent",
  "parent_id_front",
  "parent_id_back",
  "child_id_front",
  "child_id_back",
] as const;
export type YouthDocKey = (typeof YOUTH_DOC_KEYS)[number];

/**
 * true  = Dateien werden nach der Entscheidung (Freigabe ODER Ablehnung) gelöscht.
 *         Nur die Tatsache der Prüfung bleibt (Datensparsamkeit).
 * false = Dateien bleiben im Bucket liegen.
 */
const DELETE_DOCS_AFTER_REVIEW = true;

type StoredDocuments = {
  guardianName?: string;
  /** Angaben zum Zeitpunkt der Einreichung für den manuellen Abgleich durch das Team. */
  childName?: string;
  childBirthdate?: string;
  guardianEmail?: string;
  guardianAccount?: { name: string | null; email: string | null } | null;
  submissionId?: string;
  files?: Partial<Record<YouthDocKey, string>>;
  deletedAt?: string;
};

// ---------------------------------------------------------------------------
// Jugendliche/r: Unterlagen einreichen (Dateien sind vorher direkt in den privaten
// Bucket hochgeladen worden, Ordner = <userId>/<submissionId>/)
// ---------------------------------------------------------------------------
export const submitYouthVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        submissionId: z.string().uuid(),
        guardianName: z.string().trim().min(2).max(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { enforceUserRateLimit } = await import("@/lib/server/rate-limit.server");
    await enforceUserRateLimit(context.userId, "youth_submit", 10, 86400);
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assertServiceRole } = await import("@/lib/server/service-role.server");
    await assertServiceRole();

    const [{ data: roles }, { data: profile }, { data: privateProfile }, { data: guardianLink }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase
        .from("profiles")
        .select("verified_at, display_name")
        .eq("id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("profile_private")
        .select("birthdate, guardian_email")
        .eq("id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("guardian_links")
        .select("guardian_user_id, invited_email")
        .eq("child_id", userId)
        .in("status", ["invited", "active"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (!(roles ?? []).some((r) => r.role === "helper_youth")) throw new Error("not_youth");
    if (profile?.verified_at) throw new Error("already_verified");

    const { data: pending } = await supabaseAdmin
      .from("verification_requests")
      .select("id")
      .eq("user_id", userId)
      .eq("kind", "youth_documents")
      .eq("status", "pending")
      .maybeSingle();
    if (pending) throw new Error("already_pending");

    const folder = `${userId}/${data.submissionId}`;
    const { data: listed, error: listError } = await supabaseAdmin.storage
      .from(YOUTH_DOC_BUCKET)
      .list(folder);
    if (listError) throw listError;

    const files: Partial<Record<YouthDocKey, string>> = {};
    for (const key of YOUTH_DOC_KEYS) {
      const match = (listed ?? []).find((f) => f.name.startsWith(`${key}.`));
      if (match) files[key] = `${folder}/${match.name}`;
    }
    const missing = YOUTH_DOC_KEYS.filter((k) => !files[k]);
    if (missing.length > 0) throw new Error(`missing_documents:${missing.join(",")}`);

    const guardianEmail = privateProfile?.guardian_email ?? guardianLink?.invited_email ?? null;
    let guardianAccount: StoredDocuments["guardianAccount"] = null;
    if (guardianLink?.guardian_user_id) {
      const [{ data: guardianProfile }, { data: guardianAuth }] = await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("display_name")
          .eq("id", guardianLink.guardian_user_id)
          .maybeSingle(),
        supabaseAdmin.auth.admin.getUserById(guardianLink.guardian_user_id),
      ]);
      guardianAccount = {
        name: guardianProfile?.display_name?.trim() || null,
        email: guardianAuth?.user?.email ?? guardianLink.invited_email ?? null,
      };
    }

    const documents: StoredDocuments = {
      guardianName: data.guardianName,
      childName: profile?.display_name?.trim() || undefined,
      childBirthdate: privateProfile?.birthdate ?? undefined,
      guardianEmail: guardianEmail ?? undefined,
      guardianAccount,
      submissionId: data.submissionId,
      files,
    };
    const { error } = await supabaseAdmin.from("verification_requests").insert({
      user_id: userId,
      kind: "youth_documents",
      status: "pending",
      guardian_email: guardianEmail,
      documents,
    });
    // Eine Datenbank, auf der die Migration für Jugend-Unterlagen noch nicht
    // ausgeführt wurde, kennt diesen Wert in der CHECK-Constraint nicht.
    // Der Fehlercode bleibt für die Oberfläche absichtlich stabil und wird
    // dort als konkrete Einrichtungsanweisung angezeigt.
    if (
      error?.code === "23514" &&
      error.message.includes("verification_requests_kind_check")
    ) {
      throw new Error("verification_schema_outdated");
    }
    if (error) throw error;
    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// Admin: offene Prüfungen mit kurzlebigen Links zu den Dateien
// ---------------------------------------------------------------------------
export interface YouthVerificationItem {
  requestId: string;
  userId: string;
  childName: string;
  statedBirthdate: string | null;
  guardianName: string;
  guardianEmail: string | null;
  /** Verknüpftes Eltern-Konto (Name und Login-E-Mail) - zum Abgleich mit den Ausweisen */
  guardianAccount: { name: string; email: string | null } | null;
  submittedAt: string;
  documents: { key: YouthDocKey; url: string | null; isPdf: boolean }[];
}

export const listYouthVerifications = createServerFn({ method: "GET" })
  .middleware([requireAdminAuth])
  .handler(async (): Promise<{ items: YouthVerificationItem[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: requests, error } = await supabaseAdmin
      .from("verification_requests")
      .select("id, user_id, created_at, guardian_email, documents")
      .eq("kind", "youth_documents")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (error) throw error;

    const items: YouthVerificationItem[] = [];
    for (const r of requests ?? []) {
      const docs = (r.documents ?? {}) as StoredDocuments;
      const [{ data: profile }, { data: priv }, { data: link }] = await Promise.all([
        supabaseAdmin.from("profiles").select("display_name").eq("id", r.user_id).maybeSingle(),
        supabaseAdmin
          .from("profile_private")
          .select("birthdate, guardian_email")
          .eq("id", r.user_id)
          .maybeSingle(),
        supabaseAdmin
          .from("guardian_links")
          .select("guardian_user_id, invited_email")
          .eq("child_id", r.user_id)
          .eq("status", "active")
          .maybeSingle(),
      ]);

      let guardianAccount: YouthVerificationItem["guardianAccount"] = docs.guardianAccount?.name
        ? {
            name: docs.guardianAccount.name,
            email: docs.guardianAccount.email,
          }
        : null;
      if (link?.guardian_user_id) {
        const [{ data: gp }, { data: gAuth }] = await Promise.all([
          supabaseAdmin.from("profiles").select("display_name").eq("id", link.guardian_user_id).maybeSingle(),
          supabaseAdmin.auth.admin.getUserById(link.guardian_user_id),
        ]);
        guardianAccount = {
          name: gp?.display_name?.trim() || "—",
          email: gAuth?.user?.email ?? null,
        };
      }

      const paths = YOUTH_DOC_KEYS.map((k) => docs.files?.[k]).filter((p): p is string => !!p);
      const { data: signed } = await supabaseAdmin.storage
        .from(YOUTH_DOC_BUCKET)
        .createSignedUrls(paths, 600);
      const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

      items.push({
        requestId: r.id,
        userId: r.user_id,
        childName: docs.childName ?? profile?.display_name?.trim() ?? "—",
        statedBirthdate: docs.childBirthdate ?? priv?.birthdate ?? null,
        guardianName: docs.guardianName ?? "—",
        guardianEmail:
          r.guardian_email ?? docs.guardianEmail ?? priv?.guardian_email ?? link?.invited_email ?? null,
        guardianAccount,
        submittedAt: r.created_at,
        documents: YOUTH_DOC_KEYS.map((key) => {
          const path = docs.files?.[key];
          return {
            key,
            url: path ? (urlByPath.get(path) ?? null) : null,
            isPdf: !!path && path.toLowerCase().endsWith(".pdf"),
          };
        }),
      });
    }
    return { items };
  });

export const decideYouthVerification = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        requestId: z.string().uuid(),
        decision: z.enum(["approve", "reject"]),
        reason: z.string().trim().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { notifyUserByEmail } = await import("@/lib/server/notifications.server");
    const { emailTemplate, escapeHtml } = await import("@/lib/server/email.server");

    const { data: request } = await supabaseAdmin
      .from("verification_requests")
      .select("id, user_id, status, documents")
      .eq("id", data.requestId)
      .eq("kind", "youth_documents")
      .maybeSingle();
    if (!request) throw new Error("not_found");
    if (request.status !== "pending") throw new Error("already_decided");
    if (data.decision === "reject" && !data.reason) throw new Error("reason_required");

    // Pflicht: Eltern-Zusatzkonto muss verknüpft sein, sonst keine Freigabe.
    if (data.decision === "approve") {
      const { data: link } = await supabaseAdmin
        .from("guardian_links")
        .select("id")
        .eq("child_id", request.user_id)
        .eq("status", "active")
        .maybeSingle();
      if (!link) throw new Error("guardian_account_missing");
    }

    const nowIso = new Date().toISOString();
    const docs = (request.documents ?? {}) as StoredDocuments;
    const approved = data.decision === "approve";

    if (approved) {
      const { error } = await supabaseAdmin
        .from("profiles")
        .update({ verified_at: nowIso, verification_method: "guardian_consent" })
        .eq("id", request.user_id);
      if (error) throw error;
    }

    // Datensparsam: nur Ergebnis, geprüfte Rolle, Altersstatus, Datum und Verfahren bleiben.
    await supabaseAdmin.from("verification_results").upsert(
      {
        user_id: request.user_id,
        status: approved ? "verified" : "rejected",
        checked_role: "helper_youth",
        age_status: "minor_13_17",
        checked_at: nowIso,
        method: "guardian_consent_documents",
        document_deleted_at: DELETE_DOCS_AFTER_REVIEW ? nowIso : null,
      },
      { onConflict: "user_id" },
    );

    let remaining: StoredDocuments = docs;
    if (DELETE_DOCS_AFTER_REVIEW) {
      const paths = Object.values(docs.files ?? {}).filter((p): p is string => !!p);
      if (paths.length > 0) {
        const { error } = await supabaseAdmin.storage.from(YOUTH_DOC_BUCKET).remove(paths);
        if (error) throw error;
      }
      remaining = { guardianName: docs.guardianName, deletedAt: nowIso };
    }

    await supabaseAdmin
      .from("verification_requests")
      .update({
        status: approved ? "approved" : "declined",
        decided_at: nowIso,
        note: approved ? null : data.reason,
        documents: remaining,
      })
      .eq("id", request.id);

    {
      const { error: auditError } = await context.supabase.rpc("log_admin_action", {
        _action: approved ? "user.verify_youth" : "user.verify_youth_rejected",
        _target_type: "user",
        _target_id: request.user_id,
        _metadata: null,
      });
      if (auditError) throw new Error(`audit_log_failed: ${auditError.message}`);
    }

    await notifyUserByEmail({
      userId: request.user_id,
      category: "gig_updates",
      subject: approved ? "Du bist verifiziert" : "Deine Unterlagen müssen noch ergänzt werden",
      html: emailTemplate({
        heading: approved ? "Verifizierung abgeschlossen" : "Bitte reiche die Unterlagen erneut ein",
        bodyLines: [
          approved
            ? "Wir haben deine Unterlagen geprüft. Du bist jetzt verifiziert und kannst bieten und Angebote einstellen. Für jeden einzelnen Auftrag fragen wir zusätzlich deine Eltern in ihrem Eltern-Konto."
            : `Wir konnten deine Unterlagen leider nicht bestätigen. Grund: ${escapeHtml(data.reason ?? "")}. Du kannst sie im Profil erneut einreichen.`,
        ],
        ctaLabel: approved ? "Zum Dashboard" : "Zum Profil",
        ctaPath: approved ? "/dashboard" : "/profile",
      }),
      inApp: {
        title: approved ? "Du bist verifiziert" : "Unterlagen nicht bestätigt",
        body: approved ? "Du kannst jetzt bieten." : (data.reason ?? ""),
        link: "/profile",
      },
    });

    return { ok: true as const };
  });

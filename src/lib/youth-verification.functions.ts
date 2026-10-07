import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdminAuth } from "@/lib/admin-middleware";

/**
 * Verifizierung Jugendlicher (13-17) über Unterlagen:
 * Einverständniserklärung der Eltern + Ausweise (Eltern und Kind, je Vorder-/Rückseite).
 * Das Team prüft und verifiziert; erst dann gelten die Sperren für Jugendliche als aufgehoben.
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
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: roles }, { data: profile }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("profiles").select("verified_at").eq("id", userId).maybeSingle(),
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

    const documents: StoredDocuments = {
      guardianName: data.guardianName,
      submissionId: data.submissionId,
      files,
    };
    const { error } = await supabaseAdmin.from("verification_requests").insert({
      user_id: userId,
      kind: "youth_documents",
      status: "pending",
      documents,
    });
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
  submittedAt: string;
  documents: { key: YouthDocKey; url: string | null; isPdf: boolean }[];
}

export const listYouthVerifications = createServerFn({ method: "GET" })
  .middleware([requireAdminAuth])
  .handler(async (): Promise<{ items: YouthVerificationItem[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: requests, error } = await supabaseAdmin
      .from("verification_requests")
      .select("id, user_id, created_at, documents")
      .eq("kind", "youth_documents")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (error) throw error;

    const items: YouthVerificationItem[] = [];
    for (const r of requests ?? []) {
      const docs = (r.documents ?? {}) as StoredDocuments;
      const [{ data: profile }, { data: priv }] = await Promise.all([
        supabaseAdmin.from("profiles").select("display_name").eq("id", r.user_id).maybeSingle(),
        supabaseAdmin
          .from("profile_private")
          .select("birthdate, guardian_email")
          .eq("id", r.user_id)
          .maybeSingle(),
      ]);

      const paths = YOUTH_DOC_KEYS.map((k) => docs.files?.[k]).filter((p): p is string => !!p);
      const { data: signed } = await supabaseAdmin.storage
        .from(YOUTH_DOC_BUCKET)
        .createSignedUrls(paths, 600);
      const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

      items.push({
        requestId: r.id,
        userId: r.user_id,
        childName: profile?.display_name?.trim() || "—",
        statedBirthdate: priv?.birthdate ?? null,
        guardianName: docs.guardianName ?? "—",
        guardianEmail: priv?.guardian_email ?? null,
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
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { notifyUserByEmail } = await import("@/lib/server/notifications.server");
    const { emailTemplate } = await import("@/lib/server/email.server");

    const { data: request } = await supabaseAdmin
      .from("verification_requests")
      .select("id, user_id, status, documents")
      .eq("id", data.requestId)
      .eq("kind", "youth_documents")
      .maybeSingle();
    if (!request) throw new Error("not_found");
    if (request.status !== "pending") throw new Error("already_decided");
    if (data.decision === "reject" && !data.reason) throw new Error("reason_required");

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

    await notifyUserByEmail({
      userId: request.user_id,
      category: "gig_updates",
      subject: approved ? "Du bist verifiziert" : "Deine Unterlagen müssen noch ergänzt werden",
      html: emailTemplate({
        heading: approved ? "Verifizierung abgeschlossen" : "Bitte reiche die Unterlagen erneut ein",
        bodyLines: [
          approved
            ? "Wir haben deine Unterlagen geprüft. Du bist jetzt verifiziert und kannst bieten und Angebote einstellen. Für jeden einzelnen Auftrag fragen wir zusätzlich deine Eltern."
            : `Wir konnten deine Unterlagen leider nicht bestätigen. Grund: ${(data.reason ?? "").replace(/</g, "&lt;")}. Du kannst sie im Profil erneut einreichen.`,
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

import { createServerFn } from "@tanstack/react-start";
import { requireAdminAuth } from "@/lib/admin-middleware";

/**
 * Admin: Systemstatus. Zeigt, ob Server-Einstellungen und Datenbank-Migrationen vorhanden sind.
 * Typische Ursachen für "klappt nicht": fehlender Service-Schlüssel, nicht ausgeführte Migrationen,
 * fehlender E-Mail-Versand (RESEND_API_KEY), Links auf localhost (PUBLIC_SITE_URL).
 */
export interface SystemCheck {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
  /** Was zu tun ist, wenn der Check fehlschlägt */
  fix?: string;
}

export const getSystemStatus = createServerFn({ method: "GET" })
  .middleware([requireAdminAuth])
  .handler(async (): Promise<{ checks: SystemCheck[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getEmailConfig } = await import("@/lib/server/email.server");
    const { assertServiceRole } = await import("@/lib/server/service-role.server");
    const checks: SystemCheck[] = [];

    // 1. Service-Role-Schlüssel
    try {
      await assertServiceRole();
      checks.push({ key: "service_role", label: "Service-Schlüssel (Admin-Zugriff des Servers)", ok: true, detail: "funktioniert" });
    } catch (e) {
      checks.push({
        key: "service_role",
        label: "Service-Schlüssel (Admin-Zugriff des Servers)",
        ok: false,
        detail: (e as Error).message,
        fix: "SUPABASE_SERVICE_ROLE_KEY in der Hosting-Umgebung setzen (Supabase → Project Settings → API → Secret/service_role Key) und neu deployen.",
      });
    }

    // 2. E-Mail-Versand und Links
    const mail = getEmailConfig();
    checks.push({
      key: "email",
      label: "E-Mail-Versand (Resend)",
      ok: mail.resendConfigured,
      detail: mail.resendConfigured ? `Absender: ${mail.fromAddress}` : "RESEND_API_KEY fehlt - es werden KEINE E-Mails verschickt (Einladungen, Freigaben, Warnungen).",
      fix: mail.resendConfigured ? undefined : "RESEND_API_KEY (und EMAIL_FROM_ADDRESS mit verifizierter Absender-Domain) setzen.",
    });
    checks.push({
      key: "site_url",
      label: "Öffentliche Adresse für Links in E-Mails",
      ok: mail.siteUrlConfigured,
      detail: mail.siteUrlConfigured
        ? mail.effectiveSiteUrl
        : `PUBLIC_SITE_URL fehlt. Aktuell verwendet: ${mail.effectiveSiteUrl} (aus der Anfrage abgeleitet).`,
      fix: mail.siteUrlConfigured ? undefined : "PUBLIC_SITE_URL auf die echte Adresse setzen, z. B. https://deine-domain.de",
    });

    // 3. Speicher für Ausweise/Unterlagen
    try {
      const { data, error } = await supabaseAdmin.storage.getBucket("verification-docs");
      checks.push({
        key: "bucket",
        label: "Speicher für Verifizierungs-Unterlagen",
        ok: !error && Boolean(data),
        detail: error ? error.message : "Bucket vorhanden",
        fix: error ? "Migration 20261007000000_youth_documents.sql ausführen." : undefined,
      });
    } catch (e) {
      checks.push({ key: "bucket", label: "Speicher für Verifizierungs-Unterlagen", ok: false, detail: (e as Error).message });
    }

    // 4. Datenbank-Tabellen und -Spalten der Kinderschutz-Migrationen
    const probes: { table: string; column: string; migration: string }[] = [
      { table: "verification_requests", column: "documents", migration: "20261007" },
      { table: "guardian_links", column: "consent_given_at", migration: "20261008 + 20261009" },
      { table: "user_blocks", column: "blocker_id", migration: "20261008" },
      { table: "user_reports", column: "severity", migration: "20261009" },
      { table: "user_report_events", column: "report_id", migration: "20261009" },
      { table: "account_restrictions", column: "kind", migration: "20261009" },
      { table: "user_consents", column: "kind", migration: "20261009" },
      { table: "gig_safety_confirmations", column: "gig_id", migration: "20261009" },
      { table: "job_consents", column: "job_snapshot", migration: "20261009" },
      { table: "verification_results", column: "status", migration: "20261009" },
      { table: "contact_attempts", column: "user_id", migration: "20261009" },
      { table: "profiles", column: "reverification_required_at", migration: "20261009" },
      { table: "profiles", column: "suspended_at", migration: "20261008" },
    ];
    for (const p of probes) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabaseAdmin as any).from(p.table).select(p.column).limit(1);
      checks.push({
        key: `db_${p.table}_${p.column}`,
        label: `Datenbank: ${p.table}.${p.column}`,
        ok: !error,
        detail: error ? error.message : "vorhanden",
        fix: error ? `Migration ${p.migration} ausführen.` : undefined,
      });
    }

    // 5. Datenbank-Funktionen
    const zero = "00000000-0000-0000-0000-000000000000";
    const rpcs: { name: string; args: Record<string, unknown> }[] = [
      { name: "is_verified", args: { _user_id: zero } },
      { name: "is_restricted", args: { _user_id: zero, _scope: "jobs" } },
      { name: "has_guardian_consent", args: { _user_id: zero } },
      { name: "verification_required", args: {} },
    ];
    for (const r of rpcs) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabaseAdmin as any).rpc(r.name, r.args);
      checks.push({
        key: `rpc_${r.name}`,
        label: `Datenbank-Funktion: ${r.name}()`,
        ok: !error,
        detail: error ? error.message : "vorhanden",
        fix: error ? "Migration 20261009000000_child_protection_round2.sql ausführen." : undefined,
      });
    }

    return { checks };
  });

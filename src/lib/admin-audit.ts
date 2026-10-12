/**
 * Hilfsfunktion: Admin-Aktion ins Audit-Log schreiben (SECURITY-DEFINER-Funktion
 * public.log_admin_action, nur für Admins aufrufbar).
 *
 * Bewusst ohne Server-only-Imports, damit sie in *.functions.ts verwendet werden kann.
 * Ein nicht protokollierter Admin-Eingriff soll nicht unbemerkt bleiben - deshalb wirft
 * die Funktion bei Fehlern (der Eingriff selbst ist dann bereits geschehen).
 */

type AuditMetadata = Record<string, string | number | boolean | null>;

interface AuditRpcClient {
  rpc: (
    fn: "log_admin_action",
    args: {
      _action: string;
      _target_type: string | null;
      _target_id: string | null;
      _metadata: AuditMetadata | null;
    },
  ) => PromiseLike<{ error: { message: string } | null }>;
}

export async function logAdminAction(
  supabase: AuditRpcClient,
  action: string,
  targetType: string,
  targetId: string | null,
  metadata: AuditMetadata | null = null,
): Promise<void> {
  const { error } = await supabase.rpc("log_admin_action", {
    _action: action,
    _target_type: targetType,
    _target_id: targetId,
    _metadata: metadata,
  });
  if (error) throw new Error(`audit_log_failed: ${error.message}`);
}

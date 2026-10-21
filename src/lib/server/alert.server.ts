// Server-only: aktives Alerting bei Sicherheitsereignissen (Audit N5).
//
// Sendet eine kurze Nachricht an einen Webhook (Slack-, Discord-, Teams- oder eigener Endpunkt),
// wenn SECURITY_ALERT_WEBHOOK_URL gesetzt ist. Bewusst ohne personenbezogene Details: nur
// Ereignis-Art und interne IDs, damit das Team im Admin-Bereich nachsehen kann.
// Best effort: Fehler werden nur geloggt und stören den eigentlichen Ablauf nie.

export async function sendSecurityAlert(
  title: string,
  details: Record<string, string | number | boolean | null | undefined> = {},
): Promise<void> {
  const url = typeof process !== "undefined" ? process.env.SECURITY_ALERT_WEBHOOK_URL : undefined;
  if (!url || !url.startsWith("https://")) return;

  const lines = Object.entries(details)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}: ${String(v)}`);
  const text = [`🚨 GreenMatch: ${title}`, ...lines].join("\n").slice(0, 1800);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // "text" für Slack/Teams/eigene Endpunkte, "content" für Discord.
      body: JSON.stringify({ text, content: text }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) console.error("[alert] Webhook antwortete mit Status", res.status);
  } catch (err) {
    console.error("[alert] Webhook nicht erreichbar:", (err as Error).message);
  }
}

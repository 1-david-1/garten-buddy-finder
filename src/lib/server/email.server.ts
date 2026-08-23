// Server-only: E-Mail-Versand via Resend (https://resend.com).
// Nur aus Server-Function-Handlern importieren (idealerweise per dynamischem
// `await import(...)`, siehe client.server.ts), niemals aus Routen/Komponenten.

function getEnv(key: string): string | undefined {
  const fromProcess = typeof process !== "undefined" ? process.env[key] : undefined;
  const fromVite = (import.meta.env as Record<string, string | undefined>)[key];
  return fromProcess || fromVite || undefined;
}

const SITE_URL = getEnv("PUBLIC_SITE_URL") || "http://localhost:3000";

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

/**
 * Versendet eine E-Mail über die Resend-API. Wirft absichtlich nie einen Fehler:
 * Fehlt der API-Key oder schlägt der Request fehl, wird nur geloggt. Eine
 * Benachrichtigung darf niemals eine eigentliche Aktion (Gebot, Zusage, ...)
 * zum Scheitern bringen.
 */
export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<void> {
  const apiKey = getEnv("RESEND_API_KEY");
  if (!apiKey) {
    console.warn(
      `[email] RESEND_API_KEY ist nicht gesetzt - E-Mail wurde NICHT versendet: "${subject}" an ${to}`,
    );
    return;
  }

  const from = getEnv("EMAIL_FROM_ADDRESS") || "GreenMatch <no-reply@greenmatch.app>";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[email] Resend-Versand fehlgeschlagen (${res.status}):`, body);
    }
  } catch (err) {
    console.error("[email] Netzwerkfehler beim E-Mail-Versand:", err);
  }
}

/**
 * Einheitliches, inline-gestyltes HTML-Template für alle Benachrichtigungs-Mails
 * (E-Mail-Clients unterstützen kein externes CSS).
 */
export function emailTemplate(options: {
  heading: string;
  bodyLines: string[];
  ctaLabel?: string;
  ctaPath?: string;
}): string {
  const { heading, bodyLines, ctaLabel, ctaPath } = options;

  const paragraphs = bodyLines
    .map(
      (line) =>
        `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#1f2a24;">${line}</p>`,
    )
    .join("");

  const cta =
    ctaLabel && ctaPath
      ? `<a href="${SITE_URL}${ctaPath}" style="display:inline-block;margin-top:16px;padding:11px 22px;background:#1f8a5c;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">${ctaLabel}</a>`
      : "";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f6f4;">
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:32px 16px;">
      <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;border:1px solid #e3e8e4;">
        <p style="margin:0 0 20px;font-size:12px;font-weight:700;letter-spacing:0.06em;color:#1f8a5c;text-transform:uppercase;">GreenMatch</p>
        <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#12241a;">${heading}</h1>
        ${paragraphs}
        ${cta}
        <p style="margin:28px 0 0;font-size:12px;color:#8a948d;line-height:1.5;">
          Du erhältst diese E-Mail, weil du bei GreenMatch für dieses Ereignis benachrichtigt werden möchtest.
          Du kannst das jederzeit in deinen Profileinstellungen ändern.
        </p>
      </div>
    </div>
  </body>
</html>`;
}

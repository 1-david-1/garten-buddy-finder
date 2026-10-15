// Server-only: E-Mail-Versand via Resend (https://resend.com).
// Nur aus Server-Function-Handlern importieren (idealerweise per dynamischem
// `await import(...)`, siehe client.server.ts), niemals aus Routen/Komponenten.

import { getRequest } from "@tanstack/react-start/server";

function getEnv(key: string): string | undefined {
  const fromProcess = typeof process !== "undefined" ? process.env[key] : undefined;
  const fromVite = (import.meta.env as Record<string, string | undefined>)[key];
  return fromProcess || fromVite || undefined;
}

/**
 * Öffentliche Adresse der App für Links in E-Mails. Reihenfolge:
 * 1. PUBLIC_SITE_URL (empfohlen, in der Hosting-Umgebung setzen)
 * 2. Adresse der aktuellen Anfrage (Proxy-Header oder Origin) - damit Links nicht auf localhost zeigen
 * 3. http://localhost:3000 (nur lokale Entwicklung)
 */
export function getSiteUrl(): string {
  const configured = getEnv("PUBLIC_SITE_URL");
  if (configured) return configured.replace(/\/+$/, "");
  try {
    const req = getRequest();
    const proto = req.headers.get("x-forwarded-proto");
    const host = req.headers.get("x-forwarded-host");
    if (proto && host) return `${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}`;
    const origin = req.headers.get("origin");
    if (origin) return origin;
    return new URL(req.url).origin;
  } catch {
    return "http://localhost:3000";
  }
}

/** Für die Systemstatus-Seite im Admin: ist der E-Mail-Versand eingerichtet? */
export function getEmailConfig() {
  return {
    resendConfigured: Boolean(getEnv("RESEND_API_KEY")),
    fromAddress: getEnv("EMAIL_FROM_ADDRESS") || "GreenMatch <no-reply@greenmatch.app> (Standard)",
    siteUrlConfigured: Boolean(getEnv("PUBLIC_SITE_URL")),
    effectiveSiteUrl: getSiteUrl(),
  };
}

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

/**
 * Versendet eine E-Mail über die Resend-API und liefert zurück, ob sie versendet wurde.
 * Wirft absichtlich nie einen Fehler:
 * Fehlt der API-Key oder schlägt der Request fehl, wird nur geloggt. Eine
 * Benachrichtigung darf niemals eine eigentliche Aktion (Gebot, Zusage, ...)
 * zum Scheitern bringen.
 */
export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<boolean> {
  const apiKey = getEnv("RESEND_API_KEY");
  if (!apiKey) {
    console.warn(
      `[email] RESEND_API_KEY ist nicht gesetzt - E-Mail wurde NICHT versendet: "${subject}" an ${to}`,
    );
    return false;
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
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] Netzwerkfehler beim E-Mail-Versand:", err);
    return false;
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
  /** Absoluter Link für den Button (hat Vorrang vor ctaPath), z. B. Einmal-Anmeldelink */
  ctaUrl?: string;
  /** Eigener Fußzeilen-Text, z.B. für Eltern, die (noch) kein Nutzerkonto haben. */
  footer?: string;
}): string {
  const { heading, bodyLines, ctaLabel, ctaPath, ctaUrl, footer } = options;
  const footerText =
    footer ??
    "Du erhältst diese E-Mail, weil du bei GreenMatch für dieses Ereignis benachrichtigt werden möchtest. Du kannst das jederzeit in deinen Profileinstellungen ändern.";

  const paragraphs = bodyLines
    .map(
      (line) =>
        `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#1f2a24;">${line}</p>`,
    )
    .join("");

  const cta =
    ctaLabel && (ctaPath || ctaUrl)
      ? `<a href="${ctaUrl ?? `${getSiteUrl()}${ctaPath}`}" style="display:inline-block;margin-top:16px;padding:11px 22px;background:#1f8a5c;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">${ctaLabel}</a>`
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
          ${footerText}
        </p>
      </div>
    </div>
  </body>
</html>`;
}

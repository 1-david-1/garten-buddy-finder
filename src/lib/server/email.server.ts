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
    replyToAddress: getEnv("EMAIL_REPLY_TO") || undefined,
    siteUrlConfigured: Boolean(getEnv("PUBLIC_SITE_URL")),
    effectiveSiteUrl: getSiteUrl(),
  };
}

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

/**
 * Versendet eine E-Mail über die Resend-API und liefert zurück, ob sie versendet wurde.
 * Wirft absichtlich nie einen Fehler:
 * Fehlt der API-Key oder schlägt der Request fehl, wird nur geloggt. Eine
 * Benachrichtigung darf niemals eine eigentliche Aktion (Gebot, Zusage, ...)
 * zum Scheitern bringen.
 */
export async function sendEmail({ to, subject, html, replyTo }: SendEmailInput): Promise<boolean> {
  const apiKey = getEnv("RESEND_API_KEY");
  if (!apiKey) {
    console.warn(
      `[email] RESEND_API_KEY ist nicht gesetzt - E-Mail wurde NICHT versendet: "${subject}" an ${to}`,
    );
    return false;
  }

  const from = getEnv("EMAIL_FROM_ADDRESS") || "GreenMatch <no-reply@greenmatch.app>";
  const reply_to = replyTo || getEnv("EMAIL_REPLY_TO") || undefined;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        html,
        ...(reply_to ? { reply_to } : {}),
      }),
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
export interface EmailTemplateOptions {
  /** Hauptüberschrift der E-Mail */
  heading: string;
  /** Optionale persönliche Anrede, z. B. "Guten Tag Frau / Herr Müller," oder "Hallo David," */
  greeting?: string;
  /** Optionaler Badge über der Überschrift, z. B. "Jugendschutz & Freigabe" */
  badge?: string;
  /** Fließtext-Absätze */
  bodyLines: string[];
  /** Optional strukturierte Details (Tätigkeit, Auftraggeber, Ort, Termin, Vergütung, Sicherheit) */
  infoTable?: { label: string; value: string }[];
  /** Optionaler Vertrauens-/Sicherheitshinweis (Grüne Box) */
  trustNotice?: string;
  /** Haupt-Button Beschriftung */
  ctaLabel?: string;
  /** Relativer Pfad für den Hauptbutton */
  ctaPath?: string;
  /** Absoluter Link für den Hauptbutton (hat Vorrang vor ctaPath) */
  ctaUrl?: string;
  /** Optionaler zweiter Button (z. B. "Auftrag ablehnen") */
  secondaryCta?: { label: string; url: string; variant?: "danger" | "neutral" };
  /** Eigener Fußzeilen-Text */
  footer?: string;
  /** Unsichtbarer Vorschautext für die Postfach-Vorschauzeile (Preheader) */
  previewText?: string;
}

/**
 * High-End HTML E-Mail Template im offiziellen GreenMatch Design
 * Optimiert für Apple Mail, Gmail, Outlook (MSO), Thunderbird und Mobile Clients.
 */
export function emailTemplate(options: EmailTemplateOptions): string {
  const {
    heading,
    greeting,
    badge,
    bodyLines,
    infoTable,
    trustNotice,
    ctaLabel,
    ctaPath,
    ctaUrl,
    secondaryCta,
    footer,
    previewText,
  } = options;

  const siteUrl = getSiteUrl();
  const supportEmail = getEnv("EMAIL_REPLY_TO") || "david@inbox-elevate.de";

  const preheader = previewText
    ? `<div style="display:none; max-height:0px; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; max-width:0px; opacity:0;">
        ${previewText}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
      </div>`
    : "";

  const badgeHtml = badge
    ? `<span class="badge-tag" style="display:inline-block; background-color:#dcfce7; color:#15803d; font-size:11px; font-weight:bold; text-transform:uppercase; letter-spacing:1.2px; padding:6px 12px; border-radius:20px; margin-bottom:16px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${badge}</span>`
    : "";

  const greetingHtml = greeting
    ? `<p class="text-p" style="font-size:15px; line-height:1.6; color:#334155; margin:0 0 16px 0; font-family:Georgia, 'Times New Roman', serif; font-weight:bold;">${greeting}</p>`
    : "";

  const paragraphs = bodyLines
    .map(
      (line) =>
        `<p class="text-p" style="font-size:15px; line-height:1.6; color:#334155; margin:0 0 16px 0; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${line}</p>`,
    )
    .join("");

  let infoBoxHtml = "";
  if (infoTable && infoTable.length > 0) {
    const rows = infoTable
      .map(
        (row, idx) => `
        <tr class="details-row">
          <td class="label-col" style="padding:10px 0; border-bottom:${idx === infoTable.length - 1 ? "none" : "1px solid #f1f5f9"}; font-size:12px; color:#64748b; font-weight:bold; text-transform:uppercase; letter-spacing:0.5px; width:32%; vertical-align:top; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${row.label}</td>
          <td class="val-col" style="padding:10px 0; border-bottom:${idx === infoTable.length - 1 ? "none" : "1px solid #f1f5f9"}; font-size:14px; color:#0f172a; font-weight:500; vertical-align:top; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${row.value}</td>
        </tr>`,
      )
      .join("");

    infoBoxHtml = `
      <div class="details-card" style="background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:20px; margin:24px 0;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%; border-collapse:collapse;">
          ${rows}
        </table>
      </div>
    `;
  }

  const defaultTrustNotice =
    trustNotice ||
    (badge?.includes("Jugend") || badge?.includes("Kinder")
      ? "🛡️ <strong>Sicherer Nachbarschaftsservice:</strong> Alle Aufträge auf GreenMatch werden vorab auf Jugendschutzkonformität geprüft (keine gefährlichen Arbeitsmittel, max. 2 Stunden Tagesarbeitszeit)."
      : "");

  const trustBoxHtml = defaultTrustNotice
    ? `<div class="trust-box" style="background-color:#f0fdf4; border-left:4px solid #22c55e; padding:14px 16px; border-radius:0 8px 8px 0; margin-bottom:24px; font-size:13px; color:#166534; line-height:1.5; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        ${defaultTrustNotice}
      </div>`
    : "";

  let buttonsHtml = "";
  if (ctaLabel && (ctaPath || ctaUrl)) {
    const primaryUrl = ctaUrl ?? `${siteUrl}${ctaPath}`;
    buttonsHtml += `<a href="${primaryUrl}" class="btn-primary" target="_blank" style="background-color:#15803d; color:#ffffff !important; padding:14px 28px; text-decoration:none; border-radius:8px; font-size:15px; font-weight:bold; display:inline-block; box-shadow:0 4px 12px rgba(21, 128, 61, 0.25); margin-right:8px; margin-bottom:12px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${ctaLabel}</a>`;
  }
  if (secondaryCta) {
    buttonsHtml += `<a href="${secondaryCta.url}" class="btn-secondary" target="_blank" style="background-color:#ffffff; color:#64748b !important; padding:14px 20px; text-decoration:none; border-radius:8px; font-size:14px; display:inline-block; border:1px solid #cbd5e1; margin-bottom:12px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${secondaryCta.label}</a>`;
  }

  const footerText =
    footer ??
    "Sie erhalten diese E-Mail als registrierter Nutzer im Rahmen der GreenMatch-Funktionen.";

  return `<!DOCTYPE html>
<html lang="de" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>${heading}</title>
    <!--[if mso]>
    <noscript>
        <xml>
            <o:OfficeDocumentSettings>
                <o:AllowPNG/>
                <o:PixelsPerInch>96</o:PixelsPerInch>
            </o:OfficeDocumentSettings>
        </xml>
    </noscript>
    <![endif]-->
    <style>
        /* Reset Styles */
        html, body {
            margin: 0 !important;
            padding: 0 !important;
            height: 100% !important;
            width: 100% !important;
            background-color: #f0fdf4;
        }
        * {
            -ms-text-size-adjust: 100%;
            -webkit-text-size-adjust: 100%;
        }
        table, td {
            mso-table-lspace: 0pt !important;
            mso-table-rspace: 0pt !important;
        }
        table {
            border-spacing: 0 !important;
            border-collapse: collapse !important;
            table-layout: fixed !important;
            margin: 0 auto !important;
        }
        img {
            -ms-interpolation-mode: bicubic;
            border: 0;
            outline: none;
            text-decoration: none;
        }

        /* Typography & Layout */
        body, td, th {
            font-family: Georgia, 'Times New Roman', serif;
            color: #166534;
        }

        .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 10px 25px -5px rgba(22, 101, 52, 0.08), 0 8px 10px -6px rgba(22, 101, 52, 0.05);
            border: 1px solid #dcfce7;
        }

        /* Header Bar */
        .header-bar {
            background: linear-gradient(135deg, #166534 0%, #15803d 100%);
            padding: 32px 36px;
            text-align: left;
        }
        .brand-title {
            font-size: 24px;
            font-weight: bold;
            color: #ffffff;
            letter-spacing: -0.5px;
            margin: 0;
            font-family: Georgia, 'Times New Roman', serif;
        }

        /* Content Body */
        .content-body {
            padding: 36px 36px 28px 36px;
        }

        .badge-tag {
            display: inline-block;
            background-color: #dcfce7;
            color: #15803d;
            font-size: 11px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 1.2px;
            padding: 6px 12px;
            border-radius: 20px;
            margin-bottom: 16px;
        }

        .mail-heading {
            font-size: 22px;
            line-height: 1.35;
            color: #0f172a;
            font-weight: bold;
            margin: 0 0 16px 0;
            font-family: Georgia, 'Times New Roman', serif;
        }

        .text-p {
            font-size: 15px;
            line-height: 1.6;
            color: #334155;
            margin: 0 0 16px 0;
        }

        /* Card Box for Details */
        .details-card {
            background-color: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 20px;
            margin: 24px 0;
        }

        .details-row {
            padding: 10px 0;
            border-bottom: 1px solid #f1f5f9;
        }
        .details-row:last-child {
            border-bottom: none;
        }

        .label-col {
            font-size: 12px;
            color: #64748b;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            width: 32%;
        }

        .val-col {
            font-size: 14px;
            color: #0f172a;
            font-weight: 500;
        }

        .status-verified {
            color: #16a34a;
            font-weight: bold;
            font-size: 13px;
        }

        .price-highlight {
            font-size: 16px;
            color: #15803d;
            font-weight: bold;
        }

        /* Trust Box */
        .trust-box {
            background-color: #f0fdf4;
            border-left: 4px solid #22c55e;
            padding: 14px 16px;
            border-radius: 0 8px 8px 0;
            margin-bottom: 28px;
            font-size: 13px;
            color: #166534;
            line-height: 1.5;
        }

        /* Bulletproof CTA Buttons */
        .btn-primary {
            background-color: #15803d;
            color: #ffffff !important;
            padding: 14px 28px;
            text-decoration: none;
            border-radius: 8px;
            font-size: 15px;
            font-weight: bold;
            display: inline-block;
            box-shadow: 0 4px 12px rgba(21, 128, 61, 0.25);
            margin-right: 8px;
            margin-bottom: 12px;
        }

        .btn-secondary {
            background-color: #ffffff;
            color: #64748b !important;
            padding: 14px 20px;
            text-decoration: none;
            border-radius: 8px;
            font-size: 14px;
            display: inline-block;
            border: 1px solid #cbd5e1;
            margin-bottom: 12px;
        }

        /* Footer */
        .email-footer {
            background-color: #f8fafc;
            border-top: 1px solid #f1f5f9;
            padding: 24px 36px;
            font-size: 12px;
            color: #64748b;
            line-height: 1.6;
        }

        .email-footer a {
            color: #15803d;
            text-decoration: underline;
        }

        @media only screen and (max-width: 600px) {
            .email-container {
                width: 100% !important;
                border-radius: 0 !important;
            }
            .content-body, .header-bar, .email-footer {
                padding: 24px 20px !important;
            }
            .label-col {
                width: 100% !important;
                display: block !important;
                padding-bottom: 2px !important;
            }
            .val-col {
                width: 100% !important;
                display: block !important;
                padding-bottom: 8px !important;
            }
            .btn-primary, .btn-secondary {
                display: block !important;
                width: 100% !important;
                text-align: center !important;
                box-sizing: border-box !important;
            }
        }
    </style>
</head>
<body style="margin: 0; padding: 30px 0; background-color: #f0fdf4;">

    ${preheader}

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr>
            <td align="center">
                <table role="presentation" class="email-container" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; margin:0 auto; background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 10px 25px -5px rgba(22, 101, 52, 0.08), 0 8px 10px -6px rgba(22, 101, 52, 0.05); border:1px solid #dcfce7;">
                    
                    <!-- Header Bar -->
                    <tr>
                        <td class="header-bar" style="background:linear-gradient(135deg, #166534 0%, #15803d 100%); padding:32px 36px; text-align:left;">
                            <h1 class="brand-title" style="font-size:24px; font-weight:bold; color:#ffffff; letter-spacing:-0.5px; margin:0; font-family:Georgia, 'Times New Roman', serif;">🌱 GreenMatch</h1>
                        </td>
                    </tr>

                    <!-- Body Content -->
                    <tr>
                        <td class="content-body" style="padding:36px 36px 28px 36px;">
                            ${badgeHtml}
                            <h2 class="mail-heading" style="font-size:22px; line-height:1.35; color:#0f172a; font-weight:bold; margin:0 0 16px 0; font-family:Georgia, 'Times New Roman', serif;">${heading}</h2>
                            ${greetingHtml}
                            ${paragraphs}
                            ${infoBoxHtml}
                            ${trustBoxHtml}

                            ${
                              buttonsHtml
                                ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top: 10px;">
                                <tr>
                                    <td align="center">
                                        ${buttonsHtml}
                                    </td>
                                </tr>
                            </table>`
                                : ""
                            }

                            <p style="font-size: 13px; color: #64748b; line-height: 1.5; text-align: center; margin-top: 24px; margin-bottom: 0; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                                ${footerText}
                            </p>

                        </td>
                    </tr>

                    <!-- Footer Bar -->
                    <tr>
                        <td class="email-footer" style="background-color:#f8fafc; border-top:1px solid #f1f5f9; padding:24px 36px; font-size:12px; color:#64748b; line-height:1.6; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                            <p style="margin: 0 0 8px 0;">
                                Fragen oder Hilfe? Antworten Sie einfach auf diese E-Mail oder schreiben Sie uns an 
                                <a href="mailto:${supportEmail}" style="color: #15803d; text-decoration: underline;">${supportEmail}</a>.
                            </p>
                            <p style="margin: 0 0 8px 0; color: #94a3b8; font-size: 11px;">
                                GreenMatch • Sichere Gartenhilfe für Nachbarn
                            </p>
                            <p style="margin: 0; color: #94a3b8; font-size: 11px;">
                                © ${new Date().getFullYear()} GreenMatch &nbsp;•&nbsp; <a href="${siteUrl}/datenschutz" style="color: #64748b;">Datenschutz</a> &nbsp;•&nbsp; <a href="${siteUrl}/impressum" style="color: #64748b;">Impressum</a>
                            </p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>

</body>
</html>`;
}

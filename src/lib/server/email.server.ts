// Server-only: E-Mail-Versand via Resend (https://resend.com).
// Nur aus Server-Function-Handlern importieren (idealerweise per dynamischem
// `await import(...)`, siehe client.server.ts), niemals aus Routen/Komponenten.

import { getRequest } from "@tanstack/react-start/server";

function getEnv(key: string): string | undefined {
  const fromProcess = typeof process !== "undefined" ? process.env[key] : undefined;
  const fromVite = (import.meta.env as Record<string, string | undefined>)[key];
  return fromProcess || fromVite || undefined;
}

/** Echte Adresse der App. Wird verwendet, wenn PUBLIC_SITE_URL fehlt oder auf localhost zeigt. */
export const DEFAULT_SITE_URL = "https://project.inbox-elevate.de";

function isLocalAddress(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/|$)/i.test(url.trim());
}

/**
 * Öffentliche Adresse der App für Links in E-Mails. Reihenfolge:
 * 1. PUBLIC_SITE_URL, wenn gesetzt (localhost-Adressen zählen nur in der lokalen Entwicklung)
 * 2. https://project.inbox-elevate.de (Standard - so zeigen Mail-Links nie versehentlich auf localhost)
 *
 * SECURITY: x-forwarded-host / x-forwarded-proto werden absichtlich NICHT
 * verwendet – sie können von Angreifern manipuliert werden (Host-Header-
 * Injection), sodass E-Mail-Links auf Phishing-Domains zeigen würden.
 */
export function getSiteUrl(): string {
  const configured = getEnv("PUBLIC_SITE_URL")?.trim();
  if (configured) {
    const clean = configured.replace(/\/+$/, "");
    if (!isLocalAddress(clean) || import.meta.env.DEV) return clean;
    console.warn(
      `[email] PUBLIC_SITE_URL zeigt auf ${clean} (localhost) – in Produktion wird stattdessen ${DEFAULT_SITE_URL} verwendet.`,
    );
  }
  return DEFAULT_SITE_URL;
}

/**
 * HTML-Escaping für Nutzereingaben, die in E-Mail-Templates landen (Namen, Titel,
 * Nachrichtentexte, Gründe ...). bodyLines, infoTable-Werte, greeting, trustNotice und
 * footer werden im Template als HTML eingefügt - dynamische Werte MÜSSEN dort durch
 * escapeHtml() laufen. heading, previewText, badge und Button-Beschriftungen escaped das
 * Template selbst.
 */
export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Betreffzeilen dürfen keine Zeilenumbrüche enthalten (Header-Injection) und bleiben kurz. */
export function sanitizeSubject(value: string): string {
  return String(value).replace(/[\r\n\u2028\u2029]+/g, " ").trim().slice(0, 200);
}

/** Für die Systemstatus-Seite im Admin: ist der E-Mail-Versand eingerichtet? */
export function getEmailConfig() {
  const fromConfigured = Boolean(getEnv("EMAIL_FROM_ADDRESS"));
  return {
    resendConfigured: Boolean(getEnv("RESEND_API_KEY")),
    fromConfigured,
    fromAddress:
      getEnv("EMAIL_FROM_ADDRESS") ||
      "GreenMatch <noreply@mail.inbox-elevate.de>",
    replyToAddress: getEnv("EMAIL_REPLY_TO") || "david@inbox-elevate.de",
    siteUrlConfigured: Boolean(getEnv("PUBLIC_SITE_URL")) && !isLocalAddress(getEnv("PUBLIC_SITE_URL") ?? ""),
    effectiveSiteUrl: getSiteUrl(),
  };
}

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

export type SendEmailResult =
  | { ok: true }
  | { ok: false; error: string; status?: number };

/**
 * Versendet eine E-Mail über die Resend-API.
 * Wirft absichtlich nie: Fehlt der API-Key oder scheitert Resend, kommt
 * { ok: false, error }. Aufrufer (Gebote, Freigaben, …) dürfen davon nicht
 * blockiert werden – die Eltern-Einladung zeigt die Ursache aber an.
 */
export async function sendEmail({
  to,
  subject: rawSubject,
  html,
  replyTo,
}: SendEmailInput): Promise<SendEmailResult> {
  const subject = sanitizeSubject(rawSubject);
  const apiKey = getEnv("RESEND_API_KEY");
  if (!apiKey) {
    const error =
      "RESEND_API_KEY fehlt in der Server-Umgebung (.env / Hosting). Ohne diesen Schlüssel werden keine E-Mails versendet.";
    console.warn(`[email] ${error} Betreff: "${subject}" an ${to}`);
    return { ok: false, error };
  }

  const from = getEnv("EMAIL_FROM_ADDRESS") || "GreenMatch <noreply@mail.inbox-elevate.de>";
  const reply_to = replyTo || getEnv("EMAIL_REPLY_TO") || "david@inbox-elevate.de";

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
      let detail = body.slice(0, 400);
      try {
        const parsed = JSON.parse(body) as { message?: string };
        if (parsed.message) detail = parsed.message;
      } catch {
        /* raw body behalten */
      }
      const error = `Resend hat abgelehnt (${res.status}): ${detail || "unbekannter Fehler"}`;
      console.error(`[email] ${error}`);
      return { ok: false, error, status: res.status };
    }
    return { ok: true };
  } catch (err) {
    const error = `Netzwerkfehler beim E-Mail-Versand: ${(err as Error).message}`;
    console.error(`[email] ${error}`);
    return { ok: false, error };
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
 * Schlichtes, dezentes HTML-Template (weiße Karte, ein Akzent in Dunkelgrün).
 * Alles inline gestylt und tabellenbasiert, damit es in Apple Mail, Gmail, Outlook und
 * auf dem Handy gleich aussieht. Die Optionen sind unverändert, bestehende Aufrufe funktionieren weiter.
 */
export function emailTemplate(options: EmailTemplateOptions): string {
  const { greeting, bodyLines, infoTable, trustNotice, ctaPath, ctaUrl, secondaryCta, footer } =
    options;

  // Reine Textfelder: werden immer escaped (Aufrufer übergeben hier nie HTML).
  const heading = escapeHtml(options.heading);
  const previewText = options.previewText ? escapeHtml(options.previewText) : undefined;
  const badge = options.badge ? escapeHtml(options.badge) : undefined;
  const ctaLabel = options.ctaLabel ? escapeHtml(options.ctaLabel) : undefined;

  const siteUrl = getSiteUrl();
  const supportEmail = getEnv("EMAIL_REPLY_TO") || "david@inbox-elevate.de";

  const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  const INK = "#1f2937";
  const MUTED = "#6b7280";
  const LINE = "#e5e7eb";
  const ACCENT = "#166534";

  const preheader = previewText
    ? `<div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; opacity:0;">${previewText}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>`
    : "";

  const badgeHtml = badge
    ? `<p style="margin:0 0 10px 0; font-size:12px; letter-spacing:0.6px; text-transform:uppercase; color:${ACCENT}; font-family:${FONT};">${badge}</p>`
    : "";

  const greetingHtml = greeting
    ? `<p style="margin:0 0 14px 0; font-size:15px; line-height:1.65; color:${INK}; font-family:${FONT};">${greeting}</p>`
    : "";

  const paragraphs = bodyLines
    .map(
      (line) =>
        `<p style="margin:0 0 14px 0; font-size:15px; line-height:1.65; color:${INK}; font-family:${FONT};">${line}</p>`,
    )
    .join("");

  let infoBoxHtml = "";
  if (infoTable && infoTable.length > 0) {
    const rows = infoTable
      .map((row, idx) => {
        const border = idx === infoTable.length - 1 ? "none" : `1px solid ${LINE}`;
        return `<tr>
          <td style="padding:9px 12px 9px 0; border-bottom:${border}; font-size:13px; color:${MUTED}; width:32%; vertical-align:top; font-family:${FONT};">${row.label}</td>
          <td style="padding:9px 0; border-bottom:${border}; font-size:14px; color:${INK}; vertical-align:top; font-family:${FONT};">${row.value}</td>
        </tr>`;
      })
      .join("");
    infoBoxHtml = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%; margin:20px 0; border-top:1px solid ${LINE}; border-bottom:1px solid ${LINE}; border-collapse:collapse;">${rows}</table>`;
  }

  const defaultTrustNotice =
    trustNotice ||
    (badge?.includes("Jugend") || badge?.includes("Kinder")
      ? "<strong>Sicherer Nachbarschaftsservice:</strong> Alle Aufträge auf GreenMatch werden vorab auf Jugendschutzkonformität geprüft (keine gefährlichen Arbeitsmittel, max. 2 Stunden Tagesarbeitszeit)."
      : "");

  // Zusatzhinweis: nur eine feine Linie links, keine farbige Box. Emojis aus Alt-Texten entfernen.
  const trustBoxHtml = defaultTrustNotice
    ? `<p style="margin:20px 0; padding:2px 0 2px 14px; border-left:2px solid ${LINE}; font-size:13px; line-height:1.6; color:${MUTED}; font-family:${FONT};">${defaultTrustNotice.replace(/^\s*(?:🛡️|🛡)\s*/u, "")}</p>`
    : "";

  let buttonsHtml = "";
  if (ctaLabel && (ctaPath || ctaUrl)) {
    const primaryUrl = ctaUrl ?? `${siteUrl}${ctaPath}`;
    buttonsHtml += `<a href="${escapeHtml(primaryUrl)}" target="_blank" style="display:inline-block; background-color:${ACCENT}; color:#ffffff !important; padding:12px 24px; border-radius:6px; font-size:15px; font-weight:600; text-decoration:none; font-family:${FONT};">${ctaLabel}</a>`;
  }
  if (secondaryCta) {
    const color = secondaryCta.variant === "danger" ? "#b91c1c" : MUTED;
    buttonsHtml += `<a href="${escapeHtml(secondaryCta.url)}" target="_blank" style="display:inline-block; margin-left:8px; padding:11px 18px; border:1px solid ${LINE}; border-radius:6px; font-size:14px; color:${color} !important; text-decoration:none; font-family:${FONT};">${escapeHtml(secondaryCta.label)}</a>`;
  }
  const buttonBlock = buttonsHtml
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0 8px 0;"><tr><td>${buttonsHtml}</td></tr></table>`
    : "";

  const footerText =
    footer ??
    "Sie erhalten diese E-Mail als registrierter Nutzer im Rahmen der GreenMatch-Funktionen.";

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>${heading}</title>
  <style>
    body { margin:0; padding:0; background-color:#f5f5f4; }
    @media only screen and (max-width: 600px) {
      .card { width:100% !important; }
      .pad { padding:24px 20px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#f5f5f4;">
  ${preheader}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f5f5f4;">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" class="card" width="560" cellspacing="0" cellpadding="0" border="0" style="width:560px; max-width:560px; background-color:#ffffff; border:1px solid ${LINE}; border-radius:8px;">
          <tr>
            <td class="pad" style="padding:28px 36px 0 36px;">
              <a href="${escapeHtml(siteUrl)}" target="_blank" style="font-size:18px; font-weight:600; color:${ACCENT}; text-decoration:none; font-family:${FONT};">GreenMatch</a>
            </td>
          </tr>
          <tr>
            <td class="pad" style="padding:20px 36px 12px 36px;">
              ${badgeHtml}
              <h1 style="margin:0 0 18px 0; font-size:21px; line-height:1.35; font-weight:600; color:${INK}; font-family:${FONT};">${heading}</h1>
              ${greetingHtml}
              ${paragraphs}
              ${infoBoxHtml}
              ${trustBoxHtml}
              ${buttonBlock}
              <p style="margin:20px 0 0 0; font-size:13px; line-height:1.6; color:${MUTED}; font-family:${FONT};">${footerText}</p>
            </td>
          </tr>
          <tr>
            <td class="pad" style="padding:20px 36px 28px 36px; border-top:1px solid ${LINE};">
              <p style="margin:0 0 6px 0; font-size:12px; line-height:1.6; color:${MUTED}; font-family:${FONT};">
                Fragen? Antworten Sie einfach auf diese E-Mail oder schreiben Sie an
                <a href="mailto:${escapeHtml(supportEmail)}" style="color:${MUTED}; text-decoration:underline;">${escapeHtml(supportEmail)}</a>.
              </p>
              <p style="margin:0; font-size:12px; line-height:1.6; color:#9ca3af; font-family:${FONT};">
                GreenMatch · Gartenhilfe in der Nachbarschaft · <a href="${escapeHtml(siteUrl)}/datenschutz" style="color:#9ca3af; text-decoration:underline;">Datenschutz</a>
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

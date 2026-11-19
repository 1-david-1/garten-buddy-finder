/**
 * Einheitliche Beschreibung des Auftragsstatus - EINE Quelle für alle Seiten.
 *
 * Vorher hieß derselbe Status je nach Seite anders (pending_helper: "Preis geeinigt (Termin offen)",
 * "Ausstehend", "Wartet auf Helfer"), und nirgends stand, was der Nutzer als Nächstes tun muss.
 * Jede Beschreibung gibt es aus Sicht des Auftraggebers ("customer") und des Helfers ("helper").
 */

export type GigViewerRole = "customer" | "helper";
export type GigTone = "neutral" | "info" | "success" | "warning" | "danger";

/** Zahlungsstatus (Treuhand) eines Auftrags, wie in escrow_transactions.state gespeichert */
export type PaymentState = "pending" | "held" | "releasing" | "paid_out" | "disputed" | "cancelled" | null | undefined;

export interface GigStatusInfo {
  label: string;
  tone: GigTone;
  /** Was als Nächstes passiert bzw. was der Nutzer tun muss (leer, wenn nichts zu tun ist) */
  next: string | null;
  /** Braucht der Nutzer jetzt etwas zu tun? Für Hervorhebung und Sortierung. */
  needsAction: boolean;
}

export const TONE_CLASSES: Record<GigTone, string> = {
  neutral: "text-muted-foreground border-border bg-muted/40",
  info: "text-sky-400 border-sky-400/30 bg-sky-400/10",
  success: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
  warning: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  danger: "text-red-400 border-red-400/30 bg-red-400/10",
};

export function describePayment(state: PaymentState, role: GigViewerRole): { label: string; tone: GigTone } | null {
  switch (state) {
    case "paid_out":
      return { label: role === "customer" ? "Zahlung freigegeben" : "Bezahlt", tone: "success" };
    case "held":
    case "pending":
    case "releasing":
      return { label: role === "customer" ? "Zahlung gesichert, noch nicht freigegeben" : "Zahlung gesichert", tone: "info" };
    case "disputed":
      return { label: "Zahlung wird geklärt", tone: "warning" };
    case "cancelled":
      return { label: "Zahlung storniert", tone: "neutral" };
    default:
      return null;
  }
}

export function describeGigStatus(
  status: string,
  role: GigViewerRole,
  options: { paymentState?: PaymentState; hasScheduledDate?: boolean } = {},
): GigStatusInfo {
  const { paymentState, hasScheduledDate = true } = options;
  const isCustomer = role === "customer";

  switch (status) {
    case "open":
      return {
        label: "Offen",
        tone: "info",
        next: isCustomer ? "Helfer können Angebote machen. Du wirst benachrichtigt." : null,
        needsAction: false,
      };
    case "negotiating":
      return {
        label: "In Verhandlung",
        tone: "info",
        next: isCustomer ? "Prüfe die Angebote und wähle einen Helfer." : "Warte auf die Antwort des Auftraggebers.",
        needsAction: isCustomer,
      };
    case "pending_helper":
      return {
        label: isCustomer ? "Wartet auf Zusage des Helfers" : "Anfrage – wartet auf deine Zusage",
        tone: "warning",
        next: isCustomer
          ? hasScheduledDate
            ? "Der Helfer muss noch zusagen. Du wirst benachrichtigt."
            : "Der Helfer muss noch zusagen. Schlage einen Termin vor, falls noch keiner feststeht."
          : "Nimm die Anfrage an oder lehne sie ab. Die genaue Adresse siehst du nach deiner Zusage.",
        needsAction: !isCustomer,
      };
    case "assigned":
      return {
        label: "Bestätigt",
        tone: "success",
        next: isCustomer
          ? "Der Termin steht. Nach der Arbeit schließt du den Auftrag ab und gibst die Zahlung frei."
          : "Der Termin steht. Nach der Arbeit schließt der Auftraggeber den Auftrag ab.",
        needsAction: false,
      };
    case "in_progress":
      return {
        label: "Läuft",
        tone: "success",
        next: isCustomer
          ? "Ist die Arbeit erledigt? Dann schließe den Auftrag ab und gib die Zahlung frei."
          : "Nach der Arbeit schließt der Auftraggeber den Auftrag ab und gibt die Zahlung frei.",
        needsAction: false,
      };
    case "completed": {
      const pay = describePayment(paymentState, role);
      const released = paymentState === "paid_out";
      return {
        label: "Abgeschlossen",
        tone: "neutral",
        next: released
          ? null
          : paymentState === "disputed"
            ? "Die Zahlung wird geklärt und danach freigegeben."
            : isCustomer
              ? paymentState
                ? "Die Zahlung ist noch nicht freigegeben. Gib sie jetzt frei."
                : null
              : "Warte auf die Freigabe der Zahlung durch den Auftraggeber.",
        needsAction: isCustomer && !released && !!paymentState && paymentState !== "disputed" && paymentState !== "cancelled" && !!pay,
      };
    }
    case "cancelled":
      return { label: "Storniert", tone: "danger", next: null, needsAction: false };
    case "draft":
      return { label: "Entwurf", tone: "neutral", next: null, needsAction: false };
    default:
      return { label: status, tone: "neutral", next: null, needsAction: false };
  }
}

/** Aktive Aufträge: laufen, sind bestätigt oder warten auf eine Zusage. */
export const ACTIVE_STATUSES = ["pending_helper", "assigned", "in_progress"] as const;

export function isActiveStatus(status: string): boolean {
  return (ACTIVE_STATUSES as readonly string[]).includes(status);
}

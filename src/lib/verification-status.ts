/** Einheitlicher Verifizierungsstatus für alle Nutzergruppen (Helfer, Eltern, Auftraggeber). */
export type VerificationStatus =
  | "not_started"
  | "in_review"
  | "verified"
  | "rejected"
  | "reverification_required"
  | "suspended";

export const VERIFICATION_STATUS_LABEL: Record<VerificationStatus, string> = {
  not_started: "Nicht begonnen",
  in_review: "In Prüfung",
  verified: "Verifiziert",
  rejected: "Abgelehnt",
  reverification_required: "Erneute Prüfung erforderlich",
  suspended: "Gesperrt",
};

/**
 * Kennzeichnung nach einer abgeschlossenen Prüfung. Bewusst nur diese Formulierungen:
 * die Prüfung bestätigt ausschließlich Identitäts- und Altersdaten - keine Zuverlässigkeit.
 */
export const VERIFIED_BADGES = ["Identität geprüft", "Alter geprüft", "Verifizierung abgeschlossen"] as const;

export function deriveVerificationStatus(input: {
  verifiedAt: string | null;
  reverificationRequiredAt?: string | null;
  suspendedAt?: string | null;
  hasPendingRequest: boolean;
  lastRequestDeclined: boolean;
}): VerificationStatus {
  if (input.suspendedAt) return "suspended";
  if (input.verifiedAt && input.reverificationRequiredAt) return "reverification_required";
  if (input.verifiedAt) return "verified";
  if (input.hasPendingRequest) return "in_review";
  if (input.lastRequestDeclined) return "rejected";
  return "not_started";
}

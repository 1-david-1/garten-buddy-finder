/**
 * Eltern-Freigabe für Jugendliche: Was fehlt noch, damit die Eltern informiert entscheiden können?
 * Rein funktional (Client und Server), damit Eltern-Konto und Server dieselbe Regel nutzen.
 */
export function missingApprovalDetails(job: { scheduledAt: string | null; hasLocation: boolean }): string[] {
  const missing: string[] = [];
  if (!job.scheduledAt) missing.push("Termin");
  if (!job.hasLocation) missing.push("Ort");
  return missing;
}

/** Ergebnis des automatischen Anstoßens der Eltern-Anfrage (für Hinweise an den Auftraggeber). */
export type GuardianRequestCode = "requested" | "details_missing" | "already_pending" | "blocked";
export interface GuardianRequestHint {
  code: GuardianRequestCode;
  message: string;
}

/** Texte für den Auftraggeber (der Jugendliche bekommt eigene Hinweise). */
export function guardianHintForCustomer(code: GuardianRequestCode): GuardianRequestHint {
  switch (code) {
    case "requested":
      return {
        code,
        message:
          "Der Helfer ist minderjährig: Wir haben die Eltern um Freigabe gebeten. Der Auftrag startet, sobald sie zustimmen.",
      };
    case "details_missing":
      return {
        code,
        message:
          "Der Helfer ist minderjährig. Sobald Termin und Ort feststehen, bitten wir die Eltern um Freigabe.",
      };
    case "already_pending":
      return { code, message: "Die Eltern des minderjährigen Helfers wurden bereits um Freigabe gebeten." };
    default:
      return {
        code,
        message: "Der Helfer ist minderjährig. Die Freigabe der Eltern steht noch aus.",
      };
  }
}

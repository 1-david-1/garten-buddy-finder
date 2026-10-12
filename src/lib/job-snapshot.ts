/**
 * Auftragsdaten, die Eltern bei der Freigabe sehen. Ändert sich eines dieser Felder, ist eine
 * neue Freigabe nötig (in der Datenbank durchgesetzt: Trigger invalidate_youth_approval_on_change).
 */
export interface JobSnapshot {
  location: string;
  scheduledAt: string | null;
  durationMinutes: number;
  customerId: string;
  activity: string;
  description: string | null;
  priceCents: number;
}

const FIELDS: (keyof JobSnapshot)[] = [
  "location",
  "scheduledAt",
  "durationMinutes",
  "customerId",
  "activity",
  "description",
  "priceCents",
];

/** Namen der wesentlichen Felder, die sich zwischen zwei Ständen unterscheiden. */
export function changedJobFields(before: JobSnapshot, after: JobSnapshot): (keyof JobSnapshot)[] {
  return FIELDS.filter((f) => (before[f] ?? null) !== (after[f] ?? null));
}

export function requiresNewApproval(before: JobSnapshot, after: JobSnapshot): boolean {
  return changedJobFields(before, after).length > 0;
}

/** Ende des Auftrags (Beginn + Dauer) */
export function jobEnd(scheduledAt: string, durationMinutes: number): Date {
  return new Date(new Date(scheduledAt).getTime() + durationMinutes * 60_000);
}

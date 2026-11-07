import { REMEMBER_OPTIONS, REMEMBER_RISKY_NOTE } from "@/lib/consent-texts";

export type RememberValue = keyof typeof REMEMBER_OPTIONS;

/**
 * "Wie soll es weitergehen?" - Eltern legen bei der Freigabe fest, ob sie bei diesem Auftrag bzw. bei diesem
 * Auftraggeber künftig nicht mehr gefragt werden möchten. Jederzeit im Eltern-Konto widerrufbar.
 */
export function RememberChoice({
  value,
  onChange,
  customerName,
  risky,
  name,
}: {
  value: RememberValue;
  onChange: (v: RememberValue) => void;
  customerName?: string | null;
  risky: boolean;
  /** eindeutiger Name der Radio-Gruppe (je Karte) */
  name: string;
}) {
  const order: RememberValue[] = ["none", "gig", "customer"];
  return (
    <fieldset className="space-y-2 rounded-lg border border-glass-border p-3 text-sm">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Wie soll es weitergehen?
      </legend>
      {order.map((key) => (
        <label key={key} className="flex cursor-pointer items-start gap-3">
          <input
            type="radio"
            name={name}
            className="mt-1"
            checked={value === key}
            onChange={() => onChange(key)}
          />
          <span>
            <span className="font-medium">
              {key === "customer" && customerName ? `Für ${customerName} immer erlauben` : REMEMBER_OPTIONS[key].label}
            </span>
            <span className="block text-xs text-muted-foreground">{REMEMBER_OPTIONS[key].hint}</span>
          </span>
        </label>
      ))}
      {risky && value !== "none" && <p className="text-xs text-muted-foreground">{REMEMBER_RISKY_NOTE}</p>}
    </fieldset>
  );
}

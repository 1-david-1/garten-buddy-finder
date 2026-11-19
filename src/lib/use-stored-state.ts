import { useCallback, useState } from "react";

/**
 * Wie useState, merkt sich den Wert aber im Browser (localStorage).
 * Dient dazu, dass Einstellungen wie Suchfilter beim nächsten Besuch
 * wieder da sind. `validate` verwirft alte oder kaputte Werte.
 */
export function useStoredState<T>(
  key: string,
  initial: T,
  validate: (value: unknown) => value is T,
): [T, (next: T | ((prev: T) => T)) => void, () => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      if (typeof window === "undefined") return initial;
      const raw = window.localStorage.getItem(key);
      if (!raw) return initial;
      const parsed: unknown = JSON.parse(raw);
      return validate(parsed) ? parsed : initial;
    } catch {
      return initial;
    }
  });

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          // blockiert oder voll - Wert gilt nur für diese Sitzung
        }
        return resolved;
      });
    },
    [key],
  );

  const reset = useCallback(() => {
    setValue(initial);
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignorieren
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [value, set, reset];
}

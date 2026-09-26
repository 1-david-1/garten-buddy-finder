import { useEffect, useState } from "react";

/**
 * Häkchen-Zustand einer Checkliste, persistiert im localStorage des
 * Browsers (pro `storageKey`). Kein Server-Roundtrip nötig - die Listen
 * sind reine Selbsthilfe für den Helfer, kein geteilter Zustand.
 */
function readChecked(storageKey: string): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function useChecklist(storageKey: string) {
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    readChecked(storageKey),
  );

  // Beim Wechsel des Keys (z.B. anderer Auftrag ausgewählt) neu laden.
  useEffect(() => {
    setChecked(readChecked(storageKey));
  }, [storageKey]);

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // localStorage kann z.B. im privaten Modus blockiert sein - die
        // Checkliste funktioniert dann nur für die aktuelle Sitzung weiter.
      }
      return next;
    });
  };

  const reset = () => {
    setChecked({});
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // siehe oben
    }
  };

  return { checked, toggle, reset };
}

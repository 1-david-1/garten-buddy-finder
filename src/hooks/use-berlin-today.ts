import { useEffect, useState } from "react";
import { berlinDateKey } from "@/lib/berlin-time";

/**
 * Das heutige Datum ("YYYY-MM-DD") in Deutschland. Die Komponente wird neu gerendert, sobald der Tag wechselt - auch wenn
 * der Tab über Nacht offen blieb oder der Rechner im Ruhezustand war. Ohne das zeigte der Buchungskalender am nächsten
 * Morgen noch den Vortag als "Heute".
 */
export function useBerlinToday(): string {
  const [today, setToday] = useState(() => berlinDateKey(new Date()));

  useEffect(() => {
    const check = () => setToday((prev) => {
      const next = berlinDateKey(new Date());
      return prev === next ? prev : next;
    });
    const id = window.setInterval(check, 30_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    check();
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);

  return today;
}

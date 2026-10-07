import { createFileRoute, Link } from "@tanstack/react-router";
import { Info } from "lucide-react";

/**
 * Früherer Weg: Zustimmung per E-Mail-Link. Ersetzt durch die Einreichung von
 * Einverständniserklärung und Ausweisen mit Prüfung durch das GreenMatch-Team.
 * Die Seite bleibt bestehen, damit alte Links nicht ins Leere führen.
 */
export const Route = createFileRoute("/eltern-zustimmung/$token")({
  head: () => ({
    meta: [
      { title: "Hinweis · GreenMatch" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: LegacyConsentNotice,
});

function LegacyConsentNotice() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-glass-border">
        <div className="mx-auto flex h-16 max-w-2xl items-center px-4">
          <Link to="/" className="font-brand text-2xl text-primary">
            GreenMatch<span className="text-foreground">.</span>
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-12">
        <div className="flex items-start gap-4 rounded-2xl border border-glass-border bg-glass p-6 backdrop-blur">
          <Info className="mt-0.5 size-6 text-primary" />
          <div>
            <h1 className="font-brand text-2xl">Dieser Weg wird nicht mehr verwendet</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Jugendliche werden bei GreenMatch jetzt über die unterschriebene
              Einverständniserklärung der Eltern und die Ausweise von Eltern und Kind verifiziert.
              Ihr Kind reicht die Unterlagen direkt in der App ein – eine Zustimmung per Link ist
              nicht mehr nötig.
            </p>
            <Link to="/einverstaendniserklaerung" className="mt-4 inline-block text-sm text-primary underline">
              Einverständniserklärung ansehen
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

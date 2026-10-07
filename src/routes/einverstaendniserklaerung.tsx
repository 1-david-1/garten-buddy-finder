import { createFileRoute, Link } from "@tanstack/react-router";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Druckbare Vorlage: Einverständniserklärung der Eltern für jugendliche Helfer (13-17).
 * Öffentlich erreichbar, damit Eltern sie vor der Registrierung ansehen können.
 * HINWEIS: Vorlage - Text vor dem Einsatz rechtlich prüfen lassen.
 */
export const Route = createFileRoute("/einverstaendniserklaerung")({
  head: () => ({
    meta: [
      { title: "Einverständniserklärung der Eltern · GreenMatch" },
      {
        name: "description",
        content:
          "Vorlage zum Ausdrucken: Einverständniserklärung der Eltern für Jugendliche (13–17), die über GreenMatch Gartenhilfe anbieten.",
      },
    ],
  }),
  component: ConsentTemplatePage,
});

function Line({ label }: { label: string }) {
  return (
    <div className="flex items-end gap-2 text-sm">
      <span className="shrink-0">{label}</span>
      <span className="flex-1 border-b border-current" />
    </div>
  );
}

function ConsentTemplatePage() {
  return (
    <div className="min-h-screen bg-background text-foreground print:bg-white print:text-black">
      <header className="border-b border-glass-border print:hidden">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <Link to="/" className="font-brand text-2xl text-primary">
            GreenMatch<span className="text-foreground">.</span>
          </Link>
          <Button onClick={() => window.print()} size="sm" className="gap-2">
            <Printer className="size-4" />
            Drucken
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-10 print:py-0">
        <h1 className="font-brand text-3xl print:text-2xl">
          Einverständniserklärung der Eltern
        </h1>
        <p className="text-sm text-muted-foreground print:text-black">
          für die Teilnahme von Jugendlichen (13–17 Jahre) an GreenMatch – Gartenhilfe aus der
          Nachbarschaft
        </p>

        <section className="space-y-3">
          <h2 className="font-semibold">Angaben zum Kind</h2>
          <Line label="Vor- und Nachname:" />
          <Line label="Geburtsdatum:" />
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold">Angaben zum/zur Erziehungsberechtigten</h2>
          <Line label="Vor- und Nachname:" />
          <Line label="Anschrift:" />
          <Line label="E-Mail (für Freigaben einzelner Aufträge):" />
          <Line label="Telefon:" />
        </section>

        <section className="space-y-3 text-sm leading-relaxed">
          <h2 className="font-semibold">Erklärung</h2>
          <p>Ich bin sorgeberechtigt und erkläre mich damit einverstanden, dass mein Kind</p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              sich bei GreenMatch als Helfer/in registriert und leichte Gartenarbeiten für
              Auftraggeber aus der Nachbarschaft übernimmt;
            </li>
            <li>
              dabei die Regeln für Jugendliche einhält: höchstens 2 Stunden pro Tag, nur zwischen
              08:00 und 18:00 Uhr, keine schweren oder gefährlichen Maschinen;
            </li>
            <li>
              Aufträge erst annehmen kann, nachdem ich den jeweiligen Auftrag per E-Mail
              freigegeben habe. Mir ist bewusst, dass ich jeden Auftrag einzeln freigeben muss.
            </li>
          </ol>
          <p>
            Zur Prüfung dieser Erklärung reiche ich zusammen mit meinem Kind Kopien der Ausweise
            (Vorder- und Rückseite) von mir und meinem Kind ein. Ich weiß, dass ich Zugangs- und
            Seriennummer schwärzen darf, dass die Unterlagen nur zur Prüfung durch das
            GreenMatch-Team verwendet und nach der Entscheidung gelöscht werden.
          </p>
          <p>
            Ich kann diese Einverständniserklärung jederzeit mit Wirkung für die Zukunft
            widerrufen.
          </p>
        </section>

        <section className="grid gap-6 pt-8 sm:grid-cols-2">
          <Line label="Ort, Datum:" />
          <Line label="Unterschrift Erziehungsberechtigte(r):" />
        </section>

        <p className="pt-6 text-xs text-muted-foreground print:hidden">
          Vorlage – bitte ausdrucken, ausfüllen, unterschreiben und als Foto oder Scan in der App
          hochladen.
        </p>
      </main>
    </div>
  );
}

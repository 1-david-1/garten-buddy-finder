import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicPage } from "@/components/public-page";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/freiburg")({
  head: () => ({
    meta: [
      { title: "Gartenhilfe Freiburg – geprüfte Helfer · GreenMatch" },
      {
        name: "description",
        content:
          "Gartenhilfe in Freiburg: Laub, Beet, Rasen und Hecke. Helfer von nebenan, alle per Ausweis geprüft, Jugendliche mit Eltern-Freigabe. Kostenlos.",
      },
    ],
  }),
  component: FreiburgPage,
});

function FreiburgPage() {
  return (
    <PublicPage title="Gartenhilfe in Freiburg">
      <p>
        GreenMatch startet in Freiburg. Gartenbesitzer finden geprüfte Helfer aus der Nachbarschaft für Laub, Beet, Rasen
        und Hecke. Die Nutzung ist kostenlos, jeder weist sich per Ausweis aus, und bei Jugendlichen gibt die Familie jeden
        Auftrag frei.
      </p>

      <h2 className="pt-2 font-brand text-2xl">Für Auftraggeber</h2>
      <p>
        Sie suchen Hilfe im Garten? Legen Sie ein Konto an, lassen Sie sich prüfen und schreiben Sie Ihren Auftrag aus
        oder buchen Sie ein fertiges Angebot. Im Herbst helfen die Gartenhelfer zum Beispiel beim Laub harken und beim
        Winterfestmachen der Beete.
      </p>
      <div>
        <Button asChild>
          <Link to="/auth" search={{ mode: "signup", role: "customer" }}>
            Als Auftraggeber starten
          </Link>
        </Button>
      </div>

      <h2 className="pt-2 font-brand text-2xl">Für Helfer</h2>
      <p>
        Du wohnst in Freiburg und willst dir etwas dazuverdienen? Registriere dich jetzt und lass dich prüfen, dann bist du
        zum Start sofort dabei. Jugendliche ab 13 helfen bei leichten Arbeiten mit Zustimmung der Eltern, Nachbarn ab 18
        und Profi-Gärtner übernehmen auch größere Aufgaben.
      </p>
      <div>
        <Button asChild variant="outline">
          <Link to="/auth" search={{ mode: "signup", role: "helper" }}>
            Als Helfer starten
          </Link>
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Mehr zu den Regeln:{" "}
        <Link to="/vermittler" className="text-primary underline">
          Unsere Rolle als Vermittlungsplattform
        </Link>
        ,{" "}
        <Link to="/eltern-info" className="text-primary underline">
          Für Eltern
        </Link>
        .
      </p>
    </PublicPage>
  );
}

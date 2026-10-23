import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicPage } from "@/components/public-page";
import { Button } from "@/components/ui/button";

/**
 * Informationsseite für Eltern (öffentlich, ohne Login). Ansprache bewusst per "Sie".
 * HINWEIS: Alle rechtlichen Texte müssen vor dem öffentlichen Start anwaltlich geprüft werden.
 */
export const Route = createFileRoute("/eltern-info")({
  head: () => ({
    meta: [
      { title: "Für Eltern: So schützt GreenMatch Ihr Kind · GreenMatch" },
      {
        name: "description",
        content:
          "Was Jugendliche bei GreenMatch tun dürfen, was Sie als Eltern entscheiden und wie wir Auftraggeber prüfen. Leichte Gartenarbeit, jeder Auftrag nur mit Ihrer Freigabe.",
      },
    ],
  }),
  component: ParentsInfoPage,
});

function ParentsInfoPage() {
  return (
    <PublicPage title="Für Eltern: So schützt GreenMatch Ihr Kind">
      <p>
        Jugendliche ab 13 Jahren können sich über GreenMatch mit leichter Gartenarbeit Taschengeld verdienen. Nichts läuft
        ohne Sie: Sie erteilen die Einverständniserklärung und geben jeden einzelnen Auftrag frei.
      </p>

      <ul className="list-disc space-y-3 pl-5">
        <li>
          <strong>Was Ihr Kind tun darf:</strong> leichte, ungefährliche Gartenarbeit wie Beete jäten, Laub harken oder
          Pflanzen gießen, höchstens 2 Stunden pro Tag, nur zwischen 08:00 und 18:00 Uhr und nicht während des
          Schulunterrichts. Die Plattform lehnt alles andere selbst ab.
        </li>
        <li>
          <strong>Rasenmäher und Heckenscheren:</strong> Sie sind grundsätzlich erst ab 15 Jahren vorgesehen. Für jüngere
          oder vollzeitschulpflichtige Jugendliche kann die Tätigkeit wegen der Unfallgefahr unzulässig sein. Solche
          Aufträge sind deshalb nur in Absprache mit Ihnen als Erziehungsberechtigten möglich. Andere gefährliche
          Maschinen, Chemikalien, schwere Lasten, große Höhe und Gewässer sind ausgeschlossen.
        </li>
        <li>
          <strong>Was Sie entscheiden:</strong> Ihr Kind wird erst nach Ihrer Einverständniserklärung und der Prüfung der
          Ausweise freigeschaltet. Jeden einzelnen Auftrag geben Sie in Ihrem Eltern-Konto frei oder lehnen ihn ab.
          Solange der Auftrag nicht läuft, können Sie die Freigabe zurückziehen. Reagieren Sie nicht, verfällt die Anfrage
          nach 72 Stunden und der Auftrag kann nicht angenommen werden.
        </li>
        <li>
          <strong>Wen wir prüfen:</strong> Auch Auftraggeber weisen sich per Ausweis aus, bevor sie Kontakt zu Ihrem Kind
          aufnehmen können. Der Austausch läuft ausschließlich über den Chat in GreenMatch.
        </li>
        <li>
          <strong>Was wir nicht tun:</strong> Wir führen die Arbeiten nicht selbst aus und sind nicht Arbeitgeber Ihres
          Kindes. Deshalb können und werden wir nicht für Sach- und Personenschäden aufkommen, die bei einem Auftrag
          entstehen. Wir bieten derzeit keine eigene Versicherung an. Bitte klären Sie vorab, ob Ihre private Absicherung
          Gartenhilfe abdeckt. Zwingende gesetzliche Haftung bleibt unberührt, Näheres steht unter{" "}
          <Link to="/vermittler" className="text-primary underline">
            Unsere Rolle als Vermittlungsplattform
          </Link>
          .
        </li>
        <li>
          <strong>Ihre Daten:</strong> Ausweiskopien werden nur zur Prüfung verwendet und danach gelöscht. Mehr steht in
          der{" "}
          <Link to="/datenschutz" className="text-primary underline">
            Datenschutzerklärung
          </Link>
          .
        </li>
        <li>
          <strong>Kontakt:</strong>{" "}
          <a href="mailto:david@inbox-elevate.de" className="text-primary underline">
            david@inbox-elevate.de
          </a>
        </li>
      </ul>

      <p>
        So starten Sie: Ihr Kind beginnt die Anmeldung selbst und lädt Sie als Elternteil ein. Danach legen Sie Ihr
        Eltern-Konto an und erteilen die Einverständniserklärung.
      </p>

      <Button asChild>
        <Link to="/auth" search={{ mode: "signup", role: "guardian" }}>
          Eltern-Konto anlegen
        </Link>
      </Button>
    </PublicPage>
  );
}

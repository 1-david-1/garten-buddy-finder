import { createFileRoute, Link } from "@tanstack/react-router";

/**
 * Haftungs- und Vermittlerhinweis (öffentlich, ohne Login).
 * HINWEIS: Alle rechtlichen Texte müssen vor dem öffentlichen Start durch eine deutsche
 * Rechtsanwaltskanzlei geprüft werden. Betreibername und Angaben zur technischen Umsetzung
 * (Verifizierung, Melde- und Sperrfunktionen) bei Änderungen hier anpassen.
 */
export const Route = createFileRoute("/vermittler")({
  head: () => ({
    meta: [
      { title: "Unsere Rolle als Vermittlungsplattform · GreenMatch" },
      {
        name: "description",
        content:
          "GreenMatch ist eine kostenlose technische Vermittlungsplattform. Was wir tun, was nicht – und wie Jugendschutz, Verifizierung, Melden und Sperren funktionieren.",
      },
    ],
  }),
  component: IntermediaryPage,
});

function IntermediaryPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-glass-border">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4">
          <Link to="/" className="font-brand text-2xl text-primary">
            GreenMatch<span className="text-foreground">.</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-12 leading-relaxed">
        <h1 className="font-brand text-3xl">Unsere Rolle als Vermittlungsplattform</h1>

        <p>GreenMatch ist eine kostenlose technische Vermittlungsplattform.</p>
        <p>
          <strong>Zweck und Betrieb:</strong> Dieses Projekt verfolgt derzeit ausschließlich ideelle Zwecke. Die
          Nutzung ist kostenlos. Eine wirtschaftliche Tätigkeit oder entgeltliche Vermittlung findet derzeit nicht
          statt.
        </p>
        <p>
          Wir nehmen derzeit keine Zahlungen entgegen, wickeln keine Vergütungen ab und verlangen keine
          Provision oder Vermittlungsgebühr. Wir sind nicht Arbeitgeber der minderjährigen oder erwachsenen
          Personen und führen die Gartenarbeiten nicht selbst durch.
        </p>
        <p>
          Der konkrete Auftrag kommt ausschließlich zwischen dem Auftraggeber und der helfenden Person
          beziehungsweise deren gesetzlicher Vertretung zustande. Die beteiligten Personen sind selbst dafür
          verantwortlich, dass der Auftrag rechtlich zulässig, altersgerecht, sicher und ordnungsgemäß
          durchgeführt wird.
        </p>
        <p>
          Auftraggeber dürfen Minderjährigen nur geeignete und ungefährliche Tätigkeiten anbieten. Verboten sind
          insbesondere Arbeiten mit gefährlichen Maschinen, Chemikalien, Pflanzenschutzmitteln, schweren Lasten,
          großer Höhe, Baustellen, Gewässern und sonstigen erheblichen Risiken. Rasenmäher und Heckenscheren sind
          besonders unfallträchtig: Sie sind grundsätzlich erst ab 15 Jahren vorgesehen. Für jüngere oder
          vollzeitschulpflichtige Jugendliche kann die Tätigkeit wegen der Unfallgefahr unzulässig sein. Solche
          Tätigkeiten dürfen deshalb nur in Absprache mit den Erziehungsberechtigten vereinbart werden.
        </p>
        <p>
          Wir prüfen Nutzer und Inhalte im Rahmen unserer technischen und organisatorischen Möglichkeiten.
          Außerdem stellen wir Melde-, Sperr- und Sicherheitsfunktionen bereit. Eine Verifizierung bedeutet
          jedoch nicht, dass eine Person vollständig zuverlässig, geeignet oder ungefährlich ist. Sie bestätigt
          ausschließlich die geprüften Identitäts- und Altersdaten.
        </p>
        <p>
          Wir führen die Arbeiten nicht selbst aus. Sie werden ausschließlich zwischen Auftraggeber und helfender
          Person durchgeführt, bei Jugendlichen mit Zustimmung der gesetzlichen Vertretung. Deshalb können und werden
          wir nicht für Sach- und Personenschäden aufkommen, die bei der Ausführung eines Auftrags entstehen. Wir
          bieten derzeit keine eigene Versicherung an. Die Beteiligten sollten vorab klären, ob eine private
          Haftpflichtversicherung Gartenhilfe abdeckt.
        </p>
        <p>
          Wir können nicht ausschließen, dass Nutzer falsche Angaben machen oder sich trotz
          Sicherheitsmaßnahmen rechtswidrig oder gefährlich verhalten. GreenMatch haftet jedoch nicht pauschal
          für sämtliche Ereignisse im Zusammenhang mit einem Auftrag. Zwingende gesetzliche Haftung,
          insbesondere für vorsätzliches oder grob fahrlässiges Verhalten, Verletzungen von Leben, Körper oder
          Gesundheit sowie eigene Pflichtverletzungen, bleibt unberührt.
        </p>
        <p>
          Bei einer akuten Gefahr ist unverzüglich der Notruf <strong>112</strong> zu wählen.
          Sicherheitsvorfälle, unangemessene Nachrichten und gefährliche Aufträge müssen zusätzlich sofort über
          die Plattform gemeldet werden.
        </p>
        <p>
          Die Plattform ist kein Ersatz für eine rechtliche Prüfung der konkreten Tätigkeit. Auftraggeber und
          gesetzliche Vertreter müssen eigenständig prüfen, ob eine Tätigkeit nach Alter, Dauer, Ort und Art
          zulässig ist.
        </p>
        <p>
          Die Plattform muss bei rechtswidrigen Inhalten oder Meldungen über Gefahren über ein geeignetes
          Melde- und Abhilfeverfahren verfügen. Für Vermittlungsdienste gelten außerdem je nach Einordnung und
          Größe Transparenz-, Kontaktstellen-, Moderations- und Beschwerdepflichten nach dem Digital Services
          Act.
        </p>
        <p className="border-t border-glass-border pt-5 text-sm text-muted-foreground">
          Weitere Informationen:{" "}
          <Link to="/eltern-info" className="text-primary underline">
            Für Eltern
          </Link>
          {" · "}
          <Link to="/datenschutz" className="text-primary underline">
            Datenschutz
          </Link>
          {" · "}
          <Link to="/freiburg" className="text-primary underline">
            Gartenhilfe Freiburg
          </Link>
          {" · "}
          <Link to="/" className="text-primary underline">
            Startseite
          </Link>
        </p>
      </main>
    </div>
  );
}

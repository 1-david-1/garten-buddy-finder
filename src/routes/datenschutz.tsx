import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicPage } from "@/components/public-page";

/**
 * Datenschutzerklärung (öffentlich, ohne Login).
 * ENTWURF auf Basis des tatsächlichen Datenflusses der App. Vor dem öffentlichen Start:
 *  - Eckige Klammern [...] ausfüllen (Name und Anschrift des Verantwortlichen, Aufsichtsbehörde,
 *    Serverstandorte der Dienstleister und Verträge zur Auftragsverarbeitung),
 *  - anwaltlich bzw. durch einen Datenschutzbeauftragten prüfen lassen,
 *  - bei Änderungen am Datenfluss (neue Dienstleister, Analyse-Tools, Zahlungen) aktualisieren.
 */
export const Route = createFileRoute("/datenschutz")({
  head: () => ({
    meta: [
      { title: "Datenschutzerklärung · GreenMatch" },
      {
        name: "description",
        content:
          "Welche Daten GreenMatch verarbeitet, wozu, wie lange und welche Rechte Sie haben. Inklusive Ausweisprüfung und Jugendschutz.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <PublicPage title="Datenschutzerklärung">
      <p className="text-sm text-muted-foreground">Stand: 21. Oktober 2026</p>

      <h2 className="pt-2 font-brand text-2xl">1. Verantwortlicher</h2>
      <p>
        Verantwortlich für die Datenverarbeitung auf GreenMatch ist [Vor- und Nachname], [Straße und Hausnummer, PLZ Ort].
        Kontakt:{" "}
        <a href="mailto:david@inbox-elevate.de" className="text-primary underline">
          david@inbox-elevate.de
        </a>
        . Dieses Projekt verfolgt derzeit ausschließlich ideelle Zwecke, die Nutzung ist kostenlos.
      </p>

      <h2 className="pt-2 font-brand text-2xl">2. Welche Daten wir verarbeiten</h2>
      <ul className="list-disc space-y-1.5 pl-5">
        <li>
          <strong>Konto und Profil:</strong> E-Mail-Adresse, Passwort (nur als geschützter Hash), Name, gewählte Rolle,
          Ort, Postleitzahl, Profiltext, bei Profis Firmenname und USt-IdNr.
        </li>
        <li>
          <strong>Jugendliche und Eltern:</strong> Geburtsdatum und E-Mail der Eltern (in einem getrennten, geschützten
          Bereich), Einverständniserklärung, Eltern-Konto, Freigaben je Auftrag.
        </li>
        <li>
          <strong>Ausweisprüfung:</strong> das hochgeladene Foto des Ausweises (nur für die Prüfung), Prüfergebnis,
          Prüfdatum, Prüfverfahren und die Version der erteilten Einwilligung.
        </li>
        <li>
          <strong>Nutzung der Plattform:</strong> Aufträge, Gebote, Buchungen, Chat-Nachrichten, Bewertungen, Meldungen
          und Benachrichtigungen.
        </li>
        <li>
          <strong>Technische Daten:</strong> IP-Adresse, Zeitpunkt und Browser-Angaben in den Server-Protokollen des
          Hosters.
        </li>
      </ul>

      <h2 className="pt-2 font-brand text-2xl">3. Zwecke und Rechtsgrundlagen</h2>
      <ul className="list-disc space-y-1.5 pl-5">
        <li>Bereitstellung der Plattform und Vermittlung von Aufträgen: Art. 6 Abs. 1 lit. b DSGVO.</li>
        <li>
          Ausweisprüfung: Ihre Einwilligung, Art. 6 Abs. 1 lit. a DSGVO, sowie unser berechtigtes Interesse am Schutz
          Minderjähriger und aller Nutzer, Art. 6 Abs. 1 lit. f DSGVO.
        </li>
        <li>
          Nutzung durch Jugendliche: Einwilligung der Erziehungsberechtigten, Art. 6 Abs. 1 lit. a und Art. 8 DSGVO.
        </li>
        <li>Sicherheit, Missbrauchsabwehr, Melden und Sperren: Art. 6 Abs. 1 lit. f DSGVO.</li>
        <li>
          Benachrichtigungen per E-Mail zu Ihren Aufträgen: Art. 6 Abs. 1 lit. b DSGVO. Einstellungen dazu finden Sie in
          Ihrem Profil.
        </li>
      </ul>

      <h2 className="pt-2 font-brand text-2xl">4. Ausweisprüfung</h2>
      <p>
        Alle Nutzer, auch Auftraggeber, weisen sich per Ausweis aus. Sie laden ein Foto Ihres Ausweises hoch, auf dem Sie
        nicht benötigte Angaben geschwärzt haben. Erlaubt sind ausschließlich Bilder (JPG, PNG, WebP). Das Bild wird in Ihrem
        Browser neu erzeugt, dabei fallen versteckte Zusatzdaten und Standortdaten weg. Unser Team prüft das Bild von Hand.
        Nach der Prüfung löschen wir die Kopie, gespeichert bleiben nur Ergebnis, Prüfdatum und Prüfverfahren. Die
        Einwilligung können Sie jederzeit mit Wirkung für die Zukunft widerrufen, schreiben Sie uns dazu an die oben
        genannte Adresse.
      </p>

      <h2 className="pt-2 font-brand text-2xl">5. Dienstleister und Empfänger</h2>
      <ul className="list-disc space-y-1.5 pl-5">
        <li>
          <strong>Supabase:</strong> Datenbank, Anmeldung und Dateispeicher. [Serverstandort und Vertrag zur
          Auftragsverarbeitung eintragen]
        </li>
        <li>
          <strong>Cloudflare:</strong> Hosting und Auslieferung der Website. [Vertrag zur Auftragsverarbeitung eintragen]
        </li>
        <li>
          <strong>Resend:</strong> Versand von E-Mails (Benachrichtigungen, Eltern-Freigaben). [Vertrag zur
          Auftragsverarbeitung eintragen]
        </li>
        <li>
          <strong>Google:</strong> nur wenn Sie sich mit Google anmelden. Außerdem laden wir derzeit Schriftarten von
          Google Fonts, dabei wird Ihre IP-Adresse an Google übertragen.
        </li>
      </ul>
      <p>
        Einige Dienstleister können Daten auch in Ländern außerhalb der EU verarbeiten. Dann stützen wir uns auf einen
        Angemessenheitsbeschluss oder Standardvertragsklauseln. [Prüfen und konkretisieren]
      </p>

      <h2 className="pt-2 font-brand text-2xl">6. Speicherdauer</h2>
      <p>
        Kontodaten speichern wir, bis Sie Ihr Konto löschen. Ausweiskopien löschen wir nach der Prüfung. Aufträge und
        Nachrichten bewahren wir so lange auf, wie sie für die Abwicklung, für Bewertungen und für die Sicherheit der
        Plattform erforderlich sind, spätestens bis zur Löschung des Kontos, soweit keine gesetzlichen Pflichten
        entgegenstehen. Server-Protokolle werden nur kurzzeitig gespeichert. [Fristen bei Bedarf konkretisieren]
      </p>

      <h2 className="pt-2 font-brand text-2xl">7. Cookies und lokaler Speicher</h2>
      <p>
        Wir setzen keine Werbe- oder Tracking-Cookies ein. Im lokalen Speicher Ihres Browsers legen wir nur technisch
        notwendige Daten ab: Ihre Anmeldung, die gewählte Sprache und Einstellungen Ihres Dashboards.
      </p>

      <h2 className="pt-2 font-brand text-2xl">8. Jugendliche und Eltern</h2>
      <p>
        Jugendliche ab 13 Jahren nutzen GreenMatch nur mit Einwilligung ihrer Erziehungsberechtigten. Diese können jederzeit
        Auskunft über die Daten ihres Kindes verlangen und deren Löschung beantragen. Mehr dazu:{" "}
        <Link to="/eltern-info" className="text-primary underline">
          Für Eltern
        </Link>
        .
      </p>

      <h2 className="pt-2 font-brand text-2xl">9. Sicherheit</h2>
      <p>
        Die Übertragung ist verschlüsselt. Der Zugriff auf Daten ist über Zugriffsregeln in der Datenbank auf die jeweils
        berechtigten Personen beschränkt, Eingaben wie Namen werden geprüft und HTML in Nutzertexten wird neutralisiert,
        Datei-Uploads sind auf Bilder begrenzt.
      </p>

      <h2 className="pt-2 font-brand text-2xl">10. Ihre Rechte</h2>
      <p>
        Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und
        Widerspruch (Art. 15 bis 21 DSGVO) sowie das Recht, erteilte Einwilligungen zu widerrufen. Wenden Sie sich dazu an
        die oben genannte Adresse. Außerdem können Sie sich bei einer Datenschutz-Aufsichtsbehörde beschweren. [Zuständige
        Aufsichtsbehörde eintragen]
      </p>

      <h2 className="pt-2 font-brand text-2xl">11. Änderungen</h2>
      <p>
        Wir passen diese Erklärung an, wenn sich die Plattform oder die Rechtslage ändert. Es gilt die jeweils hier
        veröffentlichte Fassung.
      </p>
    </PublicPage>
  );
}

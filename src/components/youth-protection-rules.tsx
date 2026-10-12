import { ShieldCheck } from "lucide-react";

/**
 * Textbausteine der Verifizierung: Ausweisprüfung (für alle Gruppen, in jeweils
 * anderer Form) und Regelungen für den Jugendschutz.
 */

/** Hinweise zur Ausweisprüfung - vor jedem Ausweis-Upload anzeigen. */
export function IdCheckNotice({ subject = "deiner" }: { subject?: "deiner" | "der" }) {
  return (
    <div className="space-y-3 rounded-xl border border-glass-border bg-muted/20 p-4 text-xs leading-relaxed">
      <p className="text-sm font-semibold">Ausweisprüfung</p>
      <p>
        Zur Prüfung {subject === "deiner" ? "deiner" : "der"} Identität und {subject === "deiner" ? "deines" : "des"}{" "}
        Alters musst du ein Foto eines gültigen Ausweisdokuments hochladen. Bitte lade nur eine Kopie hoch, auf
        der die für unsere Prüfung erforderlichen Angaben sichtbar sind:
      </p>
      <ul className="list-disc space-y-0.5 pl-5">
        <li>Vorname und Nachname,</li>
        <li>Geburtsdatum,</li>
        <li>Stadt des Wohnsitzes,</li>
        <li>gegebenenfalls Gültigkeitsdatum.</li>
      </ul>
      <p>Bitte schwärze vor dem Upload dauerhaft:</p>
      <ul className="list-disc space-y-0.5 pl-5">
        <li>Ausweisnummer und Seriennummer,</li>
        <li>Zugangsnummer beziehungsweise CAN,</li>
        <li>maschinenlesbare Zone,</li>
        <li>Straße, Hausnummer und vollständige Anschrift,</li>
        <li>Lichtbild, sofern es für die Prüfung nicht erforderlich ist,</li>
        <li>Größe,</li>
        <li>Augenfarbe,</li>
        <li>Staatsangehörigkeit,</li>
        <li>Geburtsort,</li>
        <li>Unterschrift,</li>
        <li>alle weiteren Angaben, die für die Identitäts- und Altersprüfung nicht erforderlich sind.</li>
      </ul>
      <p>
        Die Ausweiskopie wird ausschließlich zur Identitäts- und Altersprüfung verwendet. Nach Abschluss der
        Prüfung speichern wir grundsätzlich nur das Prüfergebnis sowie Prüfdatum und Prüfverfahren. Die
        hochgeladene Kopie wird anschließend gelöscht, soweit keine gesetzliche oder konkret begründete
        sicherheitsbezogene Aufbewahrungspflicht besteht.
      </p>
      <p className="text-muted-foreground">
        Die Ausweisprüfung bedeutet nicht, dass eine Person vollständig auf ihre Zuverlässigkeit oder persönliche
        Eignung geprüft wurde. Sie bestätigt lediglich, dass die angegebenen Identitäts- und Altersdaten anhand
        des vorgelegten Dokuments geprüft wurden.
      </p>
    </div>
  );
}

/** Regelungen für den Jugendschutz. */
export function YouthProtectionRules({ className = "" }: { className?: string }) {
  return (
    <div className={`space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-4 text-xs leading-relaxed ${className}`}>
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <ShieldCheck className="size-4 text-primary" />
        Regelungen für den Jugendschutz
      </p>
      <p>
        Die Nutzung für Gartenarbeiten ist ab dem vollendeten 13. Lebensjahr möglich. Voraussetzung ist die
        Zustimmung der gesetzlichen Vertretung. Es dürfen ausschließlich leichte, geeignete und ungefährliche
        Tätigkeiten vermittelt werden. Die Tätigkeit darf höchstens zwei Stunden täglich dauern, nur zwischen
        08:00 Uhr und 18:00 Uhr stattfinden und nicht während des Schulunterrichts ausgeübt werden.
      </p>
    </div>
  );
}

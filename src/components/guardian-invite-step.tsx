import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { Copy, Loader2, Mail, MessageCircle, Printer, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NO_PARENT_EMAIL_OPTION } from "@/lib/consent-texts";
import { inviteGuardian } from "@/lib/guardian.functions";
import type { MyVerification } from "@/lib/verification.functions";

const ERRORS: Record<string, string> = {
  recently_sent: "Die E-Mail wurde gerade erst gesendet. Bitte warte ein paar Minuten.",
  already_linked: "Das Eltern-Konto ist schon verknüpft.",
  not_youth: "Das ist nur für Jugendliche möglich.",
};

function errorText(e: unknown) {
  const m = (e as Error)?.message ?? "";
  for (const [code, text] of Object.entries(ERRORS)) if (m.includes(code)) return text;
  return "Das hat nicht geklappt. Bitte versuche es später noch einmal.";
}

/**
 * Schritt 1 der Jugend-Verifizierung: Eltern-Zusatzkonto (Pflicht).
 * Variante A: E-Mail der Eltern eingeben -> sie bekommen Einverständniserklärung + Einladung.
 * Variante B: "Ohne E-Mail" -> Kind bekommt einen Link und gibt ihn den Eltern selbst weiter.
 */
export function GuardianInviteStep({
  account,
  onChanged,
}: {
  account: NonNullable<MyVerification["guardianAccount"]>;
  onChanged: () => void;
}) {
  const inviteFn = useServerFn(inviteGuardian);
  const [email, setEmail] = useState("");
  const [withoutEmail, setWithoutEmail] = useState(account.inviteWithoutEmail);
  const [link, setLink] = useState<string | null>(null);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

  const invite = useMutation({
    mutationFn: () =>
      withoutEmail
        ? inviteFn({ data: { withoutEmail: true } })
        : inviteFn({ data: { withoutEmail: false, email: email.trim() } }),
    onSuccess: (res) => {
      if (withoutEmail) {
        setLink(res.link);
        toast.success("Link erstellt. Gib ihn jetzt an deine Eltern weiter.");
      } else {
        setLink(null);
        toast.success(`Einverständniserklärung und Einladung gesendet an ${res.emailMasked}.`);
      }
      onChanged();
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const shareText = link
    ? `Hallo! Ich möchte bei GreenMatch leichte Gartenarbeiten für Nachbarn machen. Dafür brauche ich dein Einverständnis und ein Eltern-Konto: ${link}`
    : "";

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link kopiert.");
    } catch {
      toast.error("Kopieren hat nicht geklappt – markiere den Link und kopiere ihn von Hand.");
    }
  }

  async function share() {
    if (!link) return;
    try {
      await navigator.share({ title: "GreenMatch – Eltern-Konto", text: shareText });
    } catch {
      /* abgebrochen */
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-glass-border p-4">
      <div className="space-y-1">
        <p className="text-sm font-semibold">Schritt 1: Eltern-Konto</p>
        <p className="text-xs text-muted-foreground">
          Für deine Sicherheit ist ein Eltern-Konto Pflicht. Dort sehen deine Eltern deine Aufträge
          (Ort, Zeit, Auftraggeber, Art der Tätigkeit), geben jeden Auftrag frei und können dein
          Konto jederzeit pausieren.
        </p>
      </div>

      {account.state === "invited" && !link && (
        <p className="rounded-lg bg-amber-400/10 p-2 text-xs text-amber-400">
          {account.inviteWithoutEmail
            ? "Elternbestätigung ausstehend: Du hast einen Link erstellt, aber deine Eltern haben das Konto noch nicht angelegt. Erzeuge bei Bedarf unten einen neuen Link."
            : `Einladung gesendet${account.inviteEmailMasked ? ` an ${account.inviteEmailMasked}` : ""}. Deine Eltern haben das Konto noch nicht angelegt.`}
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="parent-email" className="text-xs">
          E-Mail-Adresse deiner Eltern
        </Label>
        <Input
          id="parent-email"
          type="email"
          value={email}
          disabled={withoutEmail}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="eltern@beispiel.de"
        />
        <p className="text-[11px] text-muted-foreground">
          Dorthin schicken wir die Einverständniserklärung und die Einladung zum Eltern-Konto.
        </p>
      </div>

      <div className="flex items-start gap-3">
        <Checkbox
          id="without-email"
          checked={withoutEmail}
          onCheckedChange={(v) => {
            setWithoutEmail(v === true);
            setLink(null);
          }}
          className="mt-0.5"
        />
        <Label htmlFor="without-email" className="text-xs font-normal leading-relaxed">
          {NO_PARENT_EMAIL_OPTION}
        </Label>
      </div>

      <Button
        className="w-full"
        disabled={invite.isPending || (!withoutEmail && !emailValid)}
        onClick={() => invite.mutate()}
      >
        {invite.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
        {withoutEmail
          ? "Link für meine Eltern erstellen"
          : account.state === "invited"
            ? "Einladung erneut senden"
            : "Einverständniserklärung an Eltern senden"}
      </Button>

      {link && (
        <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="text-xs">
            Gib diesen Link deinen Eltern. Sie legen damit ihr eigenes Eltern-Konto an, lassen ihre
            Identität prüfen, bestätigen die Verbindung zu dir und geben die Einwilligung ab. Der
            bloße Link ersetzt das nicht – bis dahin ist die Elternbestätigung ausstehend und dein
            Profil für keinen Auftrag freigeschaltet.
          </p>
          <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="text-xs" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={copy} className="gap-1.5">
              <Copy className="size-3.5" />
              Kopieren
            </Button>
            {typeof navigator !== "undefined" && "share" in navigator && (
              <Button size="sm" variant="outline" onClick={share} className="gap-1.5">
                <Share2 className="size-3.5" />
                Teilen
              </Button>
            )}
            <Button size="sm" variant="outline" asChild className="gap-1.5">
              <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer noopener">
                <MessageCircle className="size-3.5" />
                WhatsApp
              </a>
            </Button>
            <Button size="sm" variant="outline" asChild className="gap-1.5">
              <a
                href={`mailto:?subject=${encodeURIComponent("GreenMatch: Eltern-Konto")}&body=${encodeURIComponent(shareText)}`}
              >
                <Mail className="size-3.5" />
                Selbst mailen
              </a>
            </Button>
            <Button size="sm" variant="outline" asChild className="gap-1.5">
              <a href="/einverstaendniserklaerung" target="_blank" rel="noreferrer">
                <Printer className="size-3.5" />
                Erklärung drucken
              </a>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

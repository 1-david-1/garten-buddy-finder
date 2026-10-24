import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Clock, Loader2, Lock, ShieldCheck, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { YouthProtectionRules } from "@/components/youth-protection-rules";
import { useAuth } from "@/lib/auth";
import {
  acceptGuardianByRegistrationFn,
  getGuardianRegistration,
  registerGuardianFn,
} from "@/lib/guardian.functions";

/**
 * Eltern-Registrierung per E-Mail-Link.
 * Der Link steht nur in der Mail an die Eltern. Die E-Mail-Adresse ist bereits eingetragen (nicht änderbar);
 * die Eltern legen nur noch Namen und Passwort fest. Danach ist das Eltern-Konto mit dem Kind verknüpft.
 * Eltern, die mit dieser Adresse schon ein Konto haben, melden sich hier an und werden verknüpft.
 */
export const Route = createFileRoute("/eltern-registrierung/$token")({
  head: () => ({
    meta: [
      { title: "Eltern-Konto anlegen · GreenMatch" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: GuardianRegistrationPage,
});

const ERRORS: Record<string, string> = {
  invalid_token:
    "Dieser Link ist nicht (mehr) gültig. Vielleicht wurde er durch eine neuere E-Mail ersetzt oder schon verwendet.",
  expired: "Der Link ist abgelaufen. Ihr Kind kann in der App eine neue Einladung senden.",
  weak_password: "Das Passwort ist zu schwach. Bitte wählen Sie mindestens 8 Zeichen.",
  email_mismatch:
    "Sie sind mit einer anderen E-Mail-Adresse angemeldet. Bitte melden Sie sich mit der Adresse aus der Einladung an.",
  email_not_confirmed: "Die E-Mail-Adresse dieses Kontos ist noch nicht bestätigt.",
  guardian_is_youth: "Mit einem Jugendlichen-Konto kann kein Eltern-Konto angelegt werden.",
  own_account: "Das ist das Konto des Kindes selbst. Bitte nutzen Sie ein Konto eines Elternteils.",
  register_failed: "Das Konto konnte nicht angelegt werden. Bitte versuchen Sie es in ein paar Minuten erneut.",
};

function errorText(e: unknown): string {
  const m = (e as Error)?.message ?? "";
  const hit = Object.entries(ERRORS).find(([code]) => m.includes(code));
  if (hit) return hit[1];
  if (/zu viele|too many|rate/i.test(m)) return "Zu viele Versuche. Bitte warten Sie einige Minuten.";
  // Name-Prüfung (Zod) liefert eine verständliche deutsche Meldung
  if (/Zeichen|Buchstabe|Name/i.test(m) && m.length < 200) return m;
  return "Das hat nicht geklappt. Bitte versuchen Sie es erneut.";
}

function GuardianRegistrationPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const lookupFn = useServerFn(getGuardianRegistration);
  const registerFn = useServerFn(registerGuardianFn);
  const acceptFn = useServerFn(acceptGuardianByRegistrationFn);

  const [mode, setMode] = useState<"new" | "existing">("new");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [confirmedParent, setConfirmedParent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["guardian-registration", token],
    queryFn: () => lookupFn({ data: { token } }),
    retry: false,
  });
  const data = query.data;
  const open = data?.state === "open" ? data : null;

  const goToGuardianArea = () => navigate({ to: "/eltern", replace: true });

  // Neues Konto: anlegen (Server) -> anmelden -> zum Eltern-Konto
  const register = useMutation({
    mutationFn: async () => {
      const res = await registerFn({
        data: { token, fullName, password, confirmedParent: true },
      });
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: res.email,
        password,
      });
      if (signInError) throw signInError;
    },
    onSuccess: goToGuardianArea,
    onError: (e) => {
      if (((e as Error).message ?? "").includes("account_exists")) {
        // Für diese Adresse gibt es schon ein Konto: auf "Anmelden" umschalten
        setMode("existing");
        setPassword("");
        setPassword2("");
        setError(null);
        setInfo(
          "Für diese E-Mail-Adresse gibt es schon ein Konto. Bitte melden Sie sich mit Ihrem Passwort an – dann verknüpfen wir es mit Ihrem Kind.",
        );
        return;
      }
      setInfo(null);
      setError(errorText(e));
    },
  });

  // Vorhandenes Konto: anmelden (falls nötig) -> verknüpfen -> zum Eltern-Konto
  const linkExisting = useMutation({
    mutationFn: async () => {
      if (!user) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: open!.email,
          password,
        });
        if (signInError) throw new Error("Anmeldung fehlgeschlagen. Bitte prüfen Sie Ihr Passwort.");
      }
      await acceptFn({ data: { token } });
    },
    onSuccess: goToGuardianArea,
    onError: (e) => {
      const m = (e as Error).message ?? "";
      setInfo(null);
      setError(m.startsWith("Anmeldung fehlgeschlagen") ? m : errorText(e));
    },
  });

  const sameAccount =
    !!user && !!open && (user.email ?? "").trim().toLowerCase() === open.email.trim().toLowerCase();
  const otherAccount = !!user && !!open && !sameAccount;

  const passwordsOk = password.length >= 8 && password === password2;
  const canRegister = fullName.trim().length >= 2 && passwordsOk && confirmedParent && !register.isPending;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-glass-border">
        <div className="mx-auto flex h-16 max-w-2xl items-center px-4">
          <Link to="/" className="font-brand text-2xl text-primary">
            GreenMatch<span className="text-foreground">.</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-4 py-12">
        {query.isLoading && <p className="text-muted-foreground">Lädt…</p>}

        {(query.isError || data?.state === "invalid") && (
          <Notice
            icon={<XCircle className="size-6 text-destructive" />}
            title="Dieser Link ist nicht (mehr) gültig"
            body="Vielleicht wurde er durch eine neuere E-Mail ersetzt oder schon verwendet. Ihr Kind kann in der App jederzeit eine neue Einladung senden."
          />
        )}

        {data?.state === "expired" && (
          <Notice
            icon={<Clock className="size-6 text-amber-400" />}
            title="Der Link ist abgelaufen"
            body={`${data.childName} kann in der App eine neue Einladung senden.`}
          />
        )}

        {open && (
          <>
            <div>
              <span className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-primary">
                <ShieldCheck className="size-3.5" />
                Eltern-Konto
              </span>
              <h1 className="font-brand text-3xl leading-tight">
                {open.childName} möchte bei GreenMatch Gartenhilfe anbieten
              </h1>
              <p className="mt-3 text-muted-foreground">
                Das ist ab 13 Jahren nur mit Ihrer Zustimmung möglich. Legen Sie dafür Ihr kostenloses
                Eltern-Konto an – Ihre E-Mail-Adresse ist bereits eingetragen, Sie müssen nur noch ein
                Passwort festlegen.
              </p>
            </div>

            <div className="space-y-4 rounded-2xl border border-glass-border bg-glass p-6 backdrop-blur">
              {/* E-Mail: aus der Einladung übernommen, nicht änderbar */}
              <div>
                <Label htmlFor="guardian-email">E-Mail-Adresse</Label>
                <div className="relative mt-1">
                  <Input
                    id="guardian-email"
                    type="email"
                    value={open.email}
                    readOnly
                    disabled
                    autoComplete="email"
                    className="pr-9"
                  />
                  <Lock className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Diese Adresse hat Ihr Kind angegeben. Sie ist bestätigt, weil Sie diese E-Mail erhalten haben.
                </p>
              </div>

              {info && (
                <p className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm">{info}</p>
              )}

              {/* Variante A: neues Konto */}
              {mode === "new" && !user && (
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setError(null);
                    setInfo(null);
                    register.mutate();
                  }}
                >
                  <div>
                    <Label htmlFor="guardian-name">Ihr vollständiger Name</Label>
                    <Input
                      id="guardian-name"
                      type="text"
                      required
                      maxLength={60}
                      autoComplete="name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="mt-1"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Bitte so, wie er auf Ihrem Ausweis steht – das Team gleicht ihn bei der Prüfung ab.
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="guardian-password">Passwort festlegen</Label>
                    <Input
                      id="guardian-password"
                      type="password"
                      required
                      minLength={8}
                      maxLength={72}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="mt-1"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">Mindestens 8 Zeichen.</p>
                  </div>
                  <div>
                    <Label htmlFor="guardian-password2">Passwort wiederholen</Label>
                    <Input
                      id="guardian-password2"
                      type="password"
                      required
                      maxLength={72}
                      autoComplete="new-password"
                      value={password2}
                      onChange={(e) => setPassword2(e.target.value)}
                      className="mt-1"
                    />
                    {password2.length > 0 && password !== password2 && (
                      <p className="mt-1 text-xs text-destructive">Die Passwörter stimmen nicht überein.</p>
                    )}
                  </div>

                  <label className="flex items-start gap-3 text-sm">
                    <Checkbox
                      checked={confirmedParent}
                      onCheckedChange={(v) => setConfirmedParent(v === true)}
                      className="mt-0.5"
                    />
                    <span>
                      Ich bin Elternteil bzw. Erziehungsberechtigte/r von <strong>{open.childName}</strong> und
                      möchte mein Konto als Eltern-Konto mit diesem Kind verknüpfen.
                    </span>
                  </label>

                  {error && <p className="text-sm text-destructive">{error}</p>}

                  <Button type="submit" size="lg" className="w-full" disabled={!canRegister}>
                    {register.isPending ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" /> Konto wird angelegt…
                      </>
                    ) : (
                      "Eltern-Konto anlegen"
                    )}
                  </Button>

                  <button
                    type="button"
                    onClick={() => {
                      setMode("existing");
                      setError(null);
                      setInfo(null);
                    }}
                    className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
                  >
                    Ich habe mit dieser Adresse schon ein GreenMatch-Konto – anmelden
                  </button>
                </form>
              )}

              {/* Variante B: vorhandenes Konto, noch nicht angemeldet */}
              {mode === "existing" && !user && (
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setError(null);
                    setInfo(null);
                    linkExisting.mutate();
                  }}
                >
                  <div>
                    <Label htmlFor="guardian-login-password">Ihr Passwort</Label>
                    <Input
                      id="guardian-login-password"
                      type="password"
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <label className="flex items-start gap-3 text-sm">
                    <Checkbox
                      checked={confirmedParent}
                      onCheckedChange={(v) => setConfirmedParent(v === true)}
                      className="mt-0.5"
                    />
                    <span>
                      Ich bin Elternteil bzw. Erziehungsberechtigte/r von <strong>{open.childName}</strong> und
                      möchte mein Konto als Eltern-Konto mit diesem Kind verknüpfen.
                    </span>
                  </label>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full"
                    disabled={!password || !confirmedParent || linkExisting.isPending}
                  >
                    {linkExisting.isPending ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" /> Wird verknüpft…
                      </>
                    ) : (
                      "Anmelden und verknüpfen"
                    )}
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("new");
                      setError(null);
                      setInfo(null);
                    }}
                    className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
                  >
                    Noch kein Konto? Neu anlegen
                  </button>
                </form>
              )}

              {/* Bereits mit der richtigen Adresse angemeldet */}
              {sameAccount && (
                <div className="space-y-4">
                  <label className="flex items-start gap-3 text-sm">
                    <Checkbox
                      checked={confirmedParent}
                      onCheckedChange={(v) => setConfirmedParent(v === true)}
                      className="mt-0.5"
                    />
                    <span>
                      Ich bin Elternteil bzw. Erziehungsberechtigte/r von <strong>{open.childName}</strong> und
                      möchte mein Konto als Eltern-Konto mit diesem Kind verknüpfen.
                    </span>
                  </label>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button
                    size="lg"
                    className="w-full"
                    disabled={!confirmedParent || linkExisting.isPending}
                    onClick={() => {
                      setError(null);
                      linkExisting.mutate();
                    }}
                  >
                    {linkExisting.isPending ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" /> Wird verknüpft…
                      </>
                    ) : (
                      "Eltern-Konto verknüpfen"
                    )}
                  </Button>
                </div>
              )}

              {/* Mit einer anderen Adresse angemeldet */}
              {otherAccount && (
                <div className="space-y-3">
                  <p className="text-sm">
                    Sie sind aktuell mit <strong>{user?.email}</strong> angemeldet. Für diese Einladung brauchen
                    Sie ein Konto mit der oben genannten Adresse.
                  </p>
                  <Button variant="outline" className="w-full" onClick={() => void signOut()}>
                    Abmelden und fortfahren
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-2 rounded-2xl border border-glass-border bg-glass p-5 text-sm backdrop-blur">
              <p>
                <strong>Alle Auftragsdaten im Blick:</strong> Ort, Zeit, Auftraggeber und Art der Tätigkeit.
              </p>
              <p>
                <strong>Jeden Auftrag einzeln freigeben</strong> – ohne Ihre Freigabe kann Ihr Kind keinen
                Auftrag annehmen.
              </p>
              <p>
                <strong>Nächste Schritte nach dem Anlegen:</strong> Einverständniserklärung unterschreiben und
                zusammen mit den Ausweisen von Ihnen und Ihrem Kind hochladen. Danach prüft unser Team die
                Unterlagen.
              </p>
            </div>

            <YouthProtectionRules />

            <p className="text-xs text-muted-foreground">
              Sie haben diese Einladung nicht erwartet? Dann schließen Sie diese Seite einfach – es wird nichts
              angelegt.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function Notice({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-glass-border bg-glass p-6 backdrop-blur">
      <span className="mt-0.5">{icon}</span>
      <div>
        <h1 className="font-brand text-2xl">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

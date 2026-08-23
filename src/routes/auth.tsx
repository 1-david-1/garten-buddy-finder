import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { SiteNav } from "@/components/site-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Anmelden · GreenMatch" }] }),
  validateSearch: (search: Record<string, unknown>): { mode?: "signin" | "signup" } => ({
    mode: search.mode === "signup" ? "signup" : undefined,
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { mode: initialMode } = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">(
    initialMode === "signup" ? "signup" : "signin",
  );
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"helper" | "customer" | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (user) navigate({ to: "/dashboard" });
  }, [user, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      if (mode === "signup") {
        if (!fullName.trim()) throw new Error(t("auth.fullName"));
        if (!role) throw new Error(t("auth.role"));
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + "/dashboard",
            data: { full_name: fullName.trim(), signup_role: role },
          },
        });
        if (error) {
          // Supabase returns "User already registered" or similar for duplicate emails
          const msg = error.message.toLowerCase();
          if (
            msg.includes("already registered") ||
            msg.includes("already been registered") ||
            msg.includes("bereits registriert") ||
            msg.includes("schon vergeben") ||
            msg.includes("user_already_exists")
          ) {
            throw new Error("E-Mail-Adresse schon vergeben");
          }
          throw error;
        }

        // When email confirmations are enabled Supabase may return a user
        // with an empty identities array instead of an error when the email
        // is already taken (to prevent enumeration). Detect that case.
        if (data.user && data.user.identities && data.user.identities.length === 0) {
          throw new Error("E-Mail-Adresse schon vergeben");
        }

        if (data.user && !data.session) {
          setSuccessMessage(
            "Konto erfolgreich erstellt! Falls E-Mail-Bestätigung in Supabase aktiviert ist, prüfe bitte dein E-Mail-Postfach.",
          );
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === "Failed to fetch") {
        setError(
          "Verbindung zum Server fehlgeschlagen (Failed to fetch). Bitte prüfe deine Internetverbindung und stelle sicher, dass die Supabase-Umgebungsvariablen auf Cloudflare Pages konfiguriert sind.",
        );
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const onGoogle = async () => {
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin + "/dashboard" },
      });
      if (error) throw error;
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === "Failed to fetch") {
        setError("Verbindung zu Supabase fehlgeschlagen (Failed to fetch).");
      } else {
        setError(msg);
      }
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav />
      <div className="mx-auto flex max-w-md flex-col px-4 py-16">
        <h1 className="font-brand text-3xl">{t("auth.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("auth.subtitle")}</p>

        <form
          onSubmit={onSubmit}
          className="mt-8 space-y-4 rounded-2xl border border-glass-border bg-glass p-6 backdrop-blur"
        >
          {mode === "signup" && (
            <div>
              <Label htmlFor="fullName">{t("auth.fullName")}</Label>
              <Input
                id="fullName"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1"
              />
            </div>
          )}
          {mode === "signup" && (
            <div>
              <Label>{t("auth.role")}</Label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <RoleOption
                  active={role === "helper"}
                  onClick={() => setRole("helper")}
                  label={t("auth.role.helper")}
                />
                <RoleOption
                  active={role === "customer"}
                  onClick={() => setRole("customer")}
                  label={t("auth.role.customer")}
                />
              </div>
            </div>
          )}
          <div>
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="password">{t("auth.password")}</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1"
            />
          </div>
          {successMessage && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">
              {successMessage}
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading
              ? t("common.loading")
              : mode === "signin"
                ? t("auth.signin")
                : t("auth.signup")}
          </Button>
          <div className="relative py-2 text-center text-xs text-muted-foreground">
            <span className="bg-glass px-2 relative z-10">{t("auth.or")}</span>
            <div className="absolute left-0 right-0 top-1/2 -z-0 h-px bg-glass-border" />
          </div>
          <Button type="button" variant="outline" className="w-full" onClick={onGoogle}>
            {t("auth.google")}
          </Button>
          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="w-full pt-2 text-center text-xs text-muted-foreground hover:text-foreground"
          >
            {mode === "signin" ? t("auth.toggleToSignup") : t("auth.toggleToSignin")}
          </button>
        </form>
      </div>
    </div>
  );
}

function RoleOption({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "border-primary bg-primary/15 text-primary"
          : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      }`}
    >
      {label}
    </button>
  );
}

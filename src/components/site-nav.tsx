import { Link, useNavigate } from "@tanstack/react-router";
import { useI18n, type Locale } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export function SiteNav() {
  const { t, locale, setLocale } = useI18n();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 border-b border-glass-border bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="font-brand text-2xl text-primary">
          GreenMatch<span className="text-foreground">.</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <a href="/#how" className="hover:text-foreground">{t("nav.how")}</a>
          <a href="/#helpers" className="hover:text-foreground">{t("nav.helpers")}</a>
        </nav>
        <div className="flex items-center gap-2">
          <LocaleToggle locale={locale} setLocale={setLocale} />
          {user ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/dashboard" })}>
                {t("nav.dashboard")}
              </Button>
              <Button variant="outline" size="sm" onClick={async () => { await signOut(); navigate({ to: "/" }); }}>
                {t("nav.signout")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/auth" })}>
                {t("nav.signin")}
              </Button>
              <Button size="sm" onClick={() => navigate({ to: "/auth", search: { mode: "signup" } as never })}>
                {t("nav.signup")}
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function LocaleToggle({ locale, setLocale }: { locale: Locale; setLocale: (l: Locale) => void }) {
  return (
    <div className="flex items-center rounded-full border border-glass-border bg-glass p-0.5 text-xs">
      <button
        onClick={() => setLocale("de")}
        className={`rounded-full px-2 py-1 ${locale === "de" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
      >DE</button>
      <button
        onClick={() => setLocale("en")}
        className={`rounded-full px-2 py-1 ${locale === "en" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
      >EN</button>
    </div>
  );
}

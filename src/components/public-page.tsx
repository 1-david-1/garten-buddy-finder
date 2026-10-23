import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

/**
 * Gemeinsamer Rahmen für öffentliche Informationsseiten (ohne Login):
 * Kopfzeile mit Logo, schmale Textspalte und Fußzeile mit allen Informationsseiten,
 * damit jede Seite von jeder anderen und von der Startseite aus erreichbar ist.
 */
export function PublicPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-glass-border">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <Link to="/" className="font-brand text-2xl text-primary">
            GreenMatch<span className="text-foreground">.</span>
          </Link>
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            Zur Startseite
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-12 leading-relaxed">
        <h1 className="font-brand text-3xl">{title}</h1>
        {children}
      </main>

      <footer className="border-t border-glass-border">
        <nav className="mx-auto flex max-w-3xl flex-wrap gap-x-6 gap-y-2 px-4 py-6 text-sm text-muted-foreground">
          <Link to="/" className="hover:text-foreground">
            Startseite
          </Link>
          <Link to="/vermittler" className="hover:text-foreground">
            Unsere Rolle als Vermittler
          </Link>
          <Link to="/eltern-info" className="hover:text-foreground">
            Für Eltern
          </Link>
          <Link to="/freiburg" className="hover:text-foreground">
            Gartenhilfe Freiburg
          </Link>
          <Link to="/datenschutz" className="hover:text-foreground">
            Datenschutz
          </Link>
        </nav>
      </footer>
    </div>
  );
}

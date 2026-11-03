import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";

/**
 * Gemeinsamer Rahmen für öffentliche Informationsseiten (ohne Login):
 * Kopfzeile mit Logo, schmale Textspalte und Fußzeile mit allen Informationsseiten,
 * damit jede Seite von jeder anderen und von der Startseite aus erreichbar ist.
 */
export function PublicPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="gm-playful min-h-screen bg-background text-foreground">
      <header className="bg-[#087f43] text-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <Link to="/" className="font-brand text-2xl text-[#ffd21f]">
            GreenMatch<span className="text-white">.</span>
          </Link>
          <Link to="/" className="text-sm font-semibold underline-offset-4 hover:underline">
            Zur Startseite
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-12 leading-relaxed">
        <h1 className="font-brand text-4xl leading-tight md:text-5xl">{title}</h1>
        {children}
      </main>

      <SiteFooter />
    </div>
  );
}

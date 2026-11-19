import { useRouterState } from "@tanstack/react-router";

// Bewusst von den Routen-Typen entkoppelt: Die Seitenleiste (DashboardShell) steckt in fast jeder Seite. Würde sie die
// vollständig typisierte Router-Zustand-Abfrage nutzen, hinge der Typ jeder Seite vom gesamten Routenbaum ab - und die
// Seiten, die ihre Loader-Daten über Route.useLoaderData() lesen, verlören ihre Typen (Zirkelbezug).
const useRouterStateLoose = useRouterState as unknown as <T>(options: {
  select: (state: { location: { pathname: string } }) => T;
}) => T;

/** Aktueller Pfad, z. B. "/partner/123" */
export function usePathname(): string {
  return useRouterStateLoose({ select: (s) => s.location.pathname });
}

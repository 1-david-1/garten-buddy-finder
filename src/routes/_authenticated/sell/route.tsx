import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMyRoles } from "@/lib/roles.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/sell")({
  component: SellLayout,
});

function SellLayout() {
  const getRoles = useServerFn(getMyRoles);
  const { data, isLoading } = useQuery({
    queryKey: ["my-roles"],
    queryFn: () => getRoles(),
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <p className="text-sm text-muted-foreground">Lädt…</p>
      </div>
    );
  }

  const isHelper = (data?.roles ?? []).some((r) => r.startsWith("helper_"));

  if (!isHelper) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <Card className="border-glass-border bg-glass backdrop-blur">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <h3 className="font-semibold">Nur für Helfer</h3>
            <p className="text-sm text-muted-foreground">
              Um eigene Leistungsangebote zu erstellen, benötigst du ein
              Helfer-Profil.
            </p>
            <Button asChild className="mt-2">
              <Link to="/onboarding">Helfer-Profil einrichten</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <Outlet />;
}

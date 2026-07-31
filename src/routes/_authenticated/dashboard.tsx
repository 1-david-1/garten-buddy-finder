import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { getMyRoles } from "@/lib/roles.functions";
import { SiteNav } from "@/components/site-nav";
import { useI18n } from "@/lib/i18n";

// HINWEIS: Falls in den Dateien 'export default' verwendet wird, 
// nutze 'import HelperDashboard from ...' (ohne geschweifte Klammern).
// Falls 'export function HelperDashboard' genutzt wird, lass die Klammern da.
import { HelperDashboard } from "@/components/dashboard/helper-dashboard";
import { CustomerDashboard } from "@/components/dashboard/customer-dashboard";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardRouter,
});

function DashboardRouter() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const getRoles = useServerFn(getMyRoles);

  const { data, isLoading } = useQuery({
    queryKey: ["my-roles"],
    queryFn: () => getRoles(),
  });

  useEffect(() => {
    // Sobald die Rollen geladen sind und keine Rolle zugewiesen ist, zum Onboarding weiterleiten
    if (data && (!data.roles || data.roles.length === 0)) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [data, navigate]);

  if (isLoading || !data?.roles || data.roles.length === 0) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SiteNav />
        <div className="mx-auto max-w-6xl px-4 py-10">
          <p className="text-muted-foreground">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  const isHelper = data.roles.some((r) => r.startsWith("helper_"));

  if (isHelper) {
    return <HelperDashboard />;
  }

  return <CustomerDashboard />;
}

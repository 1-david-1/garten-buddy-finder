import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { getMyRoles } from "@/lib/roles.functions";
import { SiteNav } from "@/components/site-nav";
import { useI18n } from "@/lib/i18n";
import { QueryErrorCard } from "@/components/query-error-card";
import { useAuth } from "@/lib/auth";

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
  const { user } = useAuth();
  // Eltern-Konten (Registrierung über die Einladung) haben keine Helfer-/Kunden-Rolle.
  const isGuardianSignup = user?.user_metadata?.signup_role === "guardian";

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["my-roles"],
    queryFn: () => getRoles(),
  });

  useEffect(() => {
    // Sobald die Rollen geladen sind und keine Rolle zugewiesen ist, zum Onboarding weiterleiten
    if (data && (!data.roles || data.roles.length === 0)) {
      navigate({ to: isGuardianSignup ? "/eltern" : "/onboarding", replace: true });
    }
  }, [data, navigate, isGuardianSignup]);

  // Reine Admin-Konten (ohne Kunden-/Helfer-Rolle) landen direkt in der Admin-Zentrale.
  const isAdminOnly =
    !!data?.roles?.includes("admin") &&
    !data.roles.some((r) => r === "customer" || r.startsWith("helper_"));

  useEffect(() => {
    if (isAdminOnly) navigate({ to: "/admin", replace: true });
  }, [isAdminOnly, navigate]);

  if (isError) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SiteNav />
        <div className="mx-auto max-w-6xl px-4 py-10">
          <QueryErrorCard error={error} />
        </div>
      </div>
    );
  }

  if (isLoading || isAdminOnly || !data?.roles || data.roles.length === 0) {
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

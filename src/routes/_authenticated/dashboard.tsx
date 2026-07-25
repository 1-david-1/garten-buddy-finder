import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { getMyRoles } from "@/lib/roles.functions";
import { SiteNav } from "@/components/site-nav";
import { useI18n } from "@/lib/i18n";
import { HelperDashboard } from "@/components/dashboard/helper-dashboard";
import { CustomerDashboard } from "@/components/dashboard/customer-dashboard";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardRouter,
});

function DashboardRouter() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const getRoles = useServerFn(getMyRoles);
  const q = useQuery({ queryKey: ["my-roles"], queryFn: () => getRoles() });

  useEffect(() => {
    if (!q.data) return;
    if (!q.data.roles || q.data.roles.length === 0) {
      navigate({ to: "/onboarding" });
      return;
    }
  }, [q.data, navigate]);

  if (q.isLoading || !q.data?.roles || q.data.roles.length === 0) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SiteNav />
        <div className="mx-auto max-w-6xl px-4 py-10">
          <p className="text-muted-foreground">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  const isHelper = q.data.roles.some((r) => r.startsWith("helper_"));
  if (isHelper) return <HelperDashboard />;

  return <CustomerDashboard />;
}

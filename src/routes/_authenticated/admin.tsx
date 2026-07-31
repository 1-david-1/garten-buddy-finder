import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AdminDashboard } from "@/components/dashboard/admin-dashboard";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.user.id);
    if (error) throw error;
    const isAdmin = (data ?? []).some((r) => r.role === "admin");
    if (!isAdmin) throw redirect({ to: "/dashboard" });
  },
  component: AdminDashboard,
});

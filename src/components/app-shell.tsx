import type { ReactNode } from "react";
import { DashboardShell, type DashboardNavItem } from "@/components/dashboard/dashboard-shell";

export interface AppShellProps {
  children?: ReactNode;
  title?: string;
  activeKey?: string;
  navItems?: DashboardNavItem[];
}

export function AppShell({ children, title = "Dashboard", activeKey = "dashboard", navItems }: AppShellProps) {
  return (
    <DashboardShell title={title} activeKey={activeKey} navItems={navItems}>
      {children}
    </DashboardShell>
  );
}

export default AppShell;

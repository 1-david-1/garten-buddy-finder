import { createContext, useContext, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { BarChart3, ClipboardList, Mail, Wallet } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useI18n, type Locale } from "@/lib/i18n";

export interface DashboardNavItem {
  key: string;
  label: string;
  href: string;
  icon: ReactNode;
}

const DashboardShellContext = createContext(false);

export function DashboardShell({
  title = "Dashboard",
  navItems,
  activeKey = "dashboard",
  children,
}: {
  title?: string;
  navItems?: DashboardNavItem[];
  activeKey?: string;
  children: ReactNode;
}) {
  const isInsideShell = useContext(DashboardShellContext);
  if (isInsideShell) {
    return <>{children}</>;
  }

  const { t, locale, setLocale } = useI18n();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const defaultNavItems: DashboardNavItem[] = [
    {
      key: "dashboard",
      label: t("dashboard.nav.dashboard") || "Dashboard",
      href: "/dashboard",
      icon: <BarChart3 className="size-4" />,
    },
    {
      key: "inbox",
      label: "Postfach",
      href: "/inbox",
      icon: <Mail className="size-4" />,
    },
    {
      key: "orders",
      label: t("dashboard.nav.orders") || "Aufträge",
      href: "/gigs",
      icon: <ClipboardList className="size-4" />,
    },
    {
      key: "earnings",
      label: t("dashboard.nav.earnings") || "Einnahmen",
      href: "/earnings",
      icon: <Wallet className="size-4" />,
    },
  ];

  const itemsToRender = navItems ?? defaultNavItems;

  return (
    <DashboardShellContext.Provider value={true}>
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader className="px-3 py-3">
            <Link to="/" className="flex items-center gap-2 px-1 font-brand text-lg text-primary">
              GreenMatch<span className="text-foreground">.</span>
            </Link>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>{t("dashboard.nav.section")}</SidebarGroupLabel>
              <SidebarMenu>
                {itemsToRender.map((item) => (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton asChild isActive={item.key === activeKey} tooltip={item.label}>
                      <Link to={item.href}>
                        {item.icon}
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="gap-2 px-3 pb-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1 rounded-full border border-glass-border bg-glass p-0.5 text-xs w-fit">
              <button
                onClick={() => setLocale("de")}
                className={`rounded-full px-2 py-1 ${locale === "de" ? "bg-primary text-primary-foreground" : ""}`}
              >
                DE
              </button>
              <button
                onClick={() => setLocale("en" as Locale)}
                className={`rounded-full px-2 py-1 ${locale === "en" ? "bg-primary text-primary-foreground" : ""}`}
              >
                EN
              </button>
            </div>
            <span>© {new Date().getFullYear()} GreenMatch</span>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset>
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-glass-border bg-background/80 px-4 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <span className="font-brand text-lg">{title}</span>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await signOut();
                  navigate({ to: "/" });
                }}
              >
                {t("nav.signout")}
              </Button>
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/15 text-xs text-primary">
                  {(user?.email ?? "?").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl px-4 py-8">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </DashboardShellContext.Provider>
  );
}

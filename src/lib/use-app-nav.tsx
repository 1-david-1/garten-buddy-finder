import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  ClipboardList,
  Mail,
  MessageSquare,
  Package,
  Plus,
  Search,
  ShoppingBag,
  User,
  Wallet,
} from "lucide-react";
import type { DashboardNavItem } from "@/components/dashboard/dashboard-shell";
import { getMyRoles } from "@/lib/roles.functions";

/**
 * Single source of truth for the sidebar navigation on every authenticated
 * page. Previously every route defined its own local `navItems` array, so
 * items would appear/disappear depending on which page you were on (e.g.
 * "Verdienst" showing on /gigs but not on /sell). Every page should use this
 * hook instead of a local array.
 *
 * The underlying `getMyRoles` query is shared (same queryKey) across every
 * page that uses this hook, so react-query serves it from cache when
 * navigating between pages instead of refetching every time.
 */
export function useAppNavItems(): {
  navItems: DashboardNavItem[];
  isLoading: boolean;
} {
  const getRolesFn = useServerFn(getMyRoles);
  const rolesQuery = useQuery({
    queryKey: ["my-roles"],
    queryFn: () => getRolesFn(),
  });

  const roles = rolesQuery.data?.roles ?? [];
  const isHelper = roles.some((r) => r.startsWith("helper_"));

  const base: DashboardNavItem[] = [
    {
      key: "dashboard",
      label: "Dashboard",
      href: "/dashboard",
      icon: <BarChart3 className="size-4" />,
    },
    {
      key: "inbox",
      label: "Postfach",
      href: "/inbox",
      icon: <Mail className="size-4" />,
    },
  ];

  const roleItems: DashboardNavItem[] = isHelper
    ? [
        {
          key: "marketplace",
          label: "Aufträge finden",
          href: "/marketplace",
          icon: <Search className="size-4" />,
        },
        {
          key: "orders",
          label: "Aufträge",
          href: "/gigs",
          icon: <ClipboardList className="size-4" />,
        },
        {
          key: "earnings",
          label: "Verdienst",
          href: "/earnings",
          icon: <Wallet className="size-4" />,
        },
        {
          key: "sell",
          label: "Meine Angebote",
          href: "/sell",
          icon: <Package className="size-4" />,
        },
      ]
    : [
        {
          key: "my-gigs",
          label: "Meine Aufträge",
          href: "/my-gigs",
          icon: <Search className="size-4" />,
        },
        {
          key: "create-gig",
          label: "Auftrag erstellen",
          href: "/create-gig",
          icon: <Plus className="size-4" />,
        },
      ];

  const shared: DashboardNavItem[] = [
    {
      key: "messages",
      label: "Nachrichten",
      href: "/messages",
      icon: <MessageSquare className="size-4" />,
    },
    {
      key: "service-listings",
      label: "Service-Angebote",
      href: "/service-listings",
      icon: <ShoppingBag className="size-4" />,
    },
    {
      key: "profile",
      label: "Mein Profil",
      href: "/profile",
      icon: <User className="size-4" />,
    },
  ];

  return {
    navItems: [...base, ...roleItems, ...shared],
    isLoading: rolesQuery.isLoading,
  };
}

import {
  BarChart3,
  ClipboardList,
  Mail,
  Package,
  Plus,
  Search,
  ShoppingBag,
  Wallet,
} from "lucide-react";
import type { DashboardNavItem } from "@/components/dashboard/dashboard-shell";

/**
 * Builds the nav item list for pages reachable by both roles (e.g. the
 * service-listings marketplace). Mirrors the exact items/labels/hrefs used
 * on the existing role-specific pages (gigs.tsx/earnings.tsx for helpers,
 * my-gigs.tsx/create-gig.tsx for customers) so nothing appears/disappears
 * when navigating back and forth.
 */
export function buildSharedNavItems(
  roles: string[] | undefined,
  extra: DashboardNavItem,
): DashboardNavItem[] {
  const isHelper = (roles ?? []).some((r) => r.startsWith("helper_"));

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
          key: "orders",
          label: "Aufträge",
          href: "/gigs",
          icon: <ClipboardList className="size-4" />,
        },
        {
          key: "earnings",
          label: "Einnahmen",
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

  return [...base, ...roleItems, extra];
}

export const SERVICE_LISTINGS_NAV_EXTRA: DashboardNavItem = {
  key: "service-listings",
  label: "Service-Angebote",
  href: "/service-listings",
  icon: <ShoppingBag className="size-4" />,
};

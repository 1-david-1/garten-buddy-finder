import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Mail, Search, ShoppingBag } from "lucide-react";
import {
  DashboardShell,
  type DashboardNavItem,
} from "@/components/dashboard/dashboard-shell";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ServiceListingCard } from "@/components/service-listing-card";
import { getServiceListings } from "@/lib/service-listings.functions";
import { SERVICE_TYPES } from "@/lib/service-types";
import { QueryErrorCard } from "@/components/query-error-card";

export const Route = createFileRoute("/_authenticated/service-listings/")({
  component: ServiceListingsPage,
});

const navItems: DashboardNavItem[] = [
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
  {
    key: "service-listings",
    label: "Service-Angebote",
    href: "/service-listings",
    icon: <ShoppingBag className="size-4" />,
  },
];

const LISTING_TYPE_FILTERS = [
  { value: "all", label: "Alle" },
  { value: "fixed_price", label: "Festpreis" },
  { value: "auction", label: "Auktion" },
  { value: "negotiable", label: "Verhandelbar" },
] as const;

function ServiceListingsPage() {
  const [search, setSearch] = useState("");
  const [serviceType, setServiceType] = useState<string>("all");
  const [listingType, setListingType] =
    useState<(typeof LISTING_TYPE_FILTERS)[number]["value"]>("all");

  const getListingsFn = useServerFn(getServiceListings);

  const listingsQuery = useQuery({
    queryKey: ["service-listings", search, serviceType, listingType],
    queryFn: () =>
      getListingsFn({
        data: {
          search: search || undefined,
          serviceType: serviceType === "all" ? undefined : serviceType,
          listingType: listingType === "all" ? undefined : listingType,
        },
      }),
  });

  const listings = listingsQuery.data ?? [];

  return (
    <DashboardShell
      title="Service-Angebote"
      navItems={navItems}
      activeKey="service-listings"
    >
      <div className="mb-6">
        <h1 className="font-brand text-2xl">Service-Angebote</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Durchstöbere Leistungsangebote von Helfern in deiner Nähe.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Angebote durchsuchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={serviceType} onValueChange={setServiceType}>
          <SelectTrigger className="sm:w-56">
            <SelectValue placeholder="Leistungsart" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Leistungsarten</SelectItem>
            {SERVICE_TYPES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {LISTING_TYPE_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setListingType(f.value)}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              listingType === f.value
                ? "border-primary bg-primary/10 text-primary"
                : "border-glass-border text-muted-foreground hover:border-primary/30"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {listingsQuery.isError ? (
        <QueryErrorCard error={listingsQuery.error} />
      ) : listingsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Lädt…</p>
      ) : listings.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <ShoppingBag className="size-10 text-muted-foreground/40" />
          <h3 className="font-semibold">Keine Angebote gefunden</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Versuche es mit einer anderen Suche oder einem anderen Filter.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => (
            <ServiceListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}
    </DashboardShell>
  );
}

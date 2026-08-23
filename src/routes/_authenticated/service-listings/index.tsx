import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Search, ShoppingBag, MapPin } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { useAppNavItems } from "@/lib/use-app-nav";
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
import { getMyProfile } from "@/lib/profile.functions";
import { SERVICE_TYPES } from "@/lib/service-types";
import { QueryErrorCard } from "@/components/query-error-card";

export const Route = createFileRoute("/_authenticated/service-listings/")({
  component: ServiceListingsPage,
});

const LISTING_TYPE_FILTERS = [
  { value: "all", label: "Alle" },
  { value: "fixed_price", label: "Festpreis" },
  { value: "auction", label: "Auktion" },
  { value: "negotiable", label: "Verhandelbar" },
] as const;

function ServiceListingsPage() {
  const { navItems } = useAppNavItems();
  const [search, setSearch] = useState("");
  const [serviceType, setServiceType] = useState<string>("all");
  const [listingType, setListingType] =
    useState<(typeof LISTING_TYPE_FILTERS)[number]["value"]>("all");
  const [nearPostalCode, setNearPostalCode] = useState("");
  const [sortByProximity, setSortByProximity] = useState(false);

  const getListingsFn = useServerFn(getServiceListings);
  const getMyProfileFn = useServerFn(getMyProfile);

  const myProfileQuery = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => getMyProfileFn(),
  });

  const ownPostalCode = myProfileQuery.data?.profile?.postal_code ?? "";

  const listingsQuery = useQuery({
    queryKey: [
      "service-listings",
      search,
      serviceType,
      listingType,
      sortByProximity ? nearPostalCode || ownPostalCode : null,
    ],
    queryFn: () =>
      getListingsFn({
        data: {
          search: search || undefined,
          serviceType: serviceType === "all" ? undefined : serviceType,
          listingType: listingType === "all" ? undefined : listingType,
          nearPostalCode: sortByProximity
            ? nearPostalCode || ownPostalCode || undefined
            : undefined,
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

      <div className="flex flex-wrap items-center gap-2 mb-6">
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

        <span className="mx-1 h-4 w-px bg-glass-border" />

        <button
          onClick={() => setSortByProximity((v) => !v)}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${
            sortByProximity
              ? "border-primary bg-primary/10 text-primary"
              : "border-glass-border text-muted-foreground hover:border-primary/30"
          }`}
        >
          <MapPin className="size-3" />
          In meiner Nähe zuerst
        </button>
        {sortByProximity && (
          <Input
            placeholder={ownPostalCode || "PLZ"}
            value={nearPostalCode}
            onChange={(e) => setNearPostalCode(e.target.value)}
            className="h-7 w-24 text-xs"
            maxLength={5}
          />
        )}
      </div>

      {sortByProximity && (
        <p className="text-xs text-muted-foreground -mt-4 mb-4">
          Sortierung nach Postleitzahl-Ähnlichkeit, keine genaue
          Kilometer-Entfernung.
        </p>
      )}

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
            <ServiceListingCard
              key={listing.id}
              listing={listing}
              nearPostalCode={
                sortByProximity ? nearPostalCode || ownPostalCode : undefined
              }
            />
          ))}
        </div>
      )}
    </DashboardShell>
  );
}

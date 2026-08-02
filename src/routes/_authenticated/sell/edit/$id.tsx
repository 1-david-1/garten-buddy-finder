import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BarChart3, Mail, Package, ChevronLeft } from "lucide-react";
import {
  DashboardShell,
  type DashboardNavItem,
} from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import {
  ServiceListingForm,
  EMPTY_LISTING_INPUT,
} from "@/components/service-listing-form";
import {
  getServiceListingById,
  updateServiceListing,
  type ServiceListingInput,
} from "@/lib/service-listings.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/sell/edit/$id")({
  component: EditListingPage,
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
    key: "sell",
    label: "Meine Angebote",
    href: "/sell",
    icon: <Package className="size-4" />,
  },
];

function EditListingPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [value, setValue] = useState<ServiceListingInput>(EMPTY_LISTING_INPUT);
  const [loaded, setLoaded] = useState(false);

  const getListingFn = useServerFn(getServiceListingById);
  const updateFn = useServerFn(updateServiceListing);

  const listingQuery = useQuery({
    queryKey: ["service-listing", id],
    queryFn: () => getListingFn({ data: id }),
  });

  useEffect(() => {
    if (listingQuery.data && !loaded) {
      const l = listingQuery.data;
      setValue({
        title: l.title,
        description: l.description ?? "",
        serviceType: l.serviceType,
        listingType: l.listingType,
        priceCents: l.priceCents,
        startPriceCents: l.startPriceCents,
        reservePriceCents: l.reservePriceCents,
        buyNowPriceCents: l.buyNowPriceCents,
        auctionEndTime: l.auctionEndTime,
        minBidIncrementCents: l.minBidIncrementCents,
        location: l.location ?? "",
        postalCode: l.postalCode ?? "",
      });
      setLoaded(true);
    }
  }, [listingQuery.data, loaded]);

  const updateMutation = useMutation({
    mutationFn: () => updateFn({ data: { id, data: value } }),
    onSuccess: () => {
      toast.success("Angebot aktualisiert");
      navigate({ to: "/sell" });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  if (listingQuery.isLoading || !loaded) {
    return (
      <DashboardShell
        title="Angebot bearbeiten"
        navItems={navItems}
        activeKey="sell"
      >
        <p className="text-sm text-muted-foreground">Lädt…</p>
      </DashboardShell>
    );
  }

  if (!listingQuery.data) {
    return (
      <DashboardShell
        title="Angebot bearbeiten"
        navItems={navItems}
        activeKey="sell"
      >
        <p className="text-sm text-muted-foreground">Angebot nicht gefunden.</p>
      </DashboardShell>
    );
  }

  const isSold = listingQuery.data.status === "sold";

  return (
    <DashboardShell
      title="Angebot bearbeiten"
      navItems={navItems}
      activeKey="sell"
    >
      <div className="mb-6">
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link to="/sell">
            <ChevronLeft className="size-4 mr-1" />
            Zurück zu meinen Angeboten
          </Link>
        </Button>
        <h1 className="font-brand text-2xl">Angebot bearbeiten</h1>
      </div>

      {isSold ? (
        <p className="text-sm text-muted-foreground">
          Dieses Angebot wurde bereits verkauft und kann nicht mehr bearbeitet
          werden.
        </p>
      ) : (
        <>
          <ServiceListingForm
            value={value}
            onChange={(patch) => setValue((v) => ({ ...v, ...patch }))}
          />
          <div className="mt-6">
            <Button
              onClick={() => updateMutation.mutate()}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending
                ? "Wird gespeichert…"
                : "Änderungen speichern"}
            </Button>
          </div>
        </>
      )}
    </DashboardShell>
  );
}

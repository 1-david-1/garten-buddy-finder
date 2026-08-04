import { useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { useAppNavItems } from "@/lib/use-app-nav";
import { Button } from "@/components/ui/button";
import {
  ServiceListingForm,
  EMPTY_LISTING_INPUT,
} from "@/components/service-listing-form";
import {
  createServiceListing,
  validateListingInput,
} from "@/lib/service-listings.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/sell/create")({
  component: CreateListingPage,
});

function CreateListingPage() {
  const { navItems } = useAppNavItems();
  const navigate = useNavigate();
  const [value, setValue] = useState(EMPTY_LISTING_INPUT);

  const createFn = useServerFn(createServiceListing);

  const createMutation = useMutation({
    mutationFn: (publish: boolean) => createFn({ data: { ...value, publish } }),
    onSuccess: (listing) => {
      toast.success(
        listing.status === "active"
          ? "Angebot veröffentlicht!"
          : "Entwurf gespeichert",
      );
      navigate({ to: "/sell" });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const draftError = validateListingInput(value);

  return (
    <DashboardShell title="Neues Angebot" navItems={navItems} activeKey="sell">
      <div className="mb-6">
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link to="/sell">
            <ChevronLeft className="size-4 mr-1" />
            Zurück zu meinen Angeboten
          </Link>
        </Button>
        <h1 className="font-brand text-2xl">Neues Angebot erstellen</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Beschreibe deine Leistung und lege fest, wie Kunden sie kaufen können.
        </p>
      </div>

      <ServiceListingForm
        value={value}
        onChange={(patch) => setValue((v) => ({ ...v, ...patch }))}
      />

      <div className="mt-6 flex items-center gap-3">
        <Button
          onClick={() => createMutation.mutate(true)}
          disabled={createMutation.isPending || !!draftError}
        >
          {createMutation.isPending
            ? "Wird veröffentlicht…"
            : "Veröffentlichen"}
        </Button>
        <Button
          variant="outline"
          onClick={() => createMutation.mutate(false)}
          disabled={
            createMutation.isPending ||
            !value.title.trim() ||
            !value.serviceType
          }
        >
          Als Entwurf speichern
        </Button>
        {draftError && (
          <p className="text-xs text-muted-foreground">{draftError}</p>
        )}
      </div>
    </DashboardShell>
  );
}

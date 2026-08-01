import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SERVICE_TYPES } from "@/lib/service-types";
import type {
  ListingType,
  ServiceListingInput,
} from "@/lib/service-listings.functions";

const LISTING_TYPE_OPTIONS: {
  value: ListingType;
  label: string;
  hint: string;
}[] = [
  {
    value: "fixed_price",
    label: "Festpreis",
    hint: "Sofortkauf zu einem festen Preis",
  },
  {
    value: "auction",
    label: "Auktion",
    hint: "Kunden bieten, höchstes Gebot gewinnt",
  },
  {
    value: "negotiable",
    label: "Verhandelbar",
    hint: "Kunden können Angebote machen",
  },
];

function centsToEuroString(cents: number | null): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toString().replace(".", ",");
}

function euroStringToCents(value: string): number | null {
  const normalized = value.replace(",", ".").trim();
  if (!normalized) return null;
  const parsed = parseFloat(normalized);
  if (Number.isNaN(parsed)) return null;
  return Math.round(parsed * 100);
}

/** Datetime-local erwartet "YYYY-MM-DDTHH:mm" ohne Zeitzonen-Suffix. */
function isoToDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ServiceListingForm({
  value,
  onChange,
  disabled,
}: {
  value: ServiceListingInput;
  onChange: (patch: Partial<ServiceListingInput>) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-4">
      <Card className="border-glass-border bg-glass backdrop-blur">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground font-bold">
              1
            </span>
            Was bietest du an?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="listing-title" className="text-sm">
              Titel *
            </Label>
            <Input
              id="listing-title"
              placeholder="z.B. Rasenmähen für Vorgärten bis 200m²"
              value={value.title}
              onChange={(e) => onChange({ title: e.target.value })}
              className="mt-1"
              disabled={disabled}
            />
          </div>

          <div>
            <Label htmlFor="listing-service-type" className="text-sm">
              Leistungsart *
            </Label>
            <Select
              value={value.serviceType}
              onValueChange={(v) => onChange({ serviceType: v })}
              disabled={disabled}
            >
              <SelectTrigger id="listing-service-type" className="mt-1">
                <SelectValue placeholder="Leistungsart wählen" />
              </SelectTrigger>
              <SelectContent>
                {SERVICE_TYPES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="listing-description" className="text-sm">
              Beschreibung
            </Label>
            <Textarea
              id="listing-description"
              placeholder="Was ist im Angebot enthalten? Besonderheiten, benötigtes Werkzeug…"
              value={value.description}
              onChange={(e) => onChange({ description: e.target.value })}
              className="mt-1 min-h-[100px]"
              disabled={disabled}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-glass-border bg-glass backdrop-blur">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground font-bold">
              2
            </span>
            Preisgestaltung
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {LISTING_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={disabled}
                onClick={() => onChange({ listingType: opt.value })}
                className={`rounded-xl border p-3 text-left transition ${
                  value.listingType === opt.value
                    ? "border-primary bg-primary/10"
                    : "border-glass-border bg-glass/50 hover:border-primary/30"
                }`}
              >
                <p className="text-sm font-semibold">{opt.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {opt.hint}
                </p>
              </button>
            ))}
          </div>

          {(value.listingType === "fixed_price" ||
            value.listingType === "negotiable") && (
            <div>
              <Label htmlFor="listing-price" className="text-sm">
                {value.listingType === "negotiable"
                  ? "Wunschpreis *"
                  : "Preis *"}{" "}
                (€)
              </Label>
              <Input
                id="listing-price"
                type="text"
                inputMode="decimal"
                placeholder="25,00"
                value={centsToEuroString(value.priceCents)}
                onChange={(e) =>
                  onChange({ priceCents: euroStringToCents(e.target.value) })
                }
                className="mt-1"
                disabled={disabled}
              />
              {value.listingType === "negotiable" && (
                <p className="text-xs text-muted-foreground mt-1">
                  Kunden können dir Angebote unterhalb oder oberhalb dieses
                  Preises schicken.
                </p>
              )}
            </div>
          )}

          {value.listingType === "auction" && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="listing-start-price" className="text-sm">
                    Startpreis *
                  </Label>
                  <Input
                    id="listing-start-price"
                    type="text"
                    inputMode="decimal"
                    placeholder="10,00"
                    value={centsToEuroString(value.startPriceCents)}
                    onChange={(e) =>
                      onChange({
                        startPriceCents: euroStringToCents(e.target.value),
                      })
                    }
                    className="mt-1"
                    disabled={disabled}
                  />
                </div>
                <div>
                  <Label htmlFor="listing-min-increment" className="text-sm">
                    Mindest-Steigerung
                  </Label>
                  <Input
                    id="listing-min-increment"
                    type="text"
                    inputMode="decimal"
                    placeholder="0,50"
                    value={centsToEuroString(value.minBidIncrementCents)}
                    onChange={(e) =>
                      onChange({
                        minBidIncrementCents:
                          euroStringToCents(e.target.value) ?? 50,
                      })
                    }
                    className="mt-1"
                    disabled={disabled}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="listing-reserve-price" className="text-sm">
                    Mindestpreis (optional)
                  </Label>
                  <Input
                    id="listing-reserve-price"
                    type="text"
                    inputMode="decimal"
                    placeholder="z.B. 20,00"
                    value={centsToEuroString(value.reservePriceCents)}
                    onChange={(e) =>
                      onChange({
                        reservePriceCents: euroStringToCents(e.target.value),
                      })
                    }
                    className="mt-1"
                    disabled={disabled}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Wird dieser Preis nicht erreicht, verfällt die Auktion ohne
                    Verkauf.
                  </p>
                </div>
                <div>
                  <Label htmlFor="listing-buy-now-price" className="text-sm">
                    Sofortkauf-Preis (optional)
                  </Label>
                  <Input
                    id="listing-buy-now-price"
                    type="text"
                    inputMode="decimal"
                    placeholder="z.B. 40,00"
                    value={centsToEuroString(value.buyNowPriceCents)}
                    onChange={(e) =>
                      onChange({
                        buyNowPriceCents: euroStringToCents(e.target.value),
                      })
                    }
                    className="mt-1"
                    disabled={disabled}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="listing-end-time" className="text-sm">
                  Auktionsende *
                </Label>
                <Input
                  id="listing-end-time"
                  type="datetime-local"
                  value={isoToDatetimeLocal(value.auctionEndTime)}
                  onChange={(e) =>
                    onChange({
                      auctionEndTime: e.target.value
                        ? new Date(e.target.value).toISOString()
                        : null,
                    })
                  }
                  className="mt-1"
                  disabled={disabled}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-glass-border bg-glass backdrop-blur">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground font-bold">
              3
            </span>
            Einsatzgebiet
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="listing-location" className="text-sm">
              Ort / Region
            </Label>
            <Input
              id="listing-location"
              placeholder="z.B. Freiburg und Umgebung"
              value={value.location}
              onChange={(e) => onChange({ location: e.target.value })}
              className="mt-1"
              disabled={disabled}
            />
          </div>
          <div>
            <Label htmlFor="listing-postal-code" className="text-sm">
              PLZ
            </Label>
            <Input
              id="listing-postal-code"
              placeholder="79098"
              value={value.postalCode}
              onChange={(e) => onChange({ postalCode: e.target.value })}
              className="mt-1"
              disabled={disabled}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export const EMPTY_LISTING_INPUT: ServiceListingInput = {
  title: "",
  description: "",
  serviceType: "",
  listingType: "fixed_price",
  priceCents: null,
  startPriceCents: null,
  reservePriceCents: null,
  buyNowPriceCents: null,
  auctionEndTime: null,
  minBidIncrementCents: 50,
  location: "",
  postalCode: "",
};

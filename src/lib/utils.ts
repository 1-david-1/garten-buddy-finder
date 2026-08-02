import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatEuros(
  cents: number | null,
  locale: string = "de-DE",
): string {
  if (cents === null) return "Preis auf Anfrage";
  return (cents / 100).toLocaleString(locale, {
    style: "currency",
    currency: "EUR",
  });
}

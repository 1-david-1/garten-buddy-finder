import { toast } from "sonner";
import type { CompleteGigPayout } from "@/lib/gigs.functions";

/** Rückmeldung nach „Auftrag abschließen & Zahlung freigeben“ - sagt klar, was passiert ist. */
export function toastForPayout(payout: CompleteGigPayout, newlyCompleted: boolean) {
  switch (payout) {
    case "released":
      toast.success(newlyCompleted ? "Auftrag abgeschlossen – Zahlung freigegeben." : "Zahlung freigegeben.");
      break;
    case "already_released":
      toast.success("Der Auftrag ist abgeschlossen. Die Zahlung war bereits freigegeben.");
      break;
    case "disputed":
      toast.info("Auftrag abgeschlossen. Die Zahlung wird noch geklärt und danach freigegeben.");
      break;
    default:
      toast.success("Auftrag als abgeschlossen markiert.");
  }
}

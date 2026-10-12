import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Flag, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { blockUser, getMyBlockedUserIds, REPORT_REASONS, reportUser } from "@/lib/safety.functions";

const BLOCKS_KEY = ["my-blocked-users"] as const;

/**
 * Melden und Blockieren einer Person.
 * - Normal: für das eigene Konto.
 * - Mit onBehalfOfChildId: Eltern handeln im Namen ihres Kindes.
 * `blockedOverride` erlaubt, den Blockier-Status von außen zu übergeben (Eltern-Konto).
 */
export function SafetyActions({
  userId,
  userName,
  gigId,
  onBehalfOfChildId,
  blockedOverride,
  onChanged,
  size = "sm",
}: {
  userId: string;
  userName: string;
  gigId?: string;
  onBehalfOfChildId?: string;
  blockedOverride?: boolean;
  onChanged?: () => void;
  size?: "sm" | "default";
}) {
  const queryClient = useQueryClient();
  const blockFn = useServerFn(blockUser);
  const getBlocksFn = useServerFn(getMyBlockedUserIds);
  const [reportOpen, setReportOpen] = useState(false);

  const blocksQuery = useQuery({
    queryKey: BLOCKS_KEY,
    queryFn: () => getBlocksFn(),
    enabled: blockedOverride === undefined,
  });
  const blocked = blockedOverride ?? blocksQuery.data?.blockedUserIds.includes(userId) ?? false;

  const block = useMutation({
    mutationFn: (value: boolean) => blockFn({ data: { userId, block: value, onBehalfOfChildId } }),
    onSuccess: (_r, value) => {
      toast.success(
        value
          ? `${userName} wurde blockiert. Neue Nachrichten und Aufträge sind nicht mehr möglich.`
          : `Blockierung von ${userName} aufgehoben.`,
      );
      queryClient.invalidateQueries({ queryKey: BLOCKS_KEY });
      onChanged?.();
    },
    onError: () => toast.error("Das hat nicht geklappt. Bitte versuche es später noch einmal."),
  });

  function toggleBlock() {
    if (!blocked) {
      const ok = window.confirm(
        `${userName} blockieren? Ihr könnt euch dann keine Nachrichten mehr schreiben und keine neuen Aufträge miteinander abschließen.`,
      );
      if (!ok) return;
    }
    block.mutate(!blocked);
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button size={size} variant="outline" className="gap-1.5" onClick={() => setReportOpen(true)}>
          <Flag className="size-3.5" />
          Melden
        </Button>
        <Button
          size={size}
          variant="outline"
          className="gap-1.5"
          disabled={block.isPending}
          onClick={toggleBlock}
        >
          {block.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Ban className="size-3.5" />}
          {blocked ? "Blockierung aufheben" : "Blockieren"}
        </Button>
      </div>
      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        userId={userId}
        userName={userName}
        gigId={gigId}
        onBehalfOfChildId={onBehalfOfChildId}
      />
    </>
  );
}

function ReportDialog({
  open,
  onOpenChange,
  userId,
  userName,
  gigId,
  onBehalfOfChildId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  userName: string;
  gigId?: string;
  onBehalfOfChildId?: string;
}) {
  const reportFn = useServerFn(reportUser);
  const [reason, setReason] = useState<string>(REPORT_REASONS[0].value);
  const [details, setDetails] = useState("");

  const report = useMutation({
    mutationFn: () =>
      reportFn({
        data: {
          reportedUserId: userId,
          reason,
          details: details.trim() || undefined,
          gigId,
          onBehalfOfChildId,
        },
      }),
    onSuccess: () => {
      toast.success("Danke – unser Team prüft deine Meldung.");
      setDetails("");
      onOpenChange(false);
    },
    onError: () => toast.error("Die Meldung konnte nicht gesendet werden."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{userName} melden</DialogTitle>
          <DialogDescription>
            Das GreenMatch-Team prüft jede Meldung. Bei akuter Gefahr wähle bitte den Notruf 112.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Grund</Label>
            <div className="grid gap-1.5">
              {REPORT_REASONS.map((r) => (
                <label
                  key={r.value}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                    reason === r.value ? "border-primary bg-primary/10" : "border-glass-border"
                  }`}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                  />
                  {r.label}
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="report-details" className="text-xs">
              Was ist passiert? (optional)
            </Label>
            <Textarea
              id="report-details"
              value={details}
              maxLength={1000}
              onChange={(e) => setDetails(e.target.value)}
              className="min-h-24 text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button disabled={report.isPending} onClick={() => report.mutate()}>
            {report.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Meldung senden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

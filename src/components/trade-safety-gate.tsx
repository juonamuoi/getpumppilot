// Global safety dialog shown whenever any trade/submit action is attempted.
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert } from "lucide-react";
import {
  SAFETY_NOTICE,
  closeTradeGate,
  confirmTradeGate,
  useTradeGate,
} from "@/lib/trade-gate";

export function TradeSafetyGate() {
  const req = useTradeGate();
  const open = Boolean(req);
  const paper = req?.mode === "paper";

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && closeTradeGate()}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex flex-wrap items-center gap-2">
            <ShieldAlert
              className={`h-5 w-5 ${paper ? "text-emerald-400" : "text-amber-400"}`}
            />
            {paper ? "Before your first paper trade" : "Live execution is disabled"}
            <Badge
              variant="outline"
              className={
                paper
                  ? "border-emerald-500/40 text-[10px] uppercase text-emerald-300"
                  : "border-amber-500/40 text-[10px] uppercase text-amber-300"
              }
            >
              {paper ? "Simulated · no real funds" : "Read-only · no execution"}
            </Badge>
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-left">
              {req?.action && (
                <p className="text-sm text-foreground">
                  Requested action: <span className="font-semibold">{req.action}</span>
                  {req.detail && (
                    <span className="block text-xs text-muted-foreground">{req.detail}</span>
                  )}
                </p>
              )}
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                {SAFETY_NOTICE.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span
                      className={`mt-1.5 h-1 w-1 shrink-0 rounded-full ${paper ? "bg-emerald-400" : "bg-amber-400"}`}
                    />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                {paper
                  ? "Continue to place the simulated fill — no real funds move. You won't see this notice again for paper trades."
                  : "This action is blocked. Nothing was submitted."}
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={closeTradeGate}>
            {paper ? "Cancel" : "Got it"}
          </AlertDialogCancel>
          {paper && (
            <AlertDialogAction onClick={() => void confirmTradeGate()}>
              Place simulated trade
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

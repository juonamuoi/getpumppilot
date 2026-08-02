import { CheckCircle2, Fuel, ShieldAlert, Loader2, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatNative, type SwapCostEstimate } from "@/lib/swap-fees";
import type { ReadinessCheck } from "@/lib/swap-readiness";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  busy: boolean;
  checks: ReadinessCheck[];
  estimate: SwapCostEstimate | null;
  slippageBps: number;
  sellSymbol: string;
  buySymbol: string;
  amount: string;
  notionalUsd: number | null;
  chainLabel: string;
  needsApproval: boolean;
  quotedAt: number | null;
}

/**
 * Last-look summary: what is being traded, what it costs, the worst case, and
 * the exact readiness checks that passed — shown before anything is signed.
 */
export function SwapConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  busy,
  checks,
  estimate,
  slippageBps,
  sellSymbol,
  buySymbol,
  amount,
  notionalUsd,
  chainLabel,
  needsApproval,
  quotedAt,
}: Props) {
  const passed = checks.filter((c) => c.status === "ok");
  const notPassed = checks.filter((c) => c.status !== "ok");
  const quoteAgeSec = quotedAt ? Math.max(0, Math.round((Date.now() - quotedAt) / 1000)) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-destructive" />
            Review trade before signing
          </DialogTitle>
          <DialogDescription>
            Real funds on {chainLabel}. This transaction cannot be reversed once signed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-muted-foreground">
              <dt>You sell</dt>
              <dd className="text-right font-medium text-foreground">
                {amount} {sellSymbol}
              </dd>
              <dt>You receive</dt>
              <dd className="text-right font-medium text-foreground">{buySymbol}</dd>
              <dt>Trade size</dt>
              <dd className="text-right text-foreground">
                {notionalUsd !== null ? `$${notionalUsd.toFixed(2)}` : "—"}
              </dd>
              <dt>Network</dt>
              <dd className="text-right text-foreground">{chainLabel}</dd>
            </dl>
          </div>

          <div className="space-y-2 rounded-md border border-border p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <Fuel className="h-3.5 w-3.5 text-muted-foreground" /> Estimated costs
            </p>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <dt>Network fee (gas)</dt>
              <dd className="text-right text-foreground">
                {estimate?.feeNative != null
                  ? formatNative(estimate.feeNative, estimate.nativeSymbol)
                  : "Unavailable"}
                {estimate?.feeUsd != null && (
                  <span className="text-muted-foreground"> · ${estimate.feeUsd.toFixed(2)}</span>
                )}
              </dd>
              {estimate?.feePctOfTrade != null && (
                <>
                  <dt>Fee vs trade size</dt>
                  <dd className="text-right text-foreground">
                    {(estimate.feePctOfTrade * 100).toFixed(2)}%
                  </dd>
                </>
              )}
              <dt>Max slippage</dt>
              <dd className="text-right text-foreground">{(slippageBps / 100).toFixed(2)}%</dd>
              <dt>Worst case received</dt>
              <dd className="text-right text-foreground">
                {estimate?.slippageWorstCaseUsd != null
                  ? `up to $${estimate.slippageWorstCaseUsd.toFixed(2)} given away`
                  : "—"}
              </dd>
              {quoteAgeSec !== null && (
                <>
                  <dt>Quote age</dt>
                  <dd className="text-right text-foreground">{quoteAgeSec}s old</dd>
                </>
              )}
            </dl>
            {estimate?.severity === "high" && (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" /> Network fees are unusually high right now.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-foreground">
              Checks passed{" "}
              <Badge variant="secondary" className="ml-1">
                {passed.length}/{checks.length}
              </Badge>
            </p>
            <ul className="space-y-1">
              {passed.map((c) => (
                <li key={c.id} className="flex items-start gap-2 text-xs">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  <span>
                    <span className="text-foreground">{c.label}</span>{" "}
                    <span className="text-muted-foreground">— {c.detail}</span>
                  </span>
                </li>
              ))}
              {notPassed.map((c) => (
                <li key={c.id} className="flex items-start gap-2 text-xs">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                  <span>
                    <span className="text-foreground">{c.label}</span>{" "}
                    <span className="text-muted-foreground">— {c.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {needsApproval && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" />
              A one-time {sellSymbol} approval is signed first, then the swap.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {needsApproval ? `Approve ${sellSymbol} & continue` : "Confirm & sign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

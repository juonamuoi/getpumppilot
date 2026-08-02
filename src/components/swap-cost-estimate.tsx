import { AlertTriangle, Flame, Fuel } from "lucide-react";
import { formatNative, type SwapCostEstimate } from "@/lib/swap-fees";

interface Props {
  estimate: SwapCostEstimate;
  slippageBps: number;
}

/** Gas + slippage breakdown shown next to a live quote. */
export function SwapCostEstimateCard({ estimate, slippageBps }: Props) {
  const { severity, warnings } = estimate;
  const tone =
    severity === "high"
      ? "border-destructive/50 bg-destructive/10"
      : severity === "warn"
        ? "border-amber-500/40 bg-amber-500/10"
        : "border-border bg-muted/30";

  return (
    <div className={`space-y-2 rounded-md border p-3 text-xs ${tone}`}>
      <p className="flex items-center gap-1.5 font-medium text-foreground">
        {severity === "high" ? (
          <Flame className="h-3.5 w-3.5 text-destructive" />
        ) : (
          <Fuel className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        Estimated costs
      </p>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-muted-foreground">
        <dt>Network fee (gas)</dt>
        <dd className="text-right text-foreground">
          {estimate.feeNative !== null
            ? formatNative(estimate.feeNative, estimate.nativeSymbol)
            : "Unavailable"}
          {estimate.feeUsd !== null && (
            <span className="text-muted-foreground"> · ${estimate.feeUsd.toFixed(2)}</span>
          )}
        </dd>

        {estimate.feePctOfTrade !== null && (
          <>
            <dt>Fee vs trade size</dt>
            <dd className="text-right text-foreground">
              {(estimate.feePctOfTrade * 100).toFixed(2)}%
            </dd>
          </>
        )}

        <dt>Max slippage</dt>
        <dd className="text-right text-foreground">
          {(slippageBps / 100).toFixed(2)}%
          {estimate.slippageWorstCaseUsd !== null && (
            <span className="text-muted-foreground">
              {" "}
              · up to ${estimate.slippageWorstCaseUsd.toFixed(2)}
            </span>
          )}
        </dd>
      </dl>

      {warnings.length > 0 && (
        <ul className="space-y-1 border-t border-border/60 pt-2">
          {warnings.map((w) => (
            <li key={w} className="flex gap-1.5 text-foreground">
              <AlertTriangle
                className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                  severity === "high" ? "text-destructive" : "text-amber-500"
                }`}
              />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-muted-foreground">
        Estimates only — final gas is set by the network when your transaction is mined.
      </p>
    </div>
  );
}

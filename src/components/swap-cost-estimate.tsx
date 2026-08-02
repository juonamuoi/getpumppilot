import { useEffect, useState } from "react";
import { AlertTriangle, Flame, Fuel, RefreshCw } from "lucide-react";
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

/** Seconds elapsed since a timestamp, ticking once per second. */
function useAgeSeconds(since: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [since]);
  if (since === null) return null;
  return Math.max(0, Math.round((now - since) / 1000));
}

interface BarProps {
  estimate: SwapCostEstimate | null;
  slippageBps: number;
  /** When the current quote was fetched, for freshness. */
  quotedAt: number | null;
  onRefresh: () => void;
  busy: boolean;
}

/**
 * Always-visible cost strip pinned above the sign button: latest gas, its USD
 * value and the worst-case slippage give-up, so nothing is signed blind.
 */
export function SwapCostBar({ estimate, slippageBps, quotedAt, onRefresh, busy }: BarProps) {
  const age = useAgeSeconds(quotedAt);
  const stale = age !== null && age >= 30;

  const tone =
    estimate?.severity === "high"
      ? "border-destructive/50 bg-destructive/10"
      : estimate?.severity === "warn"
        ? "border-amber-500/40 bg-amber-500/10"
        : "border-border bg-muted/40";

  return (
    <div
      aria-live="polite"
      className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border px-3 py-2 text-xs ${tone}`}
    >
      <span className="flex items-center gap-1.5 font-medium text-foreground">
        <Fuel className="h-3.5 w-3.5 text-muted-foreground" />
        Gas{" "}
        {estimate?.feeNative !== null && estimate
          ? formatNative(estimate.feeNative!, estimate.nativeSymbol)
          : "—"}
      </span>
      <span className="text-muted-foreground">
        USD fee{" "}
        <span className="text-foreground">
          {estimate?.feeUsd != null ? `$${estimate.feeUsd.toFixed(2)}` : "—"}
        </span>
        {estimate?.feePctOfTrade != null && (
          <span> ({(estimate.feePctOfTrade * 100).toFixed(2)}% of trade)</span>
        )}
      </span>
      <span className="text-muted-foreground">
        Worst case slippage{" "}
        <span className="text-foreground">
          {(slippageBps / 100).toFixed(2)}%
          {estimate?.slippageWorstCaseUsd != null &&
            ` · up to $${estimate.slippageWorstCaseUsd.toFixed(2)}`}
        </span>
      </span>
      <span className="ml-auto flex items-center gap-2">
        <span className={stale ? "text-amber-500" : "text-muted-foreground"}>
          {age === null
            ? "No quote yet"
            : stale
              ? `Quote ${age}s old — refresh`
              : `Updated ${age}s ago`}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-foreground hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </span>
    </div>
  );
}

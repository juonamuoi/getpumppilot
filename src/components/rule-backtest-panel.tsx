import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FlaskConical, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Asset } from "@/lib/mock-data";
import type { ScannerRules } from "@/lib/paper-store";
import {
  compareBacktests,
  DEFAULT_BACKTEST_CONFIG,
  type BacktestComparison,
} from "@/lib/rule-backtest";

const num = (n: number, suffix = "") => `${n > 0 ? "+" : ""}${Number(n.toFixed(2))}${suffix}`;

function Metric({
  label,
  before,
  after,
  suffix = "",
  goodHigh = true,
  signed = false,
}: {
  label: string;
  before: number;
  after: number;
  suffix?: string;
  goodHigh?: boolean;
  signed?: boolean;
}) {
  const delta = Number((after - before).toFixed(2));
  const better = goodHigh ? delta > 0 : delta < 0;
  const worse = goodHigh ? delta < 0 : delta > 0;
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-mono text-sm">
        <span className="text-muted-foreground">
          {signed ? num(before, suffix) : `${Number(before.toFixed(2))}${suffix}`}
        </span>
        <span className="mx-1 text-muted-foreground">→</span>
        <span
          className={cn(
            better && "text-emerald-300",
            worse && "text-rose-300",
            !better && !worse && "text-foreground",
          )}
        >
          {signed ? num(after, suffix) : `${Number(after.toFixed(2))}${suffix}`}
        </span>
      </div>
      <div
        className={cn(
          "text-[10px] font-mono",
          better ? "text-emerald-300/80" : worse ? "text-rose-300/80" : "text-muted-foreground",
        )}
      >
        {delta === 0 ? "no change" : `${num(delta, suffix)}`}
      </div>
    </div>
  );
}

/** Runs a lightweight paper-trading backtest of the old vs new scanner rules. */
export function RuleBacktestPanel({
  before,
  after,
  assets,
  scopeLabel,
}: {
  before: ScannerRules;
  after: ScannerRules;
  assets: Asset[];
  scopeLabel: string;
}) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BacktestComparison | null>(null);

  const run = async () => {
    setRunning(true);
    // Yield a frame so the spinner paints before the (fast) synchronous sim.
    await new Promise((r) => setTimeout(r, 120));
    try {
      setResult(compareBacktests(before, after, assets));
    } finally {
      setRunning(false);
    }
  };

  const cfg = result?.config ?? DEFAULT_BACKTEST_CONFIG;

  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <FlaskConical className="h-4 w-4 text-primary" />
          <span className="font-medium">Paper-trading backtest</span>
          <Badge variant="outline" className="text-[10px]">
            MOCK DATA
          </Badge>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-[11px]"
          onClick={run}
          disabled={running || assets.length === 0}
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {result ? "Re-run backtest" : "Run backtest"}
        </Button>
      </div>

      <p className="mt-1 text-[11px] text-muted-foreground">
        Replays {assets.length} asset{assets.length === 1 ? "" : "s"} in “{scopeLabel}” bar-by-bar,
        entering a simulated paper position whenever the rules match. Hold {cfg.holdBars} bars, stop{" "}
        -{cfg.stopLossPct}%, target +{cfg.takeProfitPct}%, 25% allocation per trade.
      </p>

      {result && (
        <>
          <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Metric label="Trades" before={result.before.tradeCount} after={result.after.tradeCount} />
            <Metric label="Win rate" before={result.before.winRate} after={result.after.winRate} suffix="%" />
            <Metric
              label="Avg trade"
              before={result.before.avgReturnPct}
              after={result.after.avgReturnPct}
              suffix="%"
              signed
            />
            <Metric
              label="Est. return"
              before={result.before.totalReturnPct}
              after={result.after.totalReturnPct}
              suffix="%"
              signed
            />
            <Metric
              label="Max drawdown"
              before={result.before.maxDrawdownPct}
              after={result.after.maxDrawdownPct}
              suffix="%"
              goodHigh={false}
            />
            <Metric
              label="Worst trade"
              before={result.before.worstPct}
              after={result.after.worstPct}
              suffix="%"
              signed
            />
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-muted-foreground">
            <span>
              Run {result.correlationId} · {new Date(result.ranAt).toLocaleString()} (UTC{" "}
              {new Date(result.ranAt).toISOString()})
            </span>
            <span>
              {result.after.tradeCount - result.before.tradeCount >= 0 ? "+" : ""}
              {result.after.tradeCount - result.before.tradeCount} simulated entries
            </span>
          </div>

          <p className="mt-2 text-[10px] text-muted-foreground">
            Simulated on demo data with no fees, slippage or liquidity limits. Past or simulated
            performance never guarantees future returns — you can lose all your capital.
          </p>
        </>
      )}
    </div>
  );
}

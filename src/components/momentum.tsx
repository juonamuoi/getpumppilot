import { Progress } from "@/components/ui/progress";
import type { Asset } from "@/lib/mock-data";
import { Info } from "lucide-react";

export function scoreColor(n: number) {
  if (n >= 75) return "text-emerald-400";
  if (n >= 50) return "text-cyan-300";
  if (n >= 30) return "text-amber-300";
  return "text-rose-400";
}

export function MomentumBadge({ score }: { score: number }) {
  return (
    <span
      className={`inline-flex items-center rounded-md bg-muted/60 px-2 py-0.5 font-mono text-xs font-semibold ${scoreColor(score)}`}
    >
      {score}
    </span>
  );
}

export function MomentumBreakdown({ asset }: { asset: Asset }) {
  const rows: [string, number][] = [
    ["Trend", asset.momentum.trend],
    ["Volume", asset.momentum.volume],
    ["Volatility", asset.momentum.volatility],
    ["Social", asset.momentum.social],
    ["Breakout", asset.momentum.breakout],
  ];
  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <div className={`font-mono text-4xl font-bold ${scoreColor(asset.momentum.total)}`}>
          {asset.momentum.total}
        </div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Momentum score
        </div>
      </div>
      <div className="space-y-2">
        {rows.map(([label, v]) => (
          <div key={label} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">{label}</span>
              <span className={`font-mono ${scoreColor(v)}`}>{v}</span>
            </div>
            <Progress aria-label={`${label} score`} value={v} className="h-1.5" />
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
        <div className="mb-1 flex items-center gap-1.5 font-semibold text-foreground">
          <Info className="h-3.5 w-3.5" /> Why this score
        </div>
        {asset.momentum.reason}
      </div>
    </div>
  );
}

import type { Asset } from "@/lib/mock-data";
import { fmtPct } from "@/lib/mock-data";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, AlertTriangle, ShieldCheck } from "lucide-react";

export type Signal = {
  headline: string;
  action: "Watch" | "Consider buy" | "Trim / take profit" | "Avoid";
  confidence: "Low" | "Medium" | "High";
  why: string;
  tone: "positive" | "negative" | "neutral" | "warning";
};

export function explainAsset(a: Asset): Signal {
  const m = a.momentum;
  if (m.total >= 85 && m.volatility >= 85) {
    return {
      headline: `${a.symbol} is running hot but very volatile`,
      action: "Watch",
      confidence: "Medium",
      why: `Momentum ${m.total}/100 with rising volume, but volatility ${m.volatility}/100 means sharp reversals are common. If you enter, keep it small and use a stop.`,
      tone: "warning",
    };
  }
  if (m.total >= 75 && a.change24h >= 3) {
    return {
      headline: `${a.symbol} shows a clean uptrend`,
      action: "Consider buy",
      confidence: m.total >= 82 ? "High" : "Medium",
      why: `Trend ${m.trend}, volume ${m.volume}, breakout ${m.breakout}. ${a.symbol} is up ${fmtPct(a.change24h)} in 24h with participation confirming the move.`,
      tone: "positive",
    };
  }
  if (m.total <= 35 || a.change24h <= -5) {
    return {
      headline: `${a.symbol} is losing momentum`,
      action: a.change24h <= -8 ? "Avoid" : "Trim / take profit",
      confidence: "Medium",
      why: `Momentum ${m.total}/100 and 24h change ${fmtPct(a.change24h)}. Trend is weakening — better to wait for a base to form.`,
      tone: "negative",
    };
  }
  return {
    headline: `${a.symbol} is quiet`,
    action: "Watch",
    confidence: "Low",
    why: `No decisive signal. Momentum ${m.total}/100, 24h ${fmtPct(a.change24h)}. Wait for a clearer setup before committing capital.`,
    tone: "neutral",
  };
}

const toneStyle = {
  positive: "border-emerald-500/30 bg-emerald-500/5",
  negative: "border-rose-500/30 bg-rose-500/5",
  warning: "border-amber-500/30 bg-amber-500/5",
  neutral: "border-border/60 bg-muted/20",
} as const;

const toneBadge = {
  positive: "border-emerald-500/40 text-emerald-300",
  negative: "border-rose-500/40 text-rose-300",
  warning: "border-amber-500/40 text-amber-300",
  neutral: "border-border/60 text-muted-foreground",
} as const;

export function PlainSignalCard({ asset }: { asset: Asset }) {
  const s = explainAsset(asset);
  const Icon =
    s.tone === "positive"
      ? TrendingUp
      : s.tone === "negative"
        ? TrendingDown
        : s.tone === "warning"
          ? AlertTriangle
          : ShieldCheck;
  return (
    <div className={`rounded-xl border p-4 ${toneStyle[s.tone]}`}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold">{s.headline}</div>
            <Badge variant="outline" className={toneBadge[s.tone]}>
              {s.action}
            </Badge>
            <Badge variant="outline" className="border-border/60 text-[10px] uppercase tracking-wider">
              {s.confidence} confidence
            </Badge>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.why}</p>
        </div>
      </div>
    </div>
  );
}

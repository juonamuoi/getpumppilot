import { usePaper } from "@/lib/paper-store";
import { getAsset, fmtPct } from "@/lib/mock-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Term } from "./glossary";
import { HeartPulse, AlertTriangle, CheckCircle2 } from "lucide-react";

export function PortfolioHealthCard() {
  const { positions, equity, cash } = usePaper();

  const rows = positions.map((p) => {
    const a = getAsset(p.symbol);
    const value = a ? a.price * p.qty : 0;
    return {
      symbol: p.symbol,
      value,
      pct: equity > 0 ? (value / equity) * 100 : 0,
      isDemo: a?.isDemo ?? false,
      vol: a?.momentum.volatility ?? 0,
    };
  });

  const cashPct = equity > 0 ? (cash / equity) * 100 : 100;
  const largest = rows.reduce((m, r) => (r.pct > m ? r.pct : m), 0);
  const demoExposure = rows.filter((r) => r.isDemo).reduce((s, r) => s + r.pct, 0);
  const avgVol =
    rows.length === 0 ? 0 : rows.reduce((s, r) => s + r.vol * (r.pct / 100), 0);

  // Health score 0-100 (higher is healthier)
  let score = 100;
  const issues: { icon: "warn" | "ok"; text: string }[] = [];
  if (largest > 40) {
    score -= 25;
    issues.push({ icon: "warn", text: `Concentration risk: largest position is ${largest.toFixed(0)}% of equity` });
  } else if (largest > 25) {
    score -= 10;
    issues.push({ icon: "warn", text: `Position sizing check: largest is ${largest.toFixed(0)}% of equity` });
  } else if (rows.length > 0) {
    issues.push({ icon: "ok", text: "Position sizes look sensible" });
  }
  if (demoExposure > 25) {
    score -= 15;
    issues.push({ icon: "warn", text: `Small-cap demo exposure is ${demoExposure.toFixed(0)}% — very volatile` });
  }
  if (avgVol > 75) {
    score -= 10;
    issues.push({ icon: "warn", text: "Weighted volatility is high — expect big swings" });
  } else if (rows.length > 0) {
    issues.push({ icon: "ok", text: "Overall volatility is manageable" });
  }
  if (cashPct < 10 && rows.length > 0) {
    score -= 10;
    issues.push({ icon: "warn", text: "Low dry powder — hard to add on dips" });
  } else if (cashPct > 10) {
    issues.push({ icon: "ok", text: `Healthy cash buffer (${cashPct.toFixed(0)}%)` });
  }
  score = Math.max(5, Math.min(100, score));

  const band =
    score >= 80 ? { label: "Strong", color: "text-emerald-300" } :
    score >= 55 ? { label: "OK", color: "text-amber-300" } :
                  { label: "Fragile", color: "text-rose-300" };

  return (
    <Card className="border-border/60 bg-card/60">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <HeartPulse className="h-4 w-4" /> Portfolio health
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-baseline justify-between">
            <div className="font-mono text-3xl font-bold">{score}</div>
            <div className={`text-xs font-semibold uppercase tracking-wider ${band.color}`}>
              {band.label}
            </div>
          </div>
          <Progress aria-label="Portfolio health score" value={score} className="mt-2 h-2" />
          <p className="mt-2 text-[11px] text-muted-foreground">
            Combines concentration, <Term k="volatility">volatility</Term>, small-cap exposure and cash buffer.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border border-border/60 bg-muted/20 p-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Largest</div>
            <div className="mt-1 font-mono text-sm font-semibold">{largest.toFixed(0)}%</div>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/20 p-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Demo</div>
            <div className="mt-1 font-mono text-sm font-semibold">{demoExposure.toFixed(0)}%</div>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/20 p-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Cash</div>
            <div className="mt-1 font-mono text-sm font-semibold">{cashPct.toFixed(0)}%</div>
          </div>
        </div>

        <ul className="space-y-1.5">
          {issues.map((i, idx) => (
            <li key={idx} className="flex items-start gap-2 text-xs">
              {i.icon === "warn" ? (
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
              )}
              <span className="text-muted-foreground">{i.text}</span>
            </li>
          ))}
        </ul>

        {rows.length > 0 && (
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Weighted vol: <span className="font-mono text-foreground">{avgVol.toFixed(0)}</span> · P/L view →{" "}
            <a href="/paper" className="text-emerald-300 underline underline-offset-2">Paper</a>{" "}
            ({fmtPct(0)} realized)
          </div>
        )}
      </CardContent>
    </Card>
  );
}

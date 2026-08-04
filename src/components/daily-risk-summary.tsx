import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CalendarClock, ShieldAlert, ShieldCheck } from "lucide-react";
import { getAsset } from "@/lib/mock-data";
import { markPrice, usePaper } from "@/lib/paper-store";
import { useRejectionLog } from "@/lib/rejection-log";
import { controlTitle, type RiskBlockCode } from "@/lib/risk-block";

function usd(n: number) {
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}
function pct(n: number) {
  return `${n.toFixed(1)}%`;
}

/** Plain-English guidance per control, used in the daily summary. */
const ADVICE: Record<RiskBlockCode, string> = {
  max_position: "Spread size across more symbols, or raise the per-position cap deliberately.",
  max_daily_loss: "The session drawdown cap paused buys — review losers before adding risk.",
  insufficient_cash: "Free up paper cash by trimming positions before sizing new orders.",
  insufficient_position: "Sell orders exceeded the quantity held — check the position size first.",
};

/**
 * Daily risk summary: which controls fired most today and how close each open
 * position and the session drawdown are to their configured limits.
 */
export function DailyRiskSummary({ className }: { className?: string }) {
  const paper = usePaper();
  const { risk, equity, dayStartEquity, cash, positions } = paper;
  const rejections = useRejectionLog();

  const dayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const today = useMemo(
    () => rejections.filter((r) => r.ts >= dayStart),
    [rejections, dayStart],
  );
  const yesterday = useMemo(
    () => rejections.filter((r) => r.ts >= dayStart - 86_400_000 && r.ts < dayStart),
    [rejections, dayStart],
  );

  const byControl = useMemo(() => {
    const map = new Map<
      RiskBlockCode,
      { code: RiskBlockCode; count: number; worstPct: number; limitPct?: number; symbols: Set<string> }
    >();
    for (const r of today) {
      const cur =
        map.get(r.block.code) ??
        { code: r.block.code, count: 0, worstPct: 0, limitPct: r.block.limitPct, symbols: new Set<string>() };
      cur.count += 1;
      cur.worstPct = Math.max(cur.worstPct, r.block.actualPct ?? 0);
      cur.limitPct = cur.limitPct ?? r.block.limitPct;
      cur.symbols.add(r.symbol);
      map.set(r.block.code, cur);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [today]);

  const drawdownPct =
    dayStartEquity > 0 ? Math.max(0, ((dayStartEquity - equity) / dayStartEquity) * 100) : 0;
  const drawdownUse = Math.min(100, (drawdownPct / (risk.maxDailyLossPct || 1)) * 100);

  const closest = useMemo(() => {
    return positions
      .map((p) => {
        const a = getAsset(p.symbol);
        const value = a ? markPrice(p.symbol, a.price) * p.qty : 0;
        const sharePct = equity > 0 ? (value / equity) * 100 : 0;
        const use = Math.min(100, (sharePct / (risk.maxPositionPct || 1)) * 100);
        const headroom = Math.max(0, (risk.maxPositionPct / 100) * equity - value);
        return { symbol: p.symbol, value, sharePct, use, headroom };
      })
      .sort((a, b) => b.use - a.use)
      .slice(0, 5);
  }, [positions, equity, risk.maxPositionPct]);

  const delta = today.length - yesterday.length;

  return (
    <Card className={`border-border/60 bg-card/60 ${className ?? ""}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4 text-primary" aria-hidden />
          Daily risk summary
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {new Date(dayStart).toLocaleDateString(undefined, {
            weekday: "long",
            month: "short",
            day: "numeric",
          })}{" "}
          · {today.length} blocked order{today.length === 1 ? "" : "s"} today
          {yesterday.length > 0 && (
            <>
              {" "}
              ({delta === 0 ? "same as" : delta > 0 ? `${delta} more than` : `${-delta} fewer than`}{" "}
              yesterday)
            </>
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <section className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Controls triggered today
          </h3>
          {byControl.length === 0 ? (
            <p className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/40 p-3 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-emerald-400" aria-hidden />
              No risk control blocked an order today.
            </p>
          ) : (
            <ul className="space-y-3">
              {byControl.map((c) => (
                <li key={c.code} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <ShieldAlert className="h-3.5 w-3.5 text-amber-400" aria-hidden />
                      {controlTitle(c.code)}
                    </span>
                    <span className="font-mono text-sm">
                      {c.count}×
                    </span>
                  </div>
                  <Progress
                    value={Math.min(100, (c.count / (byControl[0]?.count || 1)) * 100)}
                    className="h-1.5"
                  />
                  <p className="text-xs text-muted-foreground">
                    {c.limitPct != null && c.worstPct > 0
                      ? `Worst breach ${pct(c.worstPct)} against a ${pct(c.limitPct)} limit · `
                      : ""}
                    {[...c.symbols].join(", ")} — {ADVICE[c.code]}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            How close you are to each limit
          </h3>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium">Session drawdown</span>
              <span
                className={`font-mono text-sm ${drawdownUse >= 100 ? "text-destructive" : ""}`}
              >
                {pct(drawdownPct)} / {pct(risk.maxDailyLossPct)}
              </span>
            </div>
            <Progress value={drawdownUse} className="h-1.5" />
            <p className="text-xs text-muted-foreground">
              {drawdownUse >= 100
                ? "Daily loss limit reached — new buys are paused until the session resets."
                : `${pct(Math.max(0, risk.maxDailyLossPct - drawdownPct))} of loss budget left · session start ${usd(dayStartEquity)} · ${usd(cash)} cash free`}
            </p>
          </div>

          {closest.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No open positions, so the {pct(risk.maxPositionPct)} per-position cap is untouched.
            </p>
          ) : (
            closest.map((p) => (
              <div key={p.symbol} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium">{p.symbol} position</span>
                  <span className={`font-mono text-sm ${p.use >= 100 ? "text-destructive" : ""}`}>
                    {pct(p.sharePct)} / {pct(risk.maxPositionPct)}
                  </span>
                </div>
                <Progress value={p.use} className="h-1.5" />
                <p className="text-xs text-muted-foreground">
                  {p.use >= 100
                    ? `At the cap — trim ${p.symbol} before buying more.`
                    : `${usd(p.headroom)} of headroom left (${usd(p.value)} held, ${pct(p.use)} of the cap used).`}
                </p>
              </div>
            ))
          )}
        </section>
      </CardContent>
    </Card>
  );
}

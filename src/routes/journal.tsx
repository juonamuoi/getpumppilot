import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { DisclaimerBanner } from "@/components/disclaimer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePaper } from "@/lib/paper-store";
import { computeStats } from "@/lib/journal";
import { fmtPct, fmtUsd } from "@/lib/mock-data";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Award, ArrowDownRight, ArrowUpRight, LineChart, TrendingUp } from "lucide-react";

const STARTING_CASH = 100_000;

export const Route = createFileRoute("/journal")({
  head: () => ({
    meta: [
      { title: "Trade Journal — PumpPilot AI" },
      {
        name: "description",
        content:
          "Paper trading performance analytics: win rate, expectancy, profit factor, equity curve and per-asset attribution. Demo data.",
      },
      { property: "og:title", content: "Trade Journal — PumpPilot AI" },
      {
        property: "og:description",
        content: "Win rate, expectancy, equity curve — measure your paper trading edge.",
      },
    ],
  }),
  component: JournalPage,
});

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "pos" | "neg" | "neutral";
}) {
  const t =
    tone === "pos" ? "text-emerald-400" : tone === "neg" ? "text-rose-400" : "text-foreground";
  return (
    <Card className="border-border/60 bg-card/60">
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`mt-1 font-mono text-2xl font-bold ${t}`}>{value}</div>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function JournalPage() {
  const { trades, positions, cash } = usePaper();
  const s = computeStats(trades, positions, cash, STARTING_CASH);
  const curve = s.equityCurve.map((c) => ({ ...c, t: new Date(c.ts).toLocaleTimeString() }));
  const netPnl = curve.length ? curve[curve.length - 1].equity - STARTING_CASH : 0;

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-emerald-300">
            <LineChart className="h-3.5 w-3.5" /> Trade Journal
          </div>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Your paper edge</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Objective measurement of how your paper strategy is performing — not a projection of
            future results.
          </p>
        </div>

        <DisclaimerBanner />

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat
            label="Net P/L"
            value={fmtUsd(netPnl)}
            sub={fmtPct((netPnl / STARTING_CASH) * 100)}
            tone={netPnl >= 0 ? "pos" : "neg"}
          />
          <Stat
            label="Win rate"
            value={s.closedCount ? `${s.winRate.toFixed(1)}%` : "—"}
            sub={`${s.wins}W / ${s.losses}L closed`}
          />
          <Stat
            label="Expectancy"
            value={s.closedCount ? fmtUsd(s.expectancy) : "—"}
            sub="avg $ per closed trade"
            tone={s.expectancy >= 0 ? "pos" : "neg"}
          />
          <Stat
            label="Profit factor"
            value={
              s.profitFactor === Infinity
                ? "∞"
                : s.closedCount
                  ? s.profitFactor.toFixed(2)
                  : "—"
            }
            sub="gross wins / gross losses"
            tone={s.profitFactor >= 1 ? "pos" : "neg"}
          />
        </div>

        <Card className="border-border/60 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-emerald-400" /> Equity curve
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={curve}>
                  <defs>
                    <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgb(52 211 153)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="rgb(52 211 153)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="t" hide />
                  <YAxis
                    domain={["auto", "auto"]}
                    tick={{ fontSize: 10, fill: "rgb(148 163 184)" }}
                    width={70}
                    tickFormatter={(v) => fmtUsd(v as number)}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "rgb(15 23 42)",
                      border: "1px solid rgb(51 65 85)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: number) => fmtUsd(v)}
                    labelStyle={{ color: "rgb(148 163 184)" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="equity"
                    stroke="rgb(52 211 153)"
                    fill="url(#eq)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-border/60 bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Award className="h-4 w-4 text-emerald-400" /> Best & worst closed trades
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {s.bestTrade ? (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">
                      <ArrowUpRight className="mr-1 inline h-4 w-4 text-emerald-400" />
                      Best · {s.bestTrade.symbol}
                    </span>
                    <span className="font-mono text-emerald-400">
                      {fmtUsd(s.bestTrade.pnl)} ({fmtPct(s.bestTrade.pnlPct)})
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {s.bestTrade.qty.toLocaleString(undefined, { maximumFractionDigits: 4 })} @{" "}
                    {fmtUsd(s.bestTrade.entryPrice)} → {fmtUsd(s.bestTrade.exitPrice)}
                  </div>
                </div>
              ) : (
                <div className="text-muted-foreground">No closed trades yet.</div>
              )}
              {s.worstTrade && s.worstTrade !== s.bestTrade && (
                <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">
                      <ArrowDownRight className="mr-1 inline h-4 w-4 text-rose-400" />
                      Worst · {s.worstTrade.symbol}
                    </span>
                    <span className="font-mono text-rose-400">
                      {fmtUsd(s.worstTrade.pnl)} ({fmtPct(s.worstTrade.pnlPct)})
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {s.worstTrade.qty.toLocaleString(undefined, { maximumFractionDigits: 4 })} @{" "}
                    {fmtUsd(s.worstTrade.entryPrice)} → {fmtUsd(s.worstTrade.exitPrice)}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 pt-2 text-xs">
                <div className="rounded-md border border-border/60 bg-muted/20 p-2">
                  <div className="text-muted-foreground">Avg win</div>
                  <div className="font-mono text-emerald-400">
                    {s.wins > 0 ? fmtUsd(s.avgWin) : "—"}
                  </div>
                </div>
                <div className="rounded-md border border-border/60 bg-muted/20 p-2">
                  <div className="text-muted-foreground">Avg loss</div>
                  <div className="font-mono text-rose-400">
                    {s.losses > 0 ? fmtUsd(s.avgLoss) : "—"}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Per-asset attribution</CardTitle>
            </CardHeader>
            <CardContent>
              {s.perSymbol.length === 0 ? (
                <div className="py-4 text-sm text-muted-foreground">
                  Close a paper trade to start building attribution.
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {s.perSymbol.map((r) => (
                    <div
                      key={r.symbol}
                      className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{r.symbol}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {r.closed} closed · {r.winRate.toFixed(0)}% win
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          r.winRate >= 50
                            ? "border-emerald-500/30 text-emerald-300"
                            : "border-rose-500/30 text-rose-300"
                        }
                      >
                        {r.wins}W
                      </Badge>
                      <span
                        className={`font-mono text-sm ${r.netPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}
                      >
                        {fmtUsd(r.netPnl)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/60 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Trade log ({trades.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {trades.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No trades yet. Open the Scanner and place a paper order to see it here.
              </div>
            ) : (
              <div className="divide-y divide-border/60 text-sm">
                {trades.map((t) => (
                  <div
                    key={t.id}
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-2"
                  >
                    <Badge
                      variant="outline"
                      className={
                        t.side === "buy"
                          ? "border-emerald-500/30 text-emerald-300"
                          : "border-rose-500/30 text-rose-300"
                      }
                    >
                      {t.side.toUpperCase()}
                    </Badge>
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{t.symbol}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {new Date(t.ts).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-right font-mono text-xs text-muted-foreground">
                      {t.qty.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                    </div>
                    <div className="text-right font-mono text-sm">{fmtUsd(t.price)}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

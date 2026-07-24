import { createFileRoute, Link } from "@tanstack/react-router";
import { ASSETS, fmtPct, fmtUsd, getAsset } from "@/lib/mock-data";
import { AppShell } from "@/components/app-shell";
import { DisclaimerBanner, DemoBadge } from "@/components/disclaimer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MomentumBadge } from "@/components/momentum";
import { Sparkline } from "@/components/sparkline";
import { usePaper } from "@/lib/paper-store";
import { ArrowDownRight, ArrowUpRight, Lock, TrendingUp, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — PumpPilot AI" },
      {
        name: "description",
        content:
          "Portfolio overview, top momentum signals and market pulse. Paper trading only — demo data.",
      },
      { property: "og:title", content: "PumpPilot AI Dashboard" },
      {
        property: "og:description",
        content: "Explainable momentum, portfolio, and market pulse in one premium dark UI.",
      },
    ],
  }),
  component: Dashboard,
});

function StatCard({
  label,
  value,
  sub,
  positive,
}: {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
}) {
  return (
    <Card className="border-border/60 bg-card/60">
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="mt-1 font-mono text-2xl font-bold">{value}</div>
        {sub && (
          <div
            className={`mt-1 text-xs ${
              positive === undefined
                ? "text-muted-foreground"
                : positive
                  ? "text-emerald-400"
                  : "text-rose-400"
            }`}
          >
            {sub}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const { cash, positions, equity } = usePaper();

  const posRows = positions.map((p) => {
    const a = getAsset(p.symbol)!;
    const value = a.price * p.qty;
    const pnl = (a.price - p.avgCost) * p.qty;
    const pnlPct = ((a.price - p.avgCost) / p.avgCost) * 100;
    return { p, a, value, pnl, pnlPct };
  });

  const totalPnl = posRows.reduce((s, r) => s + r.pnl, 0);
  const invested = posRows.reduce((s, r) => s + r.p.avgCost * r.p.qty, 0);
  const totalPnlPct = invested > 0 ? (totalPnl / invested) * 100 : 0;

  const topMomentum = [...ASSETS].sort((a, b) => b.momentum.total - a.momentum.total).slice(0, 4);

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-emerald-300">
              <TrendingUp className="h-3.5 w-3.5" /> PumpPilot AI
            </div>
            <h1 className="mt-1 truncate text-2xl font-bold sm:text-3xl">
              Spot momentum. Control risk. Trade smarter.
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Portfolio and market pulse — updated with demo data.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="outline" className="border-emerald-500/30 text-emerald-300">
              Paper mode
            </Badge>
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-1.5">
              <Lock className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-xs text-amber-200">Live off</span>
              <Switch checked={false} disabled aria-label="Live execution locked" />
            </div>
          </div>
        </div>

        <DisclaimerBanner />

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            label="Equity"
            value={fmtUsd(equity)}
            sub={`${fmtPct(totalPnlPct)} unrealized`}
            positive={totalPnl >= 0}
          />
          <StatCard label="Paper cash" value={fmtUsd(cash)} sub="USD available" />
          <StatCard
            label="Open P/L"
            value={fmtUsd(totalPnl)}
            sub={fmtPct(totalPnlPct)}
            positive={totalPnl >= 0}
          />
          <StatCard label="Positions" value={String(positions.length)} sub="assets held" />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Portfolio */}
          <Card className="border-border/60 bg-card/60 lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Wallet className="h-4 w-4" /> Portfolio
              </CardTitle>
              <Link
                to="/paper"
                className="text-xs text-emerald-300 hover:underline"
              >
                Manage →
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {posRows.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No positions yet. Start paper trading from the Scanner.
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {posRows.map(({ p, a, value, pnl, pnlPct }) => (
                    <Link
                      key={p.symbol}
                      to="/asset/$symbol"
                      params={{ symbol: p.symbol }}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition hover:bg-muted/40"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-semibold">{a.symbol}</span>
                          {a.isDemo && <DemoBadge />}
                          <MomentumBadge score={a.momentum.total} />
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {p.qty.toLocaleString(undefined, { maximumFractionDigits: 4 })} @{" "}
                          {fmtUsd(p.avgCost)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-sm">{fmtUsd(value)}</div>
                        <div
                          className={`flex items-center justify-end gap-0.5 font-mono text-xs ${
                            pnl >= 0 ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {pnl >= 0 ? (
                            <ArrowUpRight className="h-3 w-3" />
                          ) : (
                            <ArrowDownRight className="h-3 w-3" />
                          )}
                          {fmtPct(pnlPct)}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top momentum */}
          <Card className="border-border/60 bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Top momentum</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {topMomentum.map((a) => (
                <Link
                  key={a.symbol}
                  to="/asset/$symbol"
                  params={{ symbol: a.symbol }}
                  className="grid grid-cols-[minmax(0,1fr)_80px_auto] items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 transition hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold">{a.symbol}</span>
                      {a.isDemo && <DemoBadge />}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">{a.name}</div>
                  </div>
                  <div className="h-8">
                    <Sparkline data={a.sparkline} positive={a.change24h >= 0} />
                  </div>
                  <MomentumBadge score={a.momentum.total} />
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

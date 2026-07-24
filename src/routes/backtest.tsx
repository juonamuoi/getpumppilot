import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { DisclaimerBanner } from "@/components/disclaimer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtPct, fmtUsd } from "@/lib/mock-data";
import { History } from "lucide-react";

export const Route = createFileRoute("/backtest")({
  head: () => ({
    meta: [
      { title: "Backtest — PumpPilot AI" },
      {
        name: "description",
        content:
          "Backtest strategies against simulated historical data. Past demo results do not predict future returns.",
      },
      { property: "og:title", content: "Backtest — PumpPilot AI" },
      {
        property: "og:description",
        content: "Simulated backtests with clear disclaimers.",
      },
    ],
  }),
  component: BacktestPage,
});

type Result = {
  equity: { i: number; v: number }[];
  finalReturn: number;
  maxDrawdown: number;
  winRate: number;
  trades: number;
  sharpe: number;
};

function runBacktest(seed: number, threshold: number, months: number): Result {
  const days = months * 30;
  const equity: { i: number; v: number }[] = [];
  let v = 10000;
  let peak = v;
  let maxDD = 0;
  let wins = 0;
  let total = 0;
  const rets: number[] = [];
  for (let i = 0; i < days; i++) {
    const noise = Math.sin((i + seed) * 0.9) * 0.015 + Math.cos((i + seed) * 0.3) * 0.01;
    const drift = (threshold - 50) / 5000; // higher threshold -> lower activity, but higher edge
    const r = noise + drift + (Math.sin(i * 0.11 + seed) > 0.6 ? 0.02 : 0);
    v = v * (1 + r);
    rets.push(r);
    if (v > peak) peak = v;
    const dd = (v - peak) / peak;
    if (dd < maxDD) maxDD = dd;
    if (Math.sin(i * 0.4 + seed) > 0.5) {
      total++;
      if (r > 0) wins++;
    }
    equity.push({ i, v });
  }
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const std =
    Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length) || 0.0001;
  const sharpe = (mean / std) * Math.sqrt(365);
  return {
    equity,
    finalReturn: (v / 10000 - 1) * 100,
    maxDrawdown: maxDD * 100,
    winRate: total ? (wins / total) * 100 : 0,
    trades: total,
    sharpe,
  };
}

function BacktestPage() {
  const [strategy, setStrategy] = useState("breakout");
  const [period, setPeriod] = useState("6");
  const [threshold, setThreshold] = useState([70]);
  const [result, setResult] = useState<Result | null>(null);

  const run = () => {
    const seed = strategy === "breakout" ? 3 : strategy === "trend" ? 7 : 11;
    setResult(runBacktest(seed, threshold[0], parseInt(period)));
  };

  return (
    <AppShell>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Backtest</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Simulate a strategy against fabricated historical demo data.
          </p>
        </div>
        <DisclaimerBanner />

        <div className="grid gap-5 lg:grid-cols-[1fr_1.6fr]">
          <Card className="border-border/60 bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Parameters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label className="text-xs">Strategy</Label>
                <Select value={strategy} onValueChange={setStrategy}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="breakout">Breakout Momentum</SelectItem>
                    <SelectItem value="trend">Trend Following</SelectItem>
                    <SelectItem value="meanrev">Mean Reversion</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Period (months)</Label>
                <Select value={period} onValueChange={setPeriod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">3 months</SelectItem>
                    <SelectItem value="6">6 months</SelectItem>
                    <SelectItem value="12">12 months</SelectItem>
                    <SelectItem value="24">24 months</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Momentum threshold</Label>
                  <span className="font-mono text-xs text-emerald-300">{threshold[0]}</span>
                </div>
                <Slider value={threshold} onValueChange={setThreshold} min={30} max={95} step={1} />
              </div>
              <Button onClick={run} className="w-full">
                <History className="mr-2 h-4 w-4" /> Run backtest
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Results</CardTitle>
            </CardHeader>
            <CardContent>
              {!result ? (
                <div className="grid h-64 place-items-center text-sm text-muted-foreground">
                  Configure parameters and run a backtest to see results.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Metric
                      label="Return"
                      value={fmtPct(result.finalReturn)}
                      positive={result.finalReturn >= 0}
                    />
                    <Metric
                      label="Max drawdown"
                      value={fmtPct(result.maxDrawdown)}
                      positive={false}
                    />
                    <Metric label="Win rate" value={`${result.winRate.toFixed(1)}%`} />
                    <Metric label="Sharpe" value={result.sharpe.toFixed(2)} />
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={result.equity}>
                        <defs>
                          <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="oklch(0.78 0.17 160)" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="oklch(0.78 0.17 160)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="oklch(0.3 0.02 260 / 40%)" strokeDasharray="3 3" />
                        <XAxis dataKey="i" tick={{ fill: "oklch(0.7 0.03 258)", fontSize: 11 }} />
                        <YAxis
                          tick={{ fill: "oklch(0.7 0.03 258)", fontSize: 11 }}
                          tickFormatter={(v: number) => fmtUsd(v)}
                          width={70}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "oklch(0.2 0.025 260)",
                            border: "1px solid oklch(0.3 0.02 260)",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                          formatter={(v: number) => fmtUsd(v)}
                        />
                        <Area
                          type="monotone"
                          dataKey="v"
                          stroke="oklch(0.78 0.17 160)"
                          strokeWidth={2}
                          fill="url(#eq)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Backtest uses synthetic demo data. Past simulated performance is not indicative
                    of any future returns.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function Metric({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={`mt-1 font-mono text-lg font-bold ${
          positive === undefined
            ? "text-foreground"
            : positive
              ? "text-emerald-400"
              : "text-rose-400"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

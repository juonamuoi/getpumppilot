// Portfolio value history chart for the connected wallet (read-only tracking).
import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LineChart, TrendingDown, TrendingUp } from "lucide-react";
import { fmtPct, fmtUsd } from "@/lib/mock-data";
import {
  bucketHistory,
  recordValue,
  seriesStats,
  useValueHistory,
  type Bucketing,
} from "@/lib/wallet-history";

export function WalletValueHistoryChart({
  address,
  total,
  ready,
}: {
  address: string | null;
  total: number;
  ready: boolean;
}) {
  const [mode, setMode] = useState<Bucketing>("daily");
  const history = useValueHistory(address);

  useEffect(() => {
    if (!address || !ready) return;
    recordValue(address, total);
  }, [address, total, ready]);

  if (!address) return null;

  const points = bucketHistory(history, mode);
  const stats = seriesStats(points);
  const up = (stats?.change ?? 0) >= 0;

  return (
    <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <LineChart className="h-4 w-4 text-emerald-400" />
          <span className="text-sm font-semibold">Portfolio value history</span>
          <Badge
            variant="outline"
            className="border-emerald-500/30 text-[9px] uppercase text-emerald-300"
          >
            Live wallet · real prices
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          {(["daily", "weekly"] as Bucketing[]).map((m) => (
            <Button
              key={m}
              size="sm"
              variant={mode === m ? "secondary" : "ghost"}
              className="h-7 px-2 text-xs capitalize"
              onClick={() => setMode(m)}
            >
              {m}
            </Button>
          ))}
        </div>
      </div>

      {points.length < 2 ? (
        <p className="py-4 text-sm text-muted-foreground">
          Tracking started — your wallet value is snapshotted while the dashboard is open. The{" "}
          {mode} performance curve appears once there are at least two {mode === "weekly" ? "weeks" : "days"}{" "}
          of history.{" "}
          {points.length === 1 && (
            <span className="text-foreground">Current: {fmtUsd(points[0].value)}</span>
          )}
        </p>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-xl font-semibold tabular-nums">{fmtUsd(stats!.last)}</span>
            <span
              className={`flex items-center gap-1 text-sm tabular-nums ${
                up ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {fmtUsd(stats!.change)} ({fmtPct(stats!.changePct)})
            </span>
            <span className="text-xs text-muted-foreground">
              High {fmtUsd(stats!.high)} · Low {fmtUsd(stats!.low)} · {stats!.points}{" "}
              {mode === "weekly" ? "weeks" : "days"}
            </span>
          </div>

          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="walletValueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor={up ? "hsl(var(--chart-1, 152 60% 45%))" : "hsl(0 72% 55%)"}
                      stopOpacity={0.45}
                    />
                    <stop
                      offset="100%"
                      stopColor={up ? "hsl(var(--chart-1, 152 60% 45%))" : "hsl(0 72% 55%)"}
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  width={64}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => fmtUsd(v)}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number | string) => [fmtUsd(Number(v)), "Wallet value"]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={up ? "hsl(152 60% 45%)" : "hsl(0 72% 55%)"}
                  strokeWidth={2}
                  fill="url(#walletValueFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      <p className="mt-2 text-[11px] text-muted-foreground">
        History is recorded locally in this browser from live prices while the dashboard is open —
        tracking only, no trades are placed.
      </p>
    </div>
  );
}

// Side-by-side momentum comparison: two holdings' sparklines overlaid on one
// normalized axis (% change from the start of the selected window), so assets
// with very different prices can still be compared.
import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtPrice } from "@/components/price-sparkline";
import type { SparkWindowValue } from "@/lib/sparkline-window";

export type CompareSeries = {
  symbol: string;
  points: number[];
};

type Props = {
  a: CompareSeries;
  b: CompareSeries;
  window: SparkWindowValue;
  intervalMs: number;
  /** Epoch ms of the last point. */
  endTs?: number;
};

const COLORS = ["oklch(0.78 0.17 160)", "oklch(0.75 0.16 265)"];

function pctChange(points: number[]) {
  if (points.length < 2 || points[0] === 0) return 0;
  return ((points[points.length - 1] - points[0]) / points[0]) * 100;
}

/** Normalize a series to % change from its first point. */
function normalize(points: number[]) {
  const base = points[0];
  if (!base) return points.map(() => 0);
  return points.map((p) => ((p - base) / base) * 100);
}

export function SparklineCompare({ a, b, window: win, intervalMs, endTs }: Props) {
  const len = Math.min(a.points.length, b.points.length);
  const baseTs = endTs ?? Date.now();

  const data = useMemo(() => {
    const na = normalize(a.points.slice(-len));
    const nb = normalize(b.points.slice(-len));
    return na.map((v, i) => ({
      i,
      ts: baseTs - (len - 1 - i) * intervalMs,
      a: v,
      b: nb[i],
    }));
  }, [a.points, b.points, len, baseTs, intervalMs]);

  const changeA = pctChange(a.points.slice(-len));
  const changeB = pctChange(b.points.slice(-len));
  const leader = changeA === changeB ? null : changeA > changeB ? a.symbol : b.symbol;
  const spread = Math.abs(changeA - changeB);

  if (len < 2) {
    return (
      <div className="rounded-xl border border-border/60 bg-card/60 p-4 text-xs text-muted-foreground">
        Not enough overlapping price history to compare these two holdings on the {win}{" "}
        window.
      </div>
    );
  }

  const legend = [
    { s: a, change: changeA, color: COLORS[0] },
    { s: b, change: changeB, color: COLORS[1] },
  ];

  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          {legend.map((l) => (
            <span key={l.s.symbol} className="flex items-center gap-1.5 text-xs">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: l.color }}
                aria-hidden
              />
              <span className="font-medium">{l.s.symbol}</span>
              <span
                className={`font-mono ${
                  l.change >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {l.change >= 0 ? "+" : ""}
                {l.change.toFixed(2)}%
              </span>
            </span>
          ))}
        </div>
        <span className="text-[11px] text-muted-foreground">
          {leader
            ? `${leader} leads by ${spread.toFixed(2)} pts over ${win}`
            : `Both flat versus each other over ${win}`}
        </span>
      </div>

      <div className="mt-3 h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="oklch(0.3 0.02 260)" strokeDasharray="3 3" />
            <XAxis dataKey="i" hide />
            <YAxis
              tick={{ fill: "oklch(0.7 0.03 258)", fontSize: 10 }}
              width={48}
              tickFormatter={(v: number) => `${v.toFixed(1)}%`}
            />
            <Tooltip
              contentStyle={{
                background: "oklch(0.2 0.025 260)",
                border: "1px solid oklch(0.3 0.02 260)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(v: number, key) => [
                `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`,
                key === "a" ? a.symbol : b.symbol,
              ]}
              labelFormatter={(_l, payload) => {
                const ts = payload?.[0]?.payload?.ts as number | undefined;
                return ts ? new Date(ts).toLocaleString() : "";
              }}
            />
            <Line
              type="monotone"
              dataKey="a"
              stroke={COLORS[0]}
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="b"
              stroke={COLORS[1]}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        Normalized to % change from the start of the {win} window ({len} hourly closes).
        Latest: {a.symbol} {fmtPrice(a.points[a.points.length - 1])} · {b.symbol}{" "}
        {fmtPrice(b.points[b.points.length - 1])}. Read-only — no trades are executed.
      </p>
    </div>
  );
}

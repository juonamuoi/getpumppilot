// Live wallet vs paper (simulated) allocation comparison — value and percentage.
// Read-only: live values come from on-chain balances priced with the live feed,
// paper values come from the local simulated portfolio.
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { fmtUsd, getAsset } from "@/lib/mock-data";
import { useLivePriceMap } from "@/lib/market-data";
import { usePaper } from "@/lib/paper-store";
import type { AllocationItem } from "@/components/wallet-allocation-chart";

type Row = {
  symbol: string;
  live: number;
  paper: number;
  livePct: number;
  paperPct: number;
};

function pct(v: number, total: number) {
  return total > 0 ? (v / total) * 100 : 0;
}

export function LivePaperAllocationCompare({
  liveItems,
}: {
  liveItems: AllocationItem[];
}) {
  const { positions } = usePaper();
  const prices = useLivePriceMap();

  const { rows, liveTotal, paperTotal } = useMemo(() => {
    const live = new Map<string, number>();
    for (const i of liveItems) {
      if (i.value > 0) live.set(i.symbol, (live.get(i.symbol) ?? 0) + i.value);
    }

    const paper = new Map<string, number>();
    for (const p of positions) {
      const px = prices[p.symbol]?.price ?? getAsset(p.symbol)?.price ?? 0;
      const value = p.qty * px;
      if (value > 0) paper.set(p.symbol, (paper.get(p.symbol) ?? 0) + value);
    }

    const liveTotal = [...live.values()].reduce((s, v) => s + v, 0);
    const paperTotal = [...paper.values()].reduce((s, v) => s + v, 0);

    const symbols = [...new Set([...live.keys(), ...paper.keys()])];
    const rows: Row[] = symbols
      .map((symbol) => {
        const l = live.get(symbol) ?? 0;
        const p = paper.get(symbol) ?? 0;
        return {
          symbol,
          live: l,
          paper: p,
          livePct: pct(l, liveTotal),
          paperPct: pct(p, paperTotal),
        };
      })
      .sort((a, b) => b.live + b.paper - (a.live + a.paper));

    return { rows, liveTotal, paperTotal };
  }, [liveItems, positions, prices]);

  if (rows.length === 0 || (liveTotal <= 0 && paperTotal <= 0)) return null;

  const chartData = rows.slice(0, 6).map((r) => ({
    symbol: r.symbol,
    Live: Number(r.livePct.toFixed(2)),
    Paper: Number(r.paperPct.toFixed(2)),
    liveValue: r.live,
    paperValue: r.paper,
  }));

  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Live wallet vs paper allocation
        </div>
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline" className="text-[10px]">
            Live {fmtUsd(liveTotal)}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            Paper {fmtUsd(paperTotal)}
          </Badge>
        </div>
      </div>

      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 12, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="symbol"
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              unit="%"
            />
            <Tooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value: number, name: string, item) => {
                const p = item?.payload as (typeof chartData)[number] | undefined;
                const usd = name === "Live" ? p?.liveValue : p?.paperValue;
                return [`${value.toFixed(2)}% · ${fmtUsd(usd ?? 0)}`, name];
              }}
            />
            <Bar dataKey="Live" radius={[4, 4, 0, 0]} fill="var(--chart-1)">
              <LabelList
                dataKey="Live"
                position="top"
                className="fill-muted-foreground"
                fontSize={9}
                formatter={(v: number) => `${v.toFixed(0)}%`}
              />
            </Bar>
            <Bar dataKey="Paper" radius={[4, 4, 0, 0]} fill="var(--chart-3)">
              <Cell key="paper" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="py-1 text-left font-medium">Asset</th>
              <th className="py-1 text-right font-medium">Live</th>
              <th className="py-1 text-right font-medium">Paper</th>
              <th className="py-1 text-right font-medium">Δ value</th>
              <th className="py-1 text-right font-medium">Δ weight</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const dv = r.live - r.paper;
              const dp = r.livePct - r.paperPct;
              return (
                <tr key={r.symbol} className="border-t border-border/40">
                  <td className="py-1 font-medium">{r.symbol}</td>
                  <td className="py-1 text-right font-mono">
                    {fmtUsd(r.live)}
                    <span className="ml-1 text-muted-foreground">
                      {r.livePct.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-1 text-right font-mono">
                    {fmtUsd(r.paper)}
                    <span className="ml-1 text-muted-foreground">
                      {r.paperPct.toFixed(1)}%
                    </span>
                  </td>
                  <td
                    className={`py-1 text-right font-mono ${
                      dv >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {dv >= 0 ? "+" : "−"}
                    {fmtUsd(Math.abs(dv))}
                  </td>
                  <td
                    className={`py-1 text-right font-mono ${
                      dp >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {dp >= 0 ? "+" : "−"}
                    {Math.abs(dp).toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        Paper values are simulated holdings priced with the same live feed (mock price
        fallback for assets without a live quote). Read-only — no trades are executed.
      </p>
    </div>
  );
}

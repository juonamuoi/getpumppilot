// Allocation chart for the live wallet portfolio — value distribution by holding.
import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Button } from "@/components/ui/button";
import { fmtUsd } from "@/lib/mock-data";

export type AllocationItem = { symbol: string; value: number };

const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

/** Top holdings by value; everything else folded into "Other". */
function buildSlices(items: AllocationItem[], max = 5) {
  const sorted = items
    .filter((i) => i.value > 0)
    .sort((a, b) => b.value - a.value);
  if (sorted.length <= max) return sorted;
  const head = sorted.slice(0, max - 1);
  const rest = sorted.slice(max - 1).reduce((s, i) => s + i.value, 0);
  return [...head, { symbol: "Other", value: rest }];
}

export function WalletAllocationChart({ items }: { items: AllocationItem[] }) {
  const [mode, setMode] = useState<"pie" | "bar">("pie");
  const slices = useMemo(() => buildSlices(items), [items]);
  const total = slices.reduce((s, i) => s + i.value, 0);

  if (total <= 0) return null;

  const pct = (v: number) => (v / total) * 100;

  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Allocation by value
        </div>
        <div className="flex gap-1">
          <Button
            variant={mode === "pie" ? "secondary" : "ghost"}
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={() => setMode("pie")}
          >
            Pie
          </Button>
          <Button
            variant={mode === "bar" ? "secondary" : "ghost"}
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={() => setMode("bar")}
          >
            Stacked
          </Button>
        </div>
      </div>

      {mode === "pie" ? (
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="symbol"
                innerRadius={38}
                outerRadius={64}
                paddingAngle={2}
                stroke="none"
              >
                {slices.map((s, i) => (
                  <Cell key={s.symbol} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "var(--popover-foreground)",
                }}
                formatter={(value: number, name: string) => [
                  `${fmtUsd(value)} (${pct(value).toFixed(1)}%)`,
                  name,
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-6 w-full overflow-hidden rounded-md">
          {slices.map((s, i) => (
            <div
              key={s.symbol}
              className="h-full"
              style={{
                width: `${pct(s.value)}%`,
                background: PALETTE[i % PALETTE.length],
              }}
              title={`${s.symbol} — ${fmtUsd(s.value)} (${pct(s.value).toFixed(1)}%)`}
            />
          ))}
        </div>
      )}

      <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1">
        {slices.map((s, i) => (
          <li key={s.symbol} className="flex items-center gap-1.5 text-[11px]">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: PALETTE[i % PALETTE.length] }}
            />
            <span className="truncate font-medium">{s.symbol}</span>
            <span className="ml-auto font-mono text-muted-foreground">
              {pct(s.value).toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

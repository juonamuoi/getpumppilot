import { useMemo } from "react";
import { History } from "lucide-react";

import { controlTitle, describeHeadroom } from "@/lib/risk-block";
import { useRejectionLog } from "@/lib/rejection-log";

function pct(n?: number) {
  if (n == null) return "—";
  return `${n.toFixed(n < 10 ? 1 : 0)}%`;
}

/**
 * Compact log of orders the risk controls blocked, shown under the Risk limits
 * panel: which limit fired, the value that breached it, and the headroom that
 * remained under that limit once the order was rejected.
 */
export function RiskLimitsHistory({
  symbol,
  limit = 5,
}: {
  /** When set, only breaches for this symbol (or account-wide controls) show. */
  symbol?: string;
  limit?: number;
}) {
  const entries = useRejectionLog();

  const rows = useMemo(() => {
    const scoped = symbol
      ? entries.filter(
          (e) =>
            e.symbol === symbol ||
            e.block.code === "max_daily_loss" ||
            e.block.code === "insufficient_cash",
        )
      : entries;
    return scoped.slice(0, limit);
  }, [entries, symbol, limit]);

  return (
    <div className="space-y-2 border-t border-border/60 pt-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <History className="h-3.5 w-3.5" aria-hidden />
        Limit breach history
      </p>

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No orders blocked yet. Any rejection records the limit, the breaching value and the
          headroom left afterwards.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((e) => (
            <li key={e.id} className="rounded-md border border-border/60 bg-background/40 p-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-xs font-medium">
                  <span className="uppercase text-muted-foreground">{e.side}</span> {e.symbol}{" "}
                  <span className="text-muted-foreground">
                    {e.qty.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                  </span>
                </span>
                <time
                  dateTime={new Date(e.ts).toISOString()}
                  className="text-[11px] text-muted-foreground"
                >
                  {new Date(e.ts).toLocaleString()}
                </time>
              </div>
              <p className="mt-1 text-[11px]">
                <span className="text-warning">{controlTitle(e.block.code)}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · breached {pct(e.block.actualPct)} vs limit {pct(e.block.limitPct)}
                </span>
              </p>
              <p className="text-[11px] text-muted-foreground">
                {describeHeadroom(e.block, e.symbol) ?? e.block.remedy}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

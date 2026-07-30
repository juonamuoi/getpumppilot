import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { usePaper } from "@/lib/paper-store";
import { getAsset, fmtUsd } from "@/lib/mock-data";
import { useLivePriceMap } from "@/lib/market-data";
import {
  recordRiskHit,
  useSimulatedPrices,
  type RiskHitKind,
} from "@/lib/position-risk-watch";

/**
 * Watches every paper holding against the configured stop-loss / take-profit
 * levels and raises an in-app toast the moment a simulated price crosses one.
 * Mounted once in the app shell so alerts follow you across pages.
 */
export function PositionRiskNotifier() {
  const { positions, risk } = usePaper();
  const live = useLivePriceMap();

  const references: Record<string, number> = {};
  for (const p of positions) {
    const a = getAsset(p.symbol);
    references[p.symbol] = live[p.symbol]?.price ?? a?.price ?? p.avgCost;
  }

  const prices = useSimulatedPrices(references, { enabled: positions.length > 0 });
  /** symbol -> which side is currently latched (so we alert once per crossing) */
  const armed = useRef<Record<string, RiskHitKind | null>>({});

  useEffect(() => {
    for (const p of positions) {
      const price = prices[p.symbol];
      if (!price || p.qty <= 0) continue;

      const stop = p.avgCost * (1 - risk.stopLossPct / 100);
      const target = p.avgCost * (1 + risk.takeProfitPct / 100);
      const kind: RiskHitKind | null =
        price <= stop ? "stop-loss" : price >= target ? "take-profit" : null;

      if (!kind) {
        armed.current[p.symbol] = null; // back inside the band → re-arm
        continue;
      }
      if (armed.current[p.symbol] === kind) continue;
      armed.current[p.symbol] = kind;

      const pnlUsd = (price - p.avgCost) * p.qty;
      const pnlPct = ((price - p.avgCost) / p.avgCost) * 100;
      recordRiskHit({
        id: `${p.symbol}-${kind}-${Date.now()}`,
        symbol: p.symbol,
        kind,
        price,
        level: kind === "stop-loss" ? stop : target,
        avgCost: p.avgCost,
        qty: p.qty,
        pnlUsd,
        pnlPct,
        at: new Date().toISOString(),
      });

      const body = `${p.symbol} at ${fmtUsd(price)} — ${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(
        1,
      )}% (${fmtUsd(pnlUsd)}) on ${p.qty} units. Simulated price, no order placed.`;

      const opts = {
        description: body,
        duration: 9000,
        action: {
          label: "Review",
          onClick: () => {
            window.location.href = "/paper";
          },
        },
      };
      if (kind === "stop-loss") {
        toast.error(`Stop-loss hit — ${p.symbol} at -${risk.stopLossPct}%`, opts);
      } else {
        toast.success(`Take-profit hit — ${p.symbol} at +${risk.takeProfitPct}%`, opts);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prices, risk.stopLossPct, risk.takeProfitPct, positions]);

  return null;
}

/** Small helper link used by the dashboard card. */
export function RiskAlertsLink() {
  return (
    <Link to="/risk" className="text-xs text-emerald-300 hover:underline">
      Adjust levels →
    </Link>
  );
}

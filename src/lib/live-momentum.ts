// Realtime momentum engine.
// Blends live reference prices (majors, CoinGecko) with the demo momentum
// baseline to produce a ticking, explainable momentum score per asset.
// DEMO small-caps are fictional and always simulated.

import { useEffect, useMemo, useRef, useState } from "react";
import { ASSETS, type Asset } from "@/lib/mock-data";
import { useLivePriceMap } from "@/lib/market-data";

export type LiveMomentum = {
  symbol: string;
  name: string;
  category: Asset["category"];
  /** Current (ticking) momentum score 0-100. */
  score: number;
  /** Score at the previous tick. */
  prevScore: number;
  /** score - prevScore */
  delta: number;
  /** Baseline momentum from the demo dataset. */
  baseScore: number;
  change24h: number;
  volumeScore: number;
  volatility: number;
  /** True when the score is influenced by live reference prices. */
  liveBacked: boolean;
  reason: string;
};

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/**
 * Deterministic-ish drift so scores move plausibly instead of jumping.
 * Volatility widens the step; higher scores mean-revert slightly.
 */
function nextScore(current: number, base: number, volatility: number) {
  const step = (Math.random() - 0.5) * (4 + volatility / 10);
  const pull = (base - current) * 0.06; // mean reversion to the baseline
  return clamp(current + step + pull);
}

export type MomentumTick = {
  rows: LiveMomentum[];
  ts: number;
};

/**
 * Ticks momentum scores on an interval. Pausable so the dashboard card can
 * stop the feed without unmounting.
 */
export function useLiveMomentum(opts: { enabled: boolean; intervalMs?: number }) {
  const { enabled, intervalMs = 5000 } = opts;
  const liveMap = useLivePriceMap();
  const [ts, setTs] = useState(() => Date.now());
  const [scores, setScores] = useState<Record<string, number>>(() =>
    Object.fromEntries(ASSETS.map((a) => [a.symbol, a.momentum.total])),
  );
  const prevRef = useRef<Record<string, number>>(scores);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      setScores((prev) => {
        prevRef.current = prev;
        const next: Record<string, number> = {};
        for (const a of ASSETS) {
          const live = liveMap[a.symbol];
          // Live 24h change nudges the baseline for majors.
          const base = live
            ? clamp(a.momentum.total + live.change24h * 1.5)
            : a.momentum.total;
          next[a.symbol] = nextScore(prev[a.symbol] ?? base, base, a.momentum.volatility);
        }
        return next;
      });
      setTs(Date.now());
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [enabled, intervalMs, liveMap]);

  const rows = useMemo<LiveMomentum[]>(
    () =>
      ASSETS.map((a) => {
        const live = liveMap[a.symbol];
        const score = Math.round(scores[a.symbol] ?? a.momentum.total);
        const prevScore = Math.round(prevRef.current[a.symbol] ?? score);
        return {
          symbol: a.symbol,
          name: a.name,
          category: a.category,
          score,
          prevScore,
          delta: score - prevScore,
          baseScore: a.momentum.total,
          change24h: live ? live.change24h : a.change24h,
          volumeScore: a.momentum.volume,
          volatility: a.momentum.volatility,
          liveBacked: Boolean(live),
          reason: a.momentum.reason,
        };
      }).sort((x, y) => y.score - x.score),
    [scores, liveMap],
  );

  return { rows, ts };
}

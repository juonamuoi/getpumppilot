// Lightweight, deterministic PAPER-TRADING backtest over MOCK sparkline data.
// This is a simulation on demo data only — it is not a prediction of returns.

import type { Asset } from "@/lib/mock-data";
import type { ScannerRules } from "@/lib/paper-store";

export type BacktestBar = {
  i: number;
  price: number;
  change24h: number;
  momentum: number;
  volumeScore: number;
  volatility: number;
};

export type BacktestTrade = {
  symbol: string;
  entryBar: number;
  exitBar: number;
  entryPrice: number;
  exitPrice: number;
  returnPct: number;
};

export type BacktestResult = {
  trades: BacktestTrade[];
  tradeCount: number;
  winRate: number; // 0-100
  avgReturnPct: number;
  totalReturnPct: number; // equal-weight sum of per-trade returns / trades*allocation
  bestPct: number;
  worstPct: number;
  maxDrawdownPct: number;
  exposureBars: number;
};

export type BacktestConfig = {
  /** bars to hold each entry */
  holdBars: number;
  /** stop loss in percent (positive number) */
  stopLossPct: number;
  /** take profit in percent */
  takeProfitPct: number;
};

export const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
  holdBars: 5,
  stopLossPct: 6,
  takeProfitPct: 10,
};

/** Builds a deterministic per-bar snapshot series from an asset's mock sparkline. */
export function buildBars(asset: Asset): BacktestBar[] {
  const s = asset.sparkline;
  const bars: BacktestBar[] = [];
  for (let i = 0; i < s.length; i++) {
    const prev = s[Math.max(0, i - 1)];
    const back = s[Math.max(0, i - 5)];
    const stepPct = prev ? ((s[i] - prev) / prev) * 100 : 0;
    const trendPct = back ? ((s[i] - back) / back) * 100 : 0;

    // Local volatility: mean absolute step over the trailing window.
    let vol = 0;
    let n = 0;
    for (let k = Math.max(1, i - 5); k <= i; k++) {
      vol += Math.abs((s[k] - s[k - 1]) / s[k - 1]) * 100;
      n++;
    }
    vol = n ? vol / n : 0;

    const clamp = (v: number) => Math.max(0, Math.min(100, v));
    bars.push({
      i,
      price: s[i],
      // Scale local trend into a 24h-change-like figure anchored on the asset's mock value.
      change24h: Number((asset.change24h * 0.4 + trendPct * 1.6).toFixed(2)),
      momentum: clamp(asset.momentum.total + trendPct * 3),
      volumeScore: clamp(asset.momentum.volume + stepPct * 4),
      volatility: clamp(asset.momentum.volatility + (vol - 1.5) * 8),
    });
  }
  return bars;
}

function barMatches(rules: ScannerRules, asset: Asset, bar: BacktestBar): boolean {
  const categoryOk =
    (asset.category === "major" && rules.includeMajors) ||
    (asset.category === "demo-smallcap" && rules.includeDemoSmallCaps);
  return (
    categoryOk &&
    bar.momentum >= rules.minMomentum &&
    bar.volumeScore >= rules.minVolumeScore &&
    bar.volatility <= rules.maxVolatility &&
    bar.change24h >= rules.min24hChangePct
  );
}

/** Runs the backtest for one rule set across the given assets. */
export function runBacktest(
  rules: ScannerRules,
  assets: Asset[],
  config: BacktestConfig = DEFAULT_BACKTEST_CONFIG,
): BacktestResult {
  const trades: BacktestTrade[] = [];
  let exposureBars = 0;

  for (const asset of assets) {
    const bars = buildBars(asset);
    let cooldownUntil = -1;
    for (let i = 1; i < bars.length - 1; i++) {
      if (i < cooldownUntil) continue;
      if (!barMatches(rules, asset, bars[i])) continue;

      const entryPrice = bars[i].price;
      let exitBar = Math.min(bars.length - 1, i + config.holdBars);
      for (let k = i + 1; k <= Math.min(bars.length - 1, i + config.holdBars); k++) {
        const pct = ((bars[k].price - entryPrice) / entryPrice) * 100;
        if (pct <= -config.stopLossPct || pct >= config.takeProfitPct) {
          exitBar = k;
          break;
        }
      }
      const exitPrice = bars[exitBar].price;
      const returnPct = ((exitPrice - entryPrice) / entryPrice) * 100;
      trades.push({
        symbol: asset.symbol,
        entryBar: i,
        exitBar,
        entryPrice,
        exitPrice,
        returnPct: Number(returnPct.toFixed(2)),
      });
      exposureBars += exitBar - i;
      cooldownUntil = exitBar + 1;
    }
  }

  trades.sort((a, b) => a.entryBar - b.entryBar || a.symbol.localeCompare(b.symbol));

  const tradeCount = trades.length;
  const wins = trades.filter((t) => t.returnPct > 0).length;
  const sum = trades.reduce((s, t) => s + t.returnPct, 0);

  // Equity curve: equal-weight sequential compounding at 25% allocation per trade.
  let equity = 100;
  let peak = 100;
  let maxDd = 0;
  for (const t of trades) {
    equity *= 1 + (t.returnPct / 100) * 0.25;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, ((peak - equity) / peak) * 100);
  }

  return {
    trades,
    tradeCount,
    winRate: tradeCount ? Number(((wins / tradeCount) * 100).toFixed(1)) : 0,
    avgReturnPct: tradeCount ? Number((sum / tradeCount).toFixed(2)) : 0,
    totalReturnPct: Number((equity - 100).toFixed(2)),
    bestPct: tradeCount ? Math.max(...trades.map((t) => t.returnPct)) : 0,
    worstPct: tradeCount ? Math.min(...trades.map((t) => t.returnPct)) : 0,
    maxDrawdownPct: Number(maxDd.toFixed(2)),
    exposureBars,
  };
}

export type BacktestComparison = {
  before: BacktestResult;
  after: BacktestResult;
  config: BacktestConfig;
  assetCount: number;
  ranAt: number;
  correlationId: string;
};

function correlationId(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `BT-${(h >>> 0).toString(16).toUpperCase().padStart(8, "0")}`;
}

export function compareBacktests(
  before: ScannerRules,
  after: ScannerRules,
  assets: Asset[],
  config: BacktestConfig = DEFAULT_BACKTEST_CONFIG,
): BacktestComparison {
  const ranAt = Date.now();
  return {
    before: runBacktest(before, assets, config),
    after: runBacktest(after, assets, config),
    config,
    assetCount: assets.length,
    ranAt,
    correlationId: correlationId(
      JSON.stringify([before, after, assets.map((a) => a.symbol), config]),
    ),
  };
}

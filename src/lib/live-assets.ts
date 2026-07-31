// Live asset overlay.
// Merges real CoinGecko market data onto the demo asset universe so every
// surface (dashboard, scanner, asset pages) shows real prices for majors.
// Fictional DEMO small-caps stay simulated and clearly labelled.

import { useMemo } from "react";
import { ASSETS, type Asset } from "@/lib/mock-data";
import { useLivePrices, type LivePrice } from "@/lib/market-data";

export type LiveAsset = Asset & { isLive: boolean };

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Derive an explainable momentum profile from real market data. */
function deriveMomentum(a: Asset, p: LivePrice): Asset["momentum"] {
  const trend = clamp(50 + p.change24h * 4);

  const turnover = p.marketCap > 0 ? p.volume24h / p.marketCap : 0;
  const volume = clamp(turnover * 700);

  const range = p.high24h - p.low24h;
  const volatility = clamp(p.price > 0 ? (range / p.price) * 900 : a.momentum.volatility);

  // Where in the 24h range we're trading — near the high implies breakout.
  const pos = range > 0 ? (p.price - p.low24h) / range : 0.5;
  const breakout = clamp(pos * 100);

  const social = a.momentum.social; // no live social feed yet — baseline
  const total = clamp(trend * 0.34 + volume * 0.2 + breakout * 0.26 + social * 0.12 + (100 - volatility) * 0.08);

  const dir = p.change24h >= 0 ? "up" : "down";
  const reason =
    `Live data: ${p.symbol} is ${dir} ${Math.abs(p.change24h).toFixed(2)}% over 24h, trading ` +
    `${Math.round(pos * 100)}% of the way up its 24h range with ` +
    `${(turnover * 100).toFixed(1)}% of market cap traded. ` +
    (volatility > 65
      ? "Elevated volatility raises reversal risk."
      : "Volatility is within normal range.");

  return { total, trend, volume, volatility, social, breakout, reason };
}

function overlay(a: Asset, p?: LivePrice): LiveAsset {
  if (!p || !p.price) return { ...a, isLive: false };
  return {
    ...a,
    price: p.price,
    change24h: p.change24h,
    volume24h: p.volume24h || a.volume24h,
    marketCap: p.marketCap || a.marketCap,
    sparkline: p.sparkline.length > 1 ? p.sparkline : a.sparkline,
    momentum: deriveMomentum(a, p),
    isLive: true,
  };
}

/** Full asset universe with live prices merged in where available. */
export function useLiveAssets() {
  const { data, isLoading, isError, dataUpdatedAt } = useLivePrices();

  const map = useMemo(() => {
    const m: Record<string, LivePrice> = {};
    for (const p of data ?? []) m[p.symbol] = p;
    return m;
  }, [data]);

  const assets = useMemo(() => ASSETS.map((a) => overlay(a, map[a.symbol])), [map]);

  return {
    assets,
    liveCount: assets.filter((a) => a.isLive).length,
    isLoading,
    isError,
    updatedAt: dataUpdatedAt,
  };
}

/** Single asset with live data merged in (case-insensitive symbol). */
export function useLiveAsset(symbol: string): LiveAsset | undefined {
  const { assets } = useLiveAssets();
  return assets.find((a) => a.symbol.toLowerCase() === symbol.toLowerCase());
}

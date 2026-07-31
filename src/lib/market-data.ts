// Live market data client (CoinGecko public API — no key required).
// Falls back silently to mock/last-known data on any failure.

import { useQuery } from "@tanstack/react-query";

export type LivePrice = {
  symbol: string;
  price: number;
  change24h: number; // percent
  sparkline: number[]; // last ~24h
  volume24h: number;
  marketCap: number;
  high24h: number;
  low24h: number;
};

// Symbols we pull live. DEMO tokens stay mock (they're fictional).
const LIVE_MAP: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  BNB: "binancecoin",
  XRP: "ripple",
  DOGE: "dogecoin",
  ADA: "cardano",
  AVAX: "avalanche-2",
  LINK: "chainlink",
  TON: "the-open-network",
};

const IDS = Object.values(LIVE_MAP).join(",");
const SYMBOLS = Object.keys(LIVE_MAP);

type CGItem = {
  id: string;
  symbol: string;
  current_price: number;
  price_change_percentage_24h: number | null;
  total_volume: number | null;
  market_cap: number | null;
  high_24h: number | null;
  low_24h: number | null;
  sparkline_in_7d?: { price?: number[] };
};

async function fetchLive(): Promise<LivePrice[]> {
  const url =
    `https://api.coingecko.com/api/v3/coins/markets` +
    `?vs_currency=usd&ids=${IDS}&order=market_cap_desc` +
    `&price_change_percentage=24h&sparkline=true`;

  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const data = (await res.json()) as CGItem[];

  const bySym: Record<string, string> = {};
  for (const [sym, id] of Object.entries(LIVE_MAP)) bySym[id] = sym;

  return data
    .filter((d) => bySym[d.id])
    .map((d) => {
      const full = d.sparkline_in_7d?.price ?? [];
      // last ~24h (7d array is hourly → last 24 points)
      const spark = full.length > 24 ? full.slice(-24) : full;
      return {
        symbol: bySym[d.id],
        price: d.current_price,
        change24h: d.price_change_percentage_24h ?? 0,
        sparkline: spark,
        volume24h: d.total_volume ?? 0,
        marketCap: d.market_cap ?? 0,
        high24h: d.high_24h ?? d.current_price,
        low24h: d.low_24h ?? d.current_price,
      } satisfies LivePrice;
    });
}

export function useLivePrices() {
  return useQuery({
    queryKey: ["live-prices", "coingecko", IDS],
    queryFn: fetchLive,
    refetchInterval: 60_000, // 1 min — respects free-tier limits
    staleTime: 45_000,
    retry: 1,
  });
}

export function useLivePriceMap(): Record<string, LivePrice> {
  const { data } = useLivePrices();
  if (!data) return {};
  const m: Record<string, LivePrice> = {};
  for (const p of data) m[p.symbol] = p;
  return m;
}

export const LIVE_SYMBOLS = SYMBOLS;

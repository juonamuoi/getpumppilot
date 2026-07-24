// All data here is MOCK / DEMO — clearly not real market data.

export type Asset = {
  symbol: string;
  name: string;
  price: number;
  change24h: number; // percent
  volume24h: number;
  marketCap: number;
  isDemo: boolean;
  category: "major" | "demo-smallcap";
  // Momentum score components (0-100)
  momentum: {
    total: number;
    trend: number;
    volume: number;
    volatility: number;
    social: number;
    breakout: number;
    reason: string;
  };
  sparkline: number[];
};

function spark(seed: number, base: number, drift: number): number[] {
  const out: number[] = [];
  let v = base;
  for (let i = 0; i < 40; i++) {
    const s = Math.sin((seed + i) * 0.7) * 0.02;
    const d = drift * (i / 40);
    v = v * (1 + s + d / 40);
    out.push(v);
  }
  return out;
}

export const ASSETS: Asset[] = [
  {
    symbol: "BTC",
    name: "Bitcoin",
    price: 68432.15,
    change24h: 2.34,
    volume24h: 32_400_000_000,
    marketCap: 1_350_000_000_000,
    isDemo: false,
    category: "major",
    momentum: {
      total: 78,
      trend: 82,
      volume: 74,
      volatility: 61,
      social: 80,
      breakout: 88,
      reason:
        "Price broke above 30d resistance with rising volume. Trend and social attention remain constructive.",
    },
    sparkline: spark(1, 66000, 0.04),
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    price: 3521.4,
    change24h: 1.12,
    volume24h: 14_200_000_000,
    marketCap: 423_000_000_000,
    isDemo: false,
    category: "major",
    momentum: {
      total: 64,
      trend: 68,
      volume: 60,
      volatility: 55,
      social: 66,
      breakout: 70,
      reason:
        "Steady uptrend against BTC with above-average volume. Momentum constructive but not extended.",
    },
    sparkline: spark(2, 3400, 0.035),
  },
  {
    symbol: "SOL",
    name: "Solana",
    price: 172.88,
    change24h: 5.71,
    volume24h: 4_100_000_000,
    marketCap: 81_000_000_000,
    isDemo: false,
    category: "major",
    momentum: {
      total: 84,
      trend: 86,
      volume: 82,
      volatility: 74,
      social: 88,
      breakout: 90,
      reason:
        "Strong breakout on 3x average volume. High social engagement — elevated volatility increases risk of sharp reversal.",
    },
    sparkline: spark(3, 158, 0.09),
  },
  {
    symbol: "BNB",
    name: "BNB",
    price: 612.5,
    change24h: -0.86,
    volume24h: 1_800_000_000,
    marketCap: 92_000_000_000,
    isDemo: false,
    category: "major",
    momentum: {
      total: 46,
      trend: 44,
      volume: 40,
      volatility: 50,
      social: 42,
      breakout: 48,
      reason:
        "Ranging price action. Volume below 30d average. No decisive momentum signal.",
    },
    sparkline: spark(4, 615, -0.01),
  },
  {
    symbol: "DEMOX",
    name: "DemoX Protocol",
    price: 0.184,
    change24h: 22.4,
    volume24h: 12_400_000,
    marketCap: 18_400_000,
    isDemo: true,
    category: "demo-smallcap",
    momentum: {
      total: 91,
      trend: 88,
      volume: 96,
      volatility: 92,
      social: 94,
      breakout: 95,
      reason:
        "Fictional demo token. Parabolic move with extreme volume. High-risk / high-reversal probability — for illustration only.",
    },
    sparkline: spark(5, 0.11, 0.18),
  },
  {
    symbol: "PILOT",
    name: "Pilot Demo Token",
    price: 0.0421,
    change24h: -8.9,
    volume24h: 3_200_000,
    marketCap: 4_210_000,
    isDemo: true,
    category: "demo-smallcap",
    momentum: {
      total: 28,
      trend: 22,
      volume: 40,
      volatility: 78,
      social: 30,
      breakout: 18,
      reason:
        "Fictional demo token. Downtrend with elevated volatility. Weak momentum profile.",
    },
    sparkline: spark(6, 0.05, -0.09),
  },
  {
    symbol: "NOVA",
    name: "Nova Demo",
    price: 1.24,
    change24h: 4.2,
    volume24h: 8_100_000,
    marketCap: 24_800_000,
    isDemo: true,
    category: "demo-smallcap",
    momentum: {
      total: 72,
      trend: 74,
      volume: 68,
      volatility: 66,
      social: 76,
      breakout: 78,
      reason:
        "Fictional demo token. Constructive higher-low structure with improving volume.",
    },
    sparkline: spark(7, 1.15, 0.05),
  },
  {
    symbol: "ORBIT",
    name: "Orbit Demo",
    price: 0.612,
    change24h: 12.6,
    volume24h: 6_400_000,
    marketCap: 12_240_000,
    isDemo: true,
    category: "demo-smallcap",
    momentum: {
      total: 81,
      trend: 78,
      volume: 84,
      volatility: 80,
      social: 82,
      breakout: 86,
      reason:
        "Fictional demo token. Breakout confirmed on rising volume. Monitor for follow-through.",
    },
    sparkline: spark(8, 0.5, 0.11),
  },
];

export function getAsset(symbol: string): Asset | undefined {
  return ASSETS.find((a) => a.symbol.toLowerCase() === symbol.toLowerCase());
}

export function fmtUsd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

export function fmtPct(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

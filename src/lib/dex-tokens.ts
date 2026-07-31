/* Tradeable token registry per supported chain (live DEX routing). */

export const NATIVE_SENTINEL = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

export type DexToken = {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
};

export const DEX_TOKENS: Record<number, DexToken[]> = {
  1: [
    { symbol: "ETH", name: "Ethereum", address: NATIVE_SENTINEL, decimals: 18 },
    { symbol: "USDC", name: "USD Coin", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
    { symbol: "USDT", name: "Tether", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
    { symbol: "WBTC", name: "Wrapped Bitcoin", address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8 },
    { symbol: "LINK", name: "Chainlink", address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", decimals: 18 },
  ],
  8453: [
    { symbol: "ETH", name: "Ethereum", address: NATIVE_SENTINEL, decimals: 18 },
    { symbol: "USDC", name: "USD Coin", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
    { symbol: "DAI", name: "Dai", address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", decimals: 18 },
  ],
  42161: [
    { symbol: "ETH", name: "Ethereum", address: NATIVE_SENTINEL, decimals: 18 },
    { symbol: "USDC", name: "USD Coin", address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
    { symbol: "ARB", name: "Arbitrum", address: "0x912CE59144191C1204E64559FE8253a0e49E6548", decimals: 18 },
  ],
  10: [
    { symbol: "ETH", name: "Ethereum", address: NATIVE_SENTINEL, decimals: 18 },
    { symbol: "USDC", name: "USD Coin", address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", decimals: 6 },
    { symbol: "OP", name: "Optimism", address: "0x4200000000000000000000000000000000000042", decimals: 18 },
  ],
  137: [
    { symbol: "POL", name: "Polygon", address: NATIVE_SENTINEL, decimals: 18 },
    { symbol: "USDC", name: "USD Coin", address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6 },
    { symbol: "WETH", name: "Wrapped Ether", address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", decimals: 18 },
  ],
};

export function tokensFor(chainId: number): DexToken[] {
  return DEX_TOKENS[chainId] ?? [];
}

export function findToken(chainId: number, symbol: string): DexToken | undefined {
  return tokensFor(chainId).find((t) => t.symbol === symbol);
}

/** Decimal string -> base-unit integer string, without floating point drift. */
export function toBaseUnits(amount: string, decimals: number): string {
  const trimmed = (amount || "0").trim();
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === "" || trimmed === ".") return "0";
  const [whole = "0", frac = ""] = trimmed.split(".");
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const joined = `${whole}${padded}`.replace(/^0+(?=\d)/, "");
  return joined === "" ? "0" : joined;
}

/** Base-unit integer string -> human decimal string. */
export function fromBaseUnits(base: string, decimals: number, maxFrac = 6): string {
  const s = (base || "0").padStart(decimals + 1, "0");
  const whole = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals).slice(0, maxFrac).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

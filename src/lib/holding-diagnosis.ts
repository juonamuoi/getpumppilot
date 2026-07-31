// Explains, in plain English, why a wallet holding is (or is not) priced.
import { LIVE_SYMBOLS } from "@/lib/market-data";
import { isSpamLikely, type HoldingLike } from "@/lib/holding-filters";

export type PriceStatusCode =
  | "live"
  | "usd-peg"
  | "fetch-failed"
  | "stale"
  | "spam-likely"
  | "no-feed-coverage";

export type PriceDiagnosis = {
  code: PriceStatusCode;
  /** Short badge-level label. */
  label: string;
  /** One-sentence explanation of the exact cause. */
  reason: string;
  /** What the user can do about it. */
  fixes: string[];
  /** Whether the holding counts toward wallet totals right now. */
  counted: boolean;
  tone: "ok" | "warn" | "error";
};

export function diagnoseHolding(h: HoldingLike & { livePriced?: boolean; usdPeg?: number }): PriceDiagnosis {
  const covered = (LIVE_SYMBOLS as readonly string[]).includes(h.symbol);

  if (h.failed) {
    return {
      code: "fetch-failed",
      label: "price unavailable",
      reason:
        `${h.symbol} is covered by the live CoinGecko feed, but the last price request ` +
        `failed (network error, rate limit, or the provider omitted this symbol).`,
      fixes: [
        "Press “Refresh prices” to retry the feed.",
        "Check your connection or wait ~60s if CoinGecko rate-limited the request.",
      ],
      counted: false,
      tone: "error",
    };
  }

  if (h.stale) {
    return {
      code: "stale",
      label: "stale price",
      reason:
        "The last successful price is older than your freshness threshold, so it is excluded " +
        "from totals to avoid pricing your wallet off outdated data.",
      fixes: [
        "Press “Refresh prices” to fetch a new quote.",
        "Raise the staleness threshold if you accept slightly older prices.",
      ],
      counted: false,
      tone: "warn",
    };
  }

  if (h.usdPeg != null) {
    return {
      code: "usd-peg",
      label: "USD peg",
      reason:
        "This is a pre-configured stablecoin contract, valued at a fixed $1.00 rather than " +
        "queried from the price feed.",
      fixes: [],
      counted: true,
      tone: "ok",
    };
  }

  if (h.livePriced || h.price != null) {
    return {
      code: "live",
      label: "live price",
      reason: `${h.symbol} is in the tracked CoinGecko set and returned a fresh quote.`,
      fixes: [],
      counted: true,
      tone: "ok",
    };
  }

  if (isSpamLikely(h)) {
    return {
      code: "spam-likely",
      label: "no live price · spam-likely",
      reason:
        "This token was auto-detected from transfer logs and its symbol/name matches common " +
        "drainer-lure patterns (URLs, “claim/reward” wording, odd characters). It has no live " +
        "market feed, and PumpPilot will never price it.",
      fixes: [
        "Do not visit any URL contained in the token name.",
        "Never approve or interact with this contract — that is how drainers steal funds.",
        "Verify the contract on a block explorer before trusting it.",
      ],
      counted: false,
      tone: "error",
    };
  }

  return {
    code: "no-feed-coverage",
    label: "no live price",
    reason: covered
      ? `${h.symbol} is tracked but no quote has been fetched yet.`
      : `${h.symbol} is not part of the live price set PumpPilot tracks ` +
        `(${(LIVE_SYMBOLS as readonly string[]).join(", ")}), and it has no stablecoin peg, ` +
        `so there is no trustworthy USD value to display.`,
    fixes: [
      "It stays visible for transparency but is excluded from wallet value, 24h change and allocation.",
      "Verify the contract address on a block explorer before trusting the balance.",
    ],
    counted: false,
    tone: "warn",
  };
}

const EXPLORERS: Record<number, { name: string; url: string }> = {
  1: { name: "Etherscan", url: "https://etherscan.io" },
  10: { name: "Optimistic Etherscan", url: "https://optimistic.etherscan.io" },
  56: { name: "BscScan", url: "https://bscscan.com" },
  137: { name: "PolygonScan", url: "https://polygonscan.com" },
  8453: { name: "BaseScan", url: "https://basescan.org" },
  42161: { name: "Arbiscan", url: "https://arbiscan.io" },
  43114: { name: "SnowTrace", url: "https://snowtrace.io" },
};

export function explorerLink(
  chainId: number | undefined,
  address: string | undefined,
): { name: string; href: string } | null {
  if (!chainId || !address) return null;
  const e = EXPLORERS[chainId];
  if (!e) return null;
  return { name: e.name, href: `${e.url}/token/${address}` };
}

/** Splits an amount into whole/fractional units for the balance breakdown. */
export function balanceBreakdown(amount: number, decimals: number | undefined) {
  const dec = decimals ?? 18;
  const whole = Math.floor(amount);
  const fraction = amount - whole;
  let baseUnits: string;
  try {
    baseUnits = BigInt(Math.round(amount * 10 ** Math.min(dec, 15)))
      .toString()
      .concat(dec > 15 ? "0".repeat(dec - 15) : "");
  } catch {
    baseUnits = "—";
  }
  return { decimals: dec, whole, fraction, baseUnits };
}

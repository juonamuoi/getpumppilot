// Explainable spam scoring for auto-detected ERC-20s.
// Every badge must be traceable to concrete, human-readable signals.
import type { TokenActivity } from "@/lib/wallet-balances";
import type { SpamListState } from "@/lib/spam-lists";
import { listVerdict } from "@/lib/spam-lists";

export type SpamSignal = {
  id: string;
  label: string;
  detail: string;
  /** Points added to the spam score. */
  weight: number;
};

export type SpamVerdict = {
  /** Final decision after allowlist/blocklist overrides. */
  spam: boolean;
  source: "allowlist" | "blocklist" | "heuristic";
  score: number;
  threshold: number;
  signals: SpamSignal[];
  /** True when the heuristic alone would have flagged it. */
  heuristicSpam: boolean;
};

export type SpamInput = {
  symbol: string;
  name: string;
  kind: string;
  address?: string;
  discovered?: boolean;
  amount: number;
  price: number | null;
  priced: boolean;
  decimals?: number;
  activity?: TokenActivity;
};

const LURE_WORDS = [
  "http",
  "www.",
  ".com",
  ".io",
  ".xyz",
  ".org",
  ".net",
  "visit",
  "claim",
  "reward",
  "airdrop",
  "voucher",
  "giveaway",
  "bonus",
  "free",
  "$ ",
];

/** Decimals used by the overwhelming majority of legitimate ERC-20s. */
const COMMON_DECIMALS = [6, 8, 9, 18];

export const SPAM_THRESHOLD = 3;

/** Blocks per day, roughly, used to normalise transfer frequency. */
const BLOCKS_PER_DAY = 7200;

export function spamSignals(h: SpamInput): SpamSignal[] {
  const signals: SpamSignal[] = [];
  const text = `${h.symbol} ${h.name}`.toLowerCase();

  const hits = LURE_WORDS.filter((w) => text.includes(w));
  if (hits.length > 0) {
    signals.push({
      id: "lure-words",
      label: "Lure wording in name",
      detail: `Contains ${hits.map((w) => `“${w.trim()}”`).join(", ")} — typical of drainer airdrops that push you to a website.`,
      weight: 3,
    });
  }

  if (/[^\x20-\x7E]/.test(h.symbol)) {
    signals.push({
      id: "non-ascii",
      label: "Non-ASCII characters in ticker",
      detail: "Emoji or lookalike Unicode in the symbol is used to imitate real tickers.",
      weight: 3,
    });
  }

  if (h.symbol.length > 12) {
    signals.push({
      id: "long-symbol",
      label: `Unusually long ticker (${h.symbol.length} chars)`,
      detail: "Real tickers are typically 2–6 characters; long ones usually carry a message.",
      weight: 2,
    });
  }

  if (h.decimals != null && !COMMON_DECIMALS.includes(h.decimals)) {
    signals.push({
      id: "unusual-decimals",
      label: `Unusual decimals (${h.decimals})`,
      detail: `Legitimate tokens almost always use ${COMMON_DECIMALS.join(", ")} decimals. Odd values inflate the displayed balance.`,
      weight: 2,
    });
  }

  if (!h.priced && h.price == null) {
    signals.push({
      id: "no-market",
      label: "No live market price",
      detail: "No tracked market feed covers this contract, so it has no verifiable value.",
      weight: 1,
    });
  }

  const a = h.activity;
  if (a) {
    if (a.incoming > 0 && a.outgoing === 0) {
      signals.push({
        id: "inbound-only",
        label: `Inbound only (${a.incoming} received, 0 sent)`,
        detail: "You never sent this token — the classic unsolicited airdrop pattern.",
        weight: 2,
      });
    }
    const days = Math.max(1, a.scannedBlocks / BLOCKS_PER_DAY);
    const perDay = a.transfers / days;
    if (perDay >= 3) {
      signals.push({
        id: "high-frequency",
        label: `High transfer frequency (~${perDay.toFixed(1)}/day)`,
        detail: `${a.transfers} transfers across ~${Math.round(days)} days of scanned blocks — spam contracts drip repeatedly into wallets.`,
        weight: 2,
      });
    }
    if (a.transfers === 1 && a.incoming === 1) {
      signals.push({
        id: "single-drop",
        label: "Single unsolicited drop",
        detail: "Exactly one incoming transfer and no other activity in the scanned window.",
        weight: 1,
      });
    }
  }

  if (h.amount >= 1_000_000_000) {
    signals.push({
      id: "absurd-balance",
      label: "Absurdly large balance",
      detail: `Balance of ${h.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} units — spam tokens mint huge amounts to look valuable.`,
      weight: 2,
    });
  }

  return signals;
}

/**
 * Heuristic + user lists. Only auto-detected, unpriced ERC-20s are ever scored;
 * pre-configured or priced tokens are trusted, unless the user blocklists them.
 */
export function evaluateSpam(h: SpamInput, lists?: SpamListState): SpamVerdict {
  const listed = listVerdict(lists, h.address, h.symbol);
  const eligible = Boolean(h.discovered) && h.kind === "erc20" && !h.priced && h.price == null;
  const signals = eligible ? spamSignals(h) : [];
  const score = signals.reduce((s, x) => s + x.weight, 0);
  const heuristicSpam = eligible && score >= SPAM_THRESHOLD;

  if (listed === "allow") {
    return { spam: false, source: "allowlist", score, threshold: SPAM_THRESHOLD, signals, heuristicSpam };
  }
  if (listed === "block") {
    return { spam: true, source: "blocklist", score, threshold: SPAM_THRESHOLD, signals, heuristicSpam };
  }
  return { spam: heuristicSpam, source: "heuristic", score, threshold: SPAM_THRESHOLD, signals, heuristicSpam };
}

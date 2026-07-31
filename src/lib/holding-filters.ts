// Search / filter / sort helpers for the live wallet holdings list.
import { evaluateSpam, type SpamInput } from "@/lib/spam-signals";
import type { SpamListState } from "@/lib/spam-lists";

export type HoldingLike = {
  symbol: string;
  name: string;
  kind: "native" | "erc20" | string;
  address?: string;
  discovered?: boolean;
  amount: number;
  price: number | null;
  value: number | null;
  change24h: number | null;
  priced: boolean;
  failed: boolean;
  stale: boolean;
  decimals?: number;
  activity?: import("@/lib/wallet-balances").TokenActivity;
};

/**
 * Heuristic only — never authoritative. Delegates to the explainable signal
 * engine so every badge can be traced to concrete reasons, and honours the
 * user's allowlist / blocklist.
 */
export function isSpamLikely(h: HoldingLike, lists?: SpamListState): boolean {
  return evaluateSpam(h as SpamInput, lists).spam;
}

export type HoldingFilter = "all" | "priced" | "unpriced" | "detected" | "issues";
export type HoldingSort =
  | "value-desc"
  | "value-asc"
  | "change-desc"
  | "change-asc"
  | "amount-desc"
  | "symbol-asc";

export const FILTER_LABELS: Record<HoldingFilter, string> = {
  all: "All",
  priced: "Priced",
  unpriced: "Unpriced",
  detected: "Auto-detected",
  issues: "Stale / failed",
};

export const SORT_LABELS: Record<HoldingSort, string> = {
  "value-desc": "Value (high → low)",
  "value-asc": "Value (low → high)",
  "change-desc": "24h change (high → low)",
  "change-asc": "24h change (low → high)",
  "amount-desc": "Amount (high → low)",
  "symbol-asc": "Symbol (A → Z)",
};

function matchesFilter(h: HoldingLike, f: HoldingFilter): boolean {
  switch (f) {
    case "priced":
      return h.price != null && !h.failed;
    case "unpriced":
      return h.price == null;
    case "detected":
      return Boolean(h.discovered);
    case "issues":
      return h.failed || h.stale;
    default:
      return true;
  }
}

function matchesQuery(h: HoldingLike, q: string): boolean {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  return (
    h.symbol.toLowerCase().includes(needle) ||
    h.name.toLowerCase().includes(needle) ||
    (h.address ?? "").toLowerCase().includes(needle)
  );
}

export function applyHoldingControls<T extends HoldingLike>(
  rows: T[],
  opts: {
    query: string;
    filter: HoldingFilter;
    sort: HoldingSort;
    hideSpam: boolean;
    pricedFirst: boolean;
    lists?: SpamListState;
  },
): T[] {
  const out = rows.filter(
    (r) =>
      matchesQuery(r, opts.query) &&
      matchesFilter(r, opts.filter) &&
      (!opts.hideSpam || !isSpamLikely(r, opts.lists)),
  );

  const cmp = (a: T, b: T): number => {
    switch (opts.sort) {
      case "value-asc":
        return (a.value ?? 0) - (b.value ?? 0);
      case "change-desc":
        return (b.change24h ?? -Infinity) - (a.change24h ?? -Infinity);
      case "change-asc":
        return (a.change24h ?? Infinity) - (b.change24h ?? Infinity);
      case "amount-desc":
        return b.amount - a.amount;
      case "symbol-asc":
        return a.symbol.localeCompare(b.symbol);
      default:
        return (b.value ?? 0) - (a.value ?? 0);
    }
  };

  return out.sort((a, b) => {
    if (opts.pricedFirst) {
      const ap = a.price != null && !a.failed ? 0 : 1;
      const bp = b.price != null && !b.failed ? 0 : 1;
      if (ap !== bp) return ap - bp;
    }
    return cmp(a, b);
  });
}

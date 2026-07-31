/**
 * Persistent cache for ERC-20 discovery log scans.
 *
 * Read-only data only: which token contracts a wallet has transferred with,
 * plus how far back/forward we have already scanned. Caching lets the portfolio
 * skip re-scanning the whole history window on every load and only fetch the
 * new blocks since the last scan.
 */

export type CachedActivity = {
  transfers: number;
  incoming: number;
  outgoing: number;
  firstBlock: number;
  lastBlock: number;
  scannedBlocks: number;
};

export type LogScanCache = {
  /** Lowest block covered by the cached scan. */
  fromBlock: number;
  /** Highest block covered by the cached scan. */
  toBlock: number;
  /** Contract address (lowercase) -> activity. */
  tokens: Record<string, CachedActivity>;
  updatedAt: number;
};

const PREFIX = "pumppilot.logscan.v1";
/** Cache entries older than this are ignored (activity counts drift). */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function key(chainId: number, address: string): string {
  return `${PREFIX}:${chainId}:${address.toLowerCase()}`;
}

export function loadLogScanCache(
  chainId: number,
  address: string,
): LogScanCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key(chainId, address));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LogScanCache;
    if (
      !parsed ||
      typeof parsed.toBlock !== "number" ||
      typeof parsed.fromBlock !== "number" ||
      !parsed.tokens
    ) {
      return null;
    }
    if (Date.now() - (parsed.updatedAt ?? 0) > MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveLogScanCache(
  chainId: number,
  address: string,
  cache: LogScanCache,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      key(chainId, address),
      JSON.stringify({ ...cache, updatedAt: Date.now() }),
    );
  } catch {
    // Quota or private mode — caching is best-effort.
  }
}

export function clearLogScanCache(chainId: number, address: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key(chainId, address));
  } catch {
    /* ignore */
  }
}

/** Merges freshly scanned activity into cached activity. */
export function mergeActivity(
  base: Record<string, CachedActivity>,
  next: Record<string, CachedActivity>,
): Record<string, CachedActivity> {
  const out: Record<string, CachedActivity> = { ...base };
  for (const [addr, a] of Object.entries(next)) {
    const prev = out[addr];
    out[addr] = prev
      ? {
          transfers: prev.transfers + a.transfers,
          incoming: prev.incoming + a.incoming,
          outgoing: prev.outgoing + a.outgoing,
          firstBlock: Math.min(prev.firstBlock, a.firstBlock),
          lastBlock: Math.max(prev.lastBlock, a.lastBlock),
          scannedBlocks: Math.max(prev.scannedBlocks, a.scannedBlocks),
        }
      : { ...a };
  }
  return out;
}

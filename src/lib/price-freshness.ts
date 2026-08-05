// Configurable "stale price" threshold for the live wallet portfolio.
// When a holding's live price is older than this, it is flagged and excluded
// from wallet totals, 24h change and allocation until the feed refreshes.
import { useCallback, useSyncExternalStore } from "react";

const KEY = "pp.price-staleness-threshold-ms";
export const DEFAULT_STALE_MS = 5 * 60_000;

export const STALE_OPTIONS: { label: string; ms: number }[] = [
  { label: "1 minute", ms: 60_000 },
  { label: "2 minutes", ms: 2 * 60_000 },
  { label: "5 minutes", ms: 5 * 60_000 },
  { label: "15 minutes", ms: 15 * 60_000 },
  { label: "30 minutes", ms: 30 * 60_000 },
  { label: "1 hour", ms: 60 * 60_000 },
];

const listeners = new Set<() => void>();

function read(): number {
  if (typeof window === "undefined") return DEFAULT_STALE_MS;
  const raw = Number(window.localStorage.getItem(KEY));
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_STALE_MS;
}

export function setStaleThresholdMs(ms: number) {
  if (typeof window !== "undefined") window.localStorage.setItem(KEY, String(ms));
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useStaleThresholdMs(): [number, (ms: number) => void] {
  const value = useStableSyncExternalStore(
    subscribe,
    read,
    () => DEFAULT_STALE_MS,
    "price-freshness",
  );
  const set = useCallback((ms: number) => setStaleThresholdMs(ms), []);
  return [value, set];
}

/** True when a live-feed price fetched at `updatedAt` is older than the threshold. */
export function isStale(updatedAt: number | undefined, thresholdMs: number, now = Date.now()) {
  if (!updatedAt) return true;
  return now - updatedAt > thresholdMs;
}

export function describeAge(updatedAt: number | undefined, now = Date.now()): string {
  if (!updatedAt) return "never fetched";
  const mins = Math.round((now - updatedAt) / 60_000);
  if (mins < 1) return "under a minute old";
  return `${mins} minute${mins === 1 ? "" : "s"} old`;
}

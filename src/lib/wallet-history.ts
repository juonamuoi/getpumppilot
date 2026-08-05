// Local history of connected-wallet total value, used for the performance chart.
// Snapshots are stored per address in localStorage — read-only, no execution.
import { useStableSyncExternalStore } from "@/lib/snapshot-invariant";

export type ValueSnapshot = { ts: number; value: number };

const KEY = "pp-wallet-value-history-v1";
const MAX_PER_ADDRESS = 2000;
/** Minimum gap between stored snapshots (15 minutes). */
const MIN_GAP_MS = 15 * 60_000;

type Store = Record<string, ValueSnapshot[]>;

let store: Store = {};
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    store = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Store;
  } catch {
    store = {};
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* quota — keep in memory */
  }
}

function key(address: string) {
  return address.toLowerCase();
}

export function getHistory(address: string | null | undefined): ValueSnapshot[] {
  load();
  if (!address) return [];
  return store[key(address)] ?? [];
}

/** Record a snapshot if enough time has passed since the last one. */
export function recordValue(address: string, value: number) {
  load();
  if (!Number.isFinite(value)) return;
  const k = key(address);
  const list = store[k] ?? [];
  const last = list[list.length - 1];
  const now = Date.now();
  if (last && now - last.ts < MIN_GAP_MS) {
    // Keep the latest value for the current bucket instead of appending.
    if (Math.abs(last.value - value) < 1e-9) return;
    store[k] = [...list.slice(0, -1), { ts: now, value }];
  } else {
    store[k] = [...list, { ts: now, value }].slice(-MAX_PER_ADDRESS);
  }
  persist();
  emit();
}

export function clearHistory(address: string) {
  load();
  delete store[key(address)];
  persist();
  emit();
}

function subscribe(cb: () => void) {
  load();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const EMPTY: ValueSnapshot[] = [];

export function useValueHistory(address: string | null | undefined): ValueSnapshot[] {
  return useStableSyncExternalStore(
    subscribe,
    () => getHistory(address),
    () => EMPTY,
    "wallet-history",
  );
}

export type Bucketing = "daily" | "weekly";

function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfWeek(ts: number) {
  const d = new Date(startOfDay(ts));
  const dow = (d.getDay() + 6) % 7; // Monday start
  d.setDate(d.getDate() - dow);
  return d.getTime();
}

export type SeriesPoint = {
  bucket: number;
  label: string;
  value: number;
  changePct: number | null;
};

/** Collapse raw snapshots into daily or weekly closing values. */
export function bucketHistory(
  snapshots: ValueSnapshot[],
  mode: Bucketing,
): SeriesPoint[] {
  const bucketOf = mode === "weekly" ? startOfWeek : startOfDay;
  const byBucket = new Map<number, ValueSnapshot>();
  for (const s of snapshots) {
    const b = bucketOf(s.ts);
    const prev = byBucket.get(b);
    if (!prev || s.ts >= prev.ts) byBucket.set(b, s);
  }
  const buckets = [...byBucket.entries()].sort((a, b) => a[0] - b[0]);
  let first: number | null = null;
  return buckets.map(([bucket, snap]) => {
    if (first == null) first = snap.value;
    return {
      bucket,
      label: new Date(bucket).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      value: snap.value,
      changePct: first && first > 0 ? ((snap.value - first) / first) * 100 : null,
    };
  });
}

export function seriesStats(points: SeriesPoint[]) {
  if (points.length === 0) return null;
  const firstV = points[0].value;
  const lastV = points[points.length - 1].value;
  const values = points.map((p) => p.value);
  return {
    first: firstV,
    last: lastV,
    change: lastV - firstV,
    changePct: firstV > 0 ? ((lastV - firstV) / firstV) * 100 : 0,
    high: Math.max(...values),
    low: Math.min(...values),
    points: points.length,
  };
}

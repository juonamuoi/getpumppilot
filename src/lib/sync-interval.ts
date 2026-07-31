/**
 * Shared auto-refresh cadence for the live wallet portfolio.
 *
 * Read-only: this only controls how often balances/prices are re-fetched.
 * "off" disables background polling entirely (manual Refresh still works).
 */

import { useCallback, useEffect, useState } from "react";

export const SYNC_INTERVAL_OPTIONS = [
  { value: "off", label: "Off (manual only)", ms: 0 },
  { value: "30s", label: "Every 30 seconds", ms: 30_000 },
  { value: "1m", label: "Every minute", ms: 60_000 },
  { value: "5m", label: "Every 5 minutes", ms: 300_000 },
  { value: "15m", label: "Every 15 minutes", ms: 900_000 },
] as const;

export type SyncIntervalValue = (typeof SYNC_INTERVAL_OPTIONS)[number]["value"];

const KEY = "pumppilot.wallet.syncInterval";
const DEFAULT: SyncIntervalValue = "1m";
const EVENT = "pumppilot:sync-interval";

export function intervalMs(value: SyncIntervalValue): number {
  return SYNC_INTERVAL_OPTIONS.find((o) => o.value === value)?.ms ?? 0;
}

function read(): SyncIntervalValue {
  if (typeof window === "undefined") return DEFAULT;
  const raw = window.localStorage.getItem(KEY) as SyncIntervalValue | null;
  return SYNC_INTERVAL_OPTIONS.some((o) => o.value === raw)
    ? (raw as SyncIntervalValue)
    : DEFAULT;
}

/** Persisted auto-refresh interval, shared across components. */
export function useSyncInterval() {
  const [value, setValue] = useState<SyncIntervalValue>(DEFAULT);

  useEffect(() => {
    setValue(read());
    const onChange = () => setValue(read());
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const update = useCallback((next: SyncIntervalValue) => {
    setValue(next);
    try {
      window.localStorage.setItem(KEY, next);
      window.dispatchEvent(new Event(EVENT));
    } catch {
      /* storage may be unavailable */
    }
  }, []);

  return { value, setValue: update, ms: intervalMs(value) };
}

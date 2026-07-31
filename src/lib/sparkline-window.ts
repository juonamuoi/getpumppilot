/**
 * Shared sparkline horizon for the live wallet portfolio.
 *
 * The CoinGecko feed returns 7 days of HOURLY closes, so every window is a
 * slice of that same series. Hourly granularity means the "1h" window is a
 * short 2-point view — it is honest about the feed, not interpolated.
 */

import { useCallback, useEffect, useState } from "react";

export const SPARK_WINDOW_OPTIONS = [
  { value: "1h", label: "1h", points: 2, intervalMs: 3_600_000 },
  { value: "24h", label: "24h", points: 24, intervalMs: 3_600_000 },
  { value: "7d", label: "7d", points: 168, intervalMs: 3_600_000 },
] as const;

export type SparkWindowValue = (typeof SPARK_WINDOW_OPTIONS)[number]["value"];

const KEY = "pumppilot.wallet.sparkWindow";
const DEFAULT: SparkWindowValue = "24h";
const EVENT = "pumppilot:spark-window";

export function windowConfig(value: SparkWindowValue) {
  return SPARK_WINDOW_OPTIONS.find((o) => o.value === value) ?? SPARK_WINDOW_OPTIONS[1];
}

/** Slice a full hourly series down to the selected window. */
export function sliceSparkline(full: number[], value: SparkWindowValue): number[] {
  if (!full || full.length === 0) return [];
  const { points } = windowConfig(value);
  return full.length > points ? full.slice(-points) : full;
}

function read(): SparkWindowValue {
  if (typeof window === "undefined") return DEFAULT;
  const raw = window.localStorage.getItem(KEY) as SparkWindowValue | null;
  return SPARK_WINDOW_OPTIONS.some((o) => o.value === raw)
    ? (raw as SparkWindowValue)
    : DEFAULT;
}

/** Persisted sparkline window, shared across components. */
export function useSparkWindow() {
  const [value, setValue] = useState<SparkWindowValue>(DEFAULT);

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

  const update = useCallback((next: SparkWindowValue) => {
    setValue(next);
    try {
      window.localStorage.setItem(KEY, next);
      window.dispatchEvent(new Event(EVENT));
    } catch {
      /* storage may be unavailable */
    }
  }, []);

  return { value, setValue: update, config: windowConfig(value) };
}

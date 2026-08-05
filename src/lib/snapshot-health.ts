// Consistency checks for the live market snapshot that powers the dashboard.
// A snapshot can arrive "successfully" and still be unusable (empty payload,
// NaN prices, every asset falling back to demo data, or a stale timestamp).
// Treating those as failures is what stops the dashboard rendering blank.

import type { LiveAsset } from "@/lib/live-assets";

export type SnapshotStatus = "loading" | "ok" | "error" | "inconsistent";

export type SnapshotHealth = {
  status: SnapshotStatus;
  /** Human-readable reason, present for error/inconsistent. */
  reason?: string;
};

/** A snapshot older than this is treated as stale and re-fetched. */
export const SNAPSHOT_MAX_AGE_MS = 5 * 60_000;

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

export function checkSnapshot(input: {
  assets: LiveAsset[];
  liveCount: number;
  isLoading: boolean;
  isError: boolean;
  updatedAt: number;
  now?: number;
}): SnapshotHealth {
  const { assets, liveCount, isLoading, isError, updatedAt } = input;
  const now = input.now ?? Date.now();

  if (isError) return { status: "error", reason: "Market snapshot request failed." };
  if (isLoading && assets.length === 0) return { status: "loading" };

  if (assets.length === 0) {
    return { status: "inconsistent", reason: "Snapshot returned no assets." };
  }

  const broken = assets.filter(
    (a) =>
      !isFiniteNumber(a.price) ||
      a.price <= 0 ||
      !isFiniteNumber(a.change24h) ||
      !isFiniteNumber(a.momentum?.total),
  );
  if (broken.length > 0) {
    return {
      status: "inconsistent",
      reason: `${broken.length} asset${broken.length === 1 ? "" : "s"} returned invalid price or momentum values.`,
    };
  }

  if (liveCount === 0) {
    return { status: "inconsistent", reason: "No live prices merged into the snapshot." };
  }

  if (updatedAt > 0 && now - updatedAt > SNAPSHOT_MAX_AGE_MS) {
    const mins = Math.round((now - updatedAt) / 60_000);
    return { status: "inconsistent", reason: `Snapshot is ${mins} minute${mins === 1 ? "" : "s"} old.` };
  }

  return { status: "ok" };
}

/** Exponential backoff with a ceiling, used between automatic retries. */
export function retryDelayMs(attempt: number): number {
  return Math.min(30_000, 3_000 * 2 ** Math.max(0, attempt));
}

export const MAX_AUTO_RETRIES = 4;

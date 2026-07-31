/* ------------------------------------------------------------------ *
 * Audit trail trend buckets
 *
 * The summary panel above the audit trail gives totals; these buckets give
 * shape — when alerts fired vs when channels were muted, and how quickly
 * entries moved from pending to resolved across the filtered window.
 *
 * Bucketing rules:
 *  - the bucket size follows the selected range (hours for 24h, days for
 *    7d/30d, weeks for 90d) so a chart never renders hundreds of slivers
 *  - for a fixed range the axis spans the whole window, including empty
 *    buckets, so a quiet stretch reads as quiet rather than as missing data
 *  - for "All time" the axis spans oldest → newest entry instead
 * ------------------------------------------------------------------ */

import type { TuningLogEntry } from "@/lib/paper-store";
import { RANGE_MS, type RangeFilter } from "@/lib/audit-filters";

export type AuditBucket = {
  /** Bucket start, epoch ms. */
  ts: number;
  /** Short axis label, e.g. "14:00" or "Jul 3". */
  label: string;
  /** Full label used by tooltips and screen readers. */
  fullLabel: string;
  /** Entries whose outcome delivered at least one alert. */
  fired: number;
  /** Entries whose matches were suppressed by muted channels. */
  muted: number;
  /** Entries that matched nothing — neither fired nor muted. */
  noMatches: number;
  /** Entries that have an outcome recorded (fired + muted + noMatches). */
  resolved: number;
  /** Entries still awaiting an outcome. */
  pending: number;
  /** All entries in the bucket. */
  total: number;
};

export type BucketUnit = "hour" | "day" | "week";

const HOUR = 3_600_000;
const DAY = 86_400_000;
const WEEK = 7 * DAY;

const UNIT_MS: Record<BucketUnit, number> = { hour: HOUR, day: DAY, week: WEEK };

/** Bucket granularity for a range: enough resolution to read, few enough to plot. */
export function bucketUnitFor(range: RangeFilter, spanMs: number): BucketUnit {
  if (range === "1h" || range === "6h" || range === "24h") return "hour";
  if (range === "7d" || range === "30d") return "day";
  if (range === "90d") return "week";
  // "All time" adapts to how much history actually exists.
  if (spanMs <= 2 * DAY) return "hour";
  if (spanMs <= 60 * DAY) return "day";
  return "week";
}

/** Floor a timestamp to the start of its bucket, in local time. */
export function bucketStart(ts: number, unit: BucketUnit): number {
  const d = new Date(ts);
  d.setMinutes(0, 0, 0);
  if (unit === "hour") return d.getTime();
  d.setHours(0, 0, 0, 0);
  if (unit === "day") return d.getTime();
  // Weeks start on Monday so a bucket reads as a working week.
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d.getTime();
}

function labelFor(ts: number, unit: BucketUnit) {
  const d = new Date(ts);
  if (unit === "hour") {
    return {
      label: d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      fullLabel: d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
    };
  }
  const short = d.toLocaleDateString([], { month: "short", day: "numeric" });
  return {
    label: short,
    fullLabel: unit === "week" ? `Week of ${short}` : d.toLocaleDateString([], { dateStyle: "medium" }),
  };
}

/** Classify one entry the same way the summary tiles and outcome chips do. */
function classify(e: TuningLogEntry) {
  const status = e.outcome?.status;
  return {
    fired: status === "alerts-fired" ? 1 : 0,
    muted: status === "channels-muted" ? 1 : 0,
    noMatches: status === "no-matches" ? 1 : 0,
    resolved: e.outcome ? 1 : 0,
    pending: e.outcome ? 0 : 1,
  };
}

/**
 * Group already-filtered entries into evenly spaced time buckets.
 *
 * `entries` must be the visible (filtered) set — the charts are explicitly a
 * view of the current filter, not of the whole log.
 */
export function bucketAuditEntries(
  entries: TuningLogEntry[],
  range: RangeFilter,
  now: number = Date.now(),
): { buckets: AuditBucket[]; unit: BucketUnit } {
  const times = entries.map((e) => e.ts);
  const rangeMs = range === "all" ? undefined : RANGE_MS[range];

  const oldest = times.length ? Math.min(...times) : now;
  const newest = times.length ? Math.max(...times) : now;
  const span = rangeMs ?? Math.max(newest - oldest, HOUR);
  const unit = bucketUnitFor(range, span);
  const step = UNIT_MS[unit];

  const from = bucketStart(rangeMs ? now - rangeMs : oldest, unit);
  const to = bucketStart(rangeMs ? now : newest, unit);

  const empty = (ts: number): AuditBucket => ({
    ts,
    ...labelFor(ts, unit),
    fired: 0,
    muted: 0,
    noMatches: 0,
    resolved: 0,
    pending: 0,
    total: 0,
  });

  const buckets = new Map<number, AuditBucket>();
  // Weeks are not a fixed offset from an arbitrary start, so walk with a
  // bucketStart() call per step rather than assuming `from + n * step`.
  for (let ts = from, guard = 0; ts <= to && guard < 400; guard++) {
    buckets.set(ts, empty(ts));
    ts = bucketStart(ts + step + HOUR, unit);
  }

  for (const e of entries) {
    const key = bucketStart(e.ts, unit);
    const bucket = buckets.get(key) ?? empty(key);
    const c = classify(e);
    bucket.fired += c.fired;
    bucket.muted += c.muted;
    bucket.noMatches += c.noMatches;
    bucket.resolved += c.resolved;
    bucket.pending += c.pending;
    bucket.total += 1;
    buckets.set(key, bucket);
  }

  return { buckets: [...buckets.values()].sort((a, b) => a.ts - b.ts), unit };
}

export const BUCKET_UNIT_LABEL: Record<BucketUnit, string> = {
  hour: "per hour",
  day: "per day",
  week: "per week",
};

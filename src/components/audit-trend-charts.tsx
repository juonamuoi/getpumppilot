import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { TuningLogEntry } from "@/lib/paper-store";
import { RANGE_LABEL, type RangeFilter } from "@/lib/audit-filters";
import { BUCKET_UNIT_LABEL, bucketAuditEntries, type AuditBucket } from "@/lib/audit-trend";

/* ------------------------------------------------------------------ *
 * Audit trail mini-charts
 *
 * Two small, side-by-side trends over exactly the entries the filters
 * currently show:
 *
 *   1. Fired vs muted — did a mitigation actually reach a channel, or did a
 *      muted channel swallow the match?
 *   2. Pending vs resolved — is the backlog of outcome-less entries growing?
 *
 * Both share the same buckets, so a spike lines up horizontally between them.
 * ------------------------------------------------------------------ */

const COLOR = {
  fired: "oklch(0.75 0.17 155)",
  muted: "oklch(0.78 0.15 75)",
  resolved: "oklch(0.65 0.15 255)",
  pending: "oklch(0.62 0.02 260)",
} as const;

type SeriesKey = keyof typeof COLOR;

const SERIES_LABEL: Record<SeriesKey, string> = {
  fired: "Alerts fired",
  muted: "Channels muted",
  resolved: "Resolved",
  pending: "Pending",
};

function Legend({ keys, totals }: { keys: SeriesKey[]; totals: Record<string, number> }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {keys.map((k) => (
        <span key={k} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="h-2 w-2 rounded-[2px]" style={{ background: COLOR[k] }} aria-hidden />
          {SERIES_LABEL[k]}
          <span className="font-medium tabular-nums text-foreground">{totals[k] ?? 0}</span>
        </span>
      ))}
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  keys,
}: {
  active?: boolean;
  payload?: Array<{ payload: AuditBucket }>;
  keys: SeriesKey[];
}) {
  const bucket = active ? payload?.[0]?.payload : undefined;
  if (!bucket) return null;
  return (
    <div className="rounded-md border border-border/70 bg-popover/95 px-2 py-1.5 text-[11px] shadow-md">
      <p className="font-medium">{bucket.fullLabel}</p>
      {keys.map((k) => (
        <p key={k} className="flex items-center gap-1.5 text-muted-foreground">
          <span className="h-2 w-2 rounded-[2px]" style={{ background: COLOR[k] }} aria-hidden />
          {SERIES_LABEL[k]}
          <span className="ml-auto font-medium tabular-nums text-foreground">{bucket[k]}</span>
        </p>
      ))}
      <p className="mt-0.5 text-[10px] text-muted-foreground">
        {bucket.total} entr{bucket.total === 1 ? "y" : "ies"} total
      </p>
    </div>
  );
}

const axisProps = {
  stroke: "currentColor",
  tick: { fontSize: 9 },
  tickLine: false,
  axisLine: false,
  className: "text-muted-foreground",
} as const;

function MiniChart({
  title,
  hint,
  buckets,
  keys,
  variant,
}: {
  title: string;
  hint: string;
  buckets: AuditBucket[];
  keys: SeriesKey[];
  variant: "bar" | "area";
}) {
  const totals = useMemo(
    () =>
      Object.fromEntries(
        keys.map((k) => [k, buckets.reduce((sum, b) => sum + b[k], 0)]),
      ) as Record<string, number>,
    [buckets, keys],
  );

  // Only label a handful of ticks — these charts are ~110px tall.
  const interval = Math.max(0, Math.ceil(buckets.length / 6) - 1);
  const empty = buckets.every((b) => keys.every((k) => b[k] === 0));

  return (
    <div className="rounded-md border border-border/60 bg-card/40 p-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <p className="text-[11px] font-medium">{title}</p>
        <p className="text-[10px] text-muted-foreground">{hint}</p>
      </div>
      <div className="mt-1.5">
        <Legend keys={keys} totals={totals} />
      </div>
      <div className="mt-1.5 h-[110px]" role="img" aria-label={`${title}. ${keys
        .map((k) => `${SERIES_LABEL[k]}: ${totals[k] ?? 0}`)
        .join(", ")}.`}>
        {empty ? (
          <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
            Nothing recorded in this window.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {variant === "bar" ? (
              <BarChart data={buckets} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} vertical={false} />
                <XAxis dataKey="label" interval={interval} {...axisProps} />
                <YAxis allowDecimals={false} width={30} {...axisProps} />
                <Tooltip
                  cursor={{ fill: "currentColor", fillOpacity: 0.06 }}
                  content={<ChartTooltip keys={keys} />}
                />
                {keys.map((k) => (
                  <Bar key={k} dataKey={k} stackId="s" fill={COLOR[k]} radius={[2, 2, 0, 0]} maxBarSize={18} />
                ))}
              </BarChart>
            ) : (
              <AreaChart data={buckets} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} vertical={false} />
                <XAxis dataKey="label" interval={interval} {...axisProps} />
                <YAxis allowDecimals={false} width={30} {...axisProps} />
                <Tooltip content={<ChartTooltip keys={keys} />} />
                {keys.map((k) => (
                  <Area
                    key={k}
                    type="monotone"
                    dataKey={k}
                    stackId="s"
                    stroke={COLOR[k]}
                    fill={COLOR[k]}
                    fillOpacity={0.22}
                    strokeWidth={1.5}
                  />
                ))}
              </AreaChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

/** Fired-vs-muted and pending-vs-resolved trends for the filtered entries. */
export function AuditTrendCharts({
  entries,
  range,
}: {
  entries: TuningLogEntry[];
  range: RangeFilter;
}) {
  const { buckets, unit } = useMemo(() => bucketAuditEntries(entries, range), [entries, range]);
  const scope = `${RANGE_LABEL[range]} · ${BUCKET_UNIT_LABEL[unit]}`;

  return (
    <div
      aria-label="Audit trend charts for the current filter"
      className="mb-3 grid gap-2 md:grid-cols-2"
    >
      <MiniChart
        title="Alerts fired vs muted"
        hint={scope}
        buckets={buckets}
        keys={["fired", "muted"]}
        variant="bar"
      />
      <MiniChart
        title="Pending vs resolved"
        hint={scope}
        buckets={buckets}
        keys={["resolved", "pending"]}
        variant="area"
      />
    </div>
  );
}

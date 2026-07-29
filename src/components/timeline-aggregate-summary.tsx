import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ArrowDownRight, ArrowUpRight, Download, Minus, Sigma } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  buildAggregateCsv,
  buildAggregateJson,
  downloadAggregateExport,
  type AggregateScope,
} from "@/lib/aggregate-export";
import {
  aggregateTimeline,
  formatDuration,
  BUCKETS,
  RISK_NAME,
  type AggRiskPoint,
  type AggSignalPoint,
  type BucketKey,
} from "@/lib/timeline-aggregate";

function Stat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "good" | "bad";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-400"
      : tone === "bad"
        ? "text-destructive"
        : "text-foreground";
  return (
    <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 font-mono text-lg leading-tight ${toneClass}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

const signed = (n: number) => `${n >= 0 ? "+" : ""}${n}`;

/**
 * Aggregate roll-up of the currently filtered timeline: total signal delta and
 * risk-level transition counts, with a per-period breakdown over time.
 */
export function TimelineAggregateSummary({
  riskPoints,
  signalPoints,
  scope,
}: {
  riskPoints: AggRiskPoint[];
  signalPoints: AggSignalPoint[];
  /** Current wallet / token / range selection, recorded in the export. */
  scope?: AggregateScope;
}) {
  const [bucket, setBucket] = useState<BucketKey>("day");
  const agg = useMemo(
    () => aggregateTimeline(riskPoints, signalPoints, bucket),
    [riskPoints, signalPoints, bucket],
  );

  const bucketFmt = bucket === "hour" ? "d MMM HH:mm" : "d MMM yyyy";
  const maxBar = Math.max(
    1,
    ...agg.buckets.map((b) => Math.max(Math.abs(b.matchDelta), Math.abs(b.nearMissDelta))),
  );

  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-background/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <Sigma className="h-3.5 w-3.5 text-primary" />
          Aggregate summary
          <span className="text-[10px] font-normal text-muted-foreground">
            (current wallet / token / range selection · demo data)
          </span>
        </div>
        <div className="flex items-center gap-1">
          {BUCKETS.map((b) => (
            <Button
              key={b.key}
              size="sm"
              variant={bucket === b.key ? "secondary" : "ghost"}
              className="h-7 px-2 text-[11px]"
              onClick={() => setBucket(b.key)}
            >
              {b.label}
            </Button>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 px-2 text-[11px]"
                title="Export the aggregate summary for the current selection"
              >
                <Download className="h-3 w-3" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-xs"
                onSelect={() =>
                  downloadAggregateExport(buildAggregateCsv(agg, bucket, scope ?? {}), "csv")
                }
              >
                Summary CSV
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-xs"
                onSelect={() =>
                  downloadAggregateExport(buildAggregateJson(agg, bucket, scope ?? {}), "json")
                }
              >
                Summary JSON
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat
          label="Total match Δ"
          value={signed(agg.totalMatchDelta)}
          hint={`${agg.mitigations} mitigation${agg.mitigations === 1 ? "" : "s"}`}
          tone={agg.totalMatchDelta > 0 ? "good" : agg.totalMatchDelta < 0 ? "bad" : "neutral"}
        />
        <Stat
          label="Total near-miss Δ"
          value={signed(agg.totalNearMissDelta)}
          hint="Fragility proxy"
          tone={agg.totalNearMissDelta > 0 ? "bad" : agg.totalNearMissDelta < 0 ? "good" : "neutral"}
        />
        <Stat
          label="Net signal Δ"
          value={signed(agg.netSignalDelta)}
          hint="Matches − near-miss"
          tone={agg.netSignalDelta > 0 ? "good" : agg.netSignalDelta < 0 ? "bad" : "neutral"}
        />
        <Stat
          label="Escalations"
          value={String(agg.escalations)}
          hint="Risk level moved up"
          tone={agg.escalations > 0 ? "bad" : "neutral"}
        />
        <Stat
          label="De-escalations"
          value={String(agg.deEscalations)}
          hint="Risk level moved down"
          tone={agg.deEscalations > 0 ? "good" : "neutral"}
        />
        <Stat
          label="Time at high+"
          value={formatDuration(agg.timeAtOrAboveHighMs)}
          hint={`${agg.scans} scan${agg.scans === 1 ? "" : "s"}, ${agg.unchanged} flat`}
          tone={agg.timeAtOrAboveHighMs > 0 ? "bad" : "good"}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span>
          Risk path:{" "}
          <span className="text-foreground">
            {agg.startRisk === null ? "—" : RISK_NAME[agg.startRisk]}
          </span>{" "}
          →{" "}
          <span className="text-foreground">
            {agg.endRisk === null ? "—" : RISK_NAME[agg.endRisk]}
          </span>
        </span>
        {agg.peakRisk !== null && (
          <Badge variant="outline" className="text-[10px]">
            Peak {RISK_NAME[agg.peakRisk]}
          </Badge>
        )}
      </div>

      {/* Transition matrix */}
      {agg.transitions.length + agg.unchanged > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[380px] text-[11px]">
            <thead>
              <tr className="text-muted-foreground">
                <th className="py-1 text-left font-medium">From \ To</th>
                {[0, 1, 2, 3].map((c) => (
                  <th key={c} className="py-1 text-center font-medium">
                    {RISK_NAME[c]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2, 3].map((r) => (
                <tr key={r} className="border-t border-border/40">
                  <td className="py-1 text-muted-foreground">{RISK_NAME[r]}</td>
                  {[0, 1, 2, 3].map((c) => {
                    const n = agg.matrix[r][c];
                    const tone =
                      n === 0
                        ? "text-muted-foreground/40"
                        : c > r
                          ? "text-destructive"
                          : c < r
                            ? "text-emerald-400"
                            : "text-foreground";
                    return (
                      <td key={c} className={`py-1 text-center font-mono ${tone}`}>
                        {n}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Per-period breakdown */}
      {agg.buckets.length > 0 && (
        <div className="space-y-1">
          {agg.buckets.map((b) => (
            <div
              key={b.start}
              className="flex flex-wrap items-center gap-2 rounded-md border border-border/40 bg-muted/10 px-2 py-1.5 text-[11px]"
            >
              <span className="w-[110px] shrink-0 text-muted-foreground">
                {format(b.start, bucketFmt)}
              </span>
              <span className="flex items-center gap-1">
                <span
                  className="inline-block h-2 rounded-sm"
                  style={{
                    width: `${(Math.abs(b.matchDelta) / maxBar) * 48 + 2}px`,
                    background: "hsl(200 90% 60%)",
                  }}
                />
                <span className="font-mono">{signed(b.matchDelta)}</span>
              </span>
              <span className="flex items-center gap-1">
                <span
                  className="inline-block h-2 rounded-sm"
                  style={{
                    width: `${(Math.abs(b.nearMissDelta) / maxBar) * 48 + 2}px`,
                    background: "hsl(28 90% 58%)",
                  }}
                />
                <span className="font-mono">{signed(b.nearMissDelta)}</span>
              </span>
              <span className="inline-flex items-center gap-1 text-destructive">
                <ArrowUpRight className="h-3 w-3" />
                {b.escalations}
              </span>
              <span className="inline-flex items-center gap-1 text-emerald-400">
                <ArrowDownRight className="h-3 w-3" />
                {b.deEscalations}
              </span>
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Minus className="h-3 w-3" />
                {b.scans} scan{b.scans === 1 ? "" : "s"}
              </span>
              {b.peakRisk !== null && (
                <Badge variant="outline" className="text-[10px]">
                  Peak {RISK_NAME[b.peakRisk]}
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

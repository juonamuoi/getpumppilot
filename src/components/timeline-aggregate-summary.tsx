import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ArrowDownRight, ArrowUpRight, Download, GitCompare, Minus, Sigma } from "lucide-react";

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
  compare,
  delta,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "good" | "bad";
  /** Value for the comparison window (overlay mode). */
  compare?: string;
  /** Rendered change vs the comparison window (overlay + diff modes). */
  delta?: { text: string; tone: "neutral" | "good" | "bad" };
}) {
  const toneOf = (t: "neutral" | "good" | "bad") =>
    t === "good" ? "text-emerald-400" : t === "bad" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 font-mono text-lg leading-tight ${toneOf(tone)}`}>{value}</div>
      {compare !== undefined && (
        <div className="font-mono text-[11px] leading-tight text-muted-foreground">
          vs {compare}
        </div>
      )}
      {delta && (
        <div className={`font-mono text-[11px] leading-tight ${toneOf(delta.tone)}`}>
          Δ {delta.text}
        </div>
      )}
      {hint && <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

const signed = (n: number) => `${n >= 0 ? "+" : ""}${n}`;

type CompareKey = "off" | "prev" | "prev2" | "week" | "month" | "custom";

const COMPARE_OPTIONS: { key: CompareKey; label: string }[] = [
  { key: "off", label: "No comparison" },
  { key: "prev", label: "Previous period" },
  { key: "prev2", label: "2 periods back" },
  { key: "week", label: "Same period, 1 week earlier" },
  { key: "month", label: "Same period, 30 days earlier" },
  { key: "custom", label: "Custom window" },
];

const DAY = 24 * 3600_000;

/** `datetime-local` value <-> epoch ms helpers (local time). */
const toLocalInput = (ts: number) => {
  const d = new Date(ts - new Date(ts).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
};


/**
 * Aggregate roll-up of the currently filtered timeline: total signal delta and
 * risk-level transition counts, with a per-period breakdown over time.
 */
export function TimelineAggregateSummary({
  riskPoints,
  signalPoints,
  allRiskPoints,
  allSignalPoints,
  window: viewWindow,
  scope,
}: {
  riskPoints: AggRiskPoint[];
  signalPoints: AggSignalPoint[];
  /** Unfiltered-by-time points so a comparison window can reach further back. */
  allRiskPoints?: AggRiskPoint[];
  allSignalPoints?: AggSignalPoint[];
  /** The active time window of `riskPoints` / `signalPoints`. */
  window?: { from: number | null; to: number };
  /** Current wallet / token / range selection, recorded in the export. */
  scope?: AggregateScope;
}) {
  const [bucket, setBucket] = useState<BucketKey>("day");
  const agg = useMemo(
    () => aggregateTimeline(riskPoints, signalPoints, bucket),
    [riskPoints, signalPoints, bucket],
  );

  /* -------- Interactive heatmap drill-down -------- */
  const [selected, setSelected] = useState<{ from: number; to: number } | null>(null);
  const maxCell = useMemo(
    () => Math.max(0, ...agg.matrix.flatMap((row, r) => row.map((n, c) => (r === c ? 0 : n)))),
    [agg.matrix],
  );
  const drill = useMemo(() => {
    if (!selected) return [];
    return agg.transitions
      .filter((t) => t.from === selected.from && t.to === selected.to)
      .map((transition) => {
        const inWindow = signalPoints.filter(
          (s) => s.ts >= transition.prevTs && s.ts <= transition.ts,
        );
        return {
          transition,
          matched: inWindow.filter((s) => s.matchDelta !== 0),
          nearMiss: inWindow.filter((s) => s.matchDelta === 0 && s.nearMissDelta !== 0),
        };
      });
  }, [selected, agg.transitions, signalPoints]);



  /* ---------------- Comparison mode ---------------- */
  const canCompare = Boolean(allRiskPoints && allSignalPoints && viewWindow);
  const [compareKey, setCompareKey] = useState<CompareKey>("off");
  const [mode, setMode] = useState<"overlay" | "diff">("overlay");

  const baseWindow = useMemo(() => {
    const to = viewWindow?.to ?? Date.now();
    const earliest = Math.min(
      ...[...riskPoints, ...signalPoints].map((p) => p.ts),
      to,
    );
    return { from: viewWindow?.from ?? earliest, to };
  }, [viewWindow, riskPoints, signalPoints]);

  const [customFrom, setCustomFrom] = useState(() => toLocalInput(baseWindow.from - 7 * DAY));
  const [customTo, setCustomTo] = useState(() => toLocalInput(baseWindow.from));

  const compareWindow = useMemo(() => {
    const span = Math.max(1, baseWindow.to - baseWindow.from);
    switch (compareKey) {
      case "prev":
        return { from: baseWindow.from - span, to: baseWindow.from };
      case "prev2":
        return { from: baseWindow.from - 2 * span, to: baseWindow.from - span };
      case "week":
        return { from: baseWindow.from - 7 * DAY, to: baseWindow.to - 7 * DAY };
      case "month":
        return { from: baseWindow.from - 30 * DAY, to: baseWindow.to - 30 * DAY };
      case "custom": {
        const f = new Date(customFrom).getTime();
        const t = new Date(customTo).getTime();
        if (!Number.isFinite(f) || !Number.isFinite(t) || t <= f) return null;
        return { from: f, to: t };
      }
      default:
        return null;
    }
  }, [compareKey, baseWindow, customFrom, customTo]);

  const compareAgg = useMemo(() => {
    if (!compareWindow || !allRiskPoints || !allSignalPoints) return null;
    const inWin = <T extends { ts: number }>(p: T) =>
      p.ts >= compareWindow.from && p.ts < compareWindow.to;
    return aggregateTimeline(
      allRiskPoints.filter(inWin),
      allSignalPoints.filter(inWin),
      bucket,
    );
  }, [compareWindow, allRiskPoints, allSignalPoints, bucket]);

  /** Delta chip for a metric; `goodWhen` says which direction reads as healthy. */
  const deltaOf = (
    a: number,
    b: number | undefined,
    goodWhen: "up" | "down" | "none" = "none",
    fmt: (n: number) => string = signed,
  ) => {
    if (b === undefined) return undefined;
    const d = a - b;
    const tone: "neutral" | "good" | "bad" =
      d === 0 || goodWhen === "none"
        ? "neutral"
        : (d > 0) === (goodWhen === "up")
          ? "good"
          : "bad";
    return { text: fmt(d), tone };
  };
  const cmp = compareAgg ?? undefined;
  const showCompare = Boolean(cmp);
  const overlay = showCompare && mode === "overlay";


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

      {/* Comparison mode */}
      {canCompare && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/50 bg-muted/10 px-2 py-1.5 text-[11px]">
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <GitCompare className="h-3.5 w-3.5" /> Compare
          </span>
          <select
            value={compareKey}
            onChange={(e) => setCompareKey(e.target.value as CompareKey)}
            className="h-7 rounded-md border border-border/60 bg-background px-2 text-[11px]"
            aria-label="Comparison window"
          >
            {COMPARE_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
          {compareKey === "custom" && (
            <>
              <input
                type="datetime-local"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                aria-label="Comparison window start"
                className="h-7 rounded-md border border-border/60 bg-background px-2 text-[11px]"
              />
              <input
                type="datetime-local"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                aria-label="Comparison window end"
                className="h-7 rounded-md border border-border/60 bg-background px-2 text-[11px]"
              />
            </>
          )}
          {showCompare && (
            <div className="flex items-center gap-1">
              {(["overlay", "diff"] as const).map((m) => (
                <Button
                  key={m}
                  size="sm"
                  variant={mode === m ? "secondary" : "ghost"}
                  className="h-7 px-2 text-[11px] capitalize"
                  onClick={() => setMode(m)}
                >
                  {m}
                </Button>
              ))}
            </div>
          )}
          {compareWindow && (
            <span className="text-muted-foreground">
              A {format(baseWindow.from, "d MMM HH:mm")} → {format(baseWindow.to, "d MMM HH:mm")}
              {"  ·  "}B {format(compareWindow.from, "d MMM HH:mm")} →{" "}
              {format(compareWindow.to, "d MMM HH:mm")}
            </span>
          )}
          {compareKey === "custom" && !compareWindow && (
            <span className="text-destructive">Pick a valid start before end.</span>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat
          label="Total match Δ"
          value={signed(agg.totalMatchDelta)}
          hint={`${agg.mitigations} mitigation${agg.mitigations === 1 ? "" : "s"}`}
          tone={agg.totalMatchDelta > 0 ? "good" : agg.totalMatchDelta < 0 ? "bad" : "neutral"}
          compare={overlay ? signed(cmp!.totalMatchDelta) : undefined}
          delta={deltaOf(agg.totalMatchDelta, cmp?.totalMatchDelta, "up")}
        />
        <Stat
          label="Total near-miss Δ"
          value={signed(agg.totalNearMissDelta)}
          hint="Fragility proxy"
          tone={agg.totalNearMissDelta > 0 ? "bad" : agg.totalNearMissDelta < 0 ? "good" : "neutral"}
          compare={overlay ? signed(cmp!.totalNearMissDelta) : undefined}
          delta={deltaOf(agg.totalNearMissDelta, cmp?.totalNearMissDelta, "down")}
        />
        <Stat
          label="Net signal Δ"
          value={signed(agg.netSignalDelta)}
          hint="Matches − near-miss"
          tone={agg.netSignalDelta > 0 ? "good" : agg.netSignalDelta < 0 ? "bad" : "neutral"}
          compare={overlay ? signed(cmp!.netSignalDelta) : undefined}
          delta={deltaOf(agg.netSignalDelta, cmp?.netSignalDelta, "up")}
        />
        <Stat
          label="Escalations"
          value={String(agg.escalations)}
          hint="Risk level moved up"
          tone={agg.escalations > 0 ? "bad" : "neutral"}
          compare={overlay ? String(cmp!.escalations) : undefined}
          delta={deltaOf(agg.escalations, cmp?.escalations, "down")}
        />
        <Stat
          label="De-escalations"
          value={String(agg.deEscalations)}
          hint="Risk level moved down"
          tone={agg.deEscalations > 0 ? "good" : "neutral"}
          compare={overlay ? String(cmp!.deEscalations) : undefined}
          delta={deltaOf(agg.deEscalations, cmp?.deEscalations, "up")}
        />
        <Stat
          label="Time at high+"
          value={formatDuration(agg.timeAtOrAboveHighMs)}
          hint={`${agg.scans} scan${agg.scans === 1 ? "" : "s"}, ${agg.unchanged} flat`}
          tone={agg.timeAtOrAboveHighMs > 0 ? "bad" : "good"}
          compare={overlay ? formatDuration(cmp!.timeAtOrAboveHighMs) : undefined}
          delta={deltaOf(
            agg.timeAtOrAboveHighMs,
            cmp?.timeAtOrAboveHighMs,
            "down",
            (n) => `${n >= 0 ? "+" : "−"}${formatDuration(Math.abs(n))}`,
          )}
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

      {/* Transition heatmap */}
      {agg.transitions.length + agg.unchanged > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Risk transition heatmap — click a cell to inspect events
            </span>
            {selected && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[10px]"
                onClick={() => setSelected(null)}
              >
                Clear
              </Button>
            )}
          </div>
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
                      const b = cmp?.matrix[r][c];
                      const clickable = r !== c && n > 0;
                      const isActive = selected?.from === r && selected?.to === c;
                      const pct = maxCell > 0 ? Math.round((n / maxCell) * 70) : 0;
                      return (
                        <td key={c} className="p-0.5">
                          <button
                            type="button"
                            disabled={!clickable}
                            aria-pressed={isActive}
                            aria-label={`${RISK_NAME[r]} to ${RISK_NAME[c]}: ${n} transitions`}
                            onClick={() => setSelected(isActive ? null : { from: r, to: c })}
                            className={`w-full rounded-md py-1 text-center font-mono transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${tone} ${
                              clickable ? "cursor-pointer hover:brightness-125" : "cursor-default"
                            } ${isActive ? "ring-2 ring-ring" : ""}`}
                            style={{
                              backgroundColor:
                                n > 0
                                  ? `color-mix(in oklab, currentColor ${pct}%, transparent)`
                                  : undefined,
                            }}
                          >
                            {mode === "diff" && b !== undefined ? signed(n - b) : n}
                            {overlay && b !== undefined && (
                              <span className="ml-1 text-[10px] text-muted-foreground">({b})</span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selected && (
            <div className="rounded-lg border border-border/60 bg-muted/10 p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-[10px]">
                  {RISK_NAME[selected.from]} → {RISK_NAME[selected.to]}
                </Badge>
                <span className="text-[11px] text-muted-foreground">
                  {drill.length} transition{drill.length === 1 ? "" : "s"} ·{" "}
                  {drill.reduce((s, d) => s + d.matched.length, 0)} matched ·{" "}
                  {drill.reduce((s, d) => s + d.nearMiss.length, 0)} near-miss rule events
                </span>
              </div>
              {drill.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  No transitions in the current selection.
                </p>
              ) : (
                <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {drill.map((d, i) => (
                    <div
                      key={`${d.transition.address}-${d.transition.ts}-${i}`}
                      className="rounded-md border border-border/50 bg-background/40 p-2"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="font-mono text-muted-foreground">
                          {format(d.transition.ts, "MMM d, HH:mm")}
                        </span>
                        <span className="font-mono">
                          {d.transition.address.slice(0, 6)}…{d.transition.address.slice(-4)}
                        </span>
                        {d.transition.correlationId && (
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {d.transition.correlationId}
                          </Badge>
                        )}
                        {d.transition.trigger && (
                          <span className="text-muted-foreground">{d.transition.trigger}</span>
                        )}
                      </div>
                      {d.matched.length + d.nearMiss.length === 0 ? (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          No matched or near-miss rule events in this window.
                        </p>
                      ) : (
                        <ul className="mt-1 space-y-1">
                          {[
                            ...d.matched.map((s) => ({ s, kind: "Matched" as const })),
                            ...d.nearMiss.map((s) => ({ s, kind: "Near-miss" as const })),
                          ].map(({ s, kind }, j) => (
                            <li
                              key={`${s.ts}-${kind}-${j}`}
                              className="flex flex-wrap items-center gap-2 text-[11px]"
                            >
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${
                                  kind === "Matched" ? "text-emerald-400" : "text-amber-400"
                                }`}
                              >
                                {kind}
                              </Badge>
                              <span className="font-mono text-muted-foreground">
                                {format(s.ts, "HH:mm")}
                              </span>
                              <span className="truncate">{s.rule ?? s.label ?? "Rule change"}</span>
                              {s.symbols && s.symbols.length > 0 && (
                                <span className="font-mono text-muted-foreground">
                                  {s.symbols.slice(0, 4).join(", ")}
                                </span>
                              )}
                              <span className="ml-auto font-mono text-muted-foreground">
                                {signed(s.matchDelta)} match / {signed(s.nearMissDelta)} near
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}


      {/* Anomalies */}
      {anomalies.length > 0 && (
        <div className="space-y-1.5 rounded-lg border border-amber-400/40 bg-amber-400/5 p-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-[11px] font-medium">
              {anomalies.length} anomal{anomalies.length === 1 ? "y" : "ies"} detected
            </span>
            <span className="text-[10px] text-muted-foreground">
              sudden signal spikes or rapid risk shifts
            </span>
          </div>
          {anomalies.slice(0, 6).map((a, i) => (
            <div
              key={`${a.kind}-${a.start}-${i}`}
              className="flex flex-wrap items-center gap-2 rounded-md border border-border/50 bg-background/40 px-2 py-1.5 text-[11px]"
            >
              <Badge
                variant="outline"
                className={`text-[10px] ${a.severity === "critical" ? "text-destructive" : "text-amber-400"}`}
              >
                {a.kind === "signal-spike"
                  ? "Signal spike"
                  : a.kind === "escalation-burst"
                    ? "Escalation burst"
                    : "Rapid de-escalation"}
              </Badge>
              <span className="font-mono text-muted-foreground">
                {format(a.start, bucketFmt)}
              </span>
              <span className="truncate">{a.message}</span>
              <span className="ml-auto flex items-center gap-2">
                <span className="font-mono text-[10px] text-muted-foreground">
                  σ {a.score.toFixed(1)}
                </span>
                {onJump && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 gap-1 px-2 text-[10px]"
                    onClick={() => onJump(a)}
                  >
                    <Crosshair className="h-3 w-3" />
                    Jump to timeline
                  </Button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Per-period breakdown */}
      {agg.buckets.length > 0 && (
        <div className="space-y-1">
          {agg.buckets.map((b) => {
            const flagged = anomalies.filter((a) => a.start === b.start);
            return (
            <div
              key={b.start}
              className={`flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 text-[11px] ${
                flagged.length
                  ? "border-amber-400/60 bg-amber-400/10"
                  : "border-border/40 bg-muted/10"
              }`}
            >
              <span className="flex w-[110px] shrink-0 items-center gap-1 text-muted-foreground">
                {flagged.length > 0 && <AlertTriangle className="h-3 w-3 text-amber-400" />}
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
              {flagged.length > 0 && onJump && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 gap-1 px-2 text-[10px] text-amber-400"
                  onClick={() => onJump(flagged[0])}
                >
                  <Crosshair className="h-3 w-3" />
                  Jump
                </Button>
              )}
            </div>
            );
          })}
        </div>
      )}

    </div>
  );
}

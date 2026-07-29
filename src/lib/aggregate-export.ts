/* ------------------------------------------------------------------ *
 * Aggregate summary export
 *
 * Serialises the aggregate roll-up shown above the timeline chart —
 * delta totals, risk-level transition counts/matrix and the per-period
 * breakdown — for the current wallet / token / range selection.
 * Demo data.
 * ------------------------------------------------------------------ */

import { RISK_NAME, type BucketKey, type TimelineAggregate } from "@/lib/timeline-aggregate";
import { downloadTimelineExport } from "@/lib/timeline-export";

export type AggregateScope = {
  rangeLabel?: string;
  from?: number | null;
  to?: number;
  wallets?: string[];
  tokens?: string[];
  actions?: string[];
  outcomes?: string[];
  correlationId?: string;
};

const riskName = (s: number | null) => (s === null ? "none" : (RISK_NAME[s] ?? "unknown"));

const list = (v: string[] | undefined) => (v && v.length ? v : "all");

function csvCell(v: unknown) {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvSection(headers: string[], rows: unknown[][]) {
  return [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}

export function buildAggregateJson(
  agg: TimelineAggregate,
  bucket: BucketKey,
  scope: AggregateScope,
) {
  return JSON.stringify(
    {
      export: "mitigation-timeline-aggregate",
      generatedAt: new Date().toISOString(),
      dataSource: "demo/mock data — not financial advice",
      bucket,
      scope: {
        range: scope.rangeLabel ?? "all",
        fromIso: scope.from ? new Date(scope.from).toISOString() : null,
        toIso: new Date(scope.to ?? Date.now()).toISOString(),
        wallets: list(scope.wallets),
        tokens: list(scope.tokens),
        actions: list(scope.actions),
        outcomes: list(scope.outcomes),
        correlationId: scope.correlationId ?? null,
      },
      totals: {
        totalMatchDelta: agg.totalMatchDelta,
        totalNearMissDelta: agg.totalNearMissDelta,
        netSignalDelta: agg.netSignalDelta,
        mitigations: agg.mitigations,
        scans: agg.scans,
        escalations: agg.escalations,
        deEscalations: agg.deEscalations,
        unchanged: agg.unchanged,
        startRisk: riskName(agg.startRisk),
        endRisk: riskName(agg.endRisk),
        peakRisk: riskName(agg.peakRisk),
        timeAtOrAboveHighMs: agg.timeAtOrAboveHighMs,
      },
      transitionMatrix: agg.matrix.map((row, from) => ({
        from: riskName(from),
        counts: Object.fromEntries(row.map((n, to) => [riskName(to), n])),
      })),
      transitions: agg.transitions.map((t) => ({
        timestamp: new Date(t.ts).toISOString(),
        wallet: t.address,
        from: riskName(t.from),
        to: riskName(t.to),
        direction: t.direction,
      })),
      breakdown: agg.buckets.map((b) => ({
        periodStart: new Date(b.start).toISOString(),
        periodEnd: new Date(b.end).toISOString(),
        matchDelta: b.matchDelta,
        nearMissDelta: b.nearMissDelta,
        netDelta: b.matchDelta - b.nearMissDelta,
        mitigations: b.mitigations,
        scans: b.scans,
        escalations: b.escalations,
        deEscalations: b.deEscalations,
        peakRisk: riskName(b.peakRisk),
        endRisk: riskName(b.endRisk),
      })),
    },
    null,
    2,
  );
}

export function buildAggregateCsv(
  agg: TimelineAggregate,
  bucket: BucketKey,
  scope: AggregateScope,
) {
  const meta = csvSection(
    ["field", "value"],
    [
      ["export", "mitigation-timeline-aggregate"],
      ["generated_at", new Date().toISOString()],
      ["data_source", "demo/mock data - not financial advice"],
      ["bucket", bucket],
      ["range", scope.rangeLabel ?? "all"],
      ["from", scope.from ? new Date(scope.from).toISOString() : "all time"],
      ["to", new Date(scope.to ?? Date.now()).toISOString()],
      ["wallets", Array.isArray(list(scope.wallets)) ? (scope.wallets ?? []).join(" | ") : "all"],
      ["tokens", Array.isArray(list(scope.tokens)) ? (scope.tokens ?? []).join(" | ") : "all"],
      ["actions", Array.isArray(list(scope.actions)) ? (scope.actions ?? []).join(" | ") : "all"],
      ["outcomes", Array.isArray(list(scope.outcomes)) ? (scope.outcomes ?? []).join(" | ") : "all"],
      ["correlation_id", scope.correlationId ?? "all"],
    ],
  );

  const totals = csvSection(
    ["metric", "value"],
    [
      ["total_match_delta", agg.totalMatchDelta],
      ["total_near_miss_delta", agg.totalNearMissDelta],
      ["net_signal_delta", agg.netSignalDelta],
      ["mitigations", agg.mitigations],
      ["scans", agg.scans],
      ["escalations", agg.escalations],
      ["de_escalations", agg.deEscalations],
      ["unchanged", agg.unchanged],
      ["start_risk", riskName(agg.startRisk)],
      ["end_risk", riskName(agg.endRisk)],
      ["peak_risk", riskName(agg.peakRisk)],
      ["time_at_or_above_high_ms", agg.timeAtOrAboveHighMs],
    ],
  );

  const matrix = csvSection(
    ["from\\to", ...[0, 1, 2, 3].map((i) => riskName(i))],
    agg.matrix.map((row, from) => [riskName(from), ...row]),
  );

  const transitions = csvSection(
    ["timestamp", "wallet", "from", "to", "direction"],
    agg.transitions.map((t) => [
      new Date(t.ts).toISOString(),
      t.address,
      riskName(t.from),
      riskName(t.to),
      t.direction,
    ]),
  );

  const breakdown = csvSection(
    [
      "period_start",
      "period_end",
      "match_delta",
      "near_miss_delta",
      "net_delta",
      "mitigations",
      "scans",
      "escalations",
      "de_escalations",
      "peak_risk",
      "end_risk",
    ],
    agg.buckets.map((b) => [
      new Date(b.start).toISOString(),
      new Date(b.end).toISOString(),
      b.matchDelta,
      b.nearMissDelta,
      b.matchDelta - b.nearMissDelta,
      b.mitigations,
      b.scans,
      b.escalations,
      b.deEscalations,
      riskName(b.peakRisk),
      riskName(b.endRisk),
    ]),
  );

  return [
    meta,
    `# totals\n${totals}`,
    `# risk_transition_matrix\n${matrix}`,
    `# risk_transitions\n${transitions}`,
    `# breakdown_${bucket}\n${breakdown}`,
  ].join("\n\n") + "\n";
}

/** Reuses the timeline download helper but with an aggregate filename. */
export function downloadAggregateExport(body: string, format: "csv" | "json") {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const blob = new Blob([body], {
    type: format === "csv" ? "text/csv;charset=utf-8" : "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mitigation-aggregate-${stamp}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Keeps the shared helper referenced for callers that prefer it.
export { downloadTimelineExport };

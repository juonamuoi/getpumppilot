/* ------------------------------------------------------------------ *
 * Mitigation impact timeline export
 *
 * Serialises exactly what the chart is showing (current wallet, token
 * and time-range filters applied) to CSV or JSON. Demo data.
 * ------------------------------------------------------------------ */

export type TimelineRiskRow = {
  ts: number;
  score: number;
  address: string;
  threats: number;
  valueAtRisk: number;
  correlationId: string;
  trigger: string;
};

export type TimelineSignalRow = {
  ts: number;
  label: string;
  rule: string;
  /** single | bulk | risk-bounds */
  action?: string;
  matchDelta: number;
  nearMissDelta: number;
  matchesBefore?: number;
  matchesAfter?: number;
  nearMissBefore?: number;
  nearMissAfter?: number;
  symbols: string[];
  correlationId?: string;
  outcome?: string;
};

export type TimelineFilters = {
  range: string;
  rangeLabel: string;
  from: number | null;
  to: number;
  wallets: string[];
  tokens: string[];
  /** Mitigation action types selected (empty = all). */
  actions?: string[];
  /** Outcome statuses selected (empty = all). */
  outcomes?: string[];
};

const RISK_LABELS = ["safe", "medium", "high", "critical"];

function csvCell(v: unknown) {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvSection(headers: string[], rows: unknown[][]) {
  return [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}

export function buildTimelineJson(
  filters: TimelineFilters,
  risk: TimelineRiskRow[],
  signals: TimelineSignalRow[],
) {
  return JSON.stringify(
    {
      export: "mitigation-impact-timeline",
      generatedAt: new Date().toISOString(),
      dataSource: "demo/mock data — not financial advice",
      filters: {
        ...filters,
        fromIso: filters.from ? new Date(filters.from).toISOString() : null,
        toIso: new Date(filters.to).toISOString(),
        wallets: filters.wallets.length ? filters.wallets : "all",
        tokens: filters.tokens.length ? filters.tokens : "all",
        actions: filters.actions?.length ? filters.actions : "all",
        outcomes: filters.outcomes?.length ? filters.outcomes : "all",
      },
      totals: {
        riskPoints: risk.length,
        mitigations: signals.length,
        matchDelta: signals.reduce((s, p) => s + p.matchDelta, 0),
        nearMissDelta: signals.reduce((s, p) => s + p.nearMissDelta, 0),
        valueAtRiskUsd: risk.reduce((s, p) => s + p.valueAtRisk, 0),
      },
      riskPoints: risk.map((p) => ({
        timestamp: new Date(p.ts).toISOString(),
        wallet: p.address,
        riskLevel: RISK_LABELS[p.score] ?? "unknown",
        riskScore: p.score,
        threats: p.threats,
        valueAtRiskUsd: p.valueAtRisk,
        trigger: p.trigger,
        correlationId: p.correlationId,
      })),
      mitigations: signals.map((p) => ({
        timestamp: new Date(p.ts).toISOString(),
        mitigation: p.label,
        rule: p.rule,
        action: p.action ?? null,
        matchesBefore: p.matchesBefore ?? null,
        matchesAfter: p.matchesAfter ?? null,
        matchDelta: p.matchDelta,
        nearMissBefore: p.nearMissBefore ?? null,
        nearMissAfter: p.nearMissAfter ?? null,
        nearMissDelta: p.nearMissDelta,
        tokens: p.symbols,
        outcome: p.outcome ?? null,
        correlationId: p.correlationId ?? null,
      })),
    },
    null,
    2,
  );
}

export function buildTimelineCsv(
  filters: TimelineFilters,
  risk: TimelineRiskRow[],
  signals: TimelineSignalRow[],
) {
  const meta = csvSection(
    ["field", "value"],
    [
      ["export", "mitigation-impact-timeline"],
      ["generated_at", new Date().toISOString()],
      ["data_source", "demo/mock data - not financial advice"],
      ["range", filters.rangeLabel],
      ["from", filters.from ? new Date(filters.from).toISOString() : "all time"],
      ["to", new Date(filters.to).toISOString()],
      ["wallets", filters.wallets.length ? filters.wallets.join(" | ") : "all"],
      ["tokens", filters.tokens.length ? filters.tokens.join(" | ") : "all"],
      ["actions", filters.actions?.length ? filters.actions.join(" | ") : "all"],
      ["outcomes", filters.outcomes?.length ? filters.outcomes.join(" | ") : "all"],
    ],
  );

  const riskCsv = csvSection(
    [
      "timestamp",
      "wallet",
      "risk_level",
      "risk_score",
      "threats",
      "value_at_risk_usd",
      "trigger",
      "correlation_id",
    ],
    risk.map((p) => [
      new Date(p.ts).toISOString(),
      p.address,
      RISK_LABELS[p.score] ?? "unknown",
      p.score,
      p.threats,
      p.valueAtRisk.toFixed(2),
      p.trigger,
      p.correlationId,
    ]),
  );

  const signalCsv = csvSection(
    [
      "timestamp",
      "mitigation",
      "action",
      "rule",
      "matches_before",
      "matches_after",
      "match_delta",
      "near_miss_before",
      "near_miss_after",
      "near_miss_delta",
      "tokens",
      "outcome",
      "correlation_id",
    ],
    signals.map((p) => [
      new Date(p.ts).toISOString(),
      p.label,
      p.action ?? "",
      p.rule,
      p.matchesBefore ?? "",
      p.matchesAfter ?? "",
      p.matchDelta,
      p.nearMissBefore ?? "",
      p.nearMissAfter ?? "",
      p.nearMissDelta,
      p.symbols.join(" | "),
      p.outcome ?? "",
      p.correlationId ?? "",
    ]),
  );

  return `${meta}\n\n# wallet_risk_points\n${riskCsv}\n\n# mitigation_signal_points\n${signalCsv}\n`;
}

export function downloadTimelineExport(body: string, format: "csv" | "json") {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const blob = new Blob([body], {
    type: format === "csv" ? "text/csv;charset=utf-8" : "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mitigation-timeline-${stamp}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

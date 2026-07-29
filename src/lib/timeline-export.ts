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
  /** Exact rule change, e.g. "RSI ≥ 60 → RSI ≥ 55". */
  diff?: string;
  ruleBefore?: string;
  ruleAfter?: string;
  /** Plain-English explanation and its segments. */
  why?: string;
  whyChange?: string;
  whyStrictness?: string;
  whyImpact?: string;
  whyOutcome?: string;
  whyFragility?: string;
};

/** Selectable export sections. */
export type TimelineSection = "risk" | "matched" | "nearMiss" | "noMatch";

export const TIMELINE_SECTIONS: { key: TimelineSection; label: string; hint: string }[] = [
  { key: "risk", label: "Risk points", hint: "Wallet risk scan history" },
  { key: "matched", label: "Matched", hint: "Mitigations with matches after the change" },
  { key: "nearMiss", label: "Near-miss", hint: "No matches, but assets inside the near-miss band" },
  { key: "noMatch", label: "No-match", hint: "Mitigations that matched nothing" },
];

export const ALL_TIMELINE_SECTIONS: TimelineSection[] = TIMELINE_SECTIONS.map((s) => s.key);

/** Buckets a mitigation row into matched / near-miss / no-match. */
export function sectionOfSignal(p: TimelineSignalRow): Exclude<TimelineSection, "risk"> {
  if ((p.matchesAfter ?? 0) > 0) return "matched";
  if ((p.nearMissAfter ?? 0) > 0) return "nearMiss";
  return "noMatch";
}

export function filterTimelineSections(
  sections: TimelineSection[] | undefined,
  risk: TimelineRiskRow[],
  signals: TimelineSignalRow[],
) {
  const sel = sections?.length ? sections : ALL_TIMELINE_SECTIONS;
  return {
    sections: sel,
    risk: sel.includes("risk") ? risk : [],
    signals: signals.filter((p) => sel.includes(sectionOfSignal(p))),
  };
}

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
  /** Focused correlation ID scope, when exporting from a deep link. */
  correlationId?: string;
  /** Sections included in this export (empty/undefined = all). */
  sections?: TimelineSection[];
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
  allRisk: TimelineRiskRow[],
  allSignals: TimelineSignalRow[],
) {
  const scoped = filterTimelineSections(filters.sections, allRisk, allSignals);
  const risk = scoped.risk;
  const signals = scoped.signals;
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
        sections: scoped.sections,
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
        diff: p.diff ?? null,
        ruleBefore: p.ruleBefore ?? null,
        ruleAfter: p.ruleAfter ?? null,
        section: sectionOfSignal(p),
        why: p.why ?? null,
        whyChange: p.whyChange ?? null,
        whyStrictness: p.whyStrictness ?? null,
        whyImpact: p.whyImpact ?? null,
        whyOutcome: p.whyOutcome ?? null,
        whyFragility: p.whyFragility ?? null,
      })),
    },
    null,
    2,
  );
}

export function buildTimelineCsv(
  filters: TimelineFilters,
  allRisk: TimelineRiskRow[],
  allSignals: TimelineSignalRow[],
) {
  const scoped = filterTimelineSections(filters.sections, allRisk, allSignals);
  const risk = scoped.risk;
  const signals = scoped.signals;
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
      ["sections", scoped.sections.join(" | ")],
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
      "section",
      "diff",
      "rule_before",
      "rule_after",
      "why",
      "why_change",
      "why_strictness",
      "why_impact",
      "why_outcome",
      "why_fragility",
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
      sectionOfSignal(p),
      p.diff ?? "",
      p.ruleBefore ?? "",
      p.ruleAfter ?? "",
      p.why ?? "",
      p.whyChange ?? "",
      p.whyStrictness ?? "",
      p.whyImpact ?? "",
      p.whyOutcome ?? "",
      p.whyFragility ?? "",
    ]),
  );

  const parts = [meta];
  if (scoped.sections.includes("risk")) parts.push(`# wallet_risk_points\n${riskCsv}`);
  if (scoped.sections.some((s) => s !== "risk"))
    parts.push(`# mitigation_signal_points\n${signalCsv}`);
  return `${parts.join("\n\n")}\n`;
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

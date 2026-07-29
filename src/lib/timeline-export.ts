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
  /** CSV columns to include (undefined = every column). */
  columns?: TimelineColumnSelection;
};

/* ------------------------------------------------------------------ *
 * CSV column catalogue
 * ------------------------------------------------------------------ */

export type TimelineColumnGroup = "meta" | "risk" | "mitigation";

export type TimelineColumnSelection = {
  meta?: string[];
  risk?: string[];
  mitigation?: string[];
};

type MetaColumn = { key: string; label: string; value: (f: TimelineFilters, sections: TimelineSection[]) => unknown };
type RiskColumn = { key: string; label: string; value: (p: TimelineRiskRow) => unknown };
type SignalColumn = { key: string; label: string; value: (p: TimelineSignalRow) => unknown };

export const TIMELINE_META_COLUMNS: MetaColumn[] = [
  { key: "export", label: "Export name", value: () => "mitigation-impact-timeline" },
  { key: "generated_at", label: "Generated at", value: () => new Date().toISOString() },
  { key: "data_source", label: "Data source", value: () => "demo/mock data - not financial advice" },
  { key: "range", label: "Range", value: (f) => f.rangeLabel },
  { key: "from", label: "From", value: (f) => (f.from ? new Date(f.from).toISOString() : "all time") },
  { key: "to", label: "To", value: (f) => new Date(f.to).toISOString() },
  { key: "wallets", label: "Wallets", value: (f) => (f.wallets.length ? f.wallets.join(" | ") : "all") },
  { key: "tokens", label: "Tokens", value: (f) => (f.tokens.length ? f.tokens.join(" | ") : "all") },
  { key: "actions", label: "Actions", value: (f) => (f.actions?.length ? f.actions.join(" | ") : "all") },
  { key: "outcomes", label: "Outcomes", value: (f) => (f.outcomes?.length ? f.outcomes.join(" | ") : "all") },
  { key: "correlation_id", label: "Correlation ID", value: (f) => f.correlationId ?? "all" },
  { key: "sections", label: "Sections", value: (_f, sections) => sections.join(" | ") },
];

export const TIMELINE_RISK_COLUMNS: RiskColumn[] = [
  { key: "timestamp", label: "Timestamp", value: (p) => new Date(p.ts).toISOString() },
  { key: "wallet", label: "Wallet", value: (p) => p.address },
  { key: "risk_level", label: "Risk level", value: (p) => RISK_LABELS[p.score] ?? "unknown" },
  { key: "risk_score", label: "Risk score", value: (p) => p.score },
  { key: "threats", label: "Threats", value: (p) => p.threats },
  { key: "value_at_risk_usd", label: "Value at risk (USD)", value: (p) => p.valueAtRisk.toFixed(2) },
  { key: "trigger", label: "Trigger", value: (p) => p.trigger },
  { key: "correlation_id", label: "Correlation ID", value: (p) => p.correlationId },
];

export const TIMELINE_MITIGATION_COLUMNS: SignalColumn[] = [
  { key: "timestamp", label: "Timestamp", value: (p) => new Date(p.ts).toISOString() },
  { key: "mitigation", label: "Mitigation", value: (p) => p.label },
  { key: "action", label: "Action", value: (p) => p.action ?? "" },
  { key: "rule", label: "Rule", value: (p) => p.rule },
  { key: "matches_before", label: "Matches before", value: (p) => p.matchesBefore ?? "" },
  { key: "matches_after", label: "Matches after", value: (p) => p.matchesAfter ?? "" },
  { key: "match_delta", label: "Match delta", value: (p) => p.matchDelta },
  { key: "near_miss_before", label: "Near-miss before", value: (p) => p.nearMissBefore ?? "" },
  { key: "near_miss_after", label: "Near-miss after", value: (p) => p.nearMissAfter ?? "" },
  { key: "near_miss_delta", label: "Near-miss delta", value: (p) => p.nearMissDelta },
  { key: "tokens", label: "Tokens", value: (p) => p.symbols.join(" | ") },
  { key: "outcome", label: "Outcome", value: (p) => p.outcome ?? "" },
  { key: "correlation_id", label: "Correlation ID", value: (p) => p.correlationId ?? "" },
  { key: "section", label: "Section", value: (p) => sectionOfSignal(p) },
  { key: "diff", label: "Diff", value: (p) => p.diff ?? "" },
  { key: "rule_before", label: "Rule before", value: (p) => p.ruleBefore ?? "" },
  { key: "rule_after", label: "Rule after", value: (p) => p.ruleAfter ?? "" },
  { key: "why", label: "Why", value: (p) => p.why ?? "" },
  { key: "why_change", label: "Why · change", value: (p) => p.whyChange ?? "" },
  { key: "why_strictness", label: "Why · strictness", value: (p) => p.whyStrictness ?? "" },
  { key: "why_impact", label: "Why · impact", value: (p) => p.whyImpact ?? "" },
  { key: "why_outcome", label: "Why · outcome", value: (p) => p.whyOutcome ?? "" },
  { key: "why_fragility", label: "Why · fragility", value: (p) => p.whyFragility ?? "" },
];

export const TIMELINE_COLUMN_GROUPS: {
  key: TimelineColumnGroup;
  label: string;
  columns: { key: string; label: string }[];
}[] = [
  { key: "meta", label: "Metadata", columns: TIMELINE_META_COLUMNS.map((c) => ({ key: c.key, label: c.label })) },
  { key: "risk", label: "Risk point columns", columns: TIMELINE_RISK_COLUMNS.map((c) => ({ key: c.key, label: c.label })) },
  {
    key: "mitigation",
    label: "Mitigation columns",
    columns: TIMELINE_MITIGATION_COLUMNS.map((c) => ({ key: c.key, label: c.label })),
  },
];

/** Every column selected — the default. */
export function allTimelineColumns(): Required<TimelineColumnSelection> {
  return {
    meta: TIMELINE_META_COLUMNS.map((c) => c.key),
    risk: TIMELINE_RISK_COLUMNS.map((c) => c.key),
    mitigation: TIMELINE_MITIGATION_COLUMNS.map((c) => c.key),
  };
}

function pick<T extends { key: string }>(all: T[], selected: string[] | undefined) {
  return selected ? all.filter((c) => selected.includes(c.key)) : all;
}

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
  const cols = filters.columns ?? {};
  const metaCols = pick(TIMELINE_META_COLUMNS, cols.meta);
  const riskCols = pick(TIMELINE_RISK_COLUMNS, cols.risk);
  const signalCols = pick(TIMELINE_MITIGATION_COLUMNS, cols.mitigation);

  const meta = csvSection(
    ["field", "value"],
    metaCols.map((c) => [c.key, c.value(filters, scoped.sections)]),
  );

  const riskCsv = csvSection(
    riskCols.map((c) => c.key),
    risk.map((p) => riskCols.map((c) => c.value(p))),
  );

  const signalCsv = csvSection(
    signalCols.map((c) => c.key),
    signals.map((p) => signalCols.map((c) => c.value(p))),
  );

  const parts: string[] = [];
  if (metaCols.length) parts.push(meta);
  if (scoped.sections.includes("risk") && riskCols.length) parts.push(`# wallet_risk_points\n${riskCsv}`);
  if (scoped.sections.some((s) => s !== "risk") && signalCols.length)
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

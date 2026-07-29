/**
 * Export helpers for the mitigation before/after diff view.
 *
 * Serialises the two things the diff shows — which rules changed, and which
 * assets crossed the matched / near-miss / no-match boundary — into a single
 * CSV (two sections) or JSON document.
 */

export type DiffRuleRow = {
  label: string;
  before: string;
  after: string;
  changed: boolean;
};

export type DiffAssetRow = {
  symbol: string;
  name?: string;
  category?: string;
  statusBefore: string;
  statusAfter: string;
  changed: boolean;
  transition: string;
  failedGatesBefore: string[];
  failedGatesAfter: string[];
};

export type DiffExportPayload = {
  correlationId: string;
  mitigation: string;
  entryTs: number;
  scope: "changed-only" | "all-assets";
  rules: DiffRuleRow[];
  assets: DiffAssetRow[];
  summary: {
    rulesChanged: number;
    gainedMatches: number;
    lostMatches: number;
    newNearMisses: number;
    assetsChanged: number;
    assetsTotal: number;
  };
};

const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export function diffToJson(p: DiffExportPayload): string {
  return JSON.stringify(
    {
      export: "mitigation-diff",
      generatedAt: new Date().toISOString(),
      dataSource: "demo/mock data — not financial advice",
      correlationId: p.correlationId,
      mitigation: p.mitigation,
      entryAt: new Date(p.entryTs).toISOString(),
      scope: p.scope,
      summary: p.summary,
      ruleChanges: p.rules,
      assetTransitions: p.assets,
    },
    null,
    2,
  );
}

export function diffToCsv(p: DiffExportPayload): string {
  const meta = [
    ["export", "mitigation-diff"],
    ["generatedAt", new Date().toISOString()],
    ["correlationId", p.correlationId],
    ["mitigation", p.mitigation],
    ["entryAt", new Date(p.entryTs).toISOString()],
    ["scope", p.scope],
    ["rulesChanged", p.summary.rulesChanged],
    ["gainedMatches", p.summary.gainedMatches],
    ["lostMatches", p.summary.lostMatches],
    ["newNearMisses", p.summary.newNearMisses],
    ["assetsChanged", p.summary.assetsChanged],
    ["assetsTotal", p.summary.assetsTotal],
    ["dataSource", "demo/mock data — not financial advice"],
  ]
    .map(([k, v]) => `${cell(k)},${cell(v)}`)
    .join("\n");

  const ruleHeader = ["section", "rule", "before", "after", "changed"].map(cell).join(",");
  const ruleRows = p.rules
    .map((r) => [cell("rule_change"), cell(r.label), cell(r.before), cell(r.after), cell(r.changed)].join(","))
    .join("\n");

  const assetHeader = [
    "section",
    "symbol",
    "name",
    "category",
    "status_before",
    "status_after",
    "changed",
    "transition",
    "failed_gates_before",
    "failed_gates_after",
  ]
    .map(cell)
    .join(",");
  const assetRows = p.assets
    .map((a) =>
      [
        cell("asset_transition"),
        cell(a.symbol),
        cell(a.name),
        cell(a.category),
        cell(a.statusBefore),
        cell(a.statusAfter),
        cell(a.changed),
        cell(a.transition),
        cell(a.failedGatesBefore.join(" | ")),
        cell(a.failedGatesAfter.join(" | ")),
      ].join(","),
    )
    .join("\n");

  return [`${cell("field")},${cell("value")}`, meta, "", ruleHeader, ruleRows, "", assetHeader, assetRows].join("\n");
}

export function downloadDiff(p: DiffExportPayload, kind: "csv" | "json"): number {
  const body = kind === "csv" ? diffToCsv(p) : diffToJson(p);
  const blob = new Blob([body], { type: kind === "csv" ? "text/csv" : "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeId = p.correlationId.replace(/[^a-zA-Z0-9_-]/g, "-");
  a.download = `mitigation-diff-${safeId}-${Date.now()}.${kind}`;
  a.click();
  URL.revokeObjectURL(url);
  return p.rules.length + p.assets.length;
}

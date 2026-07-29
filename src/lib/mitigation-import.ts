import type { TuningLogEntry } from "@/lib/paper-store";

/* ------------------------------------------------------------------ *
 * Mitigation import
 *
 * Reads a file previously produced by the audit trail exports (quick
 * CSV/JSON, or the decision export with its column schema) and turns it
 * back into read-only audit entries for review.
 * ------------------------------------------------------------------ */

export type ImportIssueLevel = "error" | "warning";

/** One problem tied to a specific source record. */
export type ImportIssue = {
  /** 1-based index of the record within the file's data rows. */
  row: number;
  /** Source line in the file when known (CSV), otherwise the record index. */
  line?: number;
  level: ImportIssueLevel;
  field?: string;
  code: string;
  message: string;
  /** Raw value that triggered the issue, truncated for display. */
  value?: string;
  /** Correlation / decision id when it could be read. */
  ref?: string;
};

export type ImportResult = {
  entries: TuningLogEntry[];
  /** Rows the parser could not turn into an audit entry. */
  skipped: number;
  /** Total data rows found in the file. */
  total: number;
  /** Records imported with at least one warning. */
  warned: number;
  /** Per-record warnings and errors. */
  issues: ImportIssue[];
  /** Non-fatal notes about the file as a whole. */
  warnings: string[];
  format: "csv" | "json";
  fileName?: string;
  /** Metadata found in a JSON export header, when present. */
  meta?: {
    exportedAt?: string;
    recordCount?: number;
    filters?: unknown;
    preset?: string | null;
  };
  range?: { from: number; to: number };
  /** Raw records exactly as read from the file, for re-mapping. */
  records?: ImportRecord[];
  /** Column headers / JSON keys found in the file. */
  headers?: string[];
  /** Header → audit field mapping applied to produce `entries`. */
  mapping?: Record<string, string>;
  /** Headers not mapped to any audit field. */
  unmapped?: string[];
  /** Offset used to report CSV line numbers, kept so remaps stay accurate. */
  lineOffset?: number;
};

export const IMPORT_PREFIX = "imported-";

export function isImportedEntry(e: TuningLogEntry) {
  return e.id.startsWith(IMPORT_PREFIX);
}


/** Minimal RFC4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") cell += ch;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const numOr = (v: unknown, fallback?: number) => {
  if (v === "" || v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const tsOr = (v: unknown) => {
  if (!v) return undefined;
  const t = Date.parse(String(v));
  return Number.isNaN(t) ? undefined : t;
};

const list = (v: unknown) =>
  String(v ?? "")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);

type Raw = Record<string, unknown>;

export type ImportRecord = Raw;

const short = (v: unknown) => {
  const s = String(v ?? "");
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
};

const VALID_STATUS = ["alerts-fired", "no-matches", "channels-muted", "pending"];

/**
 * Map one exported record onto a review-only entry, recording every field
 * problem found on the way. Returns null when the row is unusable.
 */
function toEntry(
  r: Raw,
  index: number,
  lineOffset: number,
  issues: ImportIssue[],
): TuningLogEntry | null {
  const row = index + 1;
  const line = lineOffset > 0 ? lineOffset + index + 1 : undefined;
  const ref = String(r.decisionId ?? r.correlationId ?? "") || undefined;
  const add = (
    level: ImportIssueLevel,
    code: string,
    message: string,
    field?: string,
    value?: unknown,
  ) =>
    issues.push({
      row,
      line,
      level,
      code,
      message,
      field,
      value: value === undefined ? undefined : short(value),
      ref,
    });

  const ruleLabel = String(r.rule ?? r.ruleLabel ?? "").trim();
  const rawTs = r.timestamp ?? r.appliedAt ?? r.previewedAt ?? r.outcomeAt;
  const ts =
    tsOr(r.timestamp) ?? tsOr(r.appliedAt) ?? tsOr(r.previewedAt) ?? tsOr(r.outcomeAt);

  if (!ruleLabel && !r.correlationId && !r.mitigation) {
    add(
      "error",
      "unrecognised-row",
      "Row skipped — none of rule, mitigation or correlationId could be read.",
    );
    return null;
  }

  if (!ruleLabel) add("warning", "missing-rule", "No rule name — shown as “(unknown rule)”.", "rule");
  if (!ts) {
    if (rawTs) add("warning", "bad-timestamp", "Timestamp could not be parsed — using import time.", "timestamp", rawTs);
    else add("warning", "missing-timestamp", "No timestamp on this record — using import time.", "timestamp");
  }
  if (!r.correlationId) {
    add("warning", "missing-correlation", "No correlationId — this record can't be linked to a batch.", "correlationId");
  }

  const decision = String(r.decision ?? "");
  const phase: "preview" | "applied" =
    r.phase === "preview" || decision === "preview-only" ? "preview" : "applied";
  if (r.phase && r.phase !== "preview" && r.phase !== "applied") {
    add("warning", "bad-phase", `Unknown phase “${short(r.phase)}” — treated as applied.`, "phase", r.phase);
  }

  const outcomeStatus = String(r.outcomeStatus ?? "");
  if (outcomeStatus && !VALID_STATUS.includes(outcomeStatus)) {
    add("warning", "bad-outcome-status", `Unrecognised outcome status “${short(outcomeStatus)}”.`, "outcomeStatus", outcomeStatus);
  }
  const hasOutcome = outcomeStatus && outcomeStatus !== "pending";

  if (r.operator && r.operator !== ">=" && r.operator !== "<=") {
    add("warning", "bad-operator", `Unknown operator “${short(r.operator)}” — defaulted to “>=”.`, "operator", r.operator);
  }
  const operator = r.operator === "<=" ? "<=" : ">=";

  for (const f of ["oldValue", "newValue"] as const) {
    if (r[f] === "" || r[f] == null) {
      add("warning", "missing-value", `${f} missing — defaulted to 0.`, f);
    } else if (numOr(r[f]) === undefined) {
      add("warning", "bad-number", `${f} is not a number — defaulted to 0.`, f, r[f]);
    }
  }

  if (r.scope && !(["majors", "demo", "both", "none"] as const).includes(r.scope as never)) {
    add("warning", "bad-scope", `Unknown scope “${short(r.scope)}” — dropped.`, "scope", r.scope);
  }

  return {
    id: `${IMPORT_PREFIX}${index}-${r.decisionId ?? r.correlationId ?? Math.random().toString(36).slice(2)}`,
    source: "mitigation",
    kind: r.kind === "bounds" ? "bounds" : "rule",
    mitigation: String(r.mitigation ?? "Imported mitigation"),
    trigger: r.trigger ? String(r.trigger) : undefined,
    recommendedValue: numOr(r.recommendedValue),
    fragilePct: numOr(r.fragilePct),
    ts: ts ?? Date.now(),
    rule: ruleLabel.toLowerCase(),
    ruleLabel: ruleLabel || "(unknown rule)",
    operator,
    unit: String(r.unit ?? ""),
    oldValue: numOr(r.oldValue, 0) as number,
    newValue: numOr(r.newValue, 0) as number,
    preset: String(r.preset ?? "imported"),
    window: r.window ? String(r.window) : undefined,
    scope: (["majors", "demo", "both", "none"] as const).includes(r.scope as never)
      ? (r.scope as TuningLogEntry["scope"])
      : undefined,
    matchesBefore: numOr(r.matchesBefore),
    matchesAfter: numOr(r.matchesAfter),
    nearMissBefore: numOr(r.nearMissBefore),
    nearMissAfter: numOr(r.nearMissAfter),
    phase,
    previewedAt: tsOr(r.previewedAt),
    appliedAt: tsOr(r.appliedAt),
    scopeMatchesBefore: numOr(r.scopeMatchesBefore),
    scopeMatchesAfter: numOr(r.scopeMatchesAfter),
    scopeNearMissBefore: numOr(r.scopeNearMissBefore),
    scopeNearMissAfter: numOr(r.scopeNearMissAfter),
    scopeAssetsAffected: numOr(r.scopeAssetsAffected),
    correlationId: r.correlationId ? String(r.correlationId) : undefined,
    outcome: hasOutcome
      ? {
          status: outcomeStatus as never,
          matched: numOr(r.outcomeMatched, 0) as number,
          delivered: numOr(r.outcomeDelivered, 0) as number,
          symbols: list(r.outcomeSymbols),
          channels: list(r.outcomeChannels),
          ts: tsOr(r.outcomeAt) ?? ts ?? Date.now(),
        }
      : undefined,
    revertedAt: tsOr(r.revertedAt),
    revertReason: r.revertReason ? String(r.revertReason) : undefined,
  } as TuningLogEntry;
}

function finalize(
  records: Raw[],
  format: "csv" | "json",
  warnings: string[],
  opts: { fileName?: string; lineOffset?: number; meta?: ImportResult["meta"] } = {},
): ImportResult {
  const entries: TuningLogEntry[] = [];
  const issues: ImportIssue[] = [];
  let skipped = 0;
  records.forEach((r, i) => {
    const e = toEntry(r, i, opts.lineOffset ?? 0, issues);
    if (e) entries.push(e);
    else skipped++;
  });
  entries.sort((a, b) => b.ts - a.ts);
  const range =
    entries.length > 0
      ? { from: entries[entries.length - 1].ts, to: entries[0].ts }
      : undefined;
  if (skipped > 0) warnings.push(`${skipped} row(s) skipped — no recognisable mitigation fields.`);
  const warned = new Set(issues.filter((i) => i.level === "warning").map((i) => i.row)).size;
  return {
    entries,
    skipped,
    total: records.length,
    warned,
    issues,
    warnings,
    format,
    fileName: opts.fileName,
    meta: opts.meta,
    range,
    records,
    headers: [...new Set(records.flatMap((r) => Object.keys(r)))],
    lineOffset: opts.lineOffset ?? 0,
  };
}

/* ------------------------------------------------------------------ *
 * Column mapping
 *
 * Files exported from other tools (or older schema versions) use
 * different header names. Each source header can be mapped onto an
 * audit-trail field before the records are turned into entries.
 * ------------------------------------------------------------------ */

export type ImportFieldDef = { key: string; label: string; required?: boolean; aliases: string[] };

/** Audit-trail fields an imported column can be mapped onto. */
export const IMPORT_FIELDS: ImportFieldDef[] = [
  { key: "correlationId", label: "Correlation ID", required: true, aliases: ["correlation", "correlation_id", "batchid", "batch", "groupid"] },
  { key: "decisionId", label: "Entry ID", aliases: ["id", "entryid", "recordid", "rowid", "decision_id"] },
  { key: "decision", label: "Decision", aliases: ["state", "status", "result"] },
  { key: "phase", label: "Phase", aliases: ["stage", "lifecycle"] },
  { key: "mitigation", label: "Mitigation", required: true, aliases: ["action", "mitigationname", "fix", "remediation"] },
  { key: "trigger", label: "Trigger", aliases: ["cause", "reason", "triggeredby"] },
  { key: "rule", label: "Rule", required: true, aliases: ["rulelabel", "rulename", "signal", "metric"] },
  { key: "kind", label: "Change type", aliases: ["changetype", "type"] },
  { key: "operator", label: "Operator", aliases: ["comparator", "op"] },
  { key: "oldValue", label: "Old value", aliases: ["before", "previous", "from", "oldthreshold", "previousthreshold"] },
  { key: "newValue", label: "New value", aliases: ["after", "to", "newthreshold", "threshold"] },
  { key: "unit", label: "Unit", aliases: ["units", "measure"] },
  { key: "recommendedValue", label: "Recommended value", aliases: ["recommended", "suggestedvalue"] },
  { key: "preset", label: "Preset", aliases: ["profile", "mode"] },
  { key: "window", label: "Replay window", aliases: ["timewindow", "lookback"] },
  { key: "scope", label: "Asset scope", aliases: ["assetscope", "universe"] },
  { key: "timestamp", label: "Timestamp", required: true, aliases: ["time", "date", "datetime", "when", "createdat", "ts", "occurredat"] },
  { key: "previewedAt", label: "Previewed at", aliases: ["previewtime", "confirmedat", "reviewedat"] },
  { key: "appliedAt", label: "Applied at", aliases: ["appliedtime", "savedat"] },
  { key: "matchesBefore", label: "Matches before", aliases: ["matchbefore", "matchesprior"] },
  { key: "matchesAfter", label: "Matches after", aliases: ["matchafter"] },
  { key: "nearMissBefore", label: "Near-miss before", aliases: ["nearmissprior"] },
  { key: "nearMissAfter", label: "Near-miss after", aliases: [] },
  { key: "scopeMatchesBefore", label: "Scope matches before", aliases: [] },
  { key: "scopeMatchesAfter", label: "Scope matches after", aliases: [] },
  { key: "scopeNearMissBefore", label: "Scope near-miss before", aliases: [] },
  { key: "scopeNearMissAfter", label: "Scope near-miss after", aliases: [] },
  { key: "scopeAssetsAffected", label: "Assets affected", aliases: ["assetsaffected", "affectedassets"] },
  { key: "fragilePct", label: "Fragility %", aliases: ["fragility", "fragile"] },
  { key: "outcomeStatus", label: "Alert outcome", aliases: ["alerttype", "alertstatus", "outcome"] },
  { key: "outcomeMatched", label: "Outcome matches", aliases: ["matched"] },
  { key: "outcomeDelivered", label: "Alerts delivered", aliases: ["delivered", "alertssent"] },
  { key: "outcomeSymbols", label: "Outcome tokens", aliases: ["symbols", "tokens", "assets"] },
  { key: "outcomeChannels", label: "Outcome channels", aliases: ["channels"] },
  { key: "outcomeAt", label: "Outcome recorded at", aliases: ["outcometime"] },
  { key: "revertedAt", label: "Reverted at", aliases: ["rollbackat", "revertedon"] },
  { key: "revertReason", label: "Revert reason", aliases: ["rollbackreason"] },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const ALIAS_INDEX: Record<string, string> = (() => {
  const idx: Record<string, string> = {};
  for (const f of IMPORT_FIELDS) {
    idx[norm(f.key)] = f.key;
    idx[norm(f.label)] = f.key;
    for (const a of f.aliases) idx[norm(a)] = f.key;
  }
  return idx;
})();

/** Sentinel mapping value meaning "drop this column". */
export const IGNORE_COLUMN = "__ignore__";

const FIELD_KEYS = new Set(IMPORT_FIELDS.map((f) => f.key));

/**
 * Best-guess header → field mapping. Headers that already match an audit
 * field keep their own name; unrecognised headers map to "" (passed through
 * untouched) unless a confident alias match exists.
 */
export function suggestMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const taken = new Set<string>();
  for (const h of headers) {
    if (FIELD_KEYS.has(h)) {
      mapping[h] = h;
      taken.add(h);
    }
  }
  for (const h of headers) {
    if (mapping[h]) continue;
    const n = norm(h);
    let key = ALIAS_INDEX[n] ?? "";
    if (!key) {
      const hit = IMPORT_FIELDS.find((f) => n.includes(norm(f.key)));
      key = hit?.key ?? "";
    }
    mapping[h] = key && !taken.has(key) ? key : "";
    if (mapping[h]) taken.add(mapping[h]);
  }
  return mapping;
}

/** Required audit fields that the current mapping does not cover. */
export function missingRequiredFields(mapping: Record<string, string>): ImportFieldDef[] {
  const mapped = new Set(Object.values(mapping).filter((v) => v && v !== IGNORE_COLUMN));
  return IMPORT_FIELDS.filter((f) => f.required && !mapped.has(f.key));
}

/** Re-run the import with an explicit header → field mapping. */
export function applyMapping(result: ImportResult, mapping: Record<string, string>): ImportResult {
  const source = result.records ?? [];
  const remapped: ImportRecord[] = source.map((r) => {
    const o: ImportRecord = {};
    for (const [header, value] of Object.entries(r)) {
      const target = mapping[header];
      if (target === IGNORE_COLUMN) continue;
      o[target || header] = value;
    }
    return o;
  });
  const unmapped = (result.headers ?? []).filter((h) => mapping[h] === IGNORE_COLUMN);
  const warnings = [...result.warnings.filter((w) => !w.startsWith("Column mapping"))];
  const changed = Object.entries(mapping).filter(([h, k]) => k && k !== IGNORE_COLUMN && k !== h).length;
  if (changed > 0) warnings.push(`Column mapping: ${changed} header(s) remapped.`);
  if (unmapped.length > 0) warnings.push(`Column mapping: ${unmapped.length} column(s) ignored.`);

  const next = finalize(remapped, result.format, warnings, {
    fileName: result.fileName,
    lineOffset: result.lineOffset ?? 0,
    meta: result.meta,
  });
  return { ...next, records: source, headers: result.headers, mapping, unmapped };
}


/** Parse a previously exported mitigation file. Throws on unusable input. */
export function parseMitigationExport(filename: string, text: string): ImportResult {
  const warnings: string[] = [];
  const trimmed = text.trim();
  if (!trimmed) throw new Error("The file is empty.");

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error("That JSON file could not be parsed.");
    }
    let records: Raw[] = [];
    let meta: ImportResult["meta"] | undefined;
    if (Array.isArray(parsed)) {
      records = parsed as Raw[];
    } else {
      const obj = parsed as Raw;
      records = (obj.records ?? obj.decisions ?? []) as Raw[];
      meta = {
        exportedAt: (obj.generatedAt ?? obj.exportedAt) as string | undefined,
        recordCount: obj.recordCount as number | undefined,
        filters: obj.filters,
        preset: (obj.preset as { name?: string } | null)?.name ?? null,
      };
      if (!Array.isArray(records) || records.length === 0) {
        throw new Error("No mitigation records found in this JSON export.");
      }
    }
    if (!Array.isArray(records) || records.length === 0) {
      throw new Error("No mitigation records found in this JSON export.");
    }
    return finalize(records, "json", warnings, { fileName: filename, meta });
  }

  // CSV: the quick export prefixes a "filter,value" metadata block, then a
  // blank line, then the real header row.
  const rows = parseCsv(trimmed).filter((r) => r.some((c) => c.trim() !== ""));
  if (rows.length < 2) throw new Error("That CSV has no data rows.");

  let headerIdx = 0;
  if (rows[0][0]?.trim() === "filter" && rows[0][1]?.trim() === "value") {
    headerIdx = rows.findIndex(
      (r, i) => i > 0 && (r.includes("correlationId") || r.includes("rule")),
    );
    if (headerIdx < 0) throw new Error("Could not find the column header row in this CSV.");
    warnings.push("Filter metadata block detected and skipped.");
  }
  if (rows[headerIdx].includes("column") && rows[headerIdx].includes("description")) {
    throw new Error("That looks like the column schema file — import the data export instead.");
  }

  const headers = rows[headerIdx].map((h) => h.trim());
  let ragged = 0;
  const records: Raw[] = rows.slice(headerIdx + 1).map((r) => {
    if (r.length !== headers.length) ragged++;
    const o: Raw = {};
    headers.forEach((h, i) => {
      o[h] = r[i] ?? "";
    });
    return o;
  });
  if (records.length === 0) throw new Error("That CSV has no data rows.");
  if (ragged > 0) {
    warnings.push(`${ragged} row(s) had a different column count than the header.`);
  }
  if (!filename.toLowerCase().endsWith(".csv")) {
    warnings.push("File parsed as CSV based on its contents.");
  }
  return finalize(records, "csv", warnings, {
    fileName: filename,
    lineOffset: headerIdx + 1,
  });
}


/* ------------------------------------------------------------------ *
 * Error report
 * ------------------------------------------------------------------ */

const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const ERROR_REPORT_COLUMNS = [
  "row",
  "line",
  "level",
  "code",
  "field",
  "message",
  "value",
  "ref",
] as const;

/** CSV report of every per-record warning/error found while importing. */
export function buildErrorReportCsv(result: ImportResult): string {
  const head = [
    ["file", result.fileName ?? ""],
    ["format", result.format],
    ["generatedAt", new Date().toISOString()],
    ["rowsTotal", result.total],
    ["rowsImported", result.entries.length],
    ["rowsSkipped", result.skipped],
    ["rowsWithWarnings", result.warned],
    ["status", buildImportSummary(result).status],
  ].map((r) => r.map(csvCell).join(","));

  const fileNotes = result.warnings.map((w) => ["file", "", "warning", "file-note", "", w, "", ""]);
  const rows = result.issues.map((i) => [
    i.row,
    i.line ?? "",
    i.level,
    i.code,
    i.field ?? "",
    i.message,
    i.value ?? "",
    i.ref ?? "",
  ]);

  return [
    ...head,
    "",
    ERROR_REPORT_COLUMNS.join(","),
    ...[...fileNotes, ...rows].map((r) => r.map(csvCell).join(",")),
  ].join("\n");
}

/** JSON report of every per-record warning/error found while importing. */
export function buildErrorReportJson(result: ImportResult): string {
  return JSON.stringify(
    {
      file: result.fileName ?? null,
      format: result.format,
      generatedAt: new Date().toISOString(),
      summary: {
        rowsTotal: result.total,
        rowsImported: result.entries.length,
        rowsSkipped: result.skipped,
        rowsWithWarnings: result.warned,
        errors: result.issues.filter((i) => i.level === "error").length,
        warnings: result.issues.filter((i) => i.level === "warning").length,
      },
      fileNotes: result.warnings,
      records: buildImportSummary(result).records,
      issues: result.issues,
    },
    null,
    2,
  );
}


/* ------------------------------------------------------------------ *
 * Import summary
 *
 * A file can parse "partially": some rows land in the audit trail while
 * others are skipped or degraded. The summary rolls the per-record
 * issues up into one verdict plus a per-record breakdown.
 * ------------------------------------------------------------------ */

export type ImportRecordReport = {
  row: number;
  line?: number;
  ref?: string;
  imported: boolean;
  errors: ImportIssue[];
  warnings: ImportIssue[];
};

export type ImportSummary = {
  status: "clean" | "partial" | "failed";
  headline: string;
  detail: string;
  total: number;
  imported: number;
  skipped: number;
  warned: number;
  errors: number;
  warnings: number;
  /** Rows that produced at least one warning or error, newest row order. */
  records: ImportRecordReport[];
  /** Issue codes ranked by how often they occurred. */
  topCodes: { code: string; count: number; level: ImportIssueLevel }[];
};

/** Roll per-record issues up into a single import verdict. */
export function buildImportSummary(result: ImportResult): ImportSummary {
  const errors = result.issues.filter((i) => i.level === "error");
  const warnings = result.issues.filter((i) => i.level === "warning");

  const byRow = new Map<number, ImportRecordReport>();
  for (const i of result.issues) {
    let rec = byRow.get(i.row);
    if (!rec) {
      rec = { row: i.row, line: i.line, ref: i.ref, imported: true, errors: [], warnings: [] };
      byRow.set(i.row, rec);
    }
    if (!rec.ref && i.ref) rec.ref = i.ref;
    if (!rec.line && i.line) rec.line = i.line;
    if (i.level === "error") {
      rec.errors.push(i);
      rec.imported = false;
    } else rec.warnings.push(i);
  }
  const records = [...byRow.values()].sort((a, b) => a.row - b.row);

  const codeMap = new Map<string, { code: string; count: number; level: ImportIssueLevel }>();
  for (const i of result.issues) {
    const hit = codeMap.get(i.code);
    if (hit) hit.count++;
    else codeMap.set(i.code, { code: i.code, count: 1, level: i.level });
  }
  const topCodes = [...codeMap.values()].sort((a, b) => b.count - a.count).slice(0, 6);

  const imported = result.entries.length;
  const status: ImportSummary["status"] =
    imported === 0 ? "failed" : result.skipped > 0 || errors.length > 0 ? "partial" : "clean";

  const headline =
    status === "failed"
      ? "No records could be imported"
      : status === "partial"
        ? `Partially imported — ${imported} of ${result.total} record(s)`
        : `All ${imported} record(s) imported cleanly`;

  const bits: string[] = [];
  if (result.skipped > 0) bits.push(`${result.skipped} row(s) skipped`);
  if (errors.length > 0) bits.push(`${errors.length} error(s)`);
  if (warnings.length > 0) bits.push(`${warnings.length} warning(s)`);
  if (result.warned > 0) bits.push(`${result.warned} imported row(s) degraded`);

  return {
    status,
    headline,
    detail: bits.length ? bits.join(" · ") : "No warnings or errors were raised.",
    total: result.total,
    imported,
    skipped: result.skipped,
    warned: result.warned,
    errors: errors.length,
    warnings: warnings.length,
    records,
    topCodes,
  };
}

/** Plain-text summary suitable for pasting into a ticket or chat. */
export function buildImportSummaryText(result: ImportResult): string {
  const s = buildImportSummary(result);
  const lines = [
    `Mitigation import summary`,
    `File: ${result.fileName ?? "(unnamed)"} (${result.format.toUpperCase()})`,
    `Generated: ${new Date().toISOString()}`,
    ``,
    s.headline,
    s.detail,
    ``,
    `Rows in file: ${s.total}`,
    `Imported:     ${s.imported}`,
    `Skipped:      ${s.skipped}`,
    `With warnings:${s.warned}`,
    ``,
  ];
  if (result.warnings.length) {
    lines.push("File notes:", ...result.warnings.map((w) => `  - ${w}`), "");
  }
  if (s.records.length) {
    lines.push("Per-record issues:");
    for (const r of s.records) {
      lines.push(
        `  Row ${r.row}${r.line ? ` (line ${r.line})` : ""}${r.ref ? ` [${r.ref}]` : ""} — ${
          r.imported ? "imported with warnings" : "skipped"
        }`,
      );
      for (const i of [...r.errors, ...r.warnings]) {
        lines.push(`      ${i.level.toUpperCase()} ${i.code}${i.field ? ` (${i.field})` : ""}: ${i.message}`);
      }
    }
  } else {
    lines.push("Per-record issues: none.");
  }
  return lines.join("\n");
}

/* ------------------------------------------------------------------ *
 * Deduplication
 *
 * Imported files often overlap with what is already in the audit trail
 * (re-exported ranges, repeated scheduled exports). Every incoming
 * record gets an identity key; records that already exist are skipped,
 * merged or imported as duplicates depending on the chosen strategy.
 * ------------------------------------------------------------------ */

export type DedupeStrategy = "skip" | "merge" | "duplicate";

export const DEDUPE_LABEL: Record<DedupeStrategy, string> = {
  skip: "Skip duplicates",
  merge: "Merge into existing",
  duplicate: "Import all (keep duplicates)",
};

export const DEDUPE_HINT: Record<DedupeStrategy, string> = {
  skip: "Records already in the audit trail are ignored — nothing existing changes.",
  merge: "Existing records are enriched with any fields the file has and they are missing (outcome, timestamps, revert reason).",
  duplicate: "Every row is imported, even when an identical record already exists.",
};

/**
 * Stable identity for a mitigation record. Prefers the correlation ID +
 * phase (the export's own primary key); falls back to the rule change
 * signature plus timestamp when no correlation ID was exported.
 */
export function dedupeKey(e: TuningLogEntry): string {
  const phase = e.phase ?? "applied";
  if (e.correlationId) return `cid:${e.correlationId}:${phase}`;
  return [
    "sig",
    e.rule,
    e.operator,
    e.oldValue,
    e.newValue,
    phase,
    // Bucket to the second so re-exported timestamps still match.
    Math.floor(e.ts / 1000),
  ].join(":");
}

/** Fill gaps on an existing record from an incoming duplicate. Pure. */
function mergeEntries(existing: TuningLogEntry, incoming: TuningLogEntry): TuningLogEntry {
  const merged: TuningLogEntry = { ...existing };
  const keys = Object.keys(incoming) as (keyof TuningLogEntry)[];
  for (const k of keys) {
    if (k === "id") continue;
    const value = incoming[k];
    if (value === undefined || value === "" || value === null) continue;
    if (merged[k] === undefined || merged[k] === "" || merged[k] === null) {
      (merged as Record<string, unknown>)[k as string] = value;
    }
  }
  // An outcome recorded later always wins over a missing/older one.
  if (incoming.outcome && (!existing.outcome || incoming.outcome.ts > existing.outcome.ts)) {
    merged.outcome = incoming.outcome;
  }
  if (incoming.revertedAt && !existing.revertedAt) {
    merged.revertedAt = incoming.revertedAt;
    merged.revertReason = incoming.revertReason ?? existing.revertReason;
  }
  return merged;
}

export type DedupePlan = {
  strategy: DedupeStrategy;
  /** New records to append to the imported set. */
  add: TuningLogEntry[];
  /** Existing imported records to replace (merge strategy only). */
  replace: TuningLogEntry[];
  /** Incoming records that matched something already present. */
  duplicates: number;
  /** Duplicates that matched a live (non-imported) audit entry. */
  duplicatesInLog: number;
  /** Duplicates found within the file itself. */
  duplicatesInFile: number;
  /** Duplicates that actually changed an existing record when merging. */
  merged: number;
};

/**
 * Resolve an import against what is already loaded.
 *
 * `existing` should contain both the live audit log and any previously
 * imported records — live entries are never modified, only matched.
 */
export function planDedupe(
  incoming: TuningLogEntry[],
  existing: TuningLogEntry[],
  strategy: DedupeStrategy,
): DedupePlan {
  const byKey = new Map<string, TuningLogEntry>();
  for (const e of existing) {
    const k = dedupeKey(e);
    if (!byKey.has(k)) byKey.set(k, e);
  }

  const add: TuningLogEntry[] = [];
  const replaceMap = new Map<string, TuningLogEntry>();
  const seenInFile = new Set<string>();
  let duplicates = 0;
  let duplicatesInLog = 0;
  let duplicatesInFile = 0;
  let merged = 0;

  for (const entry of incoming) {
    const key = dedupeKey(entry);
    const match = replaceMap.get(key) ?? byKey.get(key);
    const inFile = seenInFile.has(key);

    if (!match && !inFile) {
      seenInFile.add(key);
      add.push(entry);
      continue;
    }

    duplicates++;
    if (inFile) duplicatesInFile++;
    else if (match && !isImportedEntry(match)) duplicatesInLog++;

    if (strategy === "duplicate") {
      add.push({ ...entry, id: `${entry.id}-dup${duplicates}` });
      continue;
    }
    if (strategy === "skip") continue;

    // merge
    const target = match ?? add.find((a) => dedupeKey(a) === key);
    if (!target) continue;
    const next = mergeEntries(target, entry);
    if (JSON.stringify(next) === JSON.stringify(target)) continue;
    merged++;
    if (match && !isImportedEntry(match)) {
      // Never mutate live audit entries — keep the enriched copy as an import.
      add.push({ ...next, id: `${IMPORT_PREFIX}merge-${duplicates}-${target.id}` });
    } else {
      const i = add.findIndex((a) => a.id === target.id);
      if (i >= 0) add[i] = next;
      else replaceMap.set(key, next);
    }
  }

  return {
    strategy,
    add,
    replace: [...replaceMap.values()],
    duplicates,
    duplicatesInLog,
    duplicatesInFile,
    merged,
  };
}

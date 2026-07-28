import type { TuningLogEntry } from "@/lib/paper-store";

/* ------------------------------------------------------------------ *
 * Mitigation import
 *
 * Reads a file previously produced by the audit trail exports (quick
 * CSV/JSON, or the decision export with its column schema) and turns it
 * back into read-only audit entries for review.
 * ------------------------------------------------------------------ */

export type ImportResult = {
  entries: TuningLogEntry[];
  /** Rows the parser could not turn into an audit entry. */
  skipped: number;
  /** Non-fatal notes for the user (unknown columns, missing fields, …). */
  warnings: string[];
  format: "csv" | "json";
  /** Metadata found in a JSON export header, when present. */
  meta?: {
    exportedAt?: string;
    recordCount?: number;
    filters?: unknown;
    preset?: string | null;
  };
  range?: { from: number; to: number };
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

/** Map one exported record (either export shape) onto a review-only entry. */
function toEntry(r: Raw, index: number): TuningLogEntry | null {
  const ruleLabel = String(r.rule ?? r.ruleLabel ?? "").trim();
  const ts =
    tsOr(r.timestamp) ??
    tsOr(r.appliedAt) ??
    tsOr(r.previewedAt) ??
    tsOr(r.outcomeAt);
  if (!ruleLabel && !r.correlationId && !r.mitigation) return null;

  const decision = String(r.decision ?? "");
  const phase: "preview" | "applied" =
    r.phase === "preview" || decision === "preview-only" ? "preview" : "applied";

  const outcomeStatus = String(r.outcomeStatus ?? "");
  const hasOutcome = outcomeStatus && outcomeStatus !== "pending";

  const operator = r.operator === "<=" ? "<=" : ">=";

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
  meta?: ImportResult["meta"],
): ImportResult {
  const entries: TuningLogEntry[] = [];
  let skipped = 0;
  records.forEach((r, i) => {
    const e = toEntry(r, i);
    if (e) entries.push(e);
    else skipped++;
  });
  entries.sort((a, b) => b.ts - a.ts);
  const range =
    entries.length > 0
      ? { from: entries[entries.length - 1].ts, to: entries[0].ts }
      : undefined;
  if (skipped > 0) warnings.push(`${skipped} row(s) skipped — no recognisable mitigation fields.`);
  return { entries, skipped, warnings, format, meta, range };
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
    return finalize(records, "json", warnings, meta);
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
  const records: Raw[] = rows.slice(headerIdx + 1).map((r) => {
    const o: Raw = {};
    headers.forEach((h, i) => {
      o[h] = r[i] ?? "";
    });
    return o;
  });
  if (records.length === 0) throw new Error("That CSV has no data rows.");
  if (!filename.toLowerCase().endsWith(".csv")) {
    warnings.push("File parsed as CSV based on its contents.");
  }
  return finalize(records, "csv", warnings);
}

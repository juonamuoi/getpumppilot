import type { TuningLogEntry } from "@/lib/paper-store";
import { dedupeKey } from "@/lib/mitigation-import";

export type FieldDiff = {
  field: string;
  label: string;
  imported: string;
  live: string;
};

export type DiffStatus = "identical" | "changed" | "import-only" | "scope-only";

export type DiffPair = {
  key: string;
  status: DiffStatus;
  imported?: TuningLogEntry;
  live?: TuningLogEntry;
  fields: FieldDiff[];
};

export type DiffSummary = {
  pairs: DiffPair[];
  counts: Record<DiffStatus, number>;
  total: number;
};

const val = (v: unknown) =>
  v === undefined || v === null || v === "" ? "—" : String(v);

const COMPARED: { field: keyof TuningLogEntry | string; label: string; get: (e: TuningLogEntry) => unknown }[] = [
  { field: "ts", label: "Timestamp", get: (e) => new Date(e.ts).toISOString() },
  { field: "phase", label: "Phase", get: (e) => e.phase ?? "applied" },
  { field: "mitigation", label: "Mitigation", get: (e) => e.mitigation },
  { field: "ruleLabel", label: "Rule", get: (e) => e.ruleLabel },
  { field: "operator", label: "Operator", get: (e) => e.operator },
  { field: "oldValue", label: "Old value", get: (e) => e.oldValue },
  { field: "newValue", label: "New value", get: (e) => e.newValue },
  { field: "unit", label: "Unit", get: (e) => e.unit },
  { field: "trigger", label: "Trigger", get: (e) => e.trigger },
  { field: "matchesBefore", label: "Matches before", get: (e) => e.matchesBefore },
  { field: "matchesAfter", label: "Matches after", get: (e) => e.matchesAfter },
  { field: "nearMissBefore", label: "Near-miss before", get: (e) => e.nearMissBefore },
  { field: "nearMissAfter", label: "Near-miss after", get: (e) => e.nearMissAfter },
  { field: "outcomeStatus", label: "Alert outcome", get: (e) => e.outcome?.status ?? "pending" },
  { field: "outcomeMatched", label: "Outcome matches", get: (e) => e.outcome?.matched },
  { field: "outcomeDelivered", label: "Alerts delivered", get: (e) => e.outcome?.delivered },
  { field: "outcomeSymbols", label: "Outcome tokens", get: (e) => e.outcome?.symbols.join(", ") },
  { field: "revertedAt", label: "Reverted at", get: (e) => (e.revertedAt ? new Date(e.revertedAt).toISOString() : undefined) },
];

function fieldDiffs(imported: TuningLogEntry, live: TuningLogEntry): FieldDiff[] {
  const out: FieldDiff[] = [];
  for (const c of COMPARED) {
    const a = val(c.get(imported));
    const b = val(c.get(live));
    if (a !== b) out.push({ field: String(c.field), label: c.label, imported: a, live: b });
  }
  return out;
}

/**
 * Pair imported records against the currently filtered live audit scope using
 * the same stable identity as dedupe, then classify each pair.
 */
export function buildImportDiff(
  imported: TuningLogEntry[],
  scope: TuningLogEntry[],
): DiffSummary {
  const liveByKey = new Map<string, TuningLogEntry>();
  for (const e of scope) {
    const k = dedupeKey(e);
    if (!liveByKey.has(k)) liveByKey.set(k, e);
  }
  const seen = new Set<string>();
  const pairs: DiffPair[] = [];

  for (const imp of imported) {
    const k = dedupeKey(imp);
    seen.add(k);
    const live = liveByKey.get(k);
    if (!live) {
      pairs.push({ key: k, status: "import-only", imported: imp, fields: [] });
      continue;
    }
    const fields = fieldDiffs(imp, live);
    pairs.push({
      key: k,
      status: fields.length === 0 ? "identical" : "changed",
      imported: imp,
      live,
      fields,
    });
  }

  for (const [k, live] of liveByKey) {
    if (seen.has(k)) continue;
    pairs.push({ key: k, status: "scope-only", live, fields: [] });
  }

  pairs.sort((a, b) => (b.imported?.ts ?? b.live?.ts ?? 0) - (a.imported?.ts ?? a.live?.ts ?? 0));

  const counts: Record<DiffStatus, number> = {
    identical: 0,
    changed: 0,
    "import-only": 0,
    "scope-only": 0,
  };
  for (const p of pairs) counts[p.status]++;

  return { pairs, counts, total: pairs.length };
}

export const DIFF_STATUS_LABEL: Record<DiffStatus, string> = {
  identical: "Identical",
  changed: "Differs",
  "import-only": "Only in import",
  "scope-only": "Only in current scope",
};

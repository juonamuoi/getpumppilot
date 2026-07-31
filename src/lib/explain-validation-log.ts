/* ------------------------------------------------------------------ *
 * ExplainFields validation notes.
 *
 * Every Zod failure raised while copying or exporting a "Why" explanation
 * is recorded here as a dedicated audit-trail note, so recurring malformed
 * data can be reviewed by symbol and timestamp instead of vanishing with
 * the toast that reported it.
 *
 * Persisted to localStorage. Notes carry no wallet keys or personal data —
 * only the entry identity, the affected fields and the Zod messages.
 * ------------------------------------------------------------------ */
import { useSyncExternalStore } from "react";

import type { TuningLogEntry } from "@/lib/paper-store";
import { safeExplainFields, sanitizedExplainFields } from "@/lib/mitigation-explain";

/** Where the failure was caught. */
export type ValidationSource = "copy" | "copy-sanitized" | "export" | "bulk-export";

export type ExplainValidationNote = {
  id: string;
  /** When the failure was observed. */
  ts: number;
  /** Timestamp of the audit entry that produced the malformed explanation. */
  entryTs: number;
  entryId: string;
  correlationId?: string;
  source: ValidationSource;
  /** Token symbols attached to the entry's outcome ("—" bucket when none). */
  symbols: string[];
  ruleLabel?: string;
  /** ExplainFields keys that failed validation. */
  invalidFields: string[];
  /** Raw Zod messages, path-prefixed. */
  issues: string[];
};

const KEY = "pp-explain-validation-notes-v1";
const MAX = 300;

/** Bucket used when an entry has no outcome symbols yet. */
export const NO_SYMBOL = "—";

let notes: ExplainValidationNote[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) notes = JSON.parse(raw) as ExplainValidationNote[];
  } catch {
    notes = [];
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(notes.slice(0, MAX)));
  } catch {
    /* quota — keep in memory only */
  }
}

export const SOURCE_LABEL: Record<ValidationSource, string> = {
  copy: "Copy blocked",
  "copy-sanitized": "Sanitized copy",
  export: "Export blocked",
  "bulk-export": "Bulk export",
};

/**
 * Records one validation failure. Repeat failures for the same entry, source
 * and field set are collapsed into the existing note (its timestamp moves
 * forward) so the list stays reviewable.
 */
export function recordValidationNote(
  entry: Pick<TuningLogEntry, "id" | "ts" | "correlationId" | "ruleLabel" | "outcome">,
  source: ValidationSource,
  issues: string[],
  invalidFields?: string[],
): ExplainValidationNote {
  load();
  const ts = Date.now();
  const fields =
    invalidFields ??
    [...new Set(issues.map((i) => i.split(":")[0]?.trim()).filter(Boolean))];
  const symbols = entry.outcome?.symbols?.length ? [...entry.outcome.symbols] : [NO_SYMBOL];

  const key = `${entry.id}|${source}|${[...fields].sort().join(",")}`;
  const existing = notes.find(
    (n) => `${n.entryId}|${n.source}|${[...n.invalidFields].sort().join(",")}` === key,
  );
  if (existing) {
    const updated: ExplainValidationNote = { ...existing, ts, issues, symbols };
    notes = [updated, ...notes.filter((n) => n.id !== existing.id)].slice(0, MAX);
    persist();
    emit();
    return updated;
  }

  const note: ExplainValidationNote = {
    id: `${ts.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    ts,
    entryTs: entry.ts,
    entryId: entry.id,
    correlationId: entry.correlationId,
    source,
    symbols,
    ruleLabel: entry.ruleLabel,
    invalidFields: fields,
    issues,
  };
  notes = [note, ...notes].slice(0, MAX);
  persist();
  emit();
  return note;
}

/** Convenience: validate an entry and record a note only when it fails. */
export function noteIfInvalid(
  entry: TuningLogEntry,
  source: ValidationSource,
): ExplainValidationNote | null {
  const { ok, issues } = safeExplainFields(entry);
  if (ok) return null;
  const { invalidKeys } = sanitizedExplainFields(entry);
  return recordValidationNote(entry, source, issues, invalidKeys);
}

export function getValidationNotes(): ExplainValidationNote[] {
  load();
  return notes;
}

export function clearValidationNotes() {
  notes = [];
  persist();
  emit();
}

export function useValidationNotes(): ExplainValidationNote[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => {
      load();
      return notes;
    },
    () => notes,
  );
}

export type SymbolValidationStat = {
  symbol: string;
  notes: number;
  /** Distinct audit entries affected. */
  entries: number;
  fields: string[];
  firstTs: number;
  lastTs: number;
};

/** Groups notes by token symbol so recurring offenders are obvious. */
export function notesBySymbol(list: ExplainValidationNote[]): SymbolValidationStat[] {
  const map = new Map<string, { notes: ExplainValidationNote[]; entries: Set<string> }>();
  for (const n of list) {
    for (const s of n.symbols.length ? n.symbols : [NO_SYMBOL]) {
      const bucket = map.get(s) ?? { notes: [], entries: new Set<string>() };
      bucket.notes.push(n);
      bucket.entries.add(n.entryId);
      map.set(s, bucket);
    }
  }
  return [...map.entries()]
    .map(([symbol, b]) => ({
      symbol,
      notes: b.notes.length,
      entries: b.entries.size,
      fields: [...new Set(b.notes.flatMap((n) => n.invalidFields))].sort(),
      firstTs: Math.min(...b.notes.map((n) => n.ts)),
      lastTs: Math.max(...b.notes.map((n) => n.ts)),
    }))
    .sort((a, b) => b.notes - a.notes || b.lastTs - a.lastTs);
}

/** Counts how often each ExplainFields key fails. */
export function notesByField(list: ExplainValidationNote[]): { field: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const n of list) {
    for (const f of n.invalidFields) counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([field, count]) => ({ field, count }))
    .sort((a, b) => b.count - a.count || a.field.localeCompare(b.field));
}

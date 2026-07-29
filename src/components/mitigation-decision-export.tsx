import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, FileJson, FileSpreadsheet, FileText, Pencil, Save, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import type { TuningLogEntry } from "@/lib/paper-store";
import { explainFields } from "@/lib/mitigation-explain";

/* ------------------------------------------------------------------ *
 * Mitigation decision export
 *
 * One row per decision (the applied change, or a preview-only review),
 * joined to the confirmation summary that was shown before it was
 * applied — with preview/apply timestamps and correlation IDs.
 * ------------------------------------------------------------------ */

export type MitigationDecisionRow = Record<string, string | number>;

type FieldDef = {
  key: string;
  label: string;
  group: "identity" | "decision" | "confirmation" | "outcome" | "why";
  get: (d: Decision) => string | number;
};

type Decision = {
  applied?: TuningLogEntry;
  preview?: TuningLogEntry;
  primary: TuningLogEntry;
};

const iso = (ts?: number) => (ts ? new Date(ts).toISOString() : "");
const num = (v?: number) => (v == null ? "" : v);
const delta = (b?: number, a?: number) => (b == null || a == null ? "" : a - b);

const FIELDS: FieldDef[] = [
  { key: "correlationId", label: "Correlation ID", group: "identity", get: (d) => d.primary.correlationId ?? "" },
  { key: "decisionId", label: "Entry ID", group: "identity", get: (d) => d.primary.id },
  { key: "decision", label: "Decision", group: "identity", get: (d) => (d.primary.revertedAt ? "reverted" : d.applied ? "applied" : "preview-only") },
  { key: "mitigation", label: "Mitigation", group: "identity", get: (d) => d.primary.mitigation ?? "" },
  { key: "trigger", label: "Trigger", group: "identity", get: (d) => d.primary.trigger ?? "" },

  { key: "rule", label: "Rule", group: "decision", get: (d) => d.primary.ruleLabel },
  { key: "kind", label: "Change type", group: "decision", get: (d) => d.primary.kind ?? "rule" },
  { key: "operator", label: "Operator", group: "decision", get: (d) => d.primary.operator },
  { key: "oldValue", label: "Old value", group: "decision", get: (d) => d.primary.oldValue },
  { key: "newValue", label: "New value", group: "decision", get: (d) => d.primary.newValue },
  { key: "unit", label: "Unit", group: "decision", get: (d) => d.primary.unit },
  { key: "recommendedValue", label: "Recommended value", group: "decision", get: (d) => num(d.primary.recommendedValue) },
  { key: "preset", label: "Preset", group: "decision", get: (d) => d.primary.preset },
  { key: "window", label: "Replay window", group: "decision", get: (d) => d.primary.window ?? "" },
  { key: "scope", label: "Asset scope", group: "decision", get: (d) => d.primary.scope ?? "" },

  { key: "previewedAt", label: "Confirmed (preview) at", group: "confirmation", get: (d) => iso(d.preview?.ts ?? d.applied?.previewedAt) },
  { key: "appliedAt", label: "Applied at", group: "confirmation", get: (d) => iso(d.applied?.appliedAt ?? d.applied?.ts) },
  { key: "matchesBefore", label: "Matches before", group: "confirmation", get: (d) => num(d.primary.matchesBefore) },
  { key: "matchesAfter", label: "Matches after", group: "confirmation", get: (d) => num(d.primary.matchesAfter) },
  { key: "matchesDelta", label: "Matches Δ", group: "confirmation", get: (d) => delta(d.primary.matchesBefore, d.primary.matchesAfter) },
  { key: "nearMissBefore", label: "Near-miss before", group: "confirmation", get: (d) => num(d.primary.nearMissBefore) },
  { key: "nearMissAfter", label: "Near-miss after", group: "confirmation", get: (d) => num(d.primary.nearMissAfter) },
  { key: "nearMissDelta", label: "Near-miss Δ", group: "confirmation", get: (d) => delta(d.primary.nearMissBefore, d.primary.nearMissAfter) },
  { key: "scopeMatchesBefore", label: "Scope matches before", group: "confirmation", get: (d) => num(d.primary.scopeMatchesBefore) },
  { key: "scopeMatchesAfter", label: "Scope matches after", group: "confirmation", get: (d) => num(d.primary.scopeMatchesAfter) },
  { key: "scopeNearMissBefore", label: "Scope near-miss before", group: "confirmation", get: (d) => num(d.primary.scopeNearMissBefore) },
  { key: "scopeNearMissAfter", label: "Scope near-miss after", group: "confirmation", get: (d) => num(d.primary.scopeNearMissAfter) },
  { key: "scopeAssetsAffected", label: "Assets affected", group: "confirmation", get: (d) => num(d.primary.scopeAssetsAffected) },
  { key: "fragilePct", label: "Fragility %", group: "confirmation", get: (d) => num(d.primary.fragilePct) },

  { key: "outcomeStatus", label: "Alert outcome", group: "outcome", get: (d) => d.primary.outcome?.status ?? "pending" },
  { key: "outcomeMatched", label: "Outcome matches", group: "outcome", get: (d) => num(d.primary.outcome?.matched) },
  { key: "outcomeDelivered", label: "Alerts delivered", group: "outcome", get: (d) => num(d.primary.outcome?.delivered) },
  { key: "outcomeSymbols", label: "Outcome tokens", group: "outcome", get: (d) => d.primary.outcome?.symbols.join("|") ?? "" },
  { key: "outcomeChannels", label: "Outcome channels", group: "outcome", get: (d) => d.primary.outcome?.channels.join("|") ?? "" },
  { key: "outcomeAt", label: "Outcome recorded at", group: "outcome", get: (d) => iso(d.primary.outcome?.ts) },
  { key: "revertedAt", label: "Reverted at", group: "outcome", get: (d) => iso(d.primary.revertedAt) },
  { key: "revertReason", label: "Revert reason", group: "outcome", get: (d) => d.primary.revertReason ?? "" },

  { key: "why", label: "Why (plain English)", group: "why", get: (d) => explainFields(d.primary).why },
  { key: "whyChange", label: "Why — rule change", group: "why", get: (d) => explainFields(d.primary).whyChange },
  { key: "whyStrictness", label: "Why — strictness", group: "why", get: (d) => explainFields(d.primary).whyStrictness },
  { key: "whyImpact", label: "Why — expected impact", group: "why", get: (d) => explainFields(d.primary).whyImpact },
  { key: "whyOutcome", label: "Why — outcome", group: "why", get: (d) => explainFields(d.primary).whyOutcome },
  { key: "whyFragility", label: "Why — fragility", group: "why", get: (d) => explainFields(d.primary).whyFragility },
];

const GROUP_LABEL: Record<FieldDef["group"], string> = {
  identity: "Decision identity",
  decision: "Rule change",
  confirmation: "Confirmation summary",
  outcome: "Outcome & rollback",
  why: "Why explanations",
};


const DEFAULT_FIELDS = FIELDS.filter((f) => f.group !== "decision" || !["kind", "preset", "unit"].includes(f.key)).map(
  (f) => f.key,
);

/* --------------------- column schema / definitions --------------------- */

type FieldDoc = { type: "string" | "number" | "timestamp" | "enum"; source: string; description: string };

/** Maps every exportable column back to the underlying mitigation confirmation record. */
const FIELD_DOC: Record<string, FieldDoc> = {
  correlationId: { type: "string", source: "tuningLog.correlationId", description: "Shared ID linking the preview, the applied change, the alert outcome and any revert." },
  decisionId: { type: "string", source: "tuningLog.id", description: "Unique ID of the audit entry this row was generated from." },
  decision: { type: "enum", source: "derived (revertedAt / phase)", description: "applied | preview-only | reverted — the final state of the decision." },
  mitigation: { type: "string", source: "tuningLog.mitigation", description: "Mitigation identifier proposed by the checklist (e.g. relax-threshold)." },
  trigger: { type: "string", source: "tuningLog.trigger", description: "What raised the mitigation: risk bounds breach, manual tuning, or automation." },

  rule: { type: "string", source: "tuningLog.ruleLabel", description: "Human label of the scanner rule that was changed." },
  kind: { type: "enum", source: "tuningLog.kind", description: "Type of change: rule threshold, operator, or scope adjustment." },
  operator: { type: "string", source: "tuningLog.operator", description: "Comparison operator in effect for the rule after the change." },
  oldValue: { type: "string", source: "tuningLog.oldValue", description: "Rule value before the mitigation was applied." },
  newValue: { type: "string", source: "tuningLog.newValue", description: "Rule value after the mitigation was applied." },
  unit: { type: "string", source: "tuningLog.unit", description: "Unit of the rule value (%, USD, score points, etc.)." },
  recommendedValue: { type: "number", source: "tuningLog.recommendedValue", description: "Value the tuning engine recommended, which may differ from what you applied." },
  preset: { type: "enum", source: "tuningLog.preset", description: "Tuning preset used: conservative, balanced, or aggressive." },
  window: { type: "string", source: "tuningLog.window", description: "Replay window the confirmation preview was computed over." },
  scope: { type: "string", source: "tuningLog.scope", description: "Asset scope the change was limited to (empty = all scanned assets)." },

  previewedAt: { type: "timestamp", source: "preview.ts / applied.previewedAt", description: "ISO time the confirmation preview was generated and reviewed." },
  appliedAt: { type: "timestamp", source: "applied.appliedAt / applied.ts", description: "ISO time the change was actually applied (blank for preview-only)." },
  matchesBefore: { type: "number", source: "tuningLog.matchesBefore", description: "Assets matching the rule set in the preview, before the change." },
  matchesAfter: { type: "number", source: "tuningLog.matchesAfter", description: "Assets matching the rule set in the preview, after the change." },
  matchesDelta: { type: "number", source: "derived (after - before)", description: "Net change in matched assets shown on the confirmation screen." },
  nearMissBefore: { type: "number", source: "tuningLog.nearMissBefore", description: "Assets within near-miss slack of the thresholds, before the change." },
  nearMissAfter: { type: "number", source: "tuningLog.nearMissAfter", description: "Assets within near-miss slack of the thresholds, after the change." },
  nearMissDelta: { type: "number", source: "derived (after - before)", description: "Net change in near-miss assets — the fragility signal you confirmed against." },
  scopeMatchesBefore: { type: "number", source: "tuningLog.scopeMatchesBefore", description: "Matches before the change, counted only within the selected asset scope." },
  scopeMatchesAfter: { type: "number", source: "tuningLog.scopeMatchesAfter", description: "Matches after the change, counted only within the selected asset scope." },
  scopeNearMissBefore: { type: "number", source: "tuningLog.scopeNearMissBefore", description: "Near-misses before the change, within the selected asset scope." },
  scopeNearMissAfter: { type: "number", source: "tuningLog.scopeNearMissAfter", description: "Near-misses after the change, within the selected asset scope." },
  scopeAssetsAffected: { type: "number", source: "tuningLog.scopeAssetsAffected", description: "Number of assets whose match status changed inside the scope." },
  fragilePct: { type: "number", source: "tuningLog.fragilePct", description: "Share of matches sitting close to a threshold after the change (higher = more fragile)." },

  outcomeStatus: { type: "enum", source: "tuningLog.outcome.status", description: "alerts-fired | no-matches | channels-muted | pending — what the rules did after the change." },
  outcomeMatched: { type: "number", source: "tuningLog.outcome.matched", description: "Assets that actually matched once the changed rules ran live." },
  outcomeDelivered: { type: "number", source: "tuningLog.outcome.delivered", description: "Alert notifications successfully delivered for those matches." },
  outcomeSymbols: { type: "string", source: "tuningLog.outcome.symbols", description: "Pipe-separated token symbols involved in the outcome." },
  outcomeChannels: { type: "string", source: "tuningLog.outcome.channels", description: "Pipe-separated delivery channels used (email, push, in-app)." },
  outcomeAt: { type: "timestamp", source: "tuningLog.outcome.ts", description: "ISO time the outcome was recorded after the change took effect." },
  revertedAt: { type: "timestamp", source: "tuningLog.revertedAt", description: "ISO time the change was rolled back, if it was reverted." },
  revertReason: { type: "string", source: "tuningLog.revertReason", description: "Reason captured at rollback time (manual undo, risk bounds breach, etc.)." },

  why: { type: "string", source: "derived (explainOutcome)", description: "Full plain-English explanation of what changed, why, and what it did." },
  whyChange: { type: "string", source: "derived (rule + values)", description: "Plain-English sentence describing the threshold move." },
  whyStrictness: { type: "enum", source: "derived (operator + direction)", description: "loosened | tightened | unchanged — direction of the filter change." },
  whyImpact: { type: "string", source: "derived (match/near-miss deltas)", description: "Plain-English expected impact on matches and near-misses." },
  whyOutcome: { type: "string", source: "derived (outcome)", description: "Plain-English account of what the alert run actually did." },
  whyFragility: { type: "string", source: "derived (fragilePct)", description: "Plain-English fragility read for the resulting rule set." },
};


export type SchemaRow = {
  column: string;
  label: string;
  group: string;
  type: string;
  source: string;
  description: string;
};

/** Build the column dictionary for exactly the fields included in an export. */
export function buildSchemaRows(selectedKeys: string[]): SchemaRow[] {
  return FIELDS.filter((f) => selectedKeys.includes(f.key)).map((f) => {
    const doc = FIELD_DOC[f.key];
    return {
      column: f.key,
      label: f.label,
      group: GROUP_LABEL[f.group],
      type: doc?.type ?? "string",
      source: doc?.source ?? "",
      description: doc?.description ?? "",
    };
  });
}


/** Pair each applied mitigation with the preview it was confirmed against. */
export function buildDecisions(log: TuningLogEntry[]): Decision[] {
  const mitigations = log.filter((e) => e.source === "mitigation" && !!e.mitigation);
  const previews = mitigations.filter((e) => e.phase === "preview");
  const applied = mitigations.filter((e) => e.phase !== "preview");
  const usedPreviewIds = new Set<string>();

  const decisions: Decision[] = applied.map((a) => {
    const preview =
      previews.find((p) => p.id === a.previewId) ??
      (a.correlationId ? previews.find((p) => p.correlationId === a.correlationId) : undefined);
    if (preview) usedPreviewIds.add(preview.id);
    return { applied: a, preview, primary: a };
  });

  previews
    .filter((p) => !usedPreviewIds.has(p.id))
    .forEach((p) => decisions.push({ preview: p, primary: p }));

  return decisions.sort((a, b) => b.primary.ts - a.primary.ts);
}

function toCsv(rows: MitigationDecisionRow[]) {
  const headers = Object.keys(rows[0]);
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(",")),
  ].join("\n");
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------ presets ------------------------------ */

const PRESETS_KEY = "pumppilot_export_presets";

/**
 * Version of the exportable column schema. Bump this whenever FIELDS gains,
 * renames or removes columns so saved presets can be migrated forward.
 *
 *  v1 — original decision/confirmation/outcome columns
 *  v2 — added the "Why explanations" group + scope columns; renamed nothing
 */
export const EXPORT_SCHEMA_VERSION = 2;

/** Minimum schema version a consumer must understand to read current files. */
export const EXPORT_SCHEMA_MIN_COMPATIBLE = 1;

/** Human-readable compatibility contract embedded in every export payload. */
export const EXPORT_SCHEMA_COMPATIBILITY = `Schema v${EXPORT_SCHEMA_VERSION} (backward compatible with v${EXPORT_SCHEMA_MIN_COMPATIBLE}+). Columns are additive: new versions may append columns, so parse by column name and ignore unknown names. Removed columns are dropped, never repurposed. Presets saved against older versions are migrated automatically on load.`;

export type ExportPreset<F = unknown> = {
  id: string;
  name: string;
  fields: string[];
  includePreviewOnly: boolean;
  /** Snapshot of the audit-trail filter scope active when the preset was saved. */
  filters?: F;
  savedAt: number;
  /** Schema version the field list was saved against. */
  schemaVersion?: number;
  /** Set when the preset was upgraded from an older schema version. */
  migratedFrom?: number;
  migratedAt?: number;
};

/** Columns renamed between schema versions, applied oldest → newest. */
const FIELD_RENAMES: Record<number, Record<string, string>> = {
  1: {},
};

/** Columns added in each version, auto-selected when a preset is migrated. */
const FIELDS_ADDED_IN: Record<number, string[]> = {
  2: FIELDS.filter((f) => f.group === "why").map((f) => f.key),
};

/** Brings one preset's field list up to EXPORT_SCHEMA_VERSION. */
export function migratePreset<F>(preset: ExportPreset<F>): { preset: ExportPreset<F>; changed: boolean } {
  const from = typeof preset.schemaVersion === "number" ? preset.schemaVersion : 1;
  let fields = [...preset.fields];

  for (let v = from; v < EXPORT_SCHEMA_VERSION; v++) {
    const renames = FIELD_RENAMES[v] ?? {};
    fields = fields.map((k) => renames[k] ?? k);
    for (const added of FIELDS_ADDED_IN[v + 1] ?? []) {
      if (!fields.includes(added)) fields.push(added);
    }
  }

  // Drop columns that no longer exist, keeping the saved order.
  const known = fields.filter((k) => FIELDS.some((f) => f.key === k));
  const changed =
    from !== EXPORT_SCHEMA_VERSION ||
    known.length !== preset.fields.length ||
    known.some((k, i) => k !== preset.fields[i]);

  if (!changed) return { preset: { ...preset, schemaVersion: EXPORT_SCHEMA_VERSION }, changed: false };

  return {
    preset: {
      ...preset,
      fields: known,
      schemaVersion: EXPORT_SCHEMA_VERSION,
      migratedFrom: from,
      migratedAt: Date.now(),
    },
    changed: true,
  };
}

/** Migrates a whole list, reporting how many presets were upgraded. */
export function migratePresets<F>(list: ExportPreset<F>[]): { presets: ExportPreset<F>[]; migrated: string[] } {
  const migrated: string[] = [];
  const presets = list.map((p) => {
    const res = migratePreset(p);
    if (res.changed) migrated.push(res.preset.name);
    return res.preset;
  });
  return { presets, migrated };
}

function loadPresets(): ExportPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PRESETS_KEY);
    return raw ? (JSON.parse(raw) as ExportPreset[]) : [];
  } catch {
    return [];
  }
}


/* ------------------ last-used export configuration ------------------- */

const LAST_USED_KEY = "pumppilot_export_last_used";

type LastUsedExport = {
  presetId: string | null;
  presetName?: string;
  fields: string[];
  includePreviewOnly: boolean;
  includeSchema: boolean;
  savedAt: number;
};

function loadLastUsed(): LastUsedExport | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_USED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastUsedExport;
    const fields = Array.isArray(parsed.fields)
      ? parsed.fields.filter((k) => FIELDS.some((f) => f.key === k))
      : [];
    if (fields.length === 0) return null;
    return {
      presetId: parsed.presetId ?? null,
      presetName: parsed.presetName,
      fields,
      includePreviewOnly: parsed.includePreviewOnly !== false,
      includeSchema: parsed.includeSchema !== false,
      savedAt: parsed.savedAt ?? 0,
    };
  } catch {
    return null;
  }
}

function saveLastUsed(next: Omit<LastUsedExport, "savedAt">) {
  try {
    window.localStorage.setItem(LAST_USED_KEY, JSON.stringify({ ...next, savedAt: Date.now() }));
  } catch {
    /* storage unavailable — keep the in-memory selection */
  }
}

export function MitigationDecisionExport<F,>({
  log,
  label = "Export decisions",
  filters,
  onApplyFilters,
}: {
  log: TuningLogEntry[];
  label?: string;
  /** Current filter scope, stored with a preset so it can be restored. */
  filters?: F;
  /** Called when a preset with a stored filter scope is applied. */
  onApplyFilters?: (filters: F) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(DEFAULT_FIELDS);
  const [includePreviewOnly, setIncludePreviewOnly] = useState(true);
  const [includeSchema, setIncludeSchema] = useState(true);
  const [presets, setPresets] = useState<ExportPreset<F>[]>(() => loadPresets() as ExportPreset<F>[]);
  const [presetName, setPresetName] = useState("");
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [restored, setRestored] = useState<string | null>(null);
  const hydrated = useRef(false);
  const presetFileRef = useRef<HTMLInputElement>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [migratedNames, setMigratedNames] = useState<string[]>([]);

  // Restore the last-used export configuration after hydration.
  useEffect(() => {
    const last = loadLastUsed();
    if (last) {
      setSelected(last.fields);
      setIncludePreviewOnly(last.includePreviewOnly);
      setIncludeSchema(last.includeSchema);
      setActivePreset(last.presetId);
      setRestored(last.presetName ?? "Last used export settings");
    }
    // Upgrade any presets saved against an older export schema.
    const { presets: upgraded, migrated } = migratePresets(loadPresets() as ExportPreset<F>[]);
    if (migrated.length > 0) {
      setPresets(upgraded);
      try {
        window.localStorage.setItem(PRESETS_KEY, JSON.stringify(upgraded));
      } catch {}
      setMigratedNames(migrated);
    }
    hydrated.current = true;
  }, []);

  // Auto-save the configuration so it becomes the default next time.
  useEffect(() => {
    if (!hydrated.current) return;
    if (selected.length === 0) return;
    const name = presets.find((p) => p.id === activePreset)?.name;
    saveLastUsed({ presetId: activePreset, presetName: name, fields: selected, includePreviewOnly, includeSchema });
  }, [selected, includePreviewOnly, includeSchema, activePreset, presets]);

  const persistPresets = (next: ExportPreset<F>[]) => {
    setPresets(next);
    try {
      window.localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
    } catch {}
  };


  const savePreset = () => {
    const name = presetName.trim();
    if (!name) {
      toast.error("Name your export preset first");
      return;
    }
    if (selected.length === 0) {
      toast.error("Select at least one field to save");
      return;
    }
    const existing = presets.find((p) => p.name.toLowerCase() === name.toLowerCase());
    const preset: ExportPreset<F> = {
      id: existing?.id ?? `${Date.now()}`,
      name,
      fields: selected,
      includePreviewOnly,
      filters,
      savedAt: Date.now(),
      schemaVersion: EXPORT_SCHEMA_VERSION,
    };
    persistPresets(existing ? presets.map((p) => (p.id === existing.id ? preset : p)) : [...presets, preset]);
    setActivePreset(preset.id);
    setPresetName("");
    toast.success(existing ? `Updated preset "${name}"` : `Saved preset "${name}"`, {
      description: `${selected.length} fields${filters ? " · filter scope included" : ""}`,
    });
  };

  const applyPreset = (p: ExportPreset<F>) => {
    setSelected(p.fields.filter((k) => FIELDS.some((f) => f.key === k)));
    setIncludePreviewOnly(p.includePreviewOnly);
    setActivePreset(p.id);
    if (p.filters && onApplyFilters) onApplyFilters(p.filters);
    toast.success(`Applied preset "${p.name}"`, {
      description: p.filters && onApplyFilters ? "Fields, toggle and filter scope restored" : "Fields and toggle restored",
    });
  };

  const commitRename = (p: ExportPreset<F>) => {
    const name = renameValue.trim();
    setRenamingId(null);
    if (!name || name === p.name) return;
    if (presets.some((o) => o.id !== p.id && o.name.toLowerCase() === name.toLowerCase())) {
      toast.error(`A preset named "${name}" already exists`);
      return;
    }
    persistPresets(presets.map((o) => (o.id === p.id ? { ...o, name } : o)));
    toast.success(`Renamed to "${name}"`);
  };

  const duplicatePreset = (p: ExportPreset<F>) => {
    const base = `${p.name} copy`;
    let name = base;
    let n = 2;
    while (presets.some((o) => o.name.toLowerCase() === name.toLowerCase())) name = `${base} ${n++}`;
    const copy: ExportPreset<F> = {
      ...p,
      id: `${Date.now()}`,
      name,
      savedAt: Date.now(),
      schemaVersion: EXPORT_SCHEMA_VERSION,
    };
    persistPresets([...presets, copy]);
    setActivePreset(copy.id);
    setRenamingId(copy.id);
    setRenameValue(name);
    toast.success(`Duplicated as "${name}"`, { description: "Rename it inline to finish." });
  };

  const deletePreset = (id: string) => {
    persistPresets(presets.filter((p) => p.id !== id));
    if (activePreset === id) setActivePreset(null);
  };

  /* --------------- preset portability (JSON export/import) --------------- */

  const exportPresets = () => {
    if (presets.length === 0) {
      toast.error("No presets to export yet");
      return;
    }
    const payload = {
      kind: "pumppilot.mitigation-export-presets",
      version: 1,
      schemaVersion: EXPORT_SCHEMA_VERSION,
      minCompatibleSchemaVersion: EXPORT_SCHEMA_MIN_COMPATIBLE,
      compatibility: EXPORT_SCHEMA_COMPATIBILITY,
      exportedAt: new Date().toISOString(),
      presets,
    };
    saveBlob(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
      `mitigation-export-presets-${new Date().toISOString().slice(0, 10)}.json`,
    );
    toast.success(`Exported ${presets.length} preset${presets.length === 1 ? "" : "s"}`, {
      description: "Import this file in another environment to restore them.",
    });
  };

  const importPresets = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const list = Array.isArray(parsed)
        ? parsed
        : (parsed as { presets?: unknown }).presets;
      if (!Array.isArray(list)) throw new Error("No presets array found in file");

      const valid: ExportPreset<F>[] = [];
      let skipped = 0;
      for (const raw of list) {
        const p = raw as Partial<ExportPreset<F>>;
        const fields = Array.isArray(p.fields) ? p.fields.filter((k) => FIELDS.some((f) => f.key === k)) : [];
        if (typeof p.name !== "string" || !p.name.trim() || fields.length === 0) {
          skipped += 1;
          continue;
        }
        valid.push({
          id: typeof p.id === "string" ? p.id : `${Date.now()}-${valid.length}`,
          name: p.name.trim(),
          fields,
          includePreviewOnly: p.includePreviewOnly !== false,
          filters: p.filters,
          savedAt: typeof p.savedAt === "number" ? p.savedAt : Date.now(),
          schemaVersion: typeof p.schemaVersion === "number" ? p.schemaVersion : 1,
        });
      }
      if (valid.length === 0) {
        toast.error("No valid presets in that file", {
          description: skipped ? `${skipped} entr${skipped === 1 ? "y" : "ies"} were unreadable.` : undefined,
        });
        return;
      }

      const { presets: upgraded, migrated } = migratePresets(valid);
      valid.length = 0;
      valid.push(...upgraded);
      if (migrated.length > 0) setMigratedNames(migrated);

      // Merge by name: an imported preset replaces a local one with the same name.
      const byName = new Map(presets.map((p) => [p.name.toLowerCase(), p]));
      let replaced = 0;
      for (const p of valid) {
        const key = p.name.toLowerCase();
        const existing = byName.get(key);
        if (existing) replaced += 1;
        byName.set(key, { ...p, id: existing?.id ?? p.id });
      }
      persistPresets([...byName.values()]);
      toast.success(`Imported ${valid.length} preset${valid.length === 1 ? "" : "s"}`, {
        description: [
          replaced ? `${replaced} updated by name` : null,
          skipped ? `${skipped} skipped` : null,
        ]
          .filter(Boolean)
          .join(" · ") || "Added to your saved presets.",
      });
    } catch (err) {
      toast.error("Could not import presets", {
        description: err instanceof Error ? err.message : "The file is not valid JSON.",
      });
    }
  };


  const decisions = useMemo(() => {
    const all = buildDecisions(log);
    return includePreviewOnly ? all : all.filter((d) => !!d.applied);
  }, [log, includePreviewOnly]);


  const rows = (): MitigationDecisionRow[] =>
    decisions.map((d) => {
      const row: MitigationDecisionRow = {};
      FIELDS.filter((f) => selected.includes(f.key)).forEach((f) => {
        row[f.key] = f.get(d);
      });
      return row;
    });

  const schemaRows = () => buildSchemaRows(selected);

  const downloadSchema = (kind: "csv" | "json", stamp = new Date().toISOString().replace(/[:.]/g, "-")) => {
    const schema = schemaRows();
    if (schema.length === 0) {
      toast.error("Select at least one field first");
      return;
    }
    if (kind === "json") {
      const payload = {
        schemaVersion: EXPORT_SCHEMA_VERSION,
        minCompatibleSchemaVersion: EXPORT_SCHEMA_MIN_COMPATIBLE,
        compatibility: EXPORT_SCHEMA_COMPATIBILITY,
        generatedAt: new Date().toISOString(),
        appliesTo: `mitigation-decisions-${stamp}.${kind === "json" ? "json" : "csv"}`,
        columnCount: schema.length,
        note: "Column dictionary for PumpPilot AI mitigation decision exports. 'source' maps each column back to the underlying mitigation confirmation record.",
        columns: schema,
      };
      saveBlob(
        new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
        `mitigation-decisions-schema-${stamp}.json`,
      );
    } else {
      const versioned = schema.map((row) => ({
        schemaVersion: EXPORT_SCHEMA_VERSION,
        minCompatibleSchemaVersion: EXPORT_SCHEMA_MIN_COMPATIBLE,
        compatibility: EXPORT_SCHEMA_COMPATIBILITY,
        ...(row as Record<string, string | number>),
      }));
      saveBlob(
        new Blob([toCsv(versioned as unknown as MitigationDecisionRow[])], { type: "text/csv" }),
        `mitigation-decisions-schema-${stamp}.csv`,
      );
    }
  };

  const download = (kind: "csv" | "json") => {
    if (decisions.length === 0) {
      toast.error("No mitigation decisions to export yet");
      return;
    }
    if (selected.length === 0) {
      toast.error("Select at least one field to export");
      return;
    }
    const data = rows();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    if (kind === "json") {
      const preset = presets.find((p) => p.id === activePreset);
      const payload = {
        schemaVersion: EXPORT_SCHEMA_VERSION,
        minCompatibleSchemaVersion: EXPORT_SCHEMA_MIN_COMPATIBLE,
        compatibility: EXPORT_SCHEMA_COMPATIBILITY,
        exportedAt: new Date().toISOString(),
        recordCount: data.length,
        fields: selected,
        includesPreviewOnly: includePreviewOnly,
        preset: preset
          ? {
              name: preset.name,
              savedAt: new Date(preset.savedAt).toISOString(),
              schemaVersion: preset.schemaVersion ?? 1,
              migratedFrom: preset.migratedFrom ?? null,
            }
          : null,
        filters: filters ?? null,
        schema: schemaRows(),
        note: "PumpPilot AI mitigation decisions — simulated/demo data.",
        decisions: data,
      };
      saveBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `mitigation-decisions-${stamp}.json`);

    } else {
      saveBlob(new Blob([toCsv(data)], { type: "text/csv" }), `mitigation-decisions-${stamp}.csv`);
    }
    if (includeSchema) downloadSchema(kind, stamp);
    toast.success(`Exported ${data.length} decision${data.length === 1 ? "" : "s"} as ${kind.toUpperCase()}`, {
      description: includeSchema
        ? `${selected.length} fields · column schema file included`
        : `${selected.length} fields · timestamps and correlation IDs included`,
    });
    setOpen(false);
  };


  const groups: FieldDef["group"][] = ["identity", "decision", "confirmation", "outcome", "why"];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
          <Download className="h-3.5 w-3.5" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Export mitigation decisions</DialogTitle>
          <DialogDescription>
            Each row is one decision joined to the confirmation summary you reviewed, with preview
            and apply timestamps plus correlation IDs.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 rounded-md border border-border/60 bg-muted/10 p-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Saved export presets
            </p>
            <span className="text-[10px] text-muted-foreground">
              Schema v{EXPORT_SCHEMA_VERSION} · fields · preview-only toggle{filters ? " · filter scope" : ""}
            </span>
          </div>
          {restored && (
            <p className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
              <Badge variant="outline" className="h-4 px-1 text-[9px] uppercase">
                Restored
              </Badge>
              Loaded your last-used export settings{restored === "Last used export settings" ? "" : ` from "${restored}"`}.
              <button
                type="button"
                className="underline hover:text-foreground"
                onClick={() => {
                  setSelected(DEFAULT_FIELDS);
                  setIncludePreviewOnly(true);
                  setIncludeSchema(true);
                  setActivePreset(null);
                  setRestored(null);
                }}
              >
                Reset to defaults
              </button>
            </p>
          )}
          {migratedNames.length > 0 && (
            <p className="flex flex-wrap items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-muted-foreground">
              <Badge variant="outline" className="h-4 px-1 text-[9px] uppercase">
                Migrated
              </Badge>
              {migratedNames.length} preset{migratedNames.length === 1 ? "" : "s"} upgraded to schema v
              {EXPORT_SCHEMA_VERSION} ({migratedNames.join(", ")}) — new columns were added and removed ones dropped.
              <button
                type="button"
                className="underline hover:text-foreground"
                onClick={() => setMigratedNames([])}
              >
                Dismiss
              </button>
            </p>
          )}
          {presets.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              No presets yet — configure your export below, then name and save it.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <span
                  key={p.id}
                  className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] ${
                    activePreset === p.id ? "border-primary/60 bg-primary/10" : "border-border/60 bg-muted/20"
                  }`}
                >
                  {renamingId === p.id ? (
                    <Input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => commitRename(p)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitRename(p);
                        }
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      aria-label={`Rename preset ${p.name}`}
                      className="h-5 w-40 px-1 py-0 text-[11px]"
                    />
                  ) : (
                    <>
                      <button type="button" className="hover:underline" onClick={() => applyPreset(p)}>
                        {p.name}
                      </button>
                      <span className="text-muted-foreground">({p.fields.length})</span>
                      <Badge
                        variant="outline"
                        title={
                          p.migratedFrom
                            ? `Migrated from schema v${p.migratedFrom} on ${new Date(p.migratedAt ?? p.savedAt).toLocaleString()}`
                            : `Saved against schema v${p.schemaVersion ?? 1}`
                        }
                        className="h-4 px-1 text-[9px]"
                      >
                        v{p.schemaVersion ?? 1}
                        {p.migratedFrom ? " ↑" : ""}
                      </Badge>
                      <button
                        type="button"
                        aria-label={`Rename preset ${p.name}`}
                        title="Rename"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setRenamingId(p.id);
                          setRenameValue(p.name);
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Duplicate preset ${p.name}`}
                        title="Duplicate"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => duplicatePreset(p)}
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    aria-label={`Delete preset ${p.name}`}
                    title="Delete"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => deletePreset(p.id)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Input
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Preset name (e.g. Weekly compliance export)"
              className="h-8 text-xs"
            />
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={savePreset}>
              <Save className="h-3.5 w-3.5" /> Save preset
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-2">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Move between environments</span>
            <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-[11px]" onClick={exportPresets}>
              <FileJson className="h-3.5 w-3.5" /> Export presets (JSON)
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 text-[11px]"
              onClick={() => presetFileRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" /> Import presets
            </Button>
            <input
              ref={presetFileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void importPresets(file);
              }}
            />
          </div>
        </div>


        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border/60 bg-muted/20 p-3 text-xs">

          <Badge variant="secondary" className="text-[10px]">
            {decisions.length} decision{decisions.length === 1 ? "" : "s"}
          </Badge>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={includePreviewOnly}
              onCheckedChange={(v) => setIncludePreviewOnly(v === true)}
            />
            Include preview-only reviews (not applied)
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={includeSchema} onCheckedChange={(v) => setIncludeSchema(v === true)} />
            Include column schema file
          </label>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 text-[11px]"
            onClick={() => downloadSchema("csv")}
          >
            <FileText className="h-3.5 w-3.5" /> Schema only
          </Button>

          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setSelected(FIELDS.map((f) => f.key))}>
              Select all
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setSelected([])}>
              Clear
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setSelected(DEFAULT_FIELDS)}>
              Reset
            </Button>
          </div>
        </div>

        <ScrollArea className="max-h-[320px] pr-3">
          <div className="space-y-4">
            {groups.map((g) => (
              <div key={g}>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {GROUP_LABEL[g]}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {FIELDS.filter((f) => f.group === g).map((f) => (
                    <label key={f.key} className="flex items-center gap-2 text-xs">
                      <Checkbox
                        checked={selected.includes(f.key)}
                        onCheckedChange={(v) =>
                          setSelected((prev) =>
                            v === true ? [...prev, f.key] : prev.filter((k) => k !== f.key),
                          )
                        }
                      />
                      <span>{f.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 sm:justify-between">
          <Label className="text-[11px] font-normal text-muted-foreground">
            {selected.length} field{selected.length === 1 ? "" : "s"} selected
          </Label>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => download("csv")}>
              <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => download("json")}>
              <FileJson className="h-3.5 w-3.5" /> JSON
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

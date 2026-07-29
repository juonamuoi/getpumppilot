import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileJson, FileSpreadsheet, FileText, Save, X } from "lucide-react";
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

export type ExportPreset<F = unknown> = {
  id: string;
  name: string;
  fields: string[];
  includePreviewOnly: boolean;
  /** Snapshot of the audit-trail filter scope active when the preset was saved. */
  filters?: F;
  savedAt: number;
};

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

  const deletePreset = (id: string) => {
    persistPresets(presets.filter((p) => p.id !== id));
    if (activePreset === id) setActivePreset(null);
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
      saveBlob(
        new Blob([toCsv(schema as unknown as MitigationDecisionRow[])], { type: "text/csv" }),
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
        exportedAt: new Date().toISOString(),
        recordCount: data.length,
        fields: selected,
        includesPreviewOnly: includePreviewOnly,
        preset: preset ? { name: preset.name, savedAt: new Date(preset.savedAt).toISOString() } : null,
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
              Fields · preview-only toggle{filters ? " · filter scope" : ""}
            </span>
          </div>
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
                  <button type="button" className="hover:underline" onClick={() => applyPreset(p)}>
                    {p.name}
                  </button>
                  <span className="text-muted-foreground">({p.fields.length})</span>
                  <button
                    type="button"
                    aria-label={`Delete preset ${p.name}`}
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

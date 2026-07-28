import { useMemo, useState } from "react";
import { Download, FileJson, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  group: "identity" | "decision" | "confirmation" | "outcome";
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
];

const GROUP_LABEL: Record<FieldDef["group"], string> = {
  identity: "Decision identity",
  decision: "Rule change",
  confirmation: "Confirmation summary",
  outcome: "Outcome & rollback",
};

const DEFAULT_FIELDS = FIELDS.filter((f) => f.group !== "decision" || !["kind", "preset", "unit"].includes(f.key)).map(
  (f) => f.key,
);

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

export function MitigationDecisionExport({
  log,
  label = "Export decisions",
}: {
  log: TuningLogEntry[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(DEFAULT_FIELDS);
  const [includePreviewOnly, setIncludePreviewOnly] = useState(true);

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
      const payload = {
        exportedAt: new Date().toISOString(),
        recordCount: data.length,
        fields: selected,
        includesPreviewOnly: includePreviewOnly,
        note: "PumpPilot AI mitigation decisions — simulated/demo data.",
        decisions: data,
      };
      saveBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `mitigation-decisions-${stamp}.json`);
    } else {
      saveBlob(new Blob([toCsv(data)], { type: "text/csv" }), `mitigation-decisions-${stamp}.csv`);
    }
    toast.success(`Exported ${data.length} decision${data.length === 1 ? "" : "s"} as ${kind.toUpperCase()}`, {
      description: `${selected.length} fields · timestamps and correlation IDs included`,
    });
    setOpen(false);
  };

  const groups: FieldDef["group"][] = ["identity", "decision", "confirmation", "outcome"];

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

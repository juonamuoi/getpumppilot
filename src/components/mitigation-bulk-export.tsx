import { useMemo, useState } from "react";
import { Download, FileJson, FileSpreadsheet, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
 * Bulk export — current filtered scope only
 *
 * Exports exactly the rows visible under the active audit-trail filters,
 * with correlation IDs and time-range columns offered as selectable
 * columns (selected by default).
 * ------------------------------------------------------------------ */

export type BulkExportScope = {
  quickSearch: string;
  outcome: string;
  timeRange: string;
  from: string | null;
  to: string;
  tokens: string[] | string;
  wallets: string[] | string;
  alertTypes: string[] | string;
  correlationIds: string[] | string;
  includePreviews: boolean;
};

type Ctx = { entry: TuningLogEntry; scope: BulkExportScope; wallets: string[] };

type Col = {
  key: string;
  label: string;
  group: "identity" | "time" | "change" | "outcome";
  get: (c: Ctx) => string | number;
};

const iso = (ts?: number) => (ts ? new Date(ts).toISOString() : "");
const list = (v: string[] | string) => (Array.isArray(v) ? v.join("|") : v);

const COLUMNS: Col[] = [
  { key: "correlationId", label: "Correlation ID", group: "identity", get: (c) => c.entry.correlationId ?? "" },
  { key: "entryId", label: "Entry ID", group: "identity", get: (c) => c.entry.id },
  { key: "phase", label: "Phase", group: "identity", get: (c) => c.entry.phase ?? "applied" },
  { key: "mitigation", label: "Mitigation", group: "identity", get: (c) => c.entry.mitigation ?? "" },
  { key: "trigger", label: "Trigger", group: "identity", get: (c) => c.entry.trigger ?? "" },
  { key: "wallets", label: "Wallets", group: "identity", get: (c) => c.wallets.join("|") },

  { key: "timestamp", label: "Entry timestamp (ISO)", group: "time", get: (c) => iso(c.entry.ts) },
  { key: "timestampEpoch", label: "Entry timestamp (epoch ms)", group: "time", get: (c) => c.entry.ts },
  { key: "previewedAt", label: "Previewed at", group: "time", get: (c) => iso(c.entry.previewedAt) },
  { key: "appliedAt", label: "Applied at", group: "time", get: (c) => iso(c.entry.appliedAt) },
  { key: "revertedAt", label: "Reverted at", group: "time", get: (c) => iso(c.entry.revertedAt) },
  { key: "rangeLabel", label: "Filter range label", group: "time", get: (c) => c.scope.timeRange },
  { key: "rangeFrom", label: "Filter range from", group: "time", get: (c) => c.scope.from ?? "" },
  { key: "rangeTo", label: "Filter range to", group: "time", get: (c) => c.scope.to },
  {
    key: "ageMinutes",
    label: "Age at export (min)",
    group: "time",
    get: (c) => Math.round((Date.parse(c.scope.to) - c.entry.ts) / 60000),
  },

  { key: "rule", label: "Rule", group: "change", get: (c) => c.entry.ruleLabel },
  { key: "operator", label: "Operator", group: "change", get: (c) => c.entry.operator },
  { key: "oldValue", label: "Old value", group: "change", get: (c) => c.entry.oldValue },
  { key: "newValue", label: "New value", group: "change", get: (c) => c.entry.newValue },
  { key: "unit", label: "Unit", group: "change", get: (c) => c.entry.unit },
  { key: "matchesBefore", label: "Matches before", group: "change", get: (c) => c.entry.matchesBefore ?? "" },
  { key: "matchesAfter", label: "Matches after", group: "change", get: (c) => c.entry.matchesAfter ?? "" },
  { key: "nearMissBefore", label: "Near-miss before", group: "change", get: (c) => c.entry.nearMissBefore ?? "" },
  { key: "nearMissAfter", label: "Near-miss after", group: "change", get: (c) => c.entry.nearMissAfter ?? "" },

  { key: "outcomeStatus", label: "Alert outcome", group: "outcome", get: (c) => c.entry.outcome?.status ?? "pending" },
  { key: "outcomeMatched", label: "Outcome matches", group: "outcome", get: (c) => c.entry.outcome?.matched ?? "" },
  { key: "outcomeDelivered", label: "Alerts delivered", group: "outcome", get: (c) => c.entry.outcome?.delivered ?? "" },
  { key: "outcomeSymbols", label: "Outcome tokens", group: "outcome", get: (c) => c.entry.outcome?.symbols.join("|") ?? "" },
  { key: "outcomeChannels", label: "Outcome channels", group: "outcome", get: (c) => c.entry.outcome?.channels.join("|") ?? "" },
  { key: "outcomeAt", label: "Outcome recorded at", group: "outcome", get: (c) => iso(c.entry.outcome?.ts) },
];

const GROUP_LABEL: Record<Col["group"], string> = {
  identity: "Identity & correlation",
  time: "Timestamps & time range",
  change: "Rule change",
  outcome: "Alert outcome",
};

/** Correlation ID and the time-range columns ship selected by default. */
const DEFAULT_COLUMNS = COLUMNS.filter(
  (c) => !["entryId", "timestampEpoch", "unit", "ageMinutes"].includes(c.key),
).map((c) => c.key);

const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function MitigationBulkExport({
  entries,
  scope,
  walletsFor,
  filterSummary,
}: {
  /** Already narrowed to the current filtered scope by the caller. */
  entries: TuningLogEntry[];
  scope: BulkExportScope;
  walletsFor?: (entry: TuningLogEntry) => string[];
  /** Short human description of the active filters, shown in the dialog. */
  filterSummary?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(DEFAULT_COLUMNS);

  const ctxs = useMemo<Ctx[]>(
    () => entries.map((entry) => ({ entry, scope, wallets: walletsFor?.(entry) ?? [] })),
    [entries, scope, walletsFor],
  );

  const cols = COLUMNS.filter((c) => selected.includes(c.key));

  const toggle = (key: string) =>
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const rows = () =>
    ctxs.map((c) => {
      const row: Record<string, string | number> = {};
      cols.forEach((col) => {
        row[col.key] = col.get(c);
      });
      return row;
    });

  const download = (kinds: ("csv" | "json")[]) => {
    if (entries.length === 0) {
      toast.error("Nothing in scope — no mitigation entries match the current filters");
      return;
    }
    if (cols.length === 0) {
      toast.error("Select at least one column to export");
      return;
    }
    const data = rows();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");

    if (kinds.includes("json")) {
      const payload = {
        export: "mitigation-audit-bulk",
        generatedAt: new Date().toISOString(),
        dataSource: "demo/mock data — not financial advice",
        scope: {
          ...scope,
          recordCount: data.length,
          window: { from: scope.from, to: scope.to, label: scope.timeRange },
          correlationIds: [...new Set(entries.map((e) => e.correlationId).filter(Boolean))],
        },
        columns: cols.map((c) => ({ key: c.key, label: c.label, group: c.group })),
        records: data,
      };
      saveBlob(
        new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
        `mitigation-audit-scope-${stamp}.json`,
      );
    }
    if (kinds.includes("csv")) {
      const meta = Object.entries(scope)
        .map(([k, v]) => [cell(k), cell(Array.isArray(v) ? v.join(" | ") : v)].join(","))
        .join("\n");
      const headers = cols.map((c) => c.key);
      const csv = [
        `${cell("filter")},${cell("value")}`,
        meta,
        `${cell("recordCount")},${cell(data.length)}`,
        "",
        headers.join(","),
        ...data.map((r) => headers.map((h) => cell(r[h])).join(",")),
      ].join("\n");
      saveBlob(new Blob([csv], { type: "text/csv" }), `mitigation-audit-scope-${stamp}.csv`);
    }

    toast.success(
      `Exported ${data.length} filtered record${data.length === 1 ? "" : "s"} as ${kinds
        .map((k) => k.toUpperCase())
        .join(" + ")}`,
      { description: `${cols.length} columns · ${scope.timeRange}` },
    );
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
          <Layers className="h-3.5 w-3.5" />
          Bulk export scope
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk export — current filtered scope</DialogTitle>
          <DialogDescription>
            Exports only the {entries.length} record{entries.length === 1 ? "" : "s"} currently
            visible under your filters. Correlation ID and time-range columns are included by
            default.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 rounded-md border border-border/60 bg-muted/10 p-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Scope in this export
            </p>
            <Badge variant="secondary" className="text-[10px]">
              {entries.length} rows · {cols.length} columns
            </Badge>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(filterSummary && filterSummary.length
              ? filterSummary
              : [
                  `Range: ${scope.timeRange}`,
                  `Outcome: ${scope.outcome}`,
                  `Search: ${scope.quickSearch}`,
                  `Tokens: ${list(scope.tokens)}`,
                  `Wallets: ${list(scope.wallets)}`,
                  `Channels: ${list(scope.alertTypes)}`,
                  `Correlation IDs: ${list(scope.correlationIds)}`,
                ]
            ).map((s) => (
              <span
                key={s}
                className="rounded border border-border/60 bg-muted/20 px-2 py-0.5 text-[10px] text-muted-foreground"
              >
                {s}
              </span>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Window: {scope.from ?? "beginning of log"} → {scope.to}
          </p>
        </div>

        <ScrollArea className="max-h-[42vh] pr-3">
          <div className="space-y-4">
            {(Object.keys(GROUP_LABEL) as Col["group"][]).map((group) => (
              <div key={group} className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {GROUP_LABEL[group]}
                  </p>
                  <button
                    type="button"
                    className="text-[10px] text-muted-foreground hover:text-foreground hover:underline"
                    onClick={() => {
                      const keys = COLUMNS.filter((c) => c.group === group).map((c) => c.key);
                      const allOn = keys.every((k) => selected.includes(k));
                      setSelected((prev) =>
                        allOn
                          ? prev.filter((k) => !keys.includes(k))
                          : [...new Set([...prev, ...keys])],
                      );
                    }}
                  >
                    toggle all
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {COLUMNS.filter((c) => c.group === group).map((c) => (
                    <label key={c.key} className="flex items-start gap-2 text-xs">
                      <Checkbox
                        checked={selected.includes(c.key)}
                        onCheckedChange={() => toggle(c.key)}
                        className="mt-0.5"
                      />
                      <span>{c.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setSelected(DEFAULT_COLUMNS)}>
              Reset columns
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              onClick={() => setSelected(COLUMNS.map((c) => c.key))}
            >
              Select all
            </Button>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => download(["csv"])}>
              <FileSpreadsheet className="h-3.5 w-3.5" />
              CSV
            </Button>
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => download(["json"])}>
              <FileJson className="h-3.5 w-3.5" />
              JSON
            </Button>
            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => download(["csv", "json"])}>
              <Download className="h-3.5 w-3.5" />
              Both
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

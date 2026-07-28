import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { RotateCw, Undo2, Filter, Save, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePaper, type TuningLogEntry } from "@/lib/paper-store";
import { MitigationDecisionExport } from "@/components/mitigation-decision-export";
import { MitigationRetentionSettings } from "@/components/mitigation-retention-settings";


type OutcomeFilter = "all" | "alerts-fired" | "no-matches" | "channels-muted" | "pending";
type RangeFilter = "all" | "24h" | "7d" | "30d" | "90d";

const RANGE_MS: Record<Exclude<RangeFilter, "all">, number> = {
  "24h": 86_400_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
  "90d": 90 * 86_400_000,
};

const RANGE_LABEL: Record<RangeFilter, string> = {
  all: "All time",
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

/** Everything that defines an export scope, so it can be named and re-used. */
type AuditFilterState = {
  q: string;
  outcome: OutcomeFilter;
  range: RangeFilter;
  correlationIds: string[];
};

type SavedAuditFilter = AuditFilterState & { id: string; name: string };

const EMPTY_FILTER: AuditFilterState = {
  q: "",
  outcome: "all",
  range: "all",
  correlationIds: [],
};

const SAVED_FILTERS_KEY = "pumppilot_audit_saved_filters";

function loadSavedFilters(): SavedAuditFilter[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SAVED_FILTERS_KEY);
    return raw ? (JSON.parse(raw) as SavedAuditFilter[]) : [];
  } catch {
    return [];
  }
}

const OUTCOME_LABEL: Record<string, string> = {
  "alerts-fired": "Alerts fired",
  "no-matches": "No matches",
  "channels-muted": "Channels muted",
};

function delta(before?: number, after?: number) {
  if (before == null || after == null) return null;
  return after - before;
}

function DeltaBadge({ label, before, after }: { label: string; before?: number; after?: number }) {
  const d = delta(before, after);
  if (d === null) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded border border-border/60 bg-muted/30 px-1.5 py-0.5 text-[10px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">
        {before} → {after}
      </span>
      <span
        className={
          d === 0 ? "text-muted-foreground" : d > 0 ? "text-emerald-400" : "text-amber-400"
        }
      >
        {d > 0 ? `+${d}` : d}
      </span>
    </span>
  );
}

/**
 * One-click undo for the most recent applied mitigation: restores every threshold
 * it changed, marks the batch reverted and records the undo in the audit trail.
 */
function UndoLastMitigationBar() {
  const paper = usePaper();
  const last = paper.lastMitigation;
  if (!last || last.entries.length === 0) return null;

  const undo = () => {
    const done = paper.undoLastMitigation();
    if (!done) return;
    toast.success(`Undid "${done.label}" — original thresholds restored`, {
      description: done.entries
        .map((e) => `${e.ruleLabel} ${e.newValue}${e.unit} → ${e.oldValue}${e.unit}`)
        .join(" · "),
    });
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-400/40 bg-amber-400/10 p-2">
      <div className="min-w-0 text-[11px]">
        <div className="flex items-center gap-1.5 font-medium text-amber-200">
          <Undo2 className="h-3.5 w-3.5" />
          Last mitigation: {last.label}
        </div>
        <div className="truncate text-[10px] text-muted-foreground">
          {format(new Date(last.ts), "MMM d, HH:mm:ss")} · {last.correlationId} ·{" "}
          {last.entries
            .map((e) => `${e.ruleLabel} ${e.newValue}${e.unit} → ${e.oldValue}${e.unit}`)
            .join(", ")}
        </div>
      </div>
      <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={undo}>
        <Undo2 className="mr-1 h-3 w-3" />
        Undo last mitigation
      </Button>
    </div>
  );
}

/**
 * Mitigation audit trail: every one-tap mitigation with the before/after deltas

 * shown in its confirmation dialog and the alert outcome it produced, all tied
 * together by a correlation ID.
 */
export function MitigationAuditTrail({ log }: { log: TuningLogEntry[] }) {
  const paper = usePaper();
  const [q, setQ] = useState("");
  const [outcome, setOutcome] = useState<OutcomeFilter>("all");
  const [range, setRange] = useState<RangeFilter>("all");
  const [correlationIds, setCorrelationIds] = useState<string[]>([]);
  const [saved, setSaved] = useState<SavedAuditFilter[]>(loadSavedFilters);
  const [filterName, setFilterName] = useState("");

  const persistSaved = (next: SavedAuditFilter[]) => {
    setSaved(next);
    try {
      window.localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(next));
    } catch {}
  };

  const current: AuditFilterState = { q, outcome, range, correlationIds };

  const applyFilter = (f: AuditFilterState) => {
    setQ(f.q);
    setOutcome(f.outcome);
    setRange(f.range);
    setCorrelationIds(f.correlationIds ?? []);
  };

  const saveCurrentFilter = () => {
    const name = filterName.trim();
    if (!name) {
      toast.error("Name this filter before saving");
      return;
    }
    const existing = saved.find((f) => f.name.toLowerCase() === name.toLowerCase());
    const entry: SavedAuditFilter = {
      ...current,
      id: existing?.id ?? Math.random().toString(36).slice(2),
      name,
    };
    persistSaved(existing ? saved.map((f) => (f.id === existing.id ? entry : f)) : [entry, ...saved]);
    setFilterName("");
    toast.success(existing ? `Updated saved filter "${name}"` : `Saved filter "${name}"`);
  };

  /** Correlation IDs available in the log, newest first. */
  const availableCids = useMemo(() => {
    const seen: string[] = [];
    for (const e of log) {
      const cid = e.correlationId;
      if (e.source === "mitigation" && cid && !seen.includes(cid)) seen.push(cid);
    }
    return seen;
  }, [log]);

  const toggleCid = (cid: string) =>
    setCorrelationIds((prev) =>
      prev.includes(cid) ? prev.filter((x) => x !== cid) : [...prev, cid],
    );

  /** Re-run a recorded mitigation with identical parameters and stored preview context. */
  const replay = (entry: TuningLogEntry) => {
    if (!entry.correlationId) {
      toast.error("This entry has no correlation ID to replay");
      return;
    }
    const res = paper.replayMitigation(entry.correlationId);
    if (!res) {
      toast.error("Nothing replayable in this entry");
      return;
    }
    toast.success(`Replayed "${res.label}"`, {
      description: `${res.entries
        .map((e) => `${e.ruleLabel} → ${e.newValue}${e.unit}`)
        .join(" · ")} — ${res.outcome.matched} match(es), ${res.outcome.delivered} delivery(s) · ${res.correlationId}`,
    });
  };

  const entries = useMemo(() => {
    return log
      .filter((e) => e.source === "mitigation" && !!e.mitigation)
      .filter((e) => {
        if (outcome === "all") return true;
        if (outcome === "pending") return !e.outcome;
        return e.outcome?.status === outcome;
      })
      .filter((e) => {
        if (range === "all") return true;
        return Date.now() - e.ts <= RANGE_MS[range];
      })
      .filter((e) => {
        if (correlationIds.length === 0) return true;
        return !!e.correlationId && correlationIds.includes(e.correlationId);
      })
      .filter((e) => {
        if (!q.trim()) return true;
        const hay = [
          e.mitigation,
          e.ruleLabel,
          e.trigger,
          e.correlationId,
          e.outcome?.symbols.join(" "),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q.trim().toLowerCase());
      });
  }, [log, q, outcome, range, correlationIds]);

  /** Export scope honours the retention policy's preview toggle. */
  const exportEntries = paper.retention.includePreviewsInExport
    ? entries
    : entries.filter((e) => e.phase !== "preview");

  const rows = () =>
    exportEntries.map((e) => ({
      correlationId: e.correlationId ?? "",
      timestamp: new Date(e.ts).toISOString(),
      phase: e.phase ?? "applied",
      mitigation: e.mitigation ?? "",
      rule: e.ruleLabel,
      operator: e.operator,
      unit: e.unit,
      oldValue: e.oldValue,
      newValue: e.newValue,
      trigger: e.trigger ?? "",
      matchesBefore: e.matchesBefore ?? "",
      matchesAfter: e.matchesAfter ?? "",
      nearMissBefore: e.nearMissBefore ?? "",
      nearMissAfter: e.nearMissAfter ?? "",
      scopeMatchesBefore: e.scopeMatchesBefore ?? "",
      scopeMatchesAfter: e.scopeMatchesAfter ?? "",
      scopeNearMissBefore: e.scopeNearMissBefore ?? "",
      scopeNearMissAfter: e.scopeNearMissAfter ?? "",
      outcomeStatus: e.outcome?.status ?? "pending",
      outcomeMatched: e.outcome?.matched ?? "",
      outcomeDelivered: e.outcome?.delivered ?? "",
      outcomeSymbols: e.outcome?.symbols.join("|") ?? "",
      outcomeChannels: e.outcome?.channels.join("|") ?? "",
      outcomeAt: e.outcome ? new Date(e.outcome.ts).toISOString() : "",
      revertedAt: e.revertedAt ? new Date(e.revertedAt).toISOString() : "",
    }));

  const download = (kind: "csv" | "json") => {
    const data = rows();
    if (data.length === 0) {
      toast.error("Nothing to export — no mitigation entries match the current filters");
      return;
    }
    let blob: Blob;
    if (kind === "json") {
      blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    } else {
      const headers = Object.keys(data[0]);
      const csv = [
        headers.join(","),
        ...data.map((r) =>
          headers
            .map((h) => `"${String((r as Record<string, unknown>)[h] ?? "").replace(/"/g, '""')}"`)
            .join(","),
        ),
      ].join("\n");
      blob = new Blob([csv], { type: "text/csv" });
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mitigation-audit-${Date.now()}.${kind}`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${data.length} mitigation record(s) as ${kind.toUpperCase()}`);
  };

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Mitigation audit trail</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              What you applied, the before/after deltas you confirmed, and the alert outcome —
              linked by correlation ID. Simulated data.
            </p>
          </div>
          <div className="flex gap-2">
            <MitigationRetentionSettings />
            <MitigationDecisionExport log={exportEntries} />
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => download("csv")}>
              Quick CSV
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => download("json")}>
              Quick JSON
            </Button>
          </div>

        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative w-full max-w-xs">
            <Input
              value={q}
              onChange={(ev) => setQ(ev.target.value)}
              placeholder="Quick search: mitigation, rule, symbol or correlation ID"
              className="h-8 pr-7 text-xs"
            />
            {q ? (
              <button
                type="button"
                aria-label="Clear quick search"
                onClick={() => setQ("")}
                className="absolute right-1.5 top-1.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <Select value={outcome} onValueChange={(v) => setOutcome(v as OutcomeFilter)}>
            <SelectTrigger className="h-8 w-[170px] text-xs">
              <SelectValue placeholder="Outcome" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All outcomes</SelectItem>
              <SelectItem value="alerts-fired">Alerts fired</SelectItem>
              <SelectItem value="no-matches">No matches</SelectItem>
              <SelectItem value="channels-muted">Channels muted</SelectItem>
              <SelectItem value="pending">Outcome pending</SelectItem>
            </SelectContent>
          </Select>
          <Select value={range} onValueChange={(v) => setRange(v as RangeFilter)}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue placeholder="Time range" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(RANGE_LABEL) as RangeFilter[]).map((r) => (
                <SelectItem key={r} value={r}>
                  {RANGE_LABEL[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 text-xs">
                <Filter className="mr-1 h-3 w-3" />
                Correlation IDs
                {correlationIds.length > 0 ? ` (${correlationIds.length})` : ": all"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-2" align="start">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium">Pick IDs to export</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => setCorrelationIds([])}
                >
                  Select all
                </Button>
              </div>
              <ScrollArea className="h-56 pr-2">
                {availableCids.length === 0 ? (
                  <p className="p-2 text-xs text-muted-foreground">No correlation IDs yet.</p>
                ) : (
                  <div className="space-y-1">
                    {availableCids.map((cid) => (
                      <label
                        key={cid}
                        className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={correlationIds.includes(cid)}
                          onCheckedChange={() => toggleCid(cid)}
                        />
                        <span className="font-mono text-[11px]">{cid}</span>
                      </label>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </PopoverContent>
          </Popover>

          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            onClick={() => applyFilter(EMPTY_FILTER)}
          >
            Reset filters
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={filterName}
            onChange={(ev) => setFilterName(ev.target.value)}
            placeholder="Name this filter"
            className="h-8 w-full max-w-[200px] text-xs"
          />
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={saveCurrentFilter}>
            <Save className="mr-1 h-3 w-3" />
            Save filter
          </Button>
          {saved.map((f) => (
            <Badge
              key={f.id}
              variant="outline"
              className="h-7 gap-1 pl-2 pr-1 text-[11px]"
            >
              <button type="button" onClick={() => applyFilter(f)} className="hover:underline">
                {f.name}
              </button>
              <button
                type="button"
                aria-label={`Delete saved filter ${f.name}`}
                onClick={() => {
                  persistSaved(saved.filter((x) => x.id !== f.id));
                  toast.success(`Deleted saved filter "${f.name}"`);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <span className="ml-auto text-[11px] text-muted-foreground">
            {exportEntries.length} of {log.filter((e) => e.source === "mitigation").length} entries
            in export scope
          </span>
        </div>
        <UndoLastMitigationBar />

      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            No mitigations recorded yet. Apply a safer alternative from the tuning dialog and it
            will be recorded here with its deltas and alert outcome.
          </p>
        ) : (
          <div className="space-y-2">
            {entries.map((e) => (
              <div key={e.id} className="rounded-md border border-border/60 bg-card/40 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {e.phase === "preview" ? "Preview only" : "Applied"}
                  </Badge>
                  <span className="text-sm font-medium">{e.mitigation}</span>
                  <span className="text-xs text-muted-foreground">
                    {e.ruleLabel} {e.operator === ">=" ? "≥" : "≤"}{" "}
                    <span className="font-mono">
                      {e.oldValue}
                      {e.unit} → {e.newValue}
                      {e.unit}
                    </span>
                  </span>
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {format(new Date(e.ts), "MMM d, HH:mm:ss")}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  <DeltaBadge label="Matches" before={e.matchesBefore} after={e.matchesAfter} />
                  <DeltaBadge label="Near-miss" before={e.nearMissBefore} after={e.nearMissAfter} />
                  <DeltaBadge
                    label="Scope matches"
                    before={e.scopeMatchesBefore}
                    after={e.scopeMatchesAfter}
                  />
                  <DeltaBadge
                    label="Scope near-miss"
                    before={e.scopeNearMissBefore}
                    after={e.scopeNearMissAfter}
                  />
                  {e.fragilePct != null && (
                    <span className="rounded border border-border/60 bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      Fragility {e.fragilePct.toFixed(0)}%
                    </span>
                  )}
                </div>

                {e.trigger && (
                  <p className="mt-2 text-[11px] text-muted-foreground">Trigger: {e.trigger}</p>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border/50 pt-2 text-[11px]">
                  {e.outcome ? (
                    <>
                      <Badge
                        variant={e.outcome.status === "alerts-fired" ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {OUTCOME_LABEL[e.outcome.status]}
                      </Badge>
                      <span className="text-muted-foreground">
                        {e.outcome.matched} match{e.outcome.matched === 1 ? "" : "es"} ·{" "}
                        {e.outcome.delivered} delivery
                        {e.outcome.delivered === 1 ? "" : "s"}
                        {e.outcome.symbols.length > 0 && ` · ${e.outcome.symbols.join(", ")}`}
                        {e.outcome.channels.length > 0 && ` · via ${e.outcome.channels.join(", ")}`}
                      </span>
                      <span className="text-muted-foreground">
                        {format(new Date(e.outcome.ts), "HH:mm:ss")}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Outcome pending</span>
                  )}
                  {e.revertedAt && (
                    <Badge variant="outline" className="text-[10px] text-amber-400">
                      Reverted {format(new Date(e.revertedAt), "HH:mm:ss")}
                    </Badge>
                  )}
                  {e.replayOf && (
                    <Badge variant="outline" className="text-[10px]">
                      Replay of {e.replayOf}
                    </Badge>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => replay(e)}
                      title="Re-run this mitigation with the same parameters"
                    >
                      <RotateCw className="mr-1 h-3 w-3" />
                      Replay
                    </Button>
                    <button
                      type="button"
                      className="font-mono text-[10px] text-muted-foreground underline-offset-2 hover:underline"
                      onClick={() => {
                        navigator.clipboard?.writeText(e.correlationId ?? "");
                        toast.success("Correlation ID copied");
                      }}
                      title="Copy correlation ID"
                    >
                      {e.correlationId ?? "—"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

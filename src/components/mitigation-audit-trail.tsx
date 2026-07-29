import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

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
import { Undo2, Filter, Save, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePaper, type TuningLogEntry } from "@/lib/paper-store";
import { useScanHistory } from "@/lib/wallet-session";

import { MitigationDecisionExport } from "@/components/mitigation-decision-export";
import { MitigationBulkExport } from "@/components/mitigation-bulk-export";
import { MitigationRetentionSettings } from "@/components/mitigation-retention-settings";
import { MitigationDiffView } from "@/components/mitigation-diff-view";
import { MitigationReplayDiff } from "@/components/mitigation-replay-diff";
import { MitigationBulkReplay } from "@/components/mitigation-bulk-replay";
import { MitigationReplayButton } from "@/components/mitigation-replay-button";
import { explainOutcome } from "@/lib/mitigation-explain";
import { MitigationImport } from "@/components/mitigation-import";
import { isImportedEntry } from "@/lib/mitigation-import";
import { MitigationScheduledExports } from "@/components/mitigation-scheduled-exports";
import {
  EMPTY_FILTER,
  RANGE_LABEL,
  RANGE_MS,
  SAVED_FILTERS_KEY,
  filterAuditEntries,
  loadSavedFilters,
  type AuditFilterState,
  type OutcomeFilter,
  type RangeFilter,
  type SavedAuditFilter,
} from "@/lib/audit-filters";




/** A mitigation is attributed to wallets scanned within this window of it. */
const WALLET_LINK_MS = 60 * 60 * 1000;

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

/** Generic checkbox multi-select used for token / wallet / alert-type scoping. */
function MultiFilter({
  label,
  options,
  selected,
  onToggle,
  onClear,
  emptyText,
  mono,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
  emptyText: string;
  mono?: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 text-xs">
          <Filter className="mr-1 h-3 w-3" />
          {label}
          {selected.length > 0 ? ` (${selected.length})` : ": all"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium">Scope export to {label.toLowerCase()}</span>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={onClear}>
            Select all
          </Button>
        </div>
        <ScrollArea className="h-48 pr-2">
          {options.length === 0 ? (
            <p className="p-2 text-xs text-muted-foreground">{emptyText}</p>
          ) : (
            <div className="space-y-1">
              {options.map((opt) => (
                <label
                  key={opt}
                  className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-muted/50"
                >
                  <Checkbox
                    checked={selected.includes(opt)}
                    onCheckedChange={() => onToggle(opt)}
                  />
                  <span className={cn("text-[11px]", mono && "font-mono")}>{opt}</span>
                </label>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}


/**
 * Mitigation audit trail: every one-tap mitigation with the before/after deltas

 * shown in its confirmation dialog and the alert outcome it produced, all tied
 * together by a correlation ID.
 */
export function MitigationAuditTrail({
  log,
  focusCorrelationId,
}: {
  log: TuningLogEntry[];
  focusCorrelationId?: string;
}) {
  const paper = usePaper();
  const [q, setQ] = useState("");
  const [outcome, setOutcome] = useState<OutcomeFilter>("all");
  const [range, setRange] = useState<RangeFilter>("all");
  const [correlationIds, setCorrelationIds] = useState<string[]>(
    focusCorrelationId ? [focusCorrelationId] : [],
  );
  const [tokens, setTokens] = useState<string[]>([]);
  const [wallets, setWallets] = useState<string[]>([]);
  const [alertTypes, setAlertTypes] = useState<string[]>([]);
  const runs = useScanHistory();
  /** Records loaded from a previously exported file — review only, never applied. */
  const [importedEntries, setImportedEntries] = useState<TuningLogEntry[]>([]);
  const focusRef = useRef<HTMLDivElement | null>(null);


  // A deep link from the impact timeline focuses one correlation batch:
  // filter to it, show previews, and scroll it into view.
  useEffect(() => {
    if (!focusCorrelationId) return;
    setCorrelationIds([focusCorrelationId]);
    setRange("all");
    setOutcome("all");
    setQ("");
    setTokens([]);
    setWallets([]);
    setAlertTypes([]);
    const t = window.setTimeout(
      () => focusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }),
      120,
    );
    return () => window.clearTimeout(t);
  }, [focusCorrelationId]);

  const [saved, setSaved] = useState<SavedAuditFilter[]>(loadSavedFilters);
  const [filterName, setFilterName] = useState("");

  const persistSaved = (next: SavedAuditFilter[]) => {
    setSaved(next);
    try {
      window.localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(next));
    } catch {}
  };

  const current: AuditFilterState = {
    q,
    outcome,
    range,
    correlationIds,
    tokens,
    wallets,
    alertTypes,
  };

  const applyFilter = (f: AuditFilterState) => {
    setQ(f.q);
    setOutcome(f.outcome);
    setRange(f.range);
    setCorrelationIds(f.correlationIds ?? []);
    setTokens(f.tokens ?? []);
    setWallets(f.wallets ?? []);
    setAlertTypes(f.alertTypes ?? []);
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

  const toggleIn = (setter: (fn: (prev: string[]) => string[]) => void) => (value: string) =>
    setter((prev) => (prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value]));

  /** Token symbols seen in mitigation outcomes. */
  const availableTokens = useMemo(() => {
    const seen = new Set<string>();
    for (const e of log) {
      if (e.source !== "mitigation") continue;
      e.outcome?.symbols.forEach((s) => seen.add(s));
    }
    return [...seen].sort();
  }, [log]);

  /** Alert delivery channels seen in mitigation outcomes. */
  const availableAlertTypes = useMemo(() => {
    const seen = new Set<string>();
    for (const e of log) {
      if (e.source !== "mitigation") continue;
      e.outcome?.channels.forEach((c) => seen.add(c));
    }
    return [...seen].sort();
  }, [log]);

  /** Wallets with scan history, used to attribute mitigations to a wallet. */
  const availableWallets = useMemo(
    () => [...new Set(runs.map((r) => r.address))],
    [runs],
  );

  /**
   * A mitigation is attributed to every wallet scanned within an hour of it
   * (or sharing its correlation ID) — the same linkage the impact timeline uses.
   */
  const walletsForEntry = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const e of log) {
      if (e.source !== "mitigation") continue;
      const hit = runs
        .filter(
          (r) =>
            r.correlationId === e.correlationId ||
            Math.abs(r.scannedAt - e.ts) <= WALLET_LINK_MS,
        )
        .map((r) => r.address);
      map.set(e.id, [...new Set(hit)]);
    }
    return map;
  }, [log, runs]);


  /** Live audit entries plus anything imported from a file, newest first. */
  const sourceLog = useMemo(
    () => (importedEntries.length ? [...importedEntries, ...log].sort((a, b) => b.ts - a.ts) : log),
    [importedEntries, log],
  );

  const entries = useMemo(
    () =>
      filterAuditEntries(
        sourceLog,
        { q, outcome, range, correlationIds, tokens, alertTypes, wallets },
        (e) => walletsForEntry.get(e.id) ?? [],
      ),
    [sourceLog, q, outcome, range, correlationIds, tokens, alertTypes, wallets, walletsForEntry],
  );


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
      wallets: (walletsForEntry.get(e.id) ?? []).join("|"),
      outcomeAt: e.outcome ? new Date(e.outcome.ts).toISOString() : "",
      revertedAt: e.revertedAt ? new Date(e.revertedAt).toISOString() : "",
    }));

  /** The filter scope stamped into every export so it matches this view. */
  const exportFilters = () => ({
    quickSearch: q.trim() || "none",
    outcome,
    timeRange: RANGE_LABEL[range],
    from:
      range === "all" ? null : new Date(Date.now() - RANGE_MS[range]).toISOString(),
    to: new Date().toISOString(),
    tokens: tokens.length ? tokens : "all",
    wallets: wallets.length ? wallets : "all",
    alertTypes: alertTypes.length ? alertTypes : "all",
    correlationIds: correlationIds.length ? correlationIds : "all",
    includePreviews: paper.retention.includePreviewsInExport,
  });


  const download = (kind: "csv" | "json") => {
    const data = rows();
    const filters = exportFilters();
    if (data.length === 0) {
      toast.error("Nothing to export — no mitigation entries match the current filters");
      return;
    }
    let blob: Blob;
    if (kind === "json") {
      blob = new Blob(
        [
          JSON.stringify(
            {
              export: "mitigation-audit-trail",
              generatedAt: new Date().toISOString(),
              dataSource: "demo/mock data — not financial advice",
              filters,
              recordCount: data.length,
              records: data,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      );
    } else {
      const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const meta = Object.entries(filters)
        .map(([k, v]) => [cell(k), cell(Array.isArray(v) ? v.join(" | ") : v)].join(","))
        .join("\n");
      const headers = Object.keys(data[0]);
      const csv = [
        `${cell("filter")},${cell("value")}`,
        meta,
        "",
        headers.join(","),
        ...data.map((r) =>
          headers.map((h) => cell((r as Record<string, unknown>)[h])).join(","),
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
            <MitigationImport
              onImport={(rows) => setImportedEntries((prev) => [...prev, ...rows])}
              importedCount={importedEntries.length}
              onClear={() => setImportedEntries([])}
            />
            <MitigationDecisionExport
              log={exportEntries}
              filters={current}
              onApplyFilters={applyFilter}
            />
            <MitigationBulkExport
              entries={exportEntries}
              scope={exportFilters()}
              walletsFor={(e) => walletsForEntry.get(e.id) ?? []}
            />
            <MitigationScheduledExports
              log={sourceLog}
              walletsFor={(e) => walletsForEntry.get(e.id) ?? []}
            />
            <MitigationBulkReplay
              entries={entries}
              scopeLabel={RANGE_LABEL[range]}
              isImported={isImportedEntry}
            />
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

          <MultiFilter
            label="Tokens"
            emptyText="No tokens in alert outcomes yet."
            options={availableTokens}
            selected={tokens}
            onToggle={toggleIn(setTokens)}
            onClear={() => setTokens([])}
          />
          <MultiFilter
            label="Wallets"
            emptyText="No scanned wallets yet."
            options={availableWallets}
            selected={wallets}
            onToggle={toggleIn(setWallets)}
            onClear={() => setWallets([])}
            mono
          />
          <MultiFilter
            label="Alert type"
            emptyText="No alert deliveries yet."
            options={availableAlertTypes}
            selected={alertTypes}
            onToggle={toggleIn(setAlertTypes)}
            onClear={() => setAlertTypes([])}
          />


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
            {entries.map((e, i) => {
              const focused = !!focusCorrelationId && e.correlationId === focusCorrelationId;
              return (
              <div
                key={e.id}
                ref={focused && i === 0 ? focusRef : undefined}
                className={cn(
                  "rounded-md border border-border/60 bg-card/40 p-3",
                  focused && "border-primary/60 ring-1 ring-primary/40",
                )}
              >

                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {e.phase === "preview" ? "Preview only" : "Applied"}
                  </Badge>
                  {isImportedEntry(e) && (
                    <Badge variant="secondary" className="text-[10px]">
                      Imported
                    </Badge>
                  )}
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

                <div className="mt-2 rounded-md border border-border/50 bg-muted/20 p-2 text-[11px] leading-relaxed text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <p className="flex-1">
                      <span className="font-medium text-foreground">Why: </span>
                      {explainOutcome(e)}
                    </p>
                    <CopyWhyButton entry={e} />
                  </div>
                </div>



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
                    <MitigationDiffView entry={e} />
                    <MitigationReplayDiff entry={e} />
                    <MitigationReplayButton entry={e} imported={isImportedEntry(e)} />
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
              );
            })}

          </div>
        )}
      </CardContent>
    </Card>
  );
}

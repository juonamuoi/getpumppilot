import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowRight, ArrowUpDown, ChevronDown, ChevronUp, Download, GitCompare } from "lucide-react";
import { ASSETS } from "@/lib/mock-data";
import { applyRuleValue, usePaper, type ScannerRules, type TuningLogEntry } from "@/lib/paper-store";
import { toast } from "sonner";
import { downloadDiff, type DiffExportPayload } from "@/lib/diff-export";
import { cn } from "@/lib/utils";

type Asset = (typeof ASSETS)[number];
type Status = "matched" | "near-miss" | "no-match";

/** Same 5 gates the scanner uses; 4/5 passing = near-miss. */
function evaluate(rules: ScannerRules, a: Asset) {
  const checks: Record<string, boolean> = {
    Scope:
      (a.category === "major" && rules.includeMajors) ||
      (a.category === "demo-smallcap" && rules.includeDemoSmallCaps),
    Momentum: a.momentum.total >= rules.minMomentum,
    Volume: a.momentum.volume >= rules.minVolumeScore,
    Volatility: a.momentum.volatility <= rules.maxVolatility,
    "24h change": a.change24h >= rules.min24hChangePct,
  };
  const failed = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([k]) => k);
  const status: Status =
    failed.length === 0 ? "matched" : failed.length === 1 ? "near-miss" : "no-match";
  return { checks, failed, status };
}

/**
 * Human-readable "actual vs threshold" for the gate that blocks an asset.
 * Returns null when nothing blocks it (i.e. it matched).
 */
function blockingGate(rules: ScannerRules, a: Asset, failed: string[]) {
  const gate = failed[0];
  if (!gate) return null;
  switch (gate) {
    case "Momentum":
      return { gate, actual: a.momentum.total, threshold: rules.minMomentum, op: "≥", unit: "" };
    case "Volume":
      return { gate, actual: a.momentum.volume, threshold: rules.minVolumeScore, op: "≥", unit: "" };
    case "Volatility":
      return { gate, actual: a.momentum.volatility, threshold: rules.maxVolatility, op: "≤", unit: "" };
    case "24h change":
      return { gate, actual: a.change24h, threshold: rules.min24hChangePct, op: "≥", unit: "%" };
    default:
      return { gate, actual: null, threshold: null, op: "", unit: "" };
  }
}

function gateText(g: ReturnType<typeof blockingGate>, extra = 0) {
  if (!g) return "All gates pass";
  const more = extra > 0 ? ` (+${extra} more)` : "";
  if (g.actual === null || g.threshold === null) return `${g.gate} excluded${more}`;
  return `${g.gate} ${g.actual}${g.unit} vs ${g.op} ${g.threshold}${g.unit}${more}`;
}

const STATUS_LABEL: Record<Status, string> = {
  matched: "Matched",
  "near-miss": "Near-miss",
  "no-match": "No match",
};

const STATUS_CLASS: Record<Status, string> = {
  matched: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
  "near-miss": "text-amber-400 border-amber-500/40 bg-amber-500/10",
  "no-match": "text-muted-foreground border-border/60 bg-muted/20",
};

const STATUS_RANK: Record<Status, number> = { matched: 2, "near-miss": 1, "no-match": 0 };

type SortKey = "symbol" | "category" | "before" | "after" | "change" | "gate" | "gateValue";

const RULE_FIELD: Record<string, keyof ScannerRules> = {
  momentum: "minMomentum",
  volume: "minVolumeScore",
  volatility: "maxVolatility",
  change: "min24hChangePct",
};

function ruleRows(before: ScannerRules, after: ScannerRules) {
  return [
    { label: "Min momentum", b: `${before.minMomentum}`, a: `${after.minMomentum}` },
    { label: "Min volume score", b: `${before.minVolumeScore}`, a: `${after.minVolumeScore}` },
    { label: "Max volatility", b: `${before.maxVolatility}`, a: `${after.maxVolatility}` },
    { label: "Min 24h change", b: `${before.min24hChangePct}%`, a: `${after.min24hChangePct}%` },
    { label: "Include majors", b: before.includeMajors ? "yes" : "no", a: after.includeMajors ? "yes" : "no" },
    {
      label: "Include DEMO small-caps",
      b: before.includeDemoSmallCaps ? "yes" : "no",
      a: after.includeDemoSmallCaps ? "yes" : "no",
    },
  ].map((r) => ({ ...r, changed: r.b !== r.a }));
}

/** Plain-English definition of every gate the scanner applies, keyed by gate name. */
const RULE_DEFS: {
  gate: string;
  label: string;
  definition: string;
  threshold: (r: ScannerRules) => string;
  value?: (a: Asset) => number;
  unit?: string;
}[] = [
  {
    gate: "Momentum",
    label: "Min momentum",
    definition: "Pass when the asset's composite momentum score is greater than or equal to the minimum.",
    threshold: (r) => `≥ ${r.minMomentum}`,
    value: (a) => a.momentum.total,
  },
  {
    gate: "Volume",
    label: "Min volume score",
    definition: "Pass when the volume sub-score (relative trading activity) meets the minimum.",
    threshold: (r) => `≥ ${r.minVolumeScore}`,
    value: (a) => a.momentum.volume,
  },
  {
    gate: "Volatility",
    label: "Max volatility",
    definition: "Pass when the volatility sub-score stays at or below the ceiling — a fragility guard.",
    threshold: (r) => `≤ ${r.maxVolatility}`,
    value: (a) => a.momentum.volatility,
  },
  {
    gate: "24h change",
    label: "Min 24h change",
    definition: "Pass when the 24-hour price change is at least the minimum percentage.",
    threshold: (r) => `≥ ${r.min24hChangePct}%`,
    value: (a) => a.change24h,
    unit: "%",
  },
  {
    gate: "Scope",
    label: "Universe scope",
    definition:
      "Pass when the asset's category is included in the scan universe (majors and/or DEMO small-caps).",
    threshold: (r) =>
      `majors: ${r.includeMajors ? "on" : "off"} · DEMO: ${r.includeDemoSmallCaps ? "on" : "off"}`,
  },
];

/**
 * Before/after diff for one mitigation batch: exactly which rules changed and
 * which assets crossed the matched / near-miss / no-match boundary.
 */
export function MitigationDiffView({ entry }: { entry: TuningLogEntry }) {
  const { tuningLog, scannerRules } = usePaper();
  const [open, setOpen] = useState(false);
  const [onlyChanged, setOnlyChanged] = useState(true);
  const [openGate, setOpenGate] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("change");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "symbol" || key === "category" || key === "gate" ? "asc" : "desc");
    }
  };

  const cid = entry.correlationId ?? entry.id;

  const batch = useMemo(
    () =>
      tuningLog.filter(
        (e) => (e.correlationId ?? e.id) === cid && e.kind !== "bounds" && e.rule !== "undo",
      ),
    [tuningLog, cid],
  );

  const { before, after } = useMemo(() => {
    const b: ScannerRules = { ...scannerRules, channels: { ...scannerRules.channels } };
    const a: ScannerRules = { ...scannerRules, channels: { ...scannerRules.channels } };
    for (const e of batch) {
      if (!RULE_FIELD[e.rule]) continue;
      applyRuleValue(b, e.rule, e.oldValue);
      applyRuleValue(a, e.rule, e.newValue);
    }
    return { before: b, after: a };
  }, [batch, scannerRules]);

  const rows = useMemo(
    () =>
      ASSETS.map((asset) => {
        const bEval = evaluate(before, asset);
        const aEval = evaluate(after, asset);
        const gateBefore = blockingGate(before, asset, bEval.failed);
        const gateAfter = blockingGate(after, asset, aEval.failed);
        return {
          asset,
          bEval,
          aEval,
          gateBefore,
          gateAfter,
          gateBeforeText: gateText(gateBefore, Math.max(0, bEval.failed.length - 1)),
          gateAfterText: gateText(gateAfter, Math.max(0, aEval.failed.length - 1)),
          changed: bEval.status !== aEval.status,
        };
      }),
    [before, after],
  );

  const gained = rows.filter((r) => r.aEval.status === "matched" && r.bEval.status !== "matched");
  const lost = rows.filter((r) => r.bEval.status === "matched" && r.aEval.status !== "matched");
  const newNearMiss = rows.filter(
    (r) => r.aEval.status === "near-miss" && r.bEval.status === "no-match",
  );
  const rules = ruleRows(before, after);
  const changedRules = rules.filter((r) => r.changed);

  /** Per-gate drill-down: definition, thresholds, and why each asset's gate flipped. */
  const drilldown = useMemo(
    () =>
      RULE_DEFS.map((def) => {
        const flips = rows
          .map((r) => {
            const passBefore = r.bEval.checks[def.gate];
            const passAfter = r.aEval.checks[def.gate];
            if (passBefore === passAfter) return null;
            const v = def.value ? def.value(r.asset) : null;
            return {
              symbol: r.asset.symbol,
              direction: passAfter ? ("pass" as const) : ("fail" as const),
              reason:
                v === null
                  ? `${r.asset.category === "major" ? "Major" : "DEMO small-cap"} scope turned ${passAfter ? "on" : "off"}`
                  : `value ${v}${def.unit ?? ""} now ${passAfter ? "satisfies" : "violates"} ${def.threshold(after)}`,
              statusBefore: r.bEval.status,
              statusAfter: r.aEval.status,
              decisive: r.bEval.status !== r.aEval.status,
            };
          })
          .filter((f): f is NonNullable<typeof f> => f !== null);
        return {
          ...def,
          before: def.threshold(before),
          after: def.threshold(after),
          changed: def.threshold(before) !== def.threshold(after),
          flips,
          nowPass: flips.filter((f) => f.direction === "pass").length,
          nowFail: flips.filter((f) => f.direction === "fail").length,
        };
      }),
    [rows, before, after],
  );

  const visible = useMemo(() => {
    const list = onlyChanged ? rows.filter((r) => r.changed) : [...rows];
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (r: (typeof rows)[number]) => {
      switch (sortKey) {
        case "symbol":
          return r.asset.symbol;
        case "category":
          return r.asset.category;
        case "before":
          return STATUS_RANK[r.bEval.status];
        case "after":
          return STATUS_RANK[r.aEval.status];
        case "change":
          return (r.changed ? 1 : 0) * 10 + STATUS_RANK[r.aEval.status];
        case "gate":
          return r.gateAfter?.gate ?? "";
        case "gateValue":
          return r.gateAfter?.actual ?? Number.NEGATIVE_INFINITY;
      }
    };
    return list.sort((x, y) => {
      const a = val(x);
      const b = val(y);
      if (typeof a === "string" || typeof b === "string") {
        return String(a).localeCompare(String(b)) * dir || x.asset.symbol.localeCompare(y.asset.symbol);
      }
      return ((a as number) - (b as number)) * dir || x.asset.symbol.localeCompare(y.asset.symbol);
    });
  }, [rows, onlyChanged, sortKey, sortDir]);


  const transitionLabel = (b: Status, a: Status) => {
    if (b === a) return "unchanged";
    if (a === "matched") return b === "near-miss" ? "near-miss → matched" : "no-match → matched";
    if (b === "matched") return `matched → ${a}`;
    return `${b} → ${a}`;
  };

  const buildPayload = (): DiffExportPayload => ({
    correlationId: cid,
    mitigation: entry.mitigation ?? "Rule change",
    entryTs: entry.ts,
    scope: onlyChanged ? "changed-only" : "all-assets",
    rules: rules.map((r) => ({ label: r.label, before: r.b, after: r.a, changed: r.changed })),
    assets: visible.map(({ asset, bEval, aEval, changed }) => ({
      symbol: asset.symbol,
      name: asset.name,
      category: asset.category,
      statusBefore: bEval.status,
      statusAfter: aEval.status,
      changed,
      transition: transitionLabel(bEval.status, aEval.status),
      failedGatesBefore: bEval.failed,
      failedGatesAfter: aEval.failed,
    })),
    summary: {
      rulesChanged: changedRules.length,
      gainedMatches: gained.length,
      lostMatches: lost.length,
      newNearMisses: newNearMiss.length,
      assetsChanged: rows.filter((r) => r.changed).length,
      assetsTotal: rows.length,
    },
  });

  const exportDiff = (kind: "csv" | "json") => {
    const payload = buildPayload();
    const count = downloadDiff(payload, kind);
    toast.success(`Exported diff as ${kind.toUpperCase()}`, {
      description: `${payload.rules.length} rule row(s) · ${payload.assets.length} asset row(s) · ${count} total`,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 text-[10px]"
          title="Before/after diff of rules and asset matches"
        >
          <GitCompare className="mr-1 h-3 w-3" />
          Diff
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Before / after diff — {entry.mitigation ?? "Rule change"}</DialogTitle>
          <DialogDescription>
            {format(new Date(entry.ts), "MMM d, HH:mm:ss")} · {cid} · simulated mock data, for
            illustration only.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-card/40 p-2 text-[11px] text-muted-foreground">
          <Download className="h-3.5 w-3.5" />
          <span>
            Export rule changes + asset transitions ({onlyChanged ? "changed assets only" : "all assets"})
          </span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => exportDiff("csv")}>
              CSV
            </Button>
            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => exportDiff("json")}>
              JSON
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <section>
            <h4 className="mb-2 text-xs font-medium text-muted-foreground">
              Rules changed ({changedRules.length})
            </h4>
            {changedRules.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No threshold differences recorded for this batch.
              </p>
            ) : (
              <div className="space-y-1">
                {changedRules.map((r) => (
                  <div
                    key={r.label}
                    className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5 text-xs"
                  >
                    <span className="w-44 shrink-0">{r.label}</span>
                    <span className="font-mono text-muted-foreground line-through">{r.b}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <span className="font-mono font-medium text-primary">{r.a}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
              {rules
                .filter((r) => !r.changed)
                .map((r) => (
                  <span key={r.label} className="rounded border border-border/60 px-1.5 py-0.5">
                    {r.label}: {r.b} (unchanged)
                  </span>
                ))}
            </div>
          </section>

          <section>
            <h4 className="mb-2 text-xs font-medium text-muted-foreground">
              Rule drill-down ({drilldown.filter((d) => d.changed).length} changed ·{" "}
              {drilldown.reduce((n, d) => n + d.flips.length, 0)} gate flips)
            </h4>
            <div className="space-y-1">
              {drilldown.map((d) => {
                const isOpen = openGate === d.gate;
                return (
                  <div
                    key={d.gate}
                    className={cn(
                      "rounded-md border text-xs",
                      d.changed ? "border-primary/30 bg-primary/5" : "border-border/60 bg-card/30",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenGate(isOpen ? null : d.gate)}
                      className="flex w-full items-center gap-2 px-2 py-1.5 text-left"
                      aria-expanded={isOpen}
                    >
                      {isOpen ? (
                        <ChevronUp className="h-3 w-3 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                      )}
                      <span className="w-40 shrink-0 font-medium">{d.label}</span>
                      <span className="font-mono text-[10px] text-muted-foreground line-through">
                        {d.before}
                      </span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span
                        className={cn(
                          "font-mono text-[10px] font-medium",
                          d.changed ? "text-primary" : "text-muted-foreground",
                        )}
                      >
                        {d.after}
                      </span>
                      <span className="ml-auto flex gap-1">
                        {d.nowPass > 0 && (
                          <Badge variant="secondary" className="bg-emerald-500/15 text-[10px] text-emerald-400">
                            +{d.nowPass} pass
                          </Badge>
                        )}
                        {d.nowFail > 0 && (
                          <Badge variant="secondary" className="bg-rose-500/15 text-[10px] text-rose-400">
                            +{d.nowFail} fail
                          </Badge>
                        )}
                        {d.flips.length === 0 && (
                          <span className="text-[10px] text-muted-foreground">no outcome change</span>
                        )}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="space-y-2 border-t border-border/50 px-2 py-2">
                        <p className="text-[11px] text-muted-foreground">{d.definition}</p>
                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                          <div className="rounded border border-border/60 p-1.5">
                            <div className="text-muted-foreground">Previous threshold</div>
                            <div className="font-mono text-foreground">{d.before}</div>
                          </div>
                          <div className="rounded border border-border/60 p-1.5">
                            <div className="text-muted-foreground">New threshold</div>
                            <div className="font-mono text-foreground">{d.after}</div>
                          </div>
                        </div>
                        {d.flips.length === 0 ? (
                          <p className="text-[10px] text-muted-foreground">
                            {d.changed
                              ? "Threshold moved, but no asset crossed this gate — every asset stayed on the same side."
                              : "Threshold unchanged, so this gate's outcome is identical for every asset."}
                          </p>
                        ) : (
                          <ul className="space-y-1">
                            {d.flips.map((f) => (
                              <li
                                key={f.symbol}
                                className="flex flex-wrap items-center gap-1.5 rounded border border-border/50 px-1.5 py-1 text-[10px]"
                              >
                                <span className="w-14 font-medium">{f.symbol}</span>
                                <Badge
                                  variant="secondary"
                                  className={cn(
                                    "text-[9px]",
                                    f.direction === "pass"
                                      ? "bg-emerald-500/15 text-emerald-400"
                                      : "bg-rose-500/15 text-rose-400",
                                  )}
                                >
                                  gate {f.direction === "pass" ? "fail → pass" : "pass → fail"}
                                </Badge>
                                <span className="text-muted-foreground">{f.reason}</span>
                                {f.decisive && (
                                  <span className="ml-auto text-primary">
                                    flipped asset: {STATUS_LABEL[f.statusBefore]} →{" "}
                                    {STATUS_LABEL[f.statusAfter]}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="grid grid-cols-3 gap-2 text-center">
            <SummaryTile label="Gained matches" value={gained.length} tone="up" />
            <SummaryTile label="Lost matches" value={lost.length} tone="down" />
            <SummaryTile label="New near-misses" value={newNearMiss.length} tone="warn" />
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-xs font-medium text-muted-foreground">
                Asset transitions ({rows.filter((r) => r.changed).length} changed of {rows.length})
              </h4>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[10px]"
                onClick={() => setOnlyChanged((v) => !v)}
              >
                {onlyChanged ? "Show all assets" : "Only changed"}
              </Button>
            </div>
            <ScrollArea className="h-72 rounded-md border border-border/60">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur">
                  <tr className="border-b border-border/60 text-left text-[10px] text-muted-foreground">
                    <SortHeader label="Asset" k="symbol" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortHeader label="Type" k="category" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortHeader label="Before" k="before" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortHeader label="After" k="after" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortHeader label="Transition" k="change" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortHeader label="Blocking gate" k="gate" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortHeader
                      label="Gate value (after)"
                      k="gateValue"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={toggleSort}
                    />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {visible.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-4 text-center text-xs text-muted-foreground">
                        No asset switched status with this change.
                      </td>
                    </tr>
                  ) : (
                    visible.map(({ asset, bEval, aEval, changed, gateAfter, gateBeforeText, gateAfterText }) => (
                      <tr key={asset.symbol} className={cn(changed && "bg-primary/5")}>
                        <td className="p-2 font-medium">{asset.symbol}</td>
                        <td className="p-2 text-[10px] text-muted-foreground">
                          {asset.category === "major" ? "Major" : "DEMO small-cap"}
                        </td>
                        <td className="p-2">
                          <Badge variant="outline" className={cn("text-[10px]", STATUS_CLASS[bEval.status])}>
                            {STATUS_LABEL[bEval.status]}
                          </Badge>
                          <div className="mt-0.5 text-[9px] text-muted-foreground">{gateBeforeText}</div>
                        </td>
                        <td className="p-2">
                          <Badge variant="outline" className={cn("text-[10px]", STATUS_CLASS[aEval.status])}>
                            {STATUS_LABEL[aEval.status]}
                          </Badge>
                        </td>
                        <td className="p-2">
                          {changed ? (
                            <Badge
                              className={cn(
                                "text-[10px]",
                                aEval.status === "matched"
                                  ? "bg-emerald-500/15 text-emerald-400"
                                  : bEval.status === "matched"
                                    ? "bg-rose-500/15 text-rose-400"
                                    : "bg-amber-500/15 text-amber-400",
                              )}
                              variant="secondary"
                            >
                              {aEval.status === "matched"
                                ? bEval.status === "near-miss"
                                  ? "Near-miss → matched"
                                  : "Now matched"
                                : bEval.status === "matched"
                                  ? `Lost → ${STATUS_LABEL[aEval.status].toLowerCase()}`
                                  : "Status shifted"}
                            </Badge>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                              {STATUS_LABEL[bEval.status]}
                              <ArrowRight className="h-3 w-3" />
                              {STATUS_LABEL[aEval.status]}
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-[10px] text-muted-foreground">
                          {aEval.failed.length === 0
                            ? "—"
                            : `${aEval.failed[0]}${aEval.failed.length > 1 ? ` +${aEval.failed.length - 1}` : ""}`}
                        </td>
                        <td className="p-2 font-mono text-[10px] text-muted-foreground">
                          {gateAfter?.actual === null || gateAfter === null
                            ? gateAfterText
                            : `${gateAfter.actual}${gateAfter.unit} vs ${gateAfter.op} ${gateAfter.threshold}${gateAfter.unit}`}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </ScrollArea>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SortHeader({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <th className="p-2 font-medium">
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          active && "text-foreground",
        )}
        aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
      >
        {label}
        {active ? (
          sortDir === "asc" ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "up" | "down" | "warn";
}) {
  return (
    <div className="rounded-md border border-border/60 bg-card/40 p-2">
      <div
        className={cn(
          "text-lg font-semibold",
          tone === "up" && "text-emerald-400",
          tone === "down" && "text-rose-400",
          tone === "warn" && "text-amber-400",
        )}
      >
        {value}
      </div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

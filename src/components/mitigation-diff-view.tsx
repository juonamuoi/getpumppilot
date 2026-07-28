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
import { ArrowRight, GitCompare } from "lucide-react";
import { ASSETS } from "@/lib/mock-data";
import { applyRuleValue, usePaper, type ScannerRules, type TuningLogEntry } from "@/lib/paper-store";
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

/**
 * Before/after diff for one mitigation batch: exactly which rules changed and
 * which assets crossed the matched / near-miss / no-match boundary.
 */
export function MitigationDiffView({ entry }: { entry: TuningLogEntry }) {
  const { tuningLog, scannerRules } = usePaper();
  const [open, setOpen] = useState(false);
  const [onlyChanged, setOnlyChanged] = useState(true);

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
        return { asset, bEval, aEval, changed: bEval.status !== aEval.status };
      }).sort((x, y) => Number(y.changed) - Number(x.changed) || x.asset.symbol.localeCompare(y.asset.symbol)),
    [before, after],
  );

  const gained = rows.filter((r) => r.aEval.status === "matched" && r.bEval.status !== "matched");
  const lost = rows.filter((r) => r.bEval.status === "matched" && r.aEval.status !== "matched");
  const newNearMiss = rows.filter(
    (r) => r.aEval.status === "near-miss" && r.bEval.status === "no-match",
  );
  const rules = ruleRows(before, after);
  const changedRules = rules.filter((r) => r.changed);
  const visible = onlyChanged ? rows.filter((r) => r.changed) : rows;

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
            <ScrollArea className="h-64 rounded-md border border-border/60">
              <div className="divide-y divide-border/50">
                {visible.length === 0 ? (
                  <p className="p-4 text-center text-xs text-muted-foreground">
                    No asset switched status with this change.
                  </p>
                ) : (
                  visible.map(({ asset, bEval, aEval, changed }) => (
                    <div key={asset.symbol} className="flex flex-wrap items-center gap-2 p-2 text-xs">
                      <span className="w-16 font-medium">{asset.symbol}</span>
                      <Badge variant="outline" className={cn("text-[10px]", STATUS_CLASS[bEval.status])}>
                        {STATUS_LABEL[bEval.status]}
                      </Badge>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <Badge variant="outline" className={cn("text-[10px]", STATUS_CLASS[aEval.status])}>
                        {STATUS_LABEL[aEval.status]}
                      </Badge>
                      {changed && (
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
                      )}
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {aEval.failed.length === 0
                          ? "All gates pass"
                          : `Blocked by ${aEval.failed.join(", ")}`}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </section>
        </div>
      </DialogContent>
    </Dialog>
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

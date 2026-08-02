import { useCallback, useMemo, useRef, useState } from "react";
import { CheckCircle2, Loader2, RotateCw, X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { usePaper, type TuningLogEntry } from "@/lib/paper-store";
import {
  preflightReplay,
  routeIssues,
  summarizeIssues,
  verifyReplayRoutes,
  type ReplayIssue,
} from "@/lib/replay-diagnostics";
import { cn } from "@/lib/utils";

type BatchStatus = "pending" | "running" | "ok" | "warning" | "blocked";

type Batch = {
  correlationId: string;
  label: string;
  ts: number;
  entries: TuningLogEntry[];
  imported: boolean;
  phase: "applied" | "preview";
};

type BatchResult = {
  correlationId: string;
  status: BatchStatus;
  newCorrelationId?: string;
  matched?: number;
  delivered?: number;
  rules?: string;
  issues: ReplayIssue[];
  pagesChecked?: number;
};

const STATUS_LABEL: Record<BatchStatus, string> = {
  pending: "Queued",
  running: "Running",
  ok: "Replayed",
  warning: "Warnings",
  blocked: "Blocked",
};

/**
 * Bulk replay for the mitigation audit trail.
 *
 * Groups the currently filtered entries into their original mitigation batches
 * (by correlation ID), lets you pick which ones to re-run, then replays each
 * with the exact stored parameters — preflight, replay, page verification —
 * and reports a per-batch + aggregate summary.
 */
export function MitigationBulkReplay({
  entries,
  scopeLabel,
  isImported,
}: {
  entries: TuningLogEntry[];
  scopeLabel?: string;
  isImported?: (e: TuningLogEntry) => boolean;
}) {
  const paper = usePaper();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, BatchResult>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const cancelled = useRef(false);
  const abort = useRef<AbortController | null>(null);

  /** Replayable batches inside the current filter scope, newest first. */
  const batches = useMemo<Batch[]>(() => {
    const map = new Map<string, Batch>();
    for (const e of entries) {
      if (e.source !== "mitigation" || e.kind !== "rule" || e.rule === "undo") continue;
      if (!e.correlationId) continue;
      const existing = map.get(e.correlationId);
      if (existing) {
        existing.entries.push(e);
        existing.ts = Math.max(existing.ts, e.ts);
        if (e.phase !== "preview") existing.phase = "applied";
      } else {
        map.set(e.correlationId, {
          correlationId: e.correlationId,
          label: e.mitigation ?? "Mitigation",
          ts: e.ts,
          entries: [e],
          imported: isImported?.(e) ?? false,
          phase: e.phase === "preview" ? "preview" : "applied",
        });
      }
    }
    return [...map.values()].sort((a, b) => b.ts - a.ts);
  }, [entries, isImported]);

  const selectable = batches.filter((b) => !b.imported);
  const chosen = selectable.filter((b) => selected[b.correlationId]);

  const toggleAll = (on: boolean) =>
    setSelected(
      on ? Object.fromEntries(selectable.map((b) => [b.correlationId, true])) : {},
    );

  const run = useCallback(async () => {
    if (chosen.length === 0) return;
    cancelled.current = false;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setDone(0);
    setResults(
      Object.fromEntries(
        chosen.map((b) => [b.correlationId, { correlationId: b.correlationId, status: "pending", issues: [] }]),
      ),
    );

    let ok = 0;
    let warned = 0;
    let blocked = 0;

    for (const batch of chosen) {
      if (cancelled.current) break;
      setResults((prev) => ({
        ...prev,
        [batch.correlationId]: { ...prev[batch.correlationId], status: "running" },
      }));

      let result: BatchResult = { correlationId: batch.correlationId, status: "ok", issues: [] };
      try {
        const pre = preflightReplay(paper.tuningLog, batch.entries[0], { imported: batch.imported });
        if (!pre.ok) {
          result = { ...result, status: "blocked", issues: pre.issues };
        } else {
          const res = paper.replayMitigation(batch.correlationId);
          if (!res) {
            result = {
              ...result,
              status: "blocked",
              issues: [
                ...pre.issues,
                {
                  code: "replay-returned-null",
                  kind: "missing-route-data",
                  severity: "blocker",
                  reason: "The scanner rejected the replay",
                  detail: "No rule entries survived re-grouping for this correlation ID.",
                  hint: "Reload the audit trail and retry this batch on its own.",
                  retryable: true,
                },
              ],
            };
          } else {
            const symbols = res.outcome?.symbols ?? [];
            const routes = symbols.length
              ? await verifyReplayRoutes(symbols, controller.signal)
              : [];
            const all = [...pre.issues, ...routeIssues(routes)];
            const hasBlocker = all.some((i) => i.severity === "blocker");
            result = {
              correlationId: batch.correlationId,
              status: hasBlocker ? "blocked" : all.length > 0 ? "warning" : "ok",
              newCorrelationId: res.correlationId,
              matched: res.outcome.matched,
              delivered: res.outcome.delivered,
              rules: res.entries.map((e) => `${e.ruleLabel} → ${e.newValue}${e.unit}`).join(" · "),
              pagesChecked: routes.length,
              issues: all,
            };
          }
        }
      } catch (err) {
        if (controller.signal.aborted) break;
        result = {
          correlationId: batch.correlationId,
          status: "blocked",
          issues: [
            {
              code: "unexpected",
              kind: "state",
              severity: "blocker",
              reason: "Unexpected error during replay",
              detail: err instanceof Error ? err.message : String(err),
              hint: "Retry this batch individually.",
              retryable: true,
            },
          ],
        };
      }

      if (result.status === "ok") ok += 1;
      else if (result.status === "warning") warned += 1;
      else blocked += 1;

      setResults((prev) => ({ ...prev, [batch.correlationId]: result }));
      setDone((n) => n + 1);
    }

    setBusy(false);
    if (cancelled.current) {
      toast.warning("Bulk replay stopped", { description: `${ok + warned + blocked} batch(es) processed before cancel.` });
      return;
    }
    const desc = `${ok} clean · ${warned} with warnings · ${blocked} blocked`;
    if (blocked > 0) toast.error(`Bulk replay finished — ${blocked} blocked`, { description: desc });
    else if (warned > 0) toast.warning("Bulk replay finished with warnings", { description: desc });
    else toast.success(`Replayed ${ok} mitigation batch(es)`, { description: desc });
  }, [chosen, paper]);

  const resultList = Object.values(results);
  const totals = {
    ok: resultList.filter((r) => r.status === "ok").length,
    warning: resultList.filter((r) => r.status === "warning").length,
    blocked: resultList.filter((r) => r.status === "blocked").length,
    matched: resultList.reduce((s, r) => s + (r.matched ?? 0), 0),
    delivered: resultList.reduce((s, r) => s + (r.delivered ?? 0), 0),
    pages: resultList.reduce((s, r) => s + (r.pagesChecked ?? 0), 0),
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          cancelled.current = true;
          abort.current?.abort();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 text-xs">
          <RotateCw className="mr-1 h-3 w-3" />
          Bulk replay
          {batches.length > 0 ? ` (${batches.length})` : ""}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Bulk replay mitigations</DialogTitle>
          <DialogDescription>
            Re-runs each selected mitigation with the exact same stored parameters, then verifies the
            affected asset pages. Scope: {scopeLabel ?? "current filters"} · {batches.length} batch
            {batches.length === 1 ? "" : "es"} in view. Simulated data.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <Checkbox
              id="bulk-replay-all"
              checked={selectable.length > 0 && chosen.length === selectable.length}
              onCheckedChange={(v) => toggleAll(Boolean(v))}
              disabled={busy || selectable.length === 0}
            />
            <label htmlFor="bulk-replay-all" className="cursor-pointer">
              Select all replayable ({selectable.length})
            </label>
          </div>
          <span className="text-muted-foreground">{chosen.length} selected</span>
        </div>

        <ScrollArea className="max-h-[320px] pr-3">
          <ul className="space-y-2">
            {batches.length === 0 ? (
              <li className="rounded-md border border-border/60 p-3 text-xs text-muted-foreground">
                No replayable mitigation batches inside the current filter scope.
              </li>
            ) : null}
            {batches.map((b) => {
              const r = results[b.correlationId];
              return (
                <li
                  key={b.correlationId}
                  className={cn(
                    "rounded-md border p-2.5 text-xs",
                    r?.status === "blocked"
                      ? "border-destructive/40 bg-destructive/5"
                      : r?.status === "warning"
                        ? "border-amber-500/30 bg-amber-500/5"
                        : "border-border/60",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Checkbox
                      checked={Boolean(selected[b.correlationId])}
                      disabled={busy || b.imported}
                      onCheckedChange={(v) =>
                        setSelected((prev) => ({ ...prev, [b.correlationId]: Boolean(v) }))
                      }
                    />
                    <span className="font-medium">{b.label}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {b.entries.length} rule{b.entries.length === 1 ? "" : "s"}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {b.phase}
                    </Badge>
                    {b.imported ? (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        imported · review-only
                      </Badge>
                    ) : null}
                    {r ? (
                      <Badge
                        variant="outline"
                        className={cn(
                          "ml-auto text-[10px]",
                          r.status === "ok" && "border-emerald-500/40 text-emerald-400",
                          r.status === "warning" && "border-amber-500/40 text-amber-300",
                          r.status === "blocked" && "border-destructive/40 text-destructive",
                        )}
                      >
                        {r.status === "running" ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : r.status === "ok" ? (
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                        ) : r.status === "blocked" ? (
                          <X className="mr-1 h-3 w-3" />
                        ) : r.status === "warning" ? (
                          <AlertTriangle className="mr-1 h-3 w-3" />
                        ) : null}
                        {STATUS_LABEL[r.status]}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                    {b.correlationId} · {new Date(b.ts).toLocaleString()}
                  </p>
                  {r?.rules ? <p className="mt-1 text-muted-foreground">{r.rules}</p> : null}
                  {r && r.status !== "pending" && r.status !== "running" && r.newCorrelationId ? (
                    <p className="mt-1 text-muted-foreground">
                      {r.matched} match(es) · {r.delivered} delivery(s) · {r.pagesChecked} page
                      {r.pagesChecked === 1 ? "" : "s"} checked → <span className="font-mono">{r.newCorrelationId}</span>
                    </p>
                  ) : null}
                  {r && r.issues.length > 0 ? (
                    <p className="mt-1 text-muted-foreground">{summarizeIssues(r.issues)}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </ScrollArea>

        {busy || resultList.length > 0 ? (
          <div className="space-y-2">
            <Progress aria-label="Bulk replay progress" value={chosen.length ? (done / chosen.length) * 100 : 0} className="h-1.5" />
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>
                {done}/{chosen.length} processed
              </span>
              <span className="text-emerald-400">{totals.ok} clean</span>
              <span className="text-amber-300">{totals.warning} warnings</span>
              <span className="text-destructive">{totals.blocked} blocked</span>
              <span>
                {totals.matched} total match(es) · {totals.delivered} delivery(s) · {totals.pages} page checks
              </span>
            </div>
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          {busy ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                cancelled.current = true;
                abort.current?.abort();
              }}
            >
              Stop
            </Button>
          ) : null}
          <Button size="sm" disabled={busy || chosen.length === 0} onClick={() => void run()}>
            {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RotateCw className="mr-1 h-3.5 w-3.5" />}
            Replay {chosen.length || ""} selected
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

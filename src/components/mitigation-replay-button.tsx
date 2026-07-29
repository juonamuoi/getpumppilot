import { useCallback, useRef, useState } from "react";
import { AlertTriangle, Info, Loader2, RotateCw, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePaper, type TuningLogEntry } from "@/lib/paper-store";
import {
  KIND_LABEL,
  preflightReplay,
  routeIssues,
  summarizeIssues,
  verifyReplayRoutes,
  type ReplayIssue,
  type RouteFetchResult,
} from "@/lib/replay-diagnostics";
import { cn } from "@/lib/utils";

function IssueRow({ issue }: { issue: ReplayIssue }) {
  const blocker = issue.severity === "blocker";
  return (
    <li
      className={cn(
        "rounded-md border p-2.5 text-xs",
        blocker ? "border-destructive/40 bg-destructive/5" : "border-amber-500/30 bg-amber-500/5",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {blocker ? (
          <X className="h-3.5 w-3.5 shrink-0 text-destructive" />
        ) : (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
        )}
        <span className="font-medium">{issue.reason}</span>
        <Badge variant="outline" className="text-[10px]">
          {KIND_LABEL[issue.kind]}
        </Badge>
        <Badge
          variant="outline"
          className={cn(
            "text-[10px]",
            blocker ? "border-destructive/40 text-destructive" : "border-amber-500/40 text-amber-300",
          )}
        >
          {blocker ? "blocker" : "warning"}
        </Badge>
        {issue.retryable ? (
          <Badge variant="outline" className="border-border/60 text-[10px] text-muted-foreground">
            retryable
          </Badge>
        ) : null}
      </div>
      <p className="mt-1 text-muted-foreground">{issue.detail}</p>
      <p className="mt-1 flex items-start gap-1 text-[11px] text-muted-foreground/80">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        {issue.hint}
      </p>
    </li>
  );
}

/**
 * Replay button with detailed failure reporting.
 *
 * Runs a preflight over the stored audit batch (missing route data, mismatched
 * rule keys/values/operators, review-only state), then — after a successful
 * replay — verifies that every affected asset page still answers 200. Anything
 * that fails opens a dialog listing each reason, its evidence and a fix hint,
 * with a one-click retry for the transient cases.
 */
export function MitigationReplayButton({
  entry,
  imported = false,
}: {
  entry: TuningLogEntry;
  imported?: boolean;
}) {
  const paper = usePaper();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState<ReplayIssue[]>([]);
  const [routes, setRoutes] = useState<RouteFetchResult[]>([]);
  const [attempts, setAttempts] = useState(0);
  const abort = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    setBusy(true);
    setAttempts((n) => n + 1);
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;

    try {
      const pre = preflightReplay(paper.tuningLog, entry, { imported });
      if (!pre.ok) {
        setIssues(pre.issues);
        setRoutes([]);
        setOpen(true);
        toast.error("Replay blocked", { description: summarizeIssues(pre.blockers) });
        return;
      }

      const res = entry.correlationId ? paper.replayMitigation(entry.correlationId) : null;
      if (!res) {
        setIssues([
          ...pre.issues,
          {
            code: "replay-returned-null",
            kind: "missing-route-data",
            severity: "blocker",
            reason: "The scanner rejected the replay",
            detail:
              "Preflight passed but no rule entries survived re-grouping — history may have changed while the dialog was open.",
            hint: "Reload the audit trail and retry.",
            retryable: true,
          },
        ]);
        setRoutes([]);
        setOpen(true);
        toast.error("Replay failed — see details");
        return;
      }

      const symbols = res.outcome?.symbols ?? [];
      const results = symbols.length
        ? await verifyReplayRoutes(symbols, controller.signal)
        : [];
      const fetchIssues = routeIssues(results);
      const all = [...pre.issues, ...fetchIssues];
      setRoutes(results);
      setIssues(all);

      const blockers = all.filter((i) => i.severity === "blocker");
      if (blockers.length > 0) {
        setOpen(true);
        toast.error(`Replay ran, but ${blockers.length} page check${blockers.length === 1 ? "" : "s"} failed`, {
          description: summarizeIssues(blockers),
        });
        return;
      }

      const detail = `${res.entries
        .map((e) => `${e.ruleLabel} → ${e.newValue}${e.unit}`)
        .join(" · ")} — ${res.outcome.matched} match(es), ${res.outcome.delivered} delivery(s)`;

      if (all.length > 0) {
        setOpen(true);
        toast.warning(`Replayed "${res.label}" with warnings`, { description: detail });
      } else {
        toast.success(`Replayed "${res.label}"`, {
          description: `${detail} · ${results.length} page${results.length === 1 ? "" : "s"} verified 200 · ${res.correlationId}`,
        });
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setIssues([
        {
          code: "unexpected",
          kind: "state",
          severity: "blocker",
          reason: "Unexpected error during replay",
          detail: err instanceof Error ? err.message : String(err),
          hint: "Retry — if it persists, export the entry and re-create the mitigation.",
          retryable: true,
        },
      ]);
      setRoutes([]);
      setOpen(true);
      toast.error("Replay failed unexpectedly");
    } finally {
      setBusy(false);
    }
  }, [entry, imported, paper]);

  const blockers = issues.filter((i) => i.severity === "blocker");
  const canRetry = issues.length === 0 || issues.some((i) => i.retryable);

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-6 px-2 text-[10px]"
        disabled={busy}
        onClick={() => void run()}
        title={
          imported
            ? "Imported records are review-only — click for details"
            : "Re-run this mitigation with the same parameters"
        }
      >
        {busy ? (
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        ) : (
          <RotateCw className="mr-1 h-3 w-3" />
        )}
        Replay
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {blockers.length > 0 ? (
                <X className="h-4 w-4 text-destructive" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-400" />
              )}
              {blockers.length > 0 ? "Replay could not complete" : "Replay finished with warnings"}
            </DialogTitle>
            <DialogDescription className="font-mono text-[11px]">
              {entry.correlationId ?? "no correlation id"} · attempt {attempts}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[50vh] pr-3">
            <ul className="space-y-2">
              {issues.map((i) => (
                <IssueRow key={i.code} issue={i} />
              ))}
            </ul>

            {routes.length > 0 ? (
              <div className="mt-4 space-y-1">
                <p className="text-[11px] font-medium text-muted-foreground">
                  Page fetch results ({routes.filter((r) => r.ok).length}/{routes.length} returned 200)
                </p>
                <ul className="space-y-1">
                  {routes.map((r) => (
                    <li
                      key={r.symbol}
                      className="flex items-center justify-between gap-2 rounded border border-border/50 bg-muted/10 px-2 py-1 font-mono text-[10px]"
                    >
                      <span className="truncate">{r.path}</span>
                      <span
                        className={cn(
                          r.ok ? "text-emerald-400" : "text-destructive",
                          "shrink-0",
                        )}
                      >
                        {r.status ?? "ERR"} · {r.ms}ms
                        {r.redirected ? " · redirected" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </ScrollArea>

          <DialogFooter className="gap-2 sm:justify-between">
            <span className="text-[11px] text-muted-foreground">
              {blockers.length} blocker{blockers.length === 1 ? "" : "s"} ·{" "}
              {issues.length - blockers.length} warning
              {issues.length - blockers.length === 1 ? "" : "s"}
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Close
              </Button>
              <Button size="sm" disabled={busy || !canRetry} onClick={() => void run()}>
                {busy ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCw className="mr-2 h-3.5 w-3.5" />
                )}
                Retry replay
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

import { useMemo } from "react";
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
import { ArrowRight, Check, Download, History, X } from "lucide-react";
import { toast } from "sonner";
import { usePaper, type TuningLogEntry } from "@/lib/paper-store";
import {
  diffSeoSnapshots,
  seoSnapshot,
  type CheckKey,
  type PageSeoCheck,
} from "@/lib/mitigation-seo-checks";
import {
  buildReplayReportCsv,
  buildReplayReportJson,
  downloadReplayReport,
} from "@/lib/replay-report";
import { cn } from "@/lib/utils";

const CHECKS: { key: CheckKey; label: string }[] = [
  { key: "canonical", label: "Canonical" },
  { key: "robots", label: "Robots" },
  { key: "redirect", label: "Redirect" },
];

function batchOf(log: TuningLogEntry[], correlationId?: string) {
  if (!correlationId) return [];
  return log.filter((e) => e.correlationId === correlationId && e.rule !== "undo");
}

function StatusPill({ check }: { check?: PageSeoCheck[CheckKey] }) {
  if (!check) return <span className="text-muted-foreground">—</span>;
  const ok = check.status === "pass";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px]",
        ok
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
          : "border-destructive/40 bg-destructive/10 text-destructive",
      )}
      title={check.detail}
    >
      {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      {ok ? "pass" : "fail"}
    </span>
  );
}

/**
 * Before/after diff between a recorded mitigation and its replay: rule
 * parameters, alert outcome, and the canonical / robots / redirect crawl
 * checks for every asset page each run surfaced.
 */
export function MitigationReplayDiff({ entry }: { entry: TuningLogEntry }) {
  const { tuningLog } = usePaper();

  const { prevId, replayId } = useMemo(() => {
    if (entry.replayOf) return { prevId: entry.replayOf, replayId: entry.correlationId };
    const replay = tuningLog
      .filter((e) => e.replayOf === entry.correlationId)
      .sort((a, b) => b.ts - a.ts)[0];
    return { prevId: entry.correlationId, replayId: replay?.correlationId };
  }, [entry, tuningLog]);

  const prev = batchOf(tuningLog, prevId);
  const next = batchOf(tuningLog, replayId);
  const available = prev.length > 0 && next.length > 0;

  const prevOutcome = prev.find((e) => e.outcome)?.outcome;
  const nextOutcome = next.find((e) => e.outcome)?.outcome;

  const diff = useMemo(
    () => diffSeoSnapshots(seoSnapshot(prevOutcome?.symbols ?? []), seoSnapshot(nextOutcome?.symbols ?? [])),
    [prevOutcome, nextOutcome],
  );

  const ruleRows = useMemo(() => {
    const keys = [...new Set([...prev, ...next].map((e) => e.rule))].sort();
    return keys.map((rule) => {
      const b = prev.find((e) => e.rule === rule);
      const a = next.find((e) => e.rule === rule);
      return {
        rule,
        label: b?.ruleLabel ?? a?.ruleLabel ?? rule,
        unit: b?.unit ?? a?.unit ?? "",
        b: b?.newValue,
        a: a?.newValue,
        changed: b?.newValue !== a?.newValue,
      };
    });
  }, [prev, next]);

  const exportReport = (format: "csv" | "json") => {
    if (!available || !replayId) return;
    const input = { previousId: prevId!, replayId, previous: prev, replay: next };
    const body = format === "csv" ? buildReplayReportCsv(input) : buildReplayReportJson(input);
    downloadReplayReport(body, format, replayId);
    toast.success(`Replay report exported as ${format.toUpperCase()}`);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 text-[10px]"
          disabled={!available}
          title={
            available
              ? "Compare this mitigation with its replay"
              : "No replay recorded for this mitigation yet"
          }
        >
          <History className="mr-1 h-3 w-3" />
          Replay diff
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Replay diff</DialogTitle>
          <DialogDescription className="font-mono text-[11px]">
            {prevId} <ArrowRight className="inline h-3 w-3" /> {replayId ?? "—"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-muted-foreground">
            Export inputs, stored preview context, results and timestamps:
          </span>
          <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => exportReport("json")}>
            <Download className="mr-1 h-3 w-3" />
            JSON
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => exportReport("csv")}>
            <Download className="mr-1 h-3 w-3" />
            CSV
          </Button>
        </div>

        <ScrollArea className="max-h-[65vh] pr-3">
          <div className="space-y-5 text-xs">
            <section className="space-y-2">
              <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Parameters
              </h4>
              <div className="rounded-lg border border-border/60">
                {ruleRows.map((r) => (
                  <div
                    key={r.rule}
                    className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 border-b border-border/40 px-3 py-1.5 last:border-b-0"
                  >
                    <span>{r.label}</span>
                    <span className="text-muted-foreground">
                      {r.b ?? "—"}
                      {r.unit}
                    </span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <span className={cn(r.changed ? "text-amber-400" : "text-muted-foreground")}>
                      {r.a ?? "—"}
                      {r.unit}
                    </span>
                  </div>
                ))}
                {ruleRows.length === 0 && (
                  <p className="px-3 py-2 text-muted-foreground">No rule entries recorded.</p>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {ruleRows.some((r) => r.changed)
                  ? "Parameters differ — the replay did not reproduce the original inputs exactly."
                  : "Replay used identical parameters."}
              </p>
            </section>

            <section className="space-y-2">
              <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Outcome
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { title: "Previous run", o: prevOutcome },
                  { title: "Replay", o: nextOutcome },
                ].map((col) => (
                  <div key={col.title} className="rounded-lg border border-border/60 p-3">
                    <p className="mb-1 font-medium">{col.title}</p>
                    {col.o ? (
                      <ul className="space-y-0.5 text-muted-foreground">
                        <li>{col.o.matched} matched</li>
                        <li>{col.o.delivered} deliveries</li>
                        <li>{col.o.symbols.join(", ") || "no symbols"}</li>
                        <li>{format(new Date(col.o.ts), "MMM d, HH:mm:ss")}</li>
                      </ul>
                    ) : (
                      <p className="text-muted-foreground">Outcome pending</p>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Crawl checks (canonical / robots / redirect)
                </h4>
                {diff.regressions > 0 && (
                  <Badge variant="destructive" className="text-[10px]">
                    {diff.regressions} regression{diff.regressions === 1 ? "" : "s"}
                  </Badge>
                )}
                {diff.improvements > 0 && (
                  <Badge className="text-[10px]">{diff.improvements} fixed</Badge>
                )}
                {diff.unchanged && (
                  <Badge variant="secondary" className="text-[10px]">
                    No change
                  </Badge>
                )}
              </div>

              <div className="overflow-hidden rounded-lg border border-border/60">
                <div className="grid grid-cols-[minmax(70px,1fr)_repeat(3,minmax(0,1.4fr))] gap-2 border-b border-border/60 bg-muted/20 px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <span>Page</span>
                  {CHECKS.map((c) => (
                    <span key={c.key}>{c.label}</span>
                  ))}
                </div>
                {diff.rows.map((row) => (
                  <div
                    key={row.symbol}
                    className="grid grid-cols-[minmax(70px,1fr)_repeat(3,minmax(0,1.4fr))] items-center gap-2 border-b border-border/40 px-3 py-2 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{row.symbol}</p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {(row.after ?? row.before)?.path}
                      </p>
                      {row.presence !== "both" && (
                        <Badge variant="outline" className="mt-1 text-[10px]">
                          {row.presence === "added" ? "New in replay" : "Dropped"}
                        </Badge>
                      )}
                    </div>
                    {CHECKS.map((c) => (
                      <div key={c.key} className="flex items-center gap-1">
                        <StatusPill check={row.before?.[c.key]} />
                        <ArrowRight
                          className={cn(
                            "h-3 w-3",
                            row.changed.includes(c.key) ? "text-amber-400" : "text-muted-foreground/50",
                          )}
                        />
                        <StatusPill check={row.after?.[c.key]} />
                      </div>
                    ))}
                  </div>
                ))}
                {diff.rows.length === 0 && (
                  <p className="px-3 py-3 text-muted-foreground">
                    Neither run surfaced any asset pages, so there is nothing to crawl-check.
                  </p>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Checks run against the canonical origin and public/robots.txt. Mock/demo data —
                results are illustrative, not a live crawl.
              </p>
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

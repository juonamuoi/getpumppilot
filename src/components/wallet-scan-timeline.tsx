/* ------------------------------------------------------------------ *
 * Wallet scan timeline — review past scans (demo data) and see exactly
 * when each threat was first detected.
 * ------------------------------------------------------------------ */
import { useMemo, useState } from "react";
import { format, formatDistanceToNowStrict } from "date-fns";
import {
  History,
  Radar,
  ShieldCheck,
  ShieldOff,
  Clock,
  Sparkles,
  CheckCircle2,
  Trash2,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { shortAddress } from "@/lib/wallet-scan";
import {
  clearScanHistory,
  useScanHistory,
  type ScanRun,
  type ScanTrigger,
} from "@/lib/wallet-session";

const TRIGGER_LABEL: Record<ScanTrigger, string> = {
  connect: "On connect",
  manual: "Manual rescan",
  background: "Background sweep",
};

function usd(n: number) {
  return `$${Math.round(n).toLocaleString()}`;
}

type Filter = "all" | "threats" | "new" | ScanTrigger;

export function WalletScanTimeline() {
  const runs = useScanHistory();
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return runs.filter((r) => {
      if (filter === "all") return true;
      if (filter === "threats") return r.threats.length > 0;
      if (filter === "new") return r.newThreatKeys.length > 0;
      return r.trigger === filter;
    });
  }, [runs, filter]);

  /** First-detection map across all history, newest threat first. */
  const firstDetections = useMemo(() => {
    const map = new Map<string, { at: number; run: ScanRun; label: string; risk: string }>();
    for (const r of [...runs].sort((a, b) => a.scannedAt - b.scannedAt)) {
      for (const t of r.threats) {
        if (!map.has(t.key)) {
          map.set(t.key, {
            at: t.firstSeenAt,
            run: r,
            label: `${t.token} → ${shortAddress(t.spender)}`,
            risk: t.risk,
          });
        }
      }
    }
    return [...map.entries()].sort((a, b) => b[1].at - a[1].at);
  }, [runs]);

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" /> Wallet scan timeline
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Every scan run is recorded locally (demo data) with the moment each threat was
            first detected.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <SelectTrigger className="h-8 w-[165px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All scans</SelectItem>
              <SelectItem value="threats">With threats</SelectItem>
              <SelectItem value="new">New detections</SelectItem>
              <SelectItem value="connect">On connect</SelectItem>
              <SelectItem value="manual">Manual rescans</SelectItem>
              <SelectItem value="background">Background sweeps</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs"
            disabled={runs.length === 0}
            onClick={() => {
              clearScanHistory();
              toast.info("Scan timeline cleared");
            }}
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {runs.length === 0 ? (
          <p className="rounded-md border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
            No scans recorded yet. Connect a wallet or run “Rescan my wallet” to start the
            timeline.
          </p>
        ) : (
          <>
            {firstDetections.length > 0 && (
              <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                  <Sparkles className="h-3.5 w-3.5 text-amber-400" /> First detected
                </div>
                <ul className="space-y-1.5">
                  {firstDetections.slice(0, 5).map(([key, d]) => (
                    <li
                      key={key}
                      className="flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <span className="flex items-center gap-2 font-mono">
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            d.risk === "critical" ? "bg-rose-500" : "bg-amber-400",
                          )}
                        />
                        {d.label}
                      </span>
                      <span className="text-muted-foreground">
                        {format(new Date(d.at), "d MMM HH:mm:ss")} ·{" "}
                        {formatDistanceToNowStrict(new Date(d.at), { addSuffix: true })} ·{" "}
                        {TRIGGER_LABEL[d.run.trigger]}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <ol className="relative space-y-3 border-l border-border/60 pl-5">
              {filtered.map((run) => {
                const open = openId === run.correlationId;
                const hasNew = run.newThreatKeys.length > 0;
                const clear = run.threats.length === 0;
                return (
                  <li key={run.correlationId} className="relative">
                    <span
                      className={cn(
                        "absolute -left-[26px] top-2 flex h-3.5 w-3.5 items-center justify-center rounded-full ring-4 ring-background",
                        hasNew
                          ? "bg-rose-500"
                          : clear
                            ? "bg-emerald-500"
                            : "bg-amber-400",
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : run.correlationId)}
                      className={cn(
                        "w-full rounded-md border border-border/60 p-3 text-left transition-colors hover:bg-muted/30",
                        hasNew && "border-rose-500/40 bg-rose-500/5",
                        clear && "border-emerald-500/30",
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold">
                          {format(new Date(run.scannedAt), "d MMM yyyy HH:mm:ss")}
                        </span>
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          <Radar className="h-3 w-3" /> {TRIGGER_LABEL[run.trigger]}
                        </Badge>
                        {clear ? (
                          <Badge className="gap-1 bg-emerald-500/15 text-[10px] text-emerald-300">
                            <ShieldCheck className="h-3 w-3" /> Clear
                          </Badge>
                        ) : (
                          <Badge className="gap-1 bg-rose-500/15 text-[10px] text-rose-300">
                            <ShieldOff className="h-3 w-3" /> {run.threats.length} threat
                            {run.threats.length > 1 ? "s" : ""}
                          </Badge>
                        )}
                        {hasNew && (
                          <Badge className="gap-1 bg-amber-500/15 text-[10px] text-amber-300">
                            <Sparkles className="h-3 w-3" /> {run.newThreatKeys.length} new
                          </Badge>
                        )}
                        {run.resolvedThreatKeys.length > 0 && (
                          <Badge variant="outline" className="gap-1 text-[10px]">
                            <CheckCircle2 className="h-3 w-3" /> {run.resolvedThreatKeys.length}{" "}
                            resolved
                          </Badge>
                        )}
                        <ChevronRight
                          className={cn(
                            "ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform",
                            open && "rotate-90",
                          )}
                        />
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                        <span>{run.approvalCount} approvals checked</span>
                        <span>Value at risk {usd(run.totalValueAtRiskUsd)}</span>
                        <span className="font-mono">{run.correlationId}</span>
                      </div>
                    </button>

                    {open && (
                      <div className="mt-2 space-y-2">
                        {run.threats.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            No risky approvals were present at this scan.
                          </p>
                        ) : (
                          run.threats.map((t) => (
                            <div
                              key={t.key}
                              className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono font-medium">
                                  {t.token} → {shortAddress(t.spender)}
                                </span>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-[10px] capitalize",
                                    t.risk === "critical" && "border-rose-500/50 text-rose-300",
                                  )}
                                >
                                  {t.risk}
                                </Badge>
                                {t.isNew && (
                                  <Badge className="bg-amber-500/15 text-[10px] text-amber-300">
                                    First detected here
                                  </Badge>
                                )}
                                <span className="ml-auto text-muted-foreground">
                                  {usd(t.valueAtRiskUsd)} at risk
                                </span>
                              </div>
                              <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                First detected {format(new Date(t.firstSeenAt), "d MMM HH:mm:ss")} (
                                {formatDistanceToNowStrict(new Date(t.firstSeenAt), {
                                  addSuffix: true,
                                })}
                                )
                              </p>
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                {t.spenderLabel} · {t.reasons[0]}
                              </p>
                              {t.correlationId && (
                                <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                                  {t.correlationId}
                                </p>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
              {filtered.length === 0 && (
                <li className="text-xs text-muted-foreground">No scans match this filter.</li>
              )}
            </ol>
          </>
        )}
      </CardContent>
    </Card>
  );
}

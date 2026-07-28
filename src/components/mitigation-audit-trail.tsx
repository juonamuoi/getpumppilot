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
import type { TuningLogEntry } from "@/lib/paper-store";
import { MitigationDecisionExport } from "@/components/mitigation-decision-export";


type OutcomeFilter = "all" | "alerts-fired" | "no-matches" | "channels-muted" | "pending";

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
  const [q, setQ] = useState("");
  const [outcome, setOutcome] = useState<OutcomeFilter>("all");

  const entries = useMemo(() => {
    return log
      .filter((e) => e.source === "mitigation" && !!e.mitigation)
      .filter((e) => {
        if (outcome === "all") return true;
        if (outcome === "pending") return !e.outcome;
        return e.outcome?.status === outcome;
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
  }, [log, q, outcome]);

  const rows = () =>
    entries.map((e) => ({
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
            <MitigationDecisionExport log={log} />
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => download("csv")}>
              Quick CSV
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => download("json")}>
              Quick JSON
            </Button>
          </div>

        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            value={q}
            onChange={(ev) => setQ(ev.target.value)}
            placeholder="Search mitigation, rule, symbol or correlation ID"
            className="h-8 w-full max-w-xs text-xs"
          />
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
                  <button
                    type="button"
                    className="ml-auto font-mono text-[10px] text-muted-foreground underline-offset-2 hover:underline"
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
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

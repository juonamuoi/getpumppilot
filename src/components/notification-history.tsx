import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Bell, Copy, Download, Search, Trash2 } from "lucide-react";
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
import {
  alertHistoryCsv,
  clearAlertHistory,
  useAlertHistory,
  type AlertEvent,
} from "@/lib/notify-history";

const RISK_STYLES: Record<string, string> = {
  critical: "bg-rose-500/15 text-rose-300 hover:bg-rose-500/15",
  high: "bg-orange-500/15 text-orange-300 hover:bg-orange-500/15",
  medium: "bg-amber-500/15 text-amber-300 hover:bg-amber-500/15",
  low: "bg-sky-500/15 text-sky-300 hover:bg-sky-500/15",
};

const WINDOWS: Record<string, number> = {
  "24h": 24 * 3600_000,
  "7d": 7 * 24 * 3600_000,
  "30d": 30 * 24 * 3600_000,
};

function DeliveryChip({ label, status }: { label: string; status: string }) {
  const cls =
    status === "sent"
      ? "bg-emerald-500/15 text-emerald-300"
      : status === "failed"
        ? "bg-rose-500/15 text-rose-300"
        : "bg-muted text-muted-foreground";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${cls}`}>
      {label} {status}
    </span>
  );
}

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Notification history — every risky-approval detection alert with its
 * timestamp, risk level, correlation ID and per-channel delivery outcome.
 */
export function NotificationHistory() {
  const events = useAlertHistory();
  const [q, setQ] = useState("");
  const [risk, setRisk] = useState("all");
  const [range, setRange] = useState("all");

  const rows = useMemo(() => {
    const cutoff = WINDOWS[range] ? Date.now() - WINDOWS[range] : 0;
    const needle = q.trim().toLowerCase();
    return events.filter((e: AlertEvent) => {
      if (cutoff && e.ts < cutoff) return false;
      if (risk !== "all" && e.risk !== risk) return false;
      if (!needle) return true;
      return [e.token, e.spender, e.spenderLabel, e.reason, e.correlationId, e.batchCorrelationId, e.address]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [events, q, risk, range]);

  const counts = useMemo(() => {
    const c = { critical: 0, high: 0, other: 0 };
    for (const e of rows) {
      if (e.risk === "critical") c.critical++;
      else if (e.risk === "high") c.high++;
      else c.other++;
    }
    return c;
  }, [rows]);

  return (
    <section className="rounded-xl border border-border/60 bg-card/60 p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Bell className="h-4 w-4 text-primary" /> Notification history
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Every risky approval detection alert, with timestamps, risk level and correlation IDs.
            Demo data — alerts are informational, not financial advice.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={rows.length === 0}
            onClick={() =>
              download(
                `pumppilot-alert-history-${Date.now()}.csv`,
                alertHistoryCsv(rows),
                "text/csv",
              )
            }
          >
            <Download className="mr-1 h-3.5 w-3.5" /> CSV
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={rows.length === 0}
            onClick={() =>
              download(
                `pumppilot-alert-history-${Date.now()}.json`,
                JSON.stringify(rows, null, 2),
                "application/json",
              )
            }
          >
            <Download className="mr-1 h-3.5 w-3.5" /> JSON
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={events.length === 0}
            onClick={() => {
              clearAlertHistory();
              toast.success("Notification history cleared");
            }}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Clear
          </Button>
        </div>
      </header>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search token, spender, correlation ID…"
            className="h-9 pl-8 text-xs"
          />
        </div>
        <Select value={risk} onValueChange={setRisk}>
          <SelectTrigger className="h-9 w-[140px] text-xs">
            <SelectValue placeholder="Risk" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All risk levels</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="h-9 w-[130px] text-xs">
            <SelectValue placeholder="Range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All time</SelectItem>
            <SelectItem value="24h">Last 24h</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        <span>{rows.length} alert{rows.length === 1 ? "" : "s"}</span>
        <span>· {counts.critical} critical</span>
        <span>· {counts.high} high</span>
        <span>· {counts.other} other</span>
      </div>

      <ul className="mt-3 space-y-2">
        {rows.length === 0 && (
          <li className="rounded-lg border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
            No detection alerts yet. Run a wallet scan to populate this history.
          </li>
        )}
        {rows.map((e) => (
          <li key={e.id} className="rounded-lg border border-border/60 bg-background/40 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={RISK_STYLES[e.risk] ?? "bg-muted text-muted-foreground"}>
                <AlertTriangle className="mr-1 h-3 w-3" />
                {String(e.risk).toUpperCase()}
              </Badge>
              <span className="text-sm font-medium">{e.token}</span>
              <span className="text-xs text-muted-foreground">
                → {e.spenderLabel ?? e.spender}
              </span>
              <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                {new Date(e.ts).toLocaleString()}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{e.reason}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <DeliveryChip label="Push" status={e.delivery.push} />
              <DeliveryChip label="Email" status={e.delivery.email} />
              {e.delivery.reportAttached && (
                <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-primary">
                  PDF attached
                </span>
              )}
              <span className="text-[11px] text-muted-foreground">
                Value at risk ${e.valueAtRiskUsd.toLocaleString()}
              </span>
              <button
                type="button"
                className="ml-auto flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-foreground"
                onClick={() => {
                  navigator.clipboard?.writeText(e.correlationId);
                  toast.success("Correlation ID copied");
                }}
              >
                <Copy className="h-3 w-3" /> {e.correlationId}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

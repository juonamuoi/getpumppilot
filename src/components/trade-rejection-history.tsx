import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, ShieldAlert, Trash2 } from "lucide-react";
import {
  clearRejections,
  rejectionsToCsv,
  useRejectionLog,
  type RejectionEntry,
} from "@/lib/rejection-log";
import { describeRiskBlock, riskBlockTitle } from "@/lib/risk-block";
import { toast } from "sonner";

function pct(n?: number) {
  if (n == null) return "—";
  return `${n.toFixed(n < 10 ? 1 : 0)}%`;
}

export function TradeRejectionHistory({ className }: { className?: string }) {
  const entries = useRejectionLog();
  const [q, setQ] = useState("");
  const [control, setControl] = useState("all");

  const controls = useMemo(
    () => Array.from(new Set(entries.map((e) => e.block.code))),
    [entries],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries.filter((e) => {
      if (control !== "all" && e.block.code !== control) return false;
      if (!needle) return true;
      return (
        e.symbol.toLowerCase().includes(needle) ||
        e.block.control.toLowerCase().includes(needle) ||
        e.block.remedy.toLowerCase().includes(needle)
      );
    });
  }, [entries, q, control]);

  const download = () => {
    const blob = new Blob([rejectionsToCsv(filtered)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pumppilot-rejections-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} rejection${filtered.length === 1 ? "" : "s"}`);
  };

  return (
    <Card className={`border-border/60 bg-card/60 ${className ?? ""}`}>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-400" />
            Trade rejection history
          </span>
          <span className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={download} disabled={!filtered.length}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!entries.length}
              onClick={() => {
                clearRejections();
                toast.success("Rejection history cleared");
              }}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Clear
            </Button>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_200px]">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search symbol, control or fix…"
            aria-label="Search rejection history"
          />
          <Select value={control} onValueChange={setControl}>
            <SelectTrigger aria-label="Filter by control">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All controls</SelectItem>
              {controls.map((c) => (
                <SelectItem key={c} value={c}>
                  {riskBlockTitle(c as RejectionEntry["block"]["code"])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <p className="rounded-lg border border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
            {entries.length
              ? "No rejections match these filters."
              : "No blocked orders yet. Rejections from risk controls will appear here."}
          </p>
        ) : (
          <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
            {filtered.map((e) => (
              <li key={e.id} className="space-y-1 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm">
                    <span
                      className={`mr-2 font-mono text-xs uppercase ${
                        e.side === "buy" ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {e.side}
                    </span>
                    <span className="font-semibold">{e.symbol}</span>{" "}
                    <span className="text-muted-foreground">
                      {e.qty.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                    </span>
                  </div>
                  <time
                    dateTime={new Date(e.ts).toISOString()}
                    className="text-[11px] text-muted-foreground"
                  >
                    {new Date(e.ts).toLocaleString()}
                  </time>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-destructive">
                    {riskBlockTitle(e.block.code)}
                  </span>
                  <span className="text-muted-foreground">
                    breached {pct(e.block.actualPct)} vs limit {pct(e.block.limitPct)}
                  </span>
                  <span className="rounded border border-border/60 px-2 py-0.5 text-muted-foreground">
                    {e.mode}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{describeRiskBlock(e.block)}</p>
                <p className="text-xs">
                  <span className="text-muted-foreground">Suggested fix: </span>
                  {e.block.remedy}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

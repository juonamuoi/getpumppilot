import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download } from "lucide-react";
import { toast } from "sonner";
import type { TuningLogEntry } from "@/lib/paper-store";

const FIELDS = [
  "id",
  "ts_local",
  "ts_utc",
  "source",
  "rule",
  "rule_label",
  "operator",
  "unit",
  "old_value",
  "new_value",
  "direction",
  "kind",
  "mitigation",
  "trigger",
  "recommended_value",
  "fragility_pct",
  "preset",
  "window",
  "matches_before",
  "matches_after",
  "near_miss_before",
  "near_miss_after",
  "reverted_at_local",
  "reverted_at_utc",
  "revert_reason",
] as const;

function toRow(e: TuningLogEntry): Record<string, string | number> {
  const looser = e.operator === ">=" ? e.newValue < e.oldValue : e.newValue > e.oldValue;
  return {
    id: e.id,
    ts_local: new Date(e.ts).toLocaleString(),
    ts_utc: new Date(e.ts).toISOString(),
    source: e.source ?? "manual-save",
    rule: e.rule,
    rule_label: e.ruleLabel,
    operator: e.operator,
    unit: e.unit,
    old_value: e.oldValue,
    new_value: e.newValue,
    direction: looser ? "loosened" : "tightened",
    kind: e.kind ?? "rule",
    mitigation: e.mitigation ?? "",
    trigger: e.trigger ?? "",
    recommended_value: e.recommendedValue ?? "",
    fragility_pct: e.fragilePct != null ? e.fragilePct.toFixed(1) : "",
    preset: e.preset ?? "",
    window: e.window ?? "",
    matches_before: e.matchesBefore ?? "",
    matches_after: e.matchesAfter ?? "",
    near_miss_before: e.nearMissBefore ?? "",
    near_miss_after: e.nearMissAfter ?? "",
    reverted_at_local: e.revertedAt ? new Date(e.revertedAt).toLocaleString() : "",
    reverted_at_utc: e.revertedAt ? new Date(e.revertedAt).toISOString() : "",
    revert_reason: e.revertReason ?? "",
  };
}

function csvCell(v: string | number): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function download(name: string, mime: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Downloads the scanner rule tuning audit log with old/new values and timestamps. */
export function TuningAuditExport({ log }: { log: TuningLogEntry[] }) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  const exportCsv = () => {
    const rows = log.map(toRow);
    const body = [
      FIELDS.join(","),
      ...rows.map((r) => FIELDS.map((f) => csvCell(r[f])).join(",")),
    ].join("\n");
    download(`pumppilot-tuning-audit-${stamp}.csv`, "text/csv;charset=utf-8", body);
    toast.success("Tuning audit log exported (CSV)", {
      description: `${log.length} entr${log.length === 1 ? "y" : "ies"} with old/new values and timestamps`,
    });
  };

  const exportJson = () => {
    const body = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        exportedAtLocal: new Date().toLocaleString(),
        entryCount: log.length,
        note: "PumpPilot AI scanner rule tuning audit log. Mock/demo data.",
        entries: log.map((e) => ({ ...toRow(e), raw: e })),
      },
      null,
      2,
    );
    download(`pumppilot-tuning-audit-${stamp}.json`, "application/json", body);
    toast.success("Tuning audit log exported (JSON)", {
      description: `${log.length} entr${log.length === 1 ? "y" : "ies"} including raw records`,
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-6 gap-1 px-2 text-[10px]"
          disabled={log.length === 0}
        >
          <Download className="h-3 w-3" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-[11px]">
          Download tuning audit log ({log.length})
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={exportCsv} className="text-xs">
          CSV (spreadsheet)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportJson} className="text-xs">
          JSON (with raw records)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

import { useMemo, useState } from "react";
import { GitCompare, Download, ArrowLeftRight } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { TuningLogEntry } from "@/lib/paper-store";
import {
  buildImportDiff,
  DIFF_STATUS_LABEL,
  type DiffStatus,
} from "@/lib/import-diff";

const ORDER: DiffStatus[] = ["changed", "import-only", "scope-only", "identical"];

const TONE: Record<DiffStatus, string> = {
  changed: "border-amber-500/40 bg-amber-500/5",
  "import-only": "border-sky-500/40 bg-sky-500/5",
  "scope-only": "border-violet-500/40 bg-violet-500/5",
  identical: "border-border/60 bg-muted/10",
};

function Side({
  title,
  entry,
  muted,
}: {
  title: string;
  entry?: TuningLogEntry;
  muted?: boolean;
}) {
  return (
    <div
      className={`min-w-0 rounded-md border border-border/40 p-2 ${muted ? "opacity-50" : "bg-background/40"}`}
    >
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{title}</p>
      {entry ? (
        <>
          <p className="truncate text-[11px] font-medium">{entry.ruleLabel}</p>
          <p className="truncate font-mono text-[10px] text-muted-foreground">
            {entry.operator} {entry.oldValue}
            {entry.unit} → {entry.newValue}
            {entry.unit}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {format(entry.ts, "d MMM yyyy HH:mm")} · {entry.phase ?? "applied"}
          </p>
        </>
      ) : (
        <p className="text-[11px] italic text-muted-foreground">Not present</p>
      )}
    </div>
  );
}

/**
 * Side-by-side comparison of file-imported mitigation records against the
 * audit entries currently visible under the active filters.
 */
export function MitigationImportDiff({
  imported,
  scope,
  scopeLabel,
}: {
  imported: TuningLogEntry[];
  /** The currently filtered live audit entries (imported rows excluded). */
  scope: TuningLogEntry[];
  scopeLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<DiffStatus | "all">("all");

  const diff = useMemo(() => buildImportDiff(imported, scope), [imported, scope]);
  const visible = useMemo(
    () => (status === "all" ? diff.pairs : diff.pairs.filter((p) => p.status === status)),
    [diff, status],
  );

  const exportDiff = (kind: "csv" | "json") => {
    const rows = visible.flatMap((p) =>
      p.fields.length
        ? p.fields.map((f) => ({
            key: p.key,
            correlationId: p.imported?.correlationId ?? p.live?.correlationId ?? "",
            status: p.status,
            field: f.label,
            imported: f.imported,
            currentScope: f.live,
          }))
        : [
            {
              key: p.key,
              correlationId: p.imported?.correlationId ?? p.live?.correlationId ?? "",
              status: p.status,
              field: "",
              imported: p.imported ? p.imported.ruleLabel : "",
              currentScope: p.live ? p.live.ruleLabel : "",
            },
          ],
    );
    if (rows.length === 0) {
      toast.error("Nothing to export in this diff view");
      return;
    }
    const body =
      kind === "json"
        ? JSON.stringify(
            {
              export: "mitigation-import-diff",
              generatedAt: new Date().toISOString(),
              scope: scopeLabel ?? "current audit filters",
              counts: diff.counts,
              rows,
            },
            null,
            2,
          )
        : (() => {
            const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
            const headers = Object.keys(rows[0]);
            return [
              headers.join(","),
              ...rows.map((r) => headers.map((h) => cell((r as Record<string, unknown>)[h])).join(",")),
            ].join("\n");
          })();
    const blob = new Blob([body], {
      type: kind === "json" ? "application/json" : "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mitigation-import-diff-${Date.now()}.${kind}`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} diff row(s)`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={imported.length === 0}>
          <GitCompare className="h-3.5 w-3.5" /> Compare import
          {imported.length > 0 && (
            <Badge variant="secondary" className="ml-1 text-[10px]">
              {imported.length}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ArrowLeftRight className="h-4 w-4" /> Imported records vs current scope
          </DialogTitle>
          <DialogDescription className="text-xs">
            Records are paired by correlation ID (or rule-change signature) against the{" "}
            {scope.length} audit entr{scope.length === 1 ? "y" : "ies"} matching your current
            filters{scopeLabel ? ` — ${scopeLabel}` : ""}. Review only; nothing is applied.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant={status === "all" ? "default" : "outline"}
              className="h-7 text-[11px]"
              onClick={() => setStatus("all")}
            >
              All {diff.total}
            </Button>
            {ORDER.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={status === s ? "default" : "outline"}
                className="h-7 text-[11px]"
                onClick={() => setStatus(s)}
              >
                {DIFF_STATUS_LABEL[s]} {diff.counts[s]}
              </Button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-[11px]" onClick={() => exportDiff("csv")}>
              <Download className="h-3 w-3" /> CSV
            </Button>
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-[11px]" onClick={() => exportDiff("json")}>
              <Download className="h-3 w-3" /> JSON
            </Button>
          </div>
        </div>

        <ScrollArea className="max-h-[55vh]">
          <div className="space-y-2 pr-2">
            {visible.length === 0 && (
              <p className="rounded-md border border-border/60 bg-muted/10 p-4 text-center text-xs text-muted-foreground">
                No records in this category.
              </p>
            )}
            {visible.map((p) => (
              <div key={p.key} className={`rounded-md border p-2.5 ${TONE[p.status]}`}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {p.imported?.correlationId ?? p.live?.correlationId ?? p.key}
                  </span>
                  <Badge variant="outline" className="text-[9px] uppercase">
                    {DIFF_STATUS_LABEL[p.status]}
                  </Badge>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Side title="Imported file" entry={p.imported} muted={!p.imported} />
                  <Side title="Current scope" entry={p.live} muted={!p.live} />
                </div>
                {p.fields.length > 0 && (
                  <table className="mt-2 w-full text-[11px]">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="px-1.5 py-1 text-left font-medium">Field</th>
                        <th className="px-1.5 py-1 text-left font-medium">Imported</th>
                        <th className="px-1.5 py-1 text-left font-medium">Current</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.fields.map((f) => (
                        <tr key={f.field} className="border-t border-border/40">
                          <td className="px-1.5 py-1 text-muted-foreground">{f.label}</td>
                          <td className="px-1.5 py-1 font-mono text-sky-400">{f.imported}</td>
                          <td className="px-1.5 py-1 font-mono text-emerald-400">{f.live}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

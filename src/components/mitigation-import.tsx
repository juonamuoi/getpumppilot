import { useRef, useState } from "react";
import { Upload, FileUp, Trash2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import type { TuningLogEntry } from "@/lib/paper-store";
import { parseMitigationExport, type ImportResult } from "@/lib/mitigation-import";

/**
 * Upload a previously exported mitigation CSV/JSON file and load the records
 * back into the audit trail as read-only entries for review.
 */
export function MitigationImport({
  onImport,
  importedCount,
  onClear,
}: {
  onImport: (entries: TuningLogEntry[]) => void;
  importedCount: number;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setResult(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      const parsed = parseMitigationExport(file.name, text);
      setResult(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that file.");
    }
  };

  const confirm = () => {
    if (!result || result.entries.length === 0) return;
    onImport(result.entries);
    toast.success(`Imported ${result.entries.length} mitigation record(s)`, {
      description: "Loaded into the audit trail for review — marked as imported, not applied.",
    });
    setResult(null);
    setFileName("");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
          <Upload className="h-3.5 w-3.5" />
          Import
          {importedCount > 0 && (
            <Badge variant="secondary" className="ml-1 text-[10px]">
              {importedCount}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import mitigation export</DialogTitle>
          <DialogDescription>
            Upload a CSV or JSON file previously exported from this audit trail. Records load in
            read-only for review — nothing is applied to your live rules.
          </DialogDescription>
        </DialogHeader>

        <div
          className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border/70 bg-muted/10 p-6 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) void handleFile(f);
          }}
        >
          <FileUp className="h-6 w-6 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            Drop your <span className="font-mono">.csv</span> or{" "}
            <span className="font-mono">.json</span> export here, or
          </p>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => inputRef.current?.click()}>
            Choose file
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.json,text/csv,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
          {fileName && <p className="text-[11px] font-mono text-muted-foreground">{fileName}</p>}
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary" className="text-[10px] uppercase">
                {result.format}
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                {result.entries.length} record{result.entries.length === 1 ? "" : "s"}
              </Badge>
              {result.skipped > 0 && (
                <Badge variant="outline" className="text-[10px]">
                  {result.skipped} skipped
                </Badge>
              )}
              {result.range && (
                <span className="text-muted-foreground">
                  {format(result.range.from, "d MMM yyyy HH:mm")} →{" "}
                  {format(result.range.to, "d MMM yyyy HH:mm")}
                </span>
              )}
              {result.meta?.exportedAt && (
                <span className="text-muted-foreground">
                  · exported {format(new Date(result.meta.exportedAt), "d MMM yyyy HH:mm")}
                </span>
              )}
            </div>

            {result.warnings.length > 0 && (
              <ul className="space-y-1 rounded-md border border-border/60 bg-muted/20 p-2 text-[11px] text-muted-foreground">
                {result.warnings.map((w) => (
                  <li key={w}>• {w}</li>
                ))}
              </ul>
            )}

            <ScrollArea className="max-h-56 rounded-md border border-border/60">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium">When</th>
                    <th className="px-2 py-1.5 text-left font-medium">Mitigation</th>
                    <th className="px-2 py-1.5 text-left font-medium">Rule</th>
                    <th className="px-2 py-1.5 text-left font-medium">Change</th>
                    <th className="px-2 py-1.5 text-left font-medium">Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {result.entries.slice(0, 50).map((e) => (
                    <tr key={e.id} className="border-t border-border/40">
                      <td className="px-2 py-1.5 text-muted-foreground">
                        {format(e.ts, "d MMM HH:mm")}
                      </td>
                      <td className="px-2 py-1.5">{e.mitigation}</td>
                      <td className="px-2 py-1.5">{e.ruleLabel}</td>
                      <td className="px-2 py-1.5 font-mono">
                        {e.oldValue} → {e.newValue}
                        {e.unit}
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground">
                        {e.outcome?.status ?? "pending"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
            {result.entries.length > 50 && (
              <p className="text-[11px] text-muted-foreground">
                Showing first 50 of {result.entries.length} records.
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 text-xs"
            disabled={importedCount === 0}
            onClick={() => {
              onClear();
              toast.success("Cleared imported records");
              setOpen(false);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear imported ({importedCount})
          </Button>
          <Button size="sm" disabled={!result || result.entries.length === 0} onClick={confirm}>
            Load into audit trail
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

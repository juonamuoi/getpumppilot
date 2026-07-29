import { useMemo, useRef, useState } from "react";
import { Upload, FileUp, Trash2, AlertTriangle, Download, CheckCircle2, XCircle, FileWarning } from "lucide-react";
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
import {
  parseMitigationExport,
  buildErrorReportCsv,
  buildErrorReportJson,
  buildImportSummary,
  buildImportSummaryText,
  planDedupe,
  applyMapping,
  suggestMapping,
  DEDUPE_LABEL,
  DEDUPE_HINT,
  type DedupeStrategy,
  type ImportResult,
} from "@/lib/mitigation-import";
import { MitigationColumnMapper } from "@/components/mitigation-column-mapper";

function download(name: string, mime: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}


/**
 * Upload a previously exported mitigation CSV/JSON file and load the records
 * back into the audit trail as read-only entries for review.
 */
export function MitigationImport({
  onImport,
  importedCount,
  onClear,
  existingEntries = [],
}: {
  onImport: (result: { add: TuningLogEntry[]; replace: TuningLogEntry[] }) => void;
  importedCount: number;
  onClear: () => void;
  /** Live audit entries plus already-imported records, used for dedupe matching. */
  existingEntries?: TuningLogEntry[];
}) {
  const [strategy, setStrategy] = useState<DedupeStrategy>("skip");
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState<ImportResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setResult(null);
    setRaw(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      const parsed = parseMitigationExport(file.name, text);
      const guess = suggestMapping(parsed.headers ?? []);
      setRaw(parsed);
      setMapping(guess);
      setResult(applyMapping(parsed, guess));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that file.");
    }
  };

  const remap = (next: Record<string, string>) => {
    setMapping(next);
    if (raw) setResult(applyMapping(raw, next));
  };

  const counts = useMemo(() => {
    if (!result) return null;
    const errors = result.issues.filter((i) => i.level === "error").length;
    const warnings = result.issues.filter((i) => i.level === "warning").length;
    return { errors, warnings, clean: result.entries.length - result.warned };
  }, [result]);

  const summary = useMemo(() => (result ? buildImportSummary(result) : null), [result]);

  const plan = useMemo(
    () => (result ? planDedupe(result.entries, existingEntries, strategy) : null),
    [result, existingEntries, strategy],
  );

  const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const downloadReport = (kind: "csv" | "json") => {
    if (!result) return;
    if (kind === "csv") {
      download(`mitigation-import-errors-${stamp()}.csv`, "text/csv;charset=utf-8", buildErrorReportCsv(result));
    } else {
      download(`mitigation-import-errors-${stamp()}.json`, "application/json", buildErrorReportJson(result));
    }
    toast.success("Error report downloaded");
  };

  const downloadSummary = () => {
    if (!result) return;
    download(
      `mitigation-import-summary-${stamp()}.txt`,
      "text/plain;charset=utf-8",
      buildImportSummaryText(result),
    );
    toast.success("Import summary downloaded");
  };

  const confirm = () => {
    if (!result || !plan) return;
    const applied = plan.add.length + plan.replace.length;
    if (applied === 0) {
      toast.info("Nothing to import", {
        description: `All ${result.entries.length} record(s) already exist in the audit trail.`,
      });
      setResult(null);
      setRaw(null);
      setFileName("");
      setOpen(false);
      return;
    }
    onImport({ add: plan.add, replace: plan.replace });
    const dupNote =
      plan.duplicates > 0
        ? strategy === "merge"
          ? `${plan.merged} merged into existing, ${plan.duplicates - plan.merged} already identical.`
          : strategy === "skip"
            ? `${plan.duplicates} duplicate(s) skipped.`
            : `${plan.duplicates} duplicate(s) kept as separate records.`
        : "No duplicates found.";
    const partial = summary?.status === "partial";
    const note = partial
      ? ` ${result.skipped} row(s) skipped, ${result.warned} with warnings — download the error report for details.`
      : result.warned > 0
        ? ` ${result.warned} with warnings.`
        : "";
    if (partial) {
      toast.warning(`Partially imported ${plan.add.length} record(s)`, {
        description: `${dupNote}${note}`,
      });
    } else {
      toast.success(`Imported ${plan.add.length} new record(s)`, {
        description: `${dupNote}${note}`,
      });
    }
    setResult(null);
    setRaw(null);
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
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: "Rows in file", value: result.total },
                { label: "Imported", value: result.entries.length },
                { label: "With warnings", value: result.warned },
                { label: "Skipped", value: result.skipped },
              ].map((s) => (
                <div key={s.label} className="rounded-md border border-border/60 bg-muted/20 p-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</p>
                  <p className="font-mono text-sm">{s.value}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary" className="text-[10px] uppercase">
                {result.format}
              </Badge>
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

            {summary && (
              <div
                className={`rounded-md border p-3 ${
                  summary.status === "failed"
                    ? "border-destructive/40 bg-destructive/10"
                    : summary.status === "partial"
                      ? "border-amber-500/40 bg-amber-500/5"
                      : "border-emerald-500/40 bg-emerald-500/5"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    {summary.status === "failed" ? (
                      <XCircle className="mt-0.5 h-4 w-4 text-destructive" />
                    ) : summary.status === "partial" ? (
                      <FileWarning className="mt-0.5 h-4 w-4 text-amber-500" />
                    ) : (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
                    )}
                    <div>
                      <p className="text-xs font-semibold">{summary.headline}</p>
                      <p className="text-[11px] text-muted-foreground">{summary.detail}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1.5 text-[11px]"
                      onClick={downloadSummary}
                    >
                      <Download className="h-3 w-3" /> Summary
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1.5 text-[11px]"
                      onClick={() => downloadReport("csv")}
                    >
                      <Download className="h-3 w-3" /> Report CSV
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1.5 text-[11px]"
                      onClick={() => downloadReport("json")}
                    >
                      <Download className="h-3 w-3" /> JSON
                    </Button>
                  </div>
                </div>

                {summary.topCodes.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {summary.topCodes.map((c) => (
                      <Badge
                        key={c.code}
                        variant={c.level === "error" ? "destructive" : "outline"}
                        className="text-[9px]"
                      >
                        {c.code} × {c.count}
                      </Badge>
                    ))}
                  </div>
                )}

                {summary.records.length > 0 && (
                  <ScrollArea className="mt-2 max-h-44">
                    <div className="space-y-1.5 pr-2">
                      {summary.records.map((r) => (
                        <div
                          key={r.row}
                          className="rounded-md border border-border/40 bg-background/40 p-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-mono text-[10px] text-muted-foreground">
                              Row {r.row}
                              {r.line ? ` · line ${r.line}` : ""}
                              {r.ref ? ` · ${r.ref}` : ""}
                            </span>
                            <Badge
                              variant={r.imported ? "outline" : "destructive"}
                              className="text-[9px] uppercase"
                            >
                              {r.imported ? "imported with warnings" : "skipped"}
                            </Badge>
                          </div>
                          <ul className="mt-1 space-y-0.5">
                            {[...r.errors, ...r.warnings].map((i, idx) => (
                              <li
                                key={`${i.code}-${idx}`}
                                className={`text-[11px] ${i.level === "error" ? "text-destructive" : "text-muted-foreground"}`}
                              >
                                • {i.field ? `${i.field}: ` : ""}
                                {i.message}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            )}

            {counts && result.issues.length === 0 ? (
              <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/10 p-2.5 text-[11px] text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                Every record parsed cleanly — no warnings or errors.
              </div>
            ) : (
              counts && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/5">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 px-2.5 py-2">
                    <div className="flex items-center gap-2 text-[11px]">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      <span>
                        {counts.errors} error{counts.errors === 1 ? "" : "s"} · {counts.warnings}{" "}
                        warning{counts.warnings === 1 ? "" : "s"} across{" "}
                        {new Set(result.issues.map((i) => i.row)).size} record(s)
                      </span>
                    </div>
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1.5 text-[11px]"
                        onClick={() => downloadReport("csv")}
                      >
                        <Download className="h-3 w-3" /> Report CSV
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1.5 text-[11px]"
                        onClick={() => downloadReport("json")}
                      >
                        <Download className="h-3 w-3" /> JSON
                      </Button>
                    </div>
                  </div>
                  <ScrollArea className="max-h-44">
                    <table className="w-full text-[11px]">
                      <thead className="sticky top-0 bg-muted/50 text-muted-foreground">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium">Row</th>
                          <th className="px-2 py-1.5 text-left font-medium">Level</th>
                          <th className="px-2 py-1.5 text-left font-medium">Field</th>
                          <th className="px-2 py-1.5 text-left font-medium">Detail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.issues.slice(0, 200).map((i, idx) => (
                          <tr key={`${i.row}-${i.code}-${idx}`} className="border-t border-border/40">
                            <td className="px-2 py-1.5 font-mono text-muted-foreground">
                              {i.row}
                              {i.line ? ` (L${i.line})` : ""}
                            </td>
                            <td className="px-2 py-1.5">
                              <Badge
                                variant={i.level === "error" ? "destructive" : "outline"}
                                className="text-[9px] uppercase"
                              >
                                {i.level}
                              </Badge>
                            </td>
                            <td className="px-2 py-1.5 font-mono text-muted-foreground">
                              {i.field ?? "—"}
                            </td>
                            <td className="px-2 py-1.5">{i.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollArea>
                  {result.issues.length > 200 && (
                    <p className="px-2.5 py-1.5 text-[10px] text-muted-foreground">
                      Showing first 200 of {result.issues.length} issues — download the report for the
                      full list.
                    </p>
                  )}
                </div>
              )
            )}


            {raw && (raw.headers?.length ?? 0) > 0 && (
              <MitigationColumnMapper
                headers={raw.headers ?? []}
                mapping={mapping}
                onChange={remap}
                sample={(raw.records?.[0] ?? undefined) as Record<string, unknown> | undefined}
              />
            )}

            <div className="space-y-2 rounded-md border border-border/60 bg-muted/10 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Duplicate handling
                </p>
                {plan && (
                  <span className="text-[11px] text-muted-foreground">
                    {plan.duplicates} duplicate{plan.duplicates === 1 ? "" : "s"} detected
                    {plan.duplicates > 0 &&
                      ` (${plan.duplicatesInLog} already in the trail, ${plan.duplicatesInFile} inside the file)`}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(["skip", "merge", "duplicate"] as DedupeStrategy[]).map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={strategy === s ? "default" : "outline"}
                    className="h-7 text-[11px]"
                    onClick={() => setStrategy(s)}
                  >
                    {DEDUPE_LABEL[s]}
                  </Button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">{DEDUPE_HINT[strategy]}</p>
              {plan && (
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  {[
                    { label: "New", value: plan.add.length },
                    { label: strategy === "merge" ? "Merged" : "Skipped", value: strategy === "merge" ? plan.merged : plan.duplicates },
                    { label: "Records after import", value: importedCount + plan.add.length },
                  ].map((s) => (
                    <div key={s.label} className="rounded border border-border/50 bg-background/60 px-2 py-1">
                      <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{s.label}</p>
                      <p className="font-mono">{s.value}</p>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">
                Records match on correlation ID + phase, or on the rule change signature and timestamp
                when no correlation ID was exported. Live audit entries are never modified.
              </p>
            </div>

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

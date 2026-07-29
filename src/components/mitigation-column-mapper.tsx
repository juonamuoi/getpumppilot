import { useMemo } from "react";
import { Columns3, RotateCcw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  IMPORT_FIELDS,
  IGNORE_COLUMN,
  missingRequiredFields,
  suggestMapping,
} from "@/lib/mitigation-import";

const PASS_THROUGH = "__passthrough__";

/**
 * Column-mapping step of the import flow: point each header found in the
 * uploaded CSV/JSON at the audit-trail field it represents.
 */
export function MitigationColumnMapper({
  headers,
  mapping,
  onChange,
  sample,
}: {
  headers: string[];
  mapping: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  /** First record of the file, used to preview a sample value per column. */
  sample?: Record<string, unknown>;
}) {
  const missing = useMemo(() => missingRequiredFields(mapping), [mapping]);
  const remapped = useMemo(
    () =>
      Object.entries(mapping).filter(([h, k]) => k && k !== IGNORE_COLUMN && k !== h).length,
    [mapping],
  );
  const ignored = useMemo(
    () => Object.values(mapping).filter((v) => v === IGNORE_COLUMN).length,
    [mapping],
  );

  const setOne = (header: string, value: string) =>
    onChange({ ...mapping, [header]: value === PASS_THROUGH ? "" : value });

  const usedBy = (key: string) =>
    Object.entries(mapping).filter(([, v]) => v === key).map(([h]) => h);

  return (
    <div className="space-y-2 rounded-md border border-border/60 bg-muted/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Columns3 className="h-3.5 w-3.5" /> Column mapping
        </p>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">
            {headers.length} column{headers.length === 1 ? "" : "s"} · {remapped} remapped ·{" "}
            {ignored} ignored
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-[11px]"
            onClick={() => onChange(suggestMapping(headers))}
          >
            <RotateCcw className="h-3 w-3" /> Auto-detect
          </Button>
        </div>
      </div>

      {missing.length > 0 ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-[11px] text-amber-500">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Unmapped key field{missing.length === 1 ? "" : "s"}:{" "}
            {missing.map((f) => f.label).join(", ")}. Rows may be skipped or lose context.
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/10 p-2 text-[11px] text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          All key audit fields are mapped.
        </div>
      )}

      <ScrollArea className="max-h-64">
        <div className="space-y-1.5 pr-2">
          {headers.map((h) => {
            const value = mapping[h] ?? "";
            const dupes = value && value !== IGNORE_COLUMN ? usedBy(value) : [];
            const raw = sample?.[h];
            return (
              <div
                key={h}
                className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-md border border-border/40 bg-background/40 px-2 py-1.5"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-[11px]">{h}</p>
                  {raw !== undefined && String(raw) !== "" && (
                    <p className="truncate text-[10px] text-muted-foreground">
                      e.g. {String(raw).slice(0, 48)}
                    </p>
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground">→</span>
                <div className="min-w-0">
                  <Select
                    value={value === "" ? PASS_THROUGH : value}
                    onValueChange={(v) => setOne(h, v)}
                  >
                    <SelectTrigger className="h-7 text-[11px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value={PASS_THROUGH} className="text-[11px]">
                        Keep as-is ({h})
                      </SelectItem>
                      <SelectItem value={IGNORE_COLUMN} className="text-[11px]">
                        Ignore this column
                      </SelectItem>
                      {IMPORT_FIELDS.map((f) => (
                        <SelectItem key={f.key} value={f.key} className="text-[11px]">
                          {f.label}
                          {f.required ? " *" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {dupes.length > 1 && (
                    <Badge variant="destructive" className="mt-1 text-[9px]">
                      also mapped by {dupes.filter((d) => d !== h).join(", ")}
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
      <p className="text-[10px] text-muted-foreground">
        Fields marked * are required to place a record in the audit trail. Changes re-parse the file
        instantly — the counts and preview above update as you map.
      </p>
    </div>
  );
}

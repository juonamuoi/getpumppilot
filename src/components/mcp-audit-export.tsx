import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Download, FileJson, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

export type ExportableAuditRow = {
  id: string;
  correlation_id: string;
  client_id: string | null;
  tool_name: string;
  status: string;
  duration_ms: number | null;
  request: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
};

const FIELDS = [
  { key: "created_at", label: "Timestamp" },
  { key: "correlation_id", label: "Correlation ID" },
  { key: "id", label: "Entry ID" },
  { key: "tool_name", label: "Tool" },
  { key: "client_id", label: "Agent / client" },
  { key: "status", label: "Status" },
  { key: "duration_ms", label: "Duration (ms)" },
  { key: "request", label: "Redacted input" },
  { key: "error_message", label: "Error message" },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];

const DEFAULT_FIELDS: FieldKey[] = [
  "created_at",
  "correlation_id",
  "tool_name",
  "client_id",
  "status",
  "duration_ms",
  "error_message",
];

const STORAGE_KEY = "pp.mcp-audit-export.fields";

function loadFields(): FieldKey[] {
  if (typeof window === "undefined") return DEFAULT_FIELDS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_FIELDS;
    const parsed = JSON.parse(raw) as string[];
    const valid = parsed.filter((k): k is FieldKey =>
      FIELDS.some((f) => f.key === k),
    );
    return valid.length ? valid : DEFAULT_FIELDS;
  } catch {
    return DEFAULT_FIELDS;
  }
}

function cellValue(row: ExportableAuditRow, key: FieldKey): string {
  const value = row[key];
  if (value == null) return "";
  if (key === "request") return JSON.stringify(value);
  return String(value);
}

function toCsv(rows: ExportableAuditRow[], fields: FieldKey[]): string {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const header = fields
    .map((k) => escape(FIELDS.find((f) => f.key === k)?.label ?? k))
    .join(",");
  const body = rows.map((r) =>
    fields.map((k) => escape(cellValue(r, k))).join(","),
  );
  return [header, ...body].join("\r\n");
}

function download(filename: string, mime: string, contents: string) {
  const blob = new Blob([contents], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function McpAuditExport({
  rows,
  totalCount,
  userId,
}: {
  rows: ExportableAuditRow[];
  totalCount: number;
  userId?: string | null;
}) {
  const [fields, setFields] = useState<FieldKey[]>(() => loadFields());
  const stamp = useMemo(
    () => new Date().toISOString().replace(/[:.]/g, "-"),
    [],
  );

  const persist = (next: FieldKey[]) => {
    setFields(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const toggle = (key: FieldKey, on: boolean) => {
    const next = on
      ? FIELDS.map((f) => f.key).filter((k) => k === key || fields.includes(k))
      : fields.filter((k) => k !== key);
    if (next.length === 0) {
      toast.error("Select at least one field to export");
      return;
    }
    persist(next);
  };

  const guard = () => {
    if (rows.length === 0) {
      toast.error("Nothing to export — no matching audit entries");
      return false;
    }
    return true;
  };

  const exportCsv = () => {
    if (!guard()) return;
    download(
      `pumppilot-mcp-audit-${stamp}.csv`,
      "text/csv",
      toCsv(rows, fields),
    );
    toast.success(`Exported ${rows.length} audit entries as CSV`);
  };

  const exportJson = () => {
    if (!guard()) return;
    const payload = {
      export: {
        generated_at: new Date().toISOString(),
        app: "PumpPilot AI",
        source: "mcp_audit_log",
        user_id: userId ?? null,
        rows_exported: rows.length,
        rows_available: totalCount,
        fields,
        note: "Tool inputs are stored redacted. Correlation IDs match Settings → Audit trail and MCP Console results.",
      },
      entries: rows.map((r) =>
        Object.fromEntries(
          fields.map((k) => [k, k === "request" ? r.request : r[k]]),
        ),
      ),
    };
    download(
      `pumppilot-mcp-audit-${stamp}.json`,
      "application/json",
      JSON.stringify(payload, null, 2),
    );
    toast.success(`Exported ${rows.length} audit entries as JSON`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Export ({rows.length})
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 space-y-3">
          <div>
            <p className="text-sm font-semibold">Fields to include</p>
            <p className="text-xs text-muted-foreground">
              Exports the {rows.length} entries currently matching your filters.
            </p>
          </div>
          <div className="space-y-2">
            {FIELDS.map((f) => (
              <div key={f.key} className="flex items-center gap-2">
                <Checkbox
                  id={`audit-field-${f.key}`}
                  checked={fields.includes(f.key)}
                  onCheckedChange={(v) => toggle(f.key, v === true)}
                />
                <Label
                  htmlFor={`audit-field-${f.key}`}
                  className="text-sm font-normal"
                >
                  {f.label}
                </Label>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" className="flex-1" onClick={exportCsv}>
              <FileSpreadsheet className="mr-2 h-4 w-4" /> CSV
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="flex-1"
              onClick={exportJson}
            >
              <FileJson className="mr-2 h-4 w-4" /> JSON
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

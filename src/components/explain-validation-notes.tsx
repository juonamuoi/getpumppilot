import { useMemo, useState } from "react";
import { format } from "date-fns";
import { AlertTriangle, ChevronDown, ChevronRight, Download, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  clearValidationNotes,
  notesByField,
  notesBySymbol,
  SOURCE_LABEL,
  useValidationNotes,
} from "@/lib/explain-validation-log";

/**
 * Dedicated audit-trail notes for Zod validation failures on Why data.
 * Grouped by token symbol so recurring malformed ExplainFields are easy
 * to spot, with a timestamped note list underneath.
 */
export function ExplainValidationNotes({
  onFocusSymbol,
}: {
  /** Optional: clicking a symbol can drive the parent's token filter. */
  onFocusSymbol?: (symbol: string) => void;
}) {
  const notes = useValidationNotes();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return notes;
    return notes.filter((n) =>
      [
        n.correlationId ?? "",
        n.entryId,
        n.ruleLabel ?? "",
        n.source,
        n.symbols.join(" "),
        n.invalidFields.join(" "),
        n.issues.join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [notes, q]);

  const bySymbol = useMemo(() => notesBySymbol(filtered), [filtered]);
  const byField = useMemo(() => notesByField(filtered), [filtered]);

  const exportNotes = () => {
    const payload = {
      export: "explain-validation-notes",
      generatedAt: new Date().toISOString(),
      noteCount: filtered.length,
      bySymbol,
      byField,
      notes: filtered.map((n) => ({
        ...n,
        observedAt: new Date(n.ts).toISOString(),
        entryAt: new Date(n.entryTs).toISOString(),
      })),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `explain-validation-notes-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} validation note${filtered.length === 1 ? "" : "s"}`);
  };

  if (notes.length === 0) return null;

  return (
    <div
      aria-label="Why validation notes"
      className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
        <button
          type="button"
          className="flex flex-1 items-center gap-1 text-left text-xs font-semibold text-amber-500"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {notes.length} Why validation note{notes.length === 1 ? "" : "s"} recorded
        </button>
        <Badge variant="secondary" className="text-[10px]">
          {bySymbol.length} symbol{bySymbol.length === 1 ? "" : "s"}
        </Badge>
        <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-[10px]" onClick={exportNotes}>
          <Download className="h-3 w-3" />
          Export
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-2 text-[10px] text-muted-foreground"
          onClick={() => {
            clearValidationNotes();
            toast.success("Validation notes cleared");
          }}
        >
          <Trash2 className="h-3 w-3" />
          Clear
        </Button>
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search notes by symbol, field, correlation ID…"
            className="h-7 text-xs"
            aria-label="Search validation notes"
          />

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border border-border/60 bg-muted/10 p-2">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Recurring by symbol
              </p>
              <ul className="space-y-1">
                {bySymbol.slice(0, 8).map((s) => (
                  <li key={s.symbol}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-[11px] hover:bg-muted/40"
                      onClick={() => onFocusSymbol?.(s.symbol)}
                    >
                      <span className="w-14 shrink-0 font-mono text-foreground">{s.symbol}</span>
                      <span className="text-muted-foreground">
                        {s.notes} note{s.notes === 1 ? "" : "s"} · {s.entries} entr
                        {s.entries === 1 ? "y" : "ies"}
                      </span>
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        last {format(new Date(s.lastTs), "MMM d, HH:mm")}
                      </span>
                    </button>
                  </li>
                ))}
                {bySymbol.length === 0 && (
                  <li className="text-[11px] text-muted-foreground">No matching notes.</li>
                )}
              </ul>
            </div>

            <div className="rounded-md border border-border/60 bg-muted/10 p-2">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Most malformed fields
              </p>
              <ul className="space-y-1">
                {byField.map((f) => (
                  <li key={f.field} className="flex items-center gap-2 text-[11px]">
                    <span className="w-28 shrink-0 font-mono text-foreground">{f.field}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded bg-muted/40">
                      <span
                        className="block h-full bg-amber-500/70"
                        style={{ width: `${(f.count / (byField[0]?.count || 1)) * 100}%` }}
                      />
                    </span>
                    <span className="w-6 text-right text-muted-foreground">{f.count}</span>
                  </li>
                ))}
                {byField.length === 0 && (
                  <li className="text-[11px] text-muted-foreground">No matching notes.</li>
                )}
              </ul>
            </div>
          </div>

          <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
            {filtered.slice(0, 50).map((n) => (
              <li
                key={n.id}
                className="rounded-md border border-border/50 bg-background/40 p-2 text-[11px]"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px]">
                    {SOURCE_LABEL[n.source]}
                  </Badge>
                  {n.symbols.map((s) => (
                    <span
                      key={s}
                      className="rounded border border-border/60 bg-muted/30 px-1.5 py-0.5 font-mono text-[10px]"
                    >
                      {s}
                    </span>
                  ))}
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {n.correlationId ?? n.entryId}
                  </span>
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {format(new Date(n.ts), "MMM d, HH:mm:ss")}
                    {" · entry "}
                    {format(new Date(n.entryTs), "MMM d, HH:mm")}
                  </span>
                </div>
                <p className="mt-1 text-muted-foreground">
                  <span className="text-foreground">{n.ruleLabel ?? "Rule"}</span> — invalid:{" "}
                  {n.invalidFields.join(", ") || "unknown"}
                </p>
                <ul className="ml-3 list-disc text-[10px] text-muted-foreground">
                  {n.issues.slice(0, 4).map((iss, i) => (
                    <li key={i}>{iss}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          {filtered.length > 50 && (
            <p className="text-[10px] text-muted-foreground">+{filtered.length - 50} older notes…</p>
          )}
        </div>
      )}
    </div>
  );
}

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Link } from "@tanstack/react-router";
import { Check, Copy, ExternalLink } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePaper } from "@/lib/paper-store";
import { explainOutcome } from "@/lib/mitigation-explain";
import type { TuningLogEntry } from "@/lib/paper-store";
import { toast } from "sonner";

/* ------------------------------------------------------------------ *
 * Right-side drawer with the focused audit entries for one correlation
 * ID. Opened from timeline markers so review never leaves the page.
 * ------------------------------------------------------------------ */

function CopyId({ id }: { id: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 gap-1 px-1.5 font-mono text-[10px]"
      aria-label={`Copy correlation ID ${id}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(id);
          setDone(true);
          toast.success(`Copied ${id}`);
          setTimeout(() => setDone(false), 1500);
        } catch {
          toast.error("Could not copy to clipboard");
        }
      }}
    >
      {id}
      {done ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium tabular-nums">{value}</div>
    </div>
  );
}

function EntryCard({ entry }: { entry: TuningLogEntry }) {
  const op = entry.operator === ">=" ? "≥" : "≤";
  const o = entry.outcome;
  const matchesBefore = entry.scopeMatchesBefore ?? entry.matchesBefore;
  const matchesAfter = entry.scopeMatchesAfter ?? entry.matchesAfter;

  return (
    <div className="rounded-lg border border-border/60 bg-card/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={entry.phase === "applied" ? "default" : "secondary"} className="text-[10px]">
          {entry.phase === "applied" ? "Applied" : "Preview"}
        </Badge>
        {entry.mitigation && (
          <span className="text-xs font-medium">{entry.mitigation}</span>
        )}
        {entry.replayOf && (
          <Badge variant="outline" className="text-[10px]">Replay</Badge>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground">
          {format(new Date(entry.ts), "d MMM yyyy, HH:mm:ss")}
        </span>
      </div>

      <div className="mt-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{entry.ruleLabel}</span>{" "}
        {op} {entry.oldValue}
        {entry.unit} → {op} {entry.newValue}
        {entry.unit}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Matches" value={`${matchesBefore ?? "–"} → ${matchesAfter ?? "–"}`} />
        <Stat label="Alerts fired" value={o?.delivered ?? "–"} />
        <Stat
          label="Muted"
          value={o ? Math.max(0, (o.matched ?? 0) - (o.delivered ?? 0)) : "–"}
        />
        <Stat label="Assets" value={o?.symbols?.length ?? entry.scopeAssetsAffected ?? "–"} />
      </div>

      {o?.symbols?.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {o.symbols.map((s) => (
            <Badge key={s} variant="outline" className="text-[10px]">
              {s}
            </Badge>
          ))}
        </div>
      ) : null}

      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{explainOutcome(entry)}</p>
    </div>
  );
}

export function AuditEntryDrawer({
  correlationId,
  onOpenChange,
}: {
  correlationId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { tuningLog } = usePaper();

  const entries = useMemo(
    () =>
      (tuningLog ?? [])
        .filter((e) => correlationId && e.correlationId === correlationId)
        .sort((a, b) => a.ts - b.ts),
    [tuningLog, correlationId],
  );

  return (
    <Sheet open={!!correlationId} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Mitigation audit entries</SheetTitle>
          <SheetDescription asChild>
            <div className="flex flex-wrap items-center gap-1 text-xs">
              <span>Correlation ID</span>
              {correlationId ? <CopyId id={correlationId} /> : null}
              <span>· {entries.length} entr{entries.length === 1 ? "y" : "ies"}</span>
            </div>
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="mt-4 h-[calc(100vh-11rem)] pr-3">
          <div className="space-y-3">
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No audit entries are stored for this marker. It may have been trimmed by your
                retention settings.
              </p>
            ) : (
              entries.map((e) => <EntryCard key={e.id} entry={e} />)
            )}
          </div>
        </ScrollArea>

        {correlationId && (
          <div className="mt-4 border-t border-border/60 pt-3">
            <Button asChild variant="outline" size="sm" className="gap-1">
              <Link to="/alerts" search={{ tab: "replay", audit: correlationId, af: undefined }}>
                Open in full audit trail
                <ExternalLink className="h-3 w-3" />
              </Link>
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

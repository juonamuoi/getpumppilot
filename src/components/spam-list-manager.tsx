// Manage the token allowlist / blocklist used by spam labeling.
import { ShieldCheck, ShieldBan, Trash2, ListFilter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useState } from "react";
import { toast } from "sonner";
import { entryKey, useSpamLists, type SpamListEntry, type SpamListKind } from "@/lib/spam-lists";

function EntryRow({
  entry,
  kind,
  onRemove,
}: {
  entry: SpamListEntry;
  kind: SpamListKind;
  onRemove: (key: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/20 px-2 py-1.5">
      <div className="min-w-0">
        <div className="truncate text-xs font-semibold">{entry.label}</div>
        <div className="truncate font-mono text-[10px] text-muted-foreground">{entry.key}</div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-muted-foreground hover:text-rose-300"
        aria-label={`Remove ${entry.label} from ${kind}list`}
        onClick={() => onRemove(entry.key)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export function SpamListManager() {
  const { lists, add, remove, clear } = useSpamLists();
  const [value, setValue] = useState("");

  const addEntry = (kind: SpamListKind) => {
    const raw = value.trim();
    if (!raw) return;
    const isAddress = /^0x[a-fA-F0-9]{40}$/.test(raw);
    add(kind, {
      key: isAddress ? raw.toLowerCase() : entryKey(undefined, raw),
      label: isAddress ? `${raw.slice(0, 10)}…${raw.slice(-6)}` : raw.toUpperCase(),
    });
    setValue("");
    toast.success(`Added to ${kind}list`);
  };

  const total = lists.allow.length + lists.block.length;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs">
          <ListFilter className="mr-1.5 h-3.5 w-3.5" />
          Spam lists
          {total > 0 && (
            <Badge variant="outline" className="ml-1.5 border-border/60 text-[9px]">
              {total}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Spam allowlist & blocklist</DialogTitle>
          <DialogDescription>
            Override the automatic spam heuristic per token. Allowlisted tokens are never badged
            as spam; blocklisted tokens always are. Blocklist wins over allowlist. Stored in this
            browser only — this never affects your funds or approvals.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Contract address (0x…) or ticker"
            className="h-8 flex-1 text-xs"
          />
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => addEntry("allow")}>
            <ShieldCheck className="mr-1.5 h-3.5 w-3.5 text-emerald-400" /> Allow
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => addEntry("block")}>
            <ShieldBan className="mr-1.5 h-3.5 w-3.5 text-rose-400" /> Block
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {(["allow", "block"] as SpamListKind[]).map((kind) => (
            <div key={kind} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {kind === "allow" ? "Allowlist (trusted)" : "Blocklist (always spam)"}
                </h4>
                {lists[kind].length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-[10px] text-muted-foreground"
                    onClick={() => clear(kind)}
                  >
                    Clear
                  </Button>
                )}
              </div>
              {lists[kind].length === 0 ? (
                <p className="text-[11px] text-muted-foreground">Nothing {kind}listed yet.</p>
              ) : (
                lists[kind].map((e) => (
                  <EntryRow key={e.key} entry={e} kind={kind} onRemove={remove} />
                ))
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

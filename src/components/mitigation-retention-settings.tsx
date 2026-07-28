import { useState } from "react";
import { toast } from "sonner";
import { Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePaper, DEFAULT_RETENTION, type AuditRetention } from "@/lib/paper-store";

const DAY_OPTIONS = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "180", label: "180 days" },
  { value: "365", label: "1 year" },
  { value: "0", label: "Keep forever" },
];

/**
 * Retention controls for mitigation audit history: how long preview-only and
 * applied entries are kept, a hard cap on stored entries, and whether previews
 * are included in exports.
 */
export function MitigationRetentionSettings() {
  const paper = usePaper();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AuditRetention>(paper.retention);

  const onOpenChange = (v: boolean) => {
    if (v) setDraft(paper.retention);
    setOpen(v);
  };

  const save = () => {
    const next: AuditRetention = {
      ...draft,
      maxEntries: Math.min(1000, Math.max(10, Math.round(draft.maxEntries) || 200)),
    };
    paper.setRetention(next);
    const removed = paper.purgeAuditHistory(next);
    setOpen(false);
    toast.success("Retention settings saved", {
      description:
        removed > 0
          ? `${removed} entr${removed === 1 ? "y" : "ies"} outside the policy were removed.`
          : "No entries were outside the policy.",
    });
  };

  const purgeNow = () => {
    const removed = paper.purgeAuditHistory();
    toast[removed > 0 ? "success" : "info"](
      removed > 0 ? `Purged ${removed} expired entr${removed === 1 ? "y" : "ies"}` : "Nothing to purge",
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 text-xs">
          <Archive className="mr-1 h-3 w-3" />
          Retention
          {paper.expiredAuditCount > 0 ? ` (${paper.expiredAuditCount})` : ""}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Audit history retention</DialogTitle>
          <DialogDescription>
            Control how long mitigation previews and applied changes are kept locally, and what
            goes into exports. Simulated data — nothing leaves your device.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Keep preview-only entries for</Label>
            <Select
              value={String(draft.previewDays)}
              onValueChange={(v) => setDraft((d) => ({ ...d, previewDays: Number(v) }))}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Keep applied entries for</Label>
            <Select
              value={String(draft.appliedDays)}
              onValueChange={(v) => setDraft((d) => ({ ...d, appliedDays: Number(v) }))}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="max-entries">
              Maximum stored entries (10–1000)
            </Label>
            <Input
              id="max-entries"
              type="number"
              min={10}
              max={1000}
              className="h-8 text-xs"
              value={draft.maxEntries}
              onChange={(e) => setDraft((d) => ({ ...d, maxEntries: Number(e.target.value) }))}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border/60 p-3">
            <div className="pr-3">
              <p className="text-xs font-medium">Include previews in exports</p>
              <p className="text-[11px] text-muted-foreground">
                Off = exports contain applied changes only.
              </p>
            </div>
            <Switch
              checked={draft.includePreviewsInExport}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, includePreviewsInExport: v }))}
            />
          </div>

          <p className="text-[11px] text-muted-foreground">
            {paper.expiredAuditCount > 0
              ? `${paper.expiredAuditCount} stored entr${paper.expiredAuditCount === 1 ? "y is" : "ies are"} outside the current policy.`
              : "All stored entries are within the current policy."}
          </p>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="text-xs"
              onClick={() => setDraft(DEFAULT_RETENTION)}
            >
              Reset defaults
            </Button>
            <Button size="sm" variant="outline" className="text-xs" onClick={purgeNow}>
              Purge expired now
            </Button>
          </div>
          <Button size="sm" className="text-xs" onClick={save}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

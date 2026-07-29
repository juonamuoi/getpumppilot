import { useState } from "react";
import { Columns3, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { TIMELINE_COLUMN_GROUPS, type TimelineColumnGroup } from "@/lib/timeline-export";
import { useTimelineExportColumns } from "@/lib/timeline-export-prefs";

type Props = ReturnType<typeof useTimelineExportColumns>;

/**
 * Lets the user pick exactly which CSV columns each export section carries.
 * The selection is stored per user (see useTimelineExportColumns).
 */
export function TimelineColumnPicker({ columns, toggleColumn, setGroup, resetColumns }: Props) {
  const [open, setOpen] = useState(false);
  const total = TIMELINE_COLUMN_GROUPS.reduce((n, g) => n + g.columns.length, 0);
  const selected =
    columns.meta.length + columns.risk.length + columns.mitigation.length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1 text-xs"
          title="Choose which CSV columns to export"
        >
          <Columns3 className="h-3 w-3" /> Columns
          <span className="text-muted-foreground">
            {selected}/{total}
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">CSV columns</DialogTitle>
          <DialogDescription className="text-xs">
            Pick the metadata, risk point and mitigation columns to include. Your selection is
            remembered for your account on this device.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[55vh] pr-3">
          <div className="space-y-5">
            {TIMELINE_COLUMN_GROUPS.map((group) => {
              const key = group.key as TimelineColumnGroup;
              const sel = columns[key];
              return (
                <section key={group.key}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h4 className="text-xs font-medium">
                      {group.label}{" "}
                      <span className="text-muted-foreground">
                        {sel.length}/{group.columns.length}
                      </span>
                    </h4>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[10px]"
                        onClick={() => setGroup(key, group.columns.map((c) => c.key))}
                      >
                        All
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[10px]"
                        onClick={() => setGroup(key, [])}
                      >
                        None
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {group.columns.map((col) => {
                      const id = `${group.key}-${col.key}`;
                      return (
                        <label
                          key={id}
                          htmlFor={id}
                          className="flex cursor-pointer items-center gap-2 rounded-md border border-border/60 px-2 py-1.5 text-xs hover:bg-muted/40"
                        >
                          <Checkbox
                            id={id}
                            checked={sel.includes(col.key)}
                            onCheckedChange={() => toggleColumn(key, col.key)}
                          />
                          <span className="truncate">{col.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={resetColumns}>
            <RotateCcw className="h-3 w-3" /> Reset to all columns
          </Button>
          <Button size="sm" className="text-xs" onClick={() => setOpen(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

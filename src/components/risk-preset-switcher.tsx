import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { usePaper } from "@/lib/paper-store";
import { sameRisk, useRiskPresets, type RiskPreset } from "@/lib/risk-presets";
import { toast } from "sonner";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";

/**
 * Quick switcher for named risk-control presets. `compact` renders an
 * inline one-line control for cards; the full version adds save/manage.
 */
export function RiskPresetSwitcher({ compact = false }: { compact?: boolean }) {
  const paper = usePaper();
  const { presets, activeId, savePreset, renamePreset, deletePreset, markActive } =
    useRiskPresets();
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const matched = presets.find((p) => sameRisk(p.settings, paper.risk));
  const current = matched ?? presets.find((p) => p.id === activeId) ?? null;
  const dirty = !matched;

  useEffect(() => {
    if (matched && matched.id !== activeId) markActive(matched.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matched?.id]);

  const apply = (p: RiskPreset) => {
    paper.setRisk(p.settings);
    markActive(p.id);
    toast.success(
      `${p.name} applied — max ${p.settings.maxPositionPct}% position, stop ${p.settings.stopLossPct}%, target ${p.settings.takeProfitPct}%.`,
    );
  };

  const onSelect = (id: string) => {
    const p = presets.find((x) => x.id === id);
    if (p) apply(p);
  };

  const selector = (
    <Select value={current?.id ?? ""} onValueChange={onSelect}>
      <SelectTrigger className="h-8 w-[190px] text-xs">
        <SelectValue placeholder="Choose a preset" />
      </SelectTrigger>
      <SelectContent>
        {presets.map((p) => (
          <SelectItem key={p.id} value={p.id} className="text-xs">
            {p.name}
            {p.builtIn ? " (built-in)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {selector}
        {dirty ? (
          <Badge variant="outline" className="border-amber-500/40 text-[10px] text-amber-300">
            Custom
          </Badge>
        ) : (
          <Badge variant="outline" className="border-emerald-500/40 text-[10px] text-emerald-300">
            <Check className="mr-1 h-3 w-3" /> Active
          </Badge>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-background/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-medium">Risk presets</div>
        {selector}
      </div>

      <div className="text-[11px] text-muted-foreground">
        Current: max {paper.risk.maxPositionPct}% position · daily cap {paper.risk.maxDailyLossPct}%
        · stop {paper.risk.stopLossPct}% · target {paper.risk.takeProfitPct}%
        {dirty ? " — unsaved custom settings" : ` — matches “${current?.name}”`}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name this preset"
          className="h-8 w-[180px] text-xs"
        />
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            if (!name.trim()) return toast.error("Give the preset a name");
            const p = savePreset(name, paper.risk);
            markActive(p.id);
            setName("");
            toast.success(`Saved preset “${p.name}”`);
          }}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Save current
        </Button>
      </div>

      <div className="space-y-1.5">
        {presets.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between gap-2 rounded-md border border-border/50 px-2.5 py-1.5"
          >
            {renaming === p.id ? (
              <Input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => {
                  if (renameValue.trim()) renamePreset(p.id, renameValue);
                  setRenaming(null);
                }}
                className="h-7 text-xs"
              />
            ) : (
              <div className="min-w-0">
                <div className="truncate text-xs font-medium">
                  {p.name}
                  {current?.id === p.id && (
                    <span className="ml-2 text-[10px] text-emerald-300">active</span>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {p.settings.maxPositionPct}% / {p.settings.maxDailyLossPct}% / -
                  {p.settings.stopLossPct}% / +{p.settings.takeProfitPct}%
                </div>
              </div>
            )}
            <div className="flex shrink-0 items-center gap-1">
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => apply(p)}>
                Apply
              </Button>
              {!p.builtIn && (
                <>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    aria-label={`Rename ${p.name}`}
                    onClick={() => {
                      setRenaming(p.id);
                      setRenameValue(p.name);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-rose-400"
                    aria-label={`Delete ${p.name}`}
                    onClick={() => {
                      deletePreset(p.id);
                      toast.success(`Deleted “${p.name}”`);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Presets are stored on this device only and apply to simulated paper trading guardrails.
      </p>
    </div>
  );
}

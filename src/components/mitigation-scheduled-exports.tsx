import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import type { TuningLogEntry } from "@/lib/paper-store";
import { loadSavedFilters, type SavedAuditFilter } from "@/lib/audit-filters";
import {
  computeNextRun,
  describeSchedule,
  loadRuns,
  loadSchedules,
  runDueSchedules,
  runSchedule,
  saveRuns,
  saveSchedules,
  weekdayLabel,
  type AuditExportSchedule,
  type Cadence,
  type ExportFormat,
  type ScheduleRun,
} from "@/lib/audit-schedule";

const CHECK_MS = 60_000;

/**
 * Scheduled exports for the mitigation audit trail.
 *
 * Audit history is browser-local demo data, so schedules fire in-app: any
 * due run executes when the app is open, and missed runs are caught up the
 * next time you return.
 */
export function MitigationScheduledExports({
  log,
  walletsFor,
}: {
  log: TuningLogEntry[];
  walletsFor?: (e: TuningLogEntry) => string[];
}) {
  const [open, setOpen] = useState(false);
  const [schedules, setSchedules] = useState<AuditExportSchedule[]>([]);
  const [runs, setRuns] = useState<ScheduleRun[]>([]);
  const [saved, setSaved] = useState<SavedAuditFilter[]>([]);

  // Draft
  const [name, setName] = useState("");
  const [filterId, setFilterId] = useState("");
  const [cadence, setCadence] = useState<Cadence>("daily");
  const [hour, setHour] = useState(8);
  const [weekday, setWeekday] = useState(1);
  const [format, setFormat] = useState<ExportFormat>("both");
  const [autoDownload, setAutoDownload] = useState(true);

  const logRef = useRef(log);
  logRef.current = log;
  const walletsRef = useRef(walletsFor);
  walletsRef.current = walletsFor;

  useEffect(() => {
    setSchedules(loadSchedules());
    setRuns(loadRuns());
    setSaved(loadSavedFilters());
  }, []);

  useEffect(() => {
    if (open) setSaved(loadSavedFilters());
  }, [open]);

  /** Catch up missed runs on mount, then poll every minute. */
  useEffect(() => {
    const tick = () => {
      const current = loadSchedules();
      if (current.length === 0) return;
      const { schedules: next, runs: fired } = runDueSchedules(
        current,
        logRef.current,
        walletsRef.current,
      );
      if (fired.length === 0) return;
      saveSchedules(next);
      setSchedules(next);
      const history = [...fired, ...loadRuns()];
      saveRuns(history);
      setRuns(history);
      fired.forEach((r) =>
        toast.success(`Scheduled export "${r.scheduleName}" ran`, {
          description: `${r.records} record(s) · ${r.files.join(", ")}${
            r.downloaded ? "" : " (auto-download off)"
          }`,
        }),
      );
    };
    tick();
    const id = window.setInterval(tick, CHECK_MS);
    return () => window.clearInterval(id);
  }, []);

  const persist = (next: AuditExportSchedule[]) => {
    setSchedules(next);
    saveSchedules(next);
  };

  const addSchedule = () => {
    const label = name.trim();
    if (!label) {
      toast.error("Name this scheduled export first");
      return;
    }
    if (!filterId) {
      toast.error("Pick a saved filter to export");
      return;
    }
    const schedule: AuditExportSchedule = {
      id: Math.random().toString(36).slice(2),
      name: label,
      filterId,
      cadence,
      hour,
      weekday,
      format,
      autoDownload,
      enabled: true,
      createdAt: Date.now(),
      nextRunAt: computeNextRun(cadence, hour, weekday),
    };
    persist([schedule, ...schedules]);
    setName("");
    toast.success(`Scheduled "${label}"`, {
      description: `${describeSchedule(schedule)} · next run ${new Date(
        schedule.nextRunAt,
      ).toLocaleString()}`,
    });
  };

  const runNow = (s: AuditExportSchedule) => {
    const result = runSchedule(s, log, walletsFor, { download: true });
    if (!result) {
      toast.error("Saved filter for this schedule no longer exists");
      return;
    }
    const history = [result.run, ...loadRuns()];
    saveRuns(history);
    setRuns(history);
    persist(schedules.map((x) => (x.id === s.id ? { ...x, lastRunAt: Date.now() } : x)));
    toast.success(`Exported ${result.run.records} record(s)`, {
      description: result.run.files.join(", "),
    });
  };

  const nextUp = useMemo(
    () => schedules.filter((s) => s.enabled).sort((a, b) => a.nextRunAt - b.nextRunAt)[0],
    [schedules],
  );

  const filterName = (id: string) => saved.find((f) => f.id === id)?.name ?? "missing filter";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
          <CalendarClock className="h-3.5 w-3.5" />
          Schedules
          {schedules.filter((s) => s.enabled).length > 0 ? (
            <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
              {schedules.filter((s) => s.enabled).length}
            </Badge>
          ) : null}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Scheduled audit exports</DialogTitle>
          <DialogDescription>
            Automatically generate CSV/JSON files for a saved filter on a daily or weekly cadence.
            Runs fire while the app is open; missed runs are caught up next time you return.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-3">
          <div className="space-y-4">
            {/* Create */}
            <div className="space-y-3 rounded-md border border-border/60 bg-muted/10 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                New schedule
              </p>
              {saved.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Save a filter in the audit trail first — schedules export a named saved filter.
                </p>
              ) : (
                <>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-[11px]">Name</Label>
                      <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Weekly compliance export"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Saved filter</Label>
                      <Select value={filterId} onValueChange={setFilterId}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Choose a saved filter" />
                        </SelectTrigger>
                        <SelectContent>
                          {saved.map((f) => (
                            <SelectItem key={f.id} value={f.id}>
                              {f.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Cadence</Label>
                      <Select value={cadence} onValueChange={(v) => setCadence(v as Cadence)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Time (local)</Label>
                      <Select value={String(hour)} onValueChange={(v) => setHour(Number(v))}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 24 }, (_, h) => (
                            <SelectItem key={h} value={String(h)}>
                              {String(h).padStart(2, "0")}:00
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {cadence === "weekly" ? (
                      <div className="space-y-1">
                        <Label className="text-[11px]">Day</Label>
                        <Select value={String(weekday)} onValueChange={(v) => setWeekday(Number(v))}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 7 }, (_, d) => (
                              <SelectItem key={d} value={String(d)}>
                                {weekdayLabel(d)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                    <div className="space-y-1">
                      <Label className="text-[11px]">Format</Label>
                      <Select value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="both">CSV + JSON</SelectItem>
                          <SelectItem value="csv">CSV only</SelectItem>
                          <SelectItem value="json">JSON only</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded border border-border/60 bg-background/40 px-3 py-2">
                    <div>
                      <p className="text-xs font-medium">Download files automatically</p>
                      <p className="text-[10px] text-muted-foreground">
                        Off = the run is recorded in history and you download it manually.
                      </p>
                    </div>
                    <Switch checked={autoDownload} onCheckedChange={setAutoDownload} />
                  </div>
                  <Button size="sm" className="h-8 text-xs" onClick={addSchedule}>
                    Create schedule
                  </Button>
                </>
              )}
            </div>

            {/* Existing */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Active schedules
                </p>
                {nextUp ? (
                  <span className="text-[10px] text-muted-foreground">
                    Next: {new Date(nextUp.nextRunAt).toLocaleString()}
                  </span>
                ) : null}
              </div>
              {schedules.length === 0 ? (
                <p className="text-xs text-muted-foreground">No scheduled exports yet.</p>
              ) : (
                schedules.map((s) => (
                  <div
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/60 bg-muted/10 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">{s.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {describeSchedule(s)} · {filterName(s.filterId)} ·{" "}
                        {s.format === "both" ? "CSV + JSON" : s.format.toUpperCase()}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Next {new Date(s.nextRunAt).toLocaleString()}
                        {s.lastRunAt ? ` · last ${new Date(s.lastRunAt).toLocaleString()}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={s.enabled}
                        onCheckedChange={(v) =>
                          persist(
                            schedules.map((x) =>
                              x.id === s.id
                                ? {
                                    ...x,
                                    enabled: v,
                                    nextRunAt: v
                                      ? computeNextRun(x.cadence, x.hour, x.weekday)
                                      : x.nextRunAt,
                                  }
                                : x,
                            ),
                          )
                        }
                        aria-label={`Toggle ${s.name}`}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 text-[11px]"
                        onClick={() => runNow(s)}
                      >
                        <Play className="h-3 w-3" />
                        Run now
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        aria-label={`Delete ${s.name}`}
                        onClick={() => persist(schedules.filter((x) => x.id !== s.id))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* History */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Run history
              </p>
              {runs.length === 0 ? (
                <p className="text-xs text-muted-foreground">No scheduled runs yet.</p>
              ) : (
                runs.slice(0, 15).map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/60 bg-muted/10 px-3 py-1.5 text-[11px]"
                  >
                    <span className="font-medium">{r.scheduleName}</span>
                    <span className="text-muted-foreground">{r.filterName}</span>
                    <span className="text-muted-foreground">{r.records} records</span>
                    <span className="text-muted-foreground">
                      {new Date(r.ranAt).toLocaleString()}
                    </span>
                    <Badge variant={r.downloaded ? "secondary" : "outline"} className="text-[10px]">
                      {r.downloaded ? "downloaded" : "recorded"}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

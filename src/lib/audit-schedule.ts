/* ------------------------------------------------------------------ *
 * Scheduled mitigation audit exports
 *
 * Audit history lives in the browser (simulated/demo data), so schedules
 * run in-app: whenever the app is open, any schedule whose next run time
 * has passed is executed once, files are generated for the chosen saved
 * filter, and the run is recorded. Missed runs are caught up on the next
 * time you open the app.
 * ------------------------------------------------------------------ */

import type { TuningLogEntry } from "@/lib/paper-store";
import {
  filterAuditEntries,
  loadSavedFilters,
  RANGE_LABEL,
  RANGE_MS,
  type AuditFilterState,
  type SavedAuditFilter,
} from "@/lib/audit-filters";

export type ExportFormat = "csv" | "json" | "both";
export type Cadence = "daily" | "weekly";

export type AuditExportSchedule = {
  id: string;
  name: string;
  /** ID of the saved audit filter this schedule exports. */
  filterId: string;
  cadence: Cadence;
  /** Local hour of day (0-23) the export should run. */
  hour: number;
  /** 0 = Sunday … 6 = Saturday. Weekly cadence only. */
  weekday: number;
  format: ExportFormat;
  /** Download files automatically when the run fires. */
  autoDownload: boolean;
  enabled: boolean;
  createdAt: number;
  lastRunAt?: number;
  nextRunAt: number;
};

export type ScheduleRun = {
  id: string;
  scheduleId: string;
  scheduleName: string;
  filterName: string;
  ranAt: number;
  records: number;
  format: ExportFormat;
  files: string[];
  downloaded: boolean;
};

const SCHEDULES_KEY = "pumppilot_audit_export_schedules";
const RUNS_KEY = "pumppilot_audit_export_runs";
const MAX_RUNS = 50;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const weekdayLabel = (d: number) => WEEKDAYS[((d % 7) + 7) % 7];

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export const loadSchedules = () => read<AuditExportSchedule[]>(SCHEDULES_KEY, []);
export const saveSchedules = (s: AuditExportSchedule[]) => write(SCHEDULES_KEY, s);
export const loadRuns = () => read<ScheduleRun[]>(RUNS_KEY, []);
export const saveRuns = (r: ScheduleRun[]) => write(RUNS_KEY, r.slice(0, MAX_RUNS));

/** Next occurrence of the schedule's hour (and weekday) strictly after `from`. */
export function computeNextRun(
  cadence: Cadence,
  hour: number,
  weekday: number,
  from = Date.now(),
): number {
  const d = new Date(from);
  d.setHours(hour, 0, 0, 0);
  if (cadence === "daily") {
    if (d.getTime() <= from) d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  const target = ((weekday % 7) + 7) % 7;
  let delta = (target - d.getDay() + 7) % 7;
  if (delta === 0 && d.getTime() <= from) delta = 7;
  d.setDate(d.getDate() + delta);
  return d.getTime();
}

export function describeSchedule(s: AuditExportSchedule) {
  const time = `${String(s.hour).padStart(2, "0")}:00`;
  return s.cadence === "daily"
    ? `Every day at ${time}`
    : `Every ${weekdayLabel(s.weekday)} at ${time}`;
}

/* ----------------------------- serialisation ----------------------------- */

const iso = (ts?: number) => (ts ? new Date(ts).toISOString() : "");
const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export type ScheduledRow = Record<string, string | number>;

export function buildRows(
  entries: TuningLogEntry[],
  filter: AuditFilterState,
  walletsFor?: (e: TuningLogEntry) => string[],
  now = Date.now(),
): ScheduledRow[] {
  const from = filter.range === "all" ? "" : new Date(now - RANGE_MS[filter.range]).toISOString();
  const to = new Date(now).toISOString();
  return entries.map((e) => ({
    correlationId: e.correlationId ?? "",
    entryId: e.id,
    phase: e.phase ?? "applied",
    mitigation: e.mitigation ?? "",
    trigger: e.trigger ?? "",
    rule: e.ruleLabel,
    operator: e.operator,
    oldValue: e.oldValue,
    newValue: e.newValue,
    unit: e.unit,
    timestamp: iso(e.ts),
    previewedAt: iso(e.previewedAt),
    appliedAt: iso(e.appliedAt),
    revertedAt: iso(e.revertedAt),
    rangeLabel: RANGE_LABEL[filter.range],
    rangeFrom: from,
    rangeTo: to,
    matchesBefore: e.matchesBefore ?? "",
    matchesAfter: e.matchesAfter ?? "",
    nearMissBefore: e.nearMissBefore ?? "",
    nearMissAfter: e.nearMissAfter ?? "",
    outcomeStatus: e.outcome?.status ?? "pending",
    outcomeMatched: e.outcome?.matched ?? "",
    outcomeDelivered: e.outcome?.delivered ?? "",
    outcomeSymbols: e.outcome?.symbols.join("|") ?? "",
    outcomeChannels: e.outcome?.channels.join("|") ?? "",
    outcomeAt: iso(e.outcome?.ts),
    wallets: (walletsFor?.(e) ?? []).join("|"),
  }));
}

export function rowsToCsv(rows: ScheduledRow[], meta: Record<string, unknown>) {
  const metaLines = Object.entries(meta)
    .map(([k, v]) => [cell(k), cell(Array.isArray(v) ? v.join(" | ") : v)].join(","))
    .join("\n");
  const headers = rows.length ? Object.keys(rows[0]) : [];
  return [
    `${cell("field")},${cell("value")}`,
    metaLines,
    "",
    headers.join(","),
    ...rows.map((r) => headers.map((h) => cell(r[h])).join(",")),
  ].join("\n");
}

export function rowsToJson(rows: ScheduledRow[], meta: Record<string, unknown>) {
  return JSON.stringify(
    {
      export: "mitigation-audit-scheduled",
      dataSource: "demo/mock data — not financial advice",
      ...meta,
      recordCount: rows.length,
      records: rows,
    },
    null,
    2,
  );
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* -------------------------------- running -------------------------------- */

export type RunResult = { run: ScheduleRun; skipped?: string };

/** Executes one schedule immediately, optionally downloading the files. */
export function runSchedule(
  schedule: AuditExportSchedule,
  log: TuningLogEntry[],
  walletsFor?: (e: TuningLogEntry) => string[],
  opts: { download?: boolean; savedFilters?: SavedAuditFilter[]; now?: number } = {},
): RunResult | null {
  const now = opts.now ?? Date.now();
  const filters = opts.savedFilters ?? loadSavedFilters();
  const filter = filters.find((f) => f.id === schedule.filterId);
  if (!filter) return null;

  const entries = filterAuditEntries(log, filter, walletsFor, now);
  const rows = buildRows(entries, filter, walletsFor, now);
  const stamp = new Date(now).toISOString().replace(/[:.]/g, "-");
  const slug = schedule.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "audit";
  const meta = {
    schedule: schedule.name,
    cadence: describeSchedule(schedule),
    savedFilter: filter.name,
    generatedAt: new Date(now).toISOString(),
    range: RANGE_LABEL[filter.range],
    rangeFrom: filter.range === "all" ? null : new Date(now - RANGE_MS[filter.range]).toISOString(),
    rangeTo: new Date(now).toISOString(),
    outcome: filter.outcome,
    quickSearch: filter.q || "none",
    tokens: filter.tokens.length ? filter.tokens : "all",
    wallets: filter.wallets.length ? filter.wallets : "all",
    alertTypes: filter.alertTypes.length ? filter.alertTypes : "all",
    correlationIds: filter.correlationIds.length ? filter.correlationIds : "all",
  };

  const files: string[] = [];
  const wantCsv = schedule.format === "csv" || schedule.format === "both";
  const wantJson = schedule.format === "json" || schedule.format === "both";
  const shouldDownload = opts.download ?? schedule.autoDownload;

  if (wantCsv) {
    const name = `${slug}-${stamp}.csv`;
    files.push(name);
    if (shouldDownload) download(new Blob([rowsToCsv(rows, meta)], { type: "text/csv" }), name);
  }
  if (wantJson) {
    const name = `${slug}-${stamp}.json`;
    files.push(name);
    if (shouldDownload)
      download(new Blob([rowsToJson(rows, meta)], { type: "application/json" }), name);
  }

  return {
    run: {
      id: `${now}-${schedule.id}`,
      scheduleId: schedule.id,
      scheduleName: schedule.name,
      filterName: filter.name,
      ranAt: now,
      records: rows.length,
      format: schedule.format,
      files,
      downloaded: !!shouldDownload,
    },
  };
}

/** Runs every enabled schedule that is due, advancing its next run time. */
export function runDueSchedules(
  schedules: AuditExportSchedule[],
  log: TuningLogEntry[],
  walletsFor?: (e: TuningLogEntry) => string[],
  now = Date.now(),
): { schedules: AuditExportSchedule[]; runs: ScheduleRun[] } {
  const runs: ScheduleRun[] = [];
  const savedFilters = loadSavedFilters();

  const next = schedules.map((s) => {
    if (!s.enabled || s.nextRunAt > now) return s;
    const result = runSchedule(s, log, walletsFor, { savedFilters, now });
    if (result) runs.push(result.run);
    return {
      ...s,
      lastRunAt: result ? now : s.lastRunAt,
      nextRunAt: computeNextRun(s.cadence, s.hour, s.weekday, now),
    };
  });

  return { schedules: next, runs };
}

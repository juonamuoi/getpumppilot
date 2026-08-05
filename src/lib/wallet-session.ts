/* ------------------------------------------------------------------ *
 * Tiny global wallet session store (demo / read-only).
 *
 * Holds the currently "connected" mock wallet plus its latest approval
 * scan so any screen (e.g. the Security Center) can show status and
 * trigger a rescan. No keys, seed phrases or signing — ever.
 * ------------------------------------------------------------------ */
import { useSyncExternalStore } from "react";
import type { ApprovalRisk, WalletScanResult } from "@/lib/wallet-scan";

export const DEMO_WALLET_ADDRESS = "0xDEMO00000000000000000000000000000000a1b2";

export type WalletSession = {
  wallet: string | null;
  address: string | null;
  scanning: boolean;
  scan: WalletScanResult | null;
};

let state: WalletSession = { wallet: null, address: null, scanning: false, scan: null };

const listeners = new Set<() => void>();
/** Set by <WalletConnect/> so other screens can trigger a rescan. */
let rescanHandler: ((opts?: { background?: boolean }) => void) | null = null;

function emit() {
  for (const l of listeners) l();
}

export function setWalletSession(patch: Partial<WalletSession>) {
  state = { ...state, ...patch };
  emit();
}

export function registerRescanHandler(
  fn: ((opts?: { background?: boolean }) => void) | null,
) {
  rescanHandler = fn;
}

export function requestWalletRescan(opts?: { background?: boolean }) {
  rescanHandler?.(opts);
}

export function useWalletSession(): WalletSession {
  return useStableSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
    "wallet-session",
  );
}

/* ----------------------- Background monitoring settings ---------------------- */

export type WalletMonitorSettings = {
  enabled: boolean;
  /** Default scan interval in minutes (used when a wallet has no override). */
  intervalMinutes: number;
  /** Per-wallet custom interval overrides, keyed by lowercased address. */
  walletIntervals: Record<string, number>;
  /** Toast immediately when a new threat appears. */
  notifyOnNewThreats: boolean;
  /** Send a device/browser push notification for new risky approvals. */
  pushOnNewThreats: boolean;
  /** Email the signed-in account for new risky approvals. */
  emailOnNewThreats: boolean;
  /** Attach a signed link to the full PDF threat report in those emails. */
  emailPdfReport: boolean;
  /** Recurring PDF threat-report export. */
  reportSchedule: ReportSchedule;
  /**
   * Alert scoping: only notify for approvals whose token / wallet is
   * selected. Empty array = no filter (all tokens / all wallets).
   */
  alertTokens: string[];
  alertWallets: string[];
};

export type ReportFrequency = "off" | "daily" | "weekly";
export type ReportDelivery = "download" | "email" | "both";

export type ReportSchedule = {
  frequency: ReportFrequency;
  /** Local hour of day (0-23) the report is generated. */
  hour: number;
  /** Local weekday (0 = Sunday) used when frequency is "weekly". */
  weekday: number;
  /** Where the generated report goes. */
  delivery: ReportDelivery;
  /** Epoch ms of the last successful run (null if never run). */
  lastRunAt: number | null;
};

export const defaultReportSchedule: ReportSchedule = {
  frequency: "off",
  hour: 9,
  weekday: 1,
  delivery: "download",
  lastRunAt: null,
};

export const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const MONITOR_INTERVALS = [5, 15, 30, 60] as const;

/** Allowed bounds for a custom interval, in minutes. */
export const MIN_INTERVAL_MINUTES = 1;
export const MAX_INTERVAL_MINUTES = 1440;

export function clampInterval(minutes: number) {
  if (!Number.isFinite(minutes)) return defaultMonitor.intervalMinutes;
  return Math.min(MAX_INTERVAL_MINUTES, Math.max(MIN_INTERVAL_MINUTES, Math.round(minutes)));
}

export function formatInterval(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

const MONITOR_KEY = "pp_wallet_monitor_v1";

const defaultMonitor: WalletMonitorSettings = {
  enabled: true,
  intervalMinutes: 15,
  walletIntervals: {},
  notifyOnNewThreats: true,
  pushOnNewThreats: false,
  emailOnNewThreats: false,
  emailPdfReport: true,
  reportSchedule: defaultReportSchedule,
  alertTokens: [],
  alertWallets: [],
};

function loadMonitor(): WalletMonitorSettings {
  if (typeof window === "undefined") return defaultMonitor;
  try {
    const raw = window.localStorage.getItem(MONITOR_KEY);
    if (!raw) return defaultMonitor;
    const parsed = JSON.parse(raw) as Partial<WalletMonitorSettings>;
    return {
      ...defaultMonitor,
      ...parsed,
      reportSchedule: { ...defaultReportSchedule, ...(parsed.reportSchedule ?? {}) },
    };
  } catch {
    return defaultMonitor;
  }
}

let monitor: WalletMonitorSettings = loadMonitor();
const monitorListeners = new Set<() => void>();

export function setWalletMonitor(patch: Partial<WalletMonitorSettings>) {
  monitor = { ...monitor, ...patch };
  try {
    window.localStorage.setItem(MONITOR_KEY, JSON.stringify(monitor));
  } catch {
    /* ignore */
  }
  for (const l of monitorListeners) l();
}

export function getWalletMonitor(): WalletMonitorSettings {
  return monitor;
}

/** Effective scan interval for a wallet: its override, else the default. */
export function getWalletInterval(address: string | null | undefined): number {
  if (!address) return monitor.intervalMinutes;
  const custom = monitor.walletIntervals[address.toLowerCase()];
  return custom ? clampInterval(custom) : monitor.intervalMinutes;
}

export function hasWalletIntervalOverride(address: string | null | undefined) {
  return !!address && monitor.walletIntervals[address.toLowerCase()] !== undefined;
}

/** Set (or with null, clear) a per-wallet custom interval. */
export function setWalletInterval(address: string, minutes: number | null) {
  const key = address.toLowerCase();
  const next = { ...monitor.walletIntervals };
  if (minutes === null) delete next[key];
  else next[key] = clampInterval(minutes);
  setWalletMonitor({ walletIntervals: next });
}

/* --------------------------- Alert scope filters --------------------------- */

/** Toggle a token in the alert filter. Empty selection = all tokens. */
export function toggleAlertToken(token: string) {
  const key = token.toUpperCase();
  const has = monitor.alertTokens.includes(key);
  setWalletMonitor({
    alertTokens: has
      ? monitor.alertTokens.filter((t) => t !== key)
      : [...monitor.alertTokens, key],
  });
}

/** Toggle a wallet address in the alert filter. Empty selection = all wallets. */
export function toggleAlertWallet(address: string) {
  const key = address.toLowerCase();
  const has = monitor.alertWallets.includes(key);
  setWalletMonitor({
    alertWallets: has
      ? monitor.alertWallets.filter((a) => a !== key)
      : [...monitor.alertWallets, key],
  });
}

export function clearAlertFilters() {
  setWalletMonitor({ alertTokens: [], alertWallets: [] });
}

/** True when alerts are allowed for this wallet address. */
export function walletAlertsEnabled(address: string | null | undefined) {
  const list = monitor.alertWallets;
  if (list.length === 0) return true;
  return !!address && list.includes(address.toLowerCase());
}

/** True when alerts are allowed for this token symbol. */
export function tokenAlertsEnabled(token: string | null | undefined) {
  const list = monitor.alertTokens;
  if (list.length === 0) return true;
  return !!token && list.includes(token.toUpperCase());
}

/**
 * Narrow a set of detected approvals down to the ones the user wants to be
 * notified about. Filtering is notification-only — every threat still shows
 * up in scans, the security log and reports.
 */
export function filterAlertThreats<T extends { token: string }>(
  address: string | null | undefined,
  threats: T[],
): T[] {
  if (!walletAlertsEnabled(address)) return [];
  return threats.filter((t) => tokenAlertsEnabled(t.token));
}



/** Patch the recurring report schedule. */
export function setReportSchedule(patch: Partial<ReportSchedule>) {
  setWalletMonitor({ reportSchedule: { ...monitor.reportSchedule, ...patch } });
}

/**
 * Next fire time (epoch ms) for a schedule, in local time.
 * Returns null when the schedule is off.
 */
export function nextReportRunAt(
  schedule: ReportSchedule,
  from: number = Date.now(),
): number | null {
  if (schedule.frequency === "off") return null;
  const hour = Math.min(23, Math.max(0, Math.round(schedule.hour)));
  const base = new Date(from);
  const candidate = new Date(base);
  candidate.setHours(hour, 0, 0, 0);

  if (schedule.frequency === "daily") {
    if (candidate.getTime() <= from) candidate.setDate(candidate.getDate() + 1);
    return candidate.getTime();
  }

  const weekday = Math.min(6, Math.max(0, Math.round(schedule.weekday)));
  let delta = (weekday - candidate.getDay() + 7) % 7;
  if (delta === 0 && candidate.getTime() <= from) delta = 7;
  candidate.setDate(candidate.getDate() + delta);
  return candidate.getTime();
}

/** True when the schedule's most recent slot has passed without a run. */
export function isReportDue(schedule: ReportSchedule, now: number = Date.now()): boolean {
  if (schedule.frequency === "off") return false;
  // The previous slot is the next slot one period earlier.
  const next = nextReportRunAt(schedule, now);
  if (next === null) return false;
  const period = schedule.frequency === "daily" ? 86_400_000 : 7 * 86_400_000;
  const previousSlot = next - period;
  if (previousSlot > now) return false;
  return (schedule.lastRunAt ?? 0) < previousSlot;
}

export function useWalletMonitor(): WalletMonitorSettings {
  return useStableSyncExternalStore(
    (cb) => {
      monitorListeners.add(cb);
      return () => monitorListeners.delete(cb);
    },
    () => monitor,
    () => defaultMonitor,
    "wallet-session/monitor",
  );
}


/* --------------------------- Scan history / timeline -------------------------- *
 * Every scan run (connect, manual rescan, background sweep) is recorded so the
 * Security Center can show a timeline of past scans and the exact moment each
 * threat was first detected. Demo data only — persisted locally, never sent
 * anywhere.
 * ----------------------------------------------------------------------------- */

export type ScanTrigger = "connect" | "manual" | "background";

export type TimelineThreat = {
  /** Stable identity across scans: token + spender. */
  key: string;
  id: string;
  token: string;
  spender: string;
  spenderLabel: string;
  risk: ApprovalRisk;
  valueAtRiskUsd: number;
  reasons: string[];
  rules: string[];
  correlationId?: string;
  /** When this threat was first ever detected. */
  firstSeenAt: number;
  /** True if this scan is the one that first detected it. */
  isNew: boolean;
};

export type ScanRun = {
  correlationId: string;
  address: string;
  scannedAt: number;
  trigger: ScanTrigger;
  approvalCount: number;
  worst: ApprovalRisk;
  totalValueAtRiskUsd: number;
  threats: TimelineThreat[];
  /** Keys detected in this run that were not present in the previous run. */
  newThreatKeys: string[];
  /** Keys present in the previous run but gone in this one (revoked/cleared). */
  resolvedThreatKeys: string[];
};

const HISTORY_KEY = "pp_wallet_scan_history_v1";
const HISTORY_LIMIT = 60;

export function threatKey(t: { token: string; spender: string }) {
  return `${t.token}:${t.spender}`.toLowerCase();
}

type HistoryState = { runs: ScanRun[]; firstSeen: Record<string, number> };

function loadHistory(): HistoryState {
  if (typeof window === "undefined") return { runs: [], firstSeen: {} };
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return { runs: [], firstSeen: {} };
    const parsed = JSON.parse(raw) as Partial<HistoryState>;
    return { runs: parsed.runs ?? [], firstSeen: parsed.firstSeen ?? {} };
  } catch {
    return { runs: [], firstSeen: {} };
  }
}

const emptyHistory: HistoryState = { runs: [], firstSeen: {} };
let history: HistoryState = loadHistory();
const historyListeners = new Set<() => void>();

function persistHistory() {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    /* ignore */
  }
  for (const l of historyListeners) l();
}

/** Record a completed scan on the timeline. Returns the stored run. */
export function recordScanRun(result: WalletScanResult, trigger: ScanTrigger): ScanRun {
  const previous = history.runs[0];
  const previousKeys = new Set(previous?.threats.map((t) => t.key) ?? []);
  const firstSeen = { ...history.firstSeen };

  const threats: TimelineThreat[] = result.threats.map((t) => {
    const key = threatKey(t);
    const seen = firstSeen[key];
    const isNew = seen === undefined || !previousKeys.has(key);
    if (seen === undefined) firstSeen[key] = result.scannedAt;
    return {
      key,
      id: t.id,
      token: t.token,
      spender: t.spender,
      spenderLabel: t.spenderLabel,
      risk: t.risk,
      valueAtRiskUsd: t.valueAtRiskUsd,
      reasons: t.reasons,
      rules: t.rules,
      correlationId: t.correlationId,
      firstSeenAt: firstSeen[key],
      isNew,
    };
  });

  const currentKeys = new Set(threats.map((t) => t.key));
  const run: ScanRun = {
    correlationId: result.correlationId,
    address: result.address,
    scannedAt: result.scannedAt,
    trigger,
    approvalCount: result.approvals.length,
    worst: result.worst,
    totalValueAtRiskUsd: result.totalValueAtRiskUsd,
    threats,
    newThreatKeys: threats.filter((t) => t.isNew).map((t) => t.key),
    resolvedThreatKeys: [...previousKeys].filter((k) => !currentKeys.has(k)),
  };

  history = { runs: [run, ...history.runs].slice(0, HISTORY_LIMIT), firstSeen };
  persistHistory();
  return run;
}

export function clearScanHistory() {
  history = { runs: [], firstSeen: {} };
  persistHistory();
}

export function useScanHistory(): ScanRun[] {
  return useStableSyncExternalStore(
    (cb) => {
      historyListeners.add(cb);
      return () => historyListeners.delete(cb);
    },
    () => history.runs,
    () => emptyHistory.runs,
    "wallet-session/scan-history",
  );
}

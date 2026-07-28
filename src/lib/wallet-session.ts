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
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
  );
}

/* ----------------------- Background monitoring settings ---------------------- */

export type WalletMonitorSettings = {
  enabled: boolean;
  /** Scan interval in minutes. */
  intervalMinutes: number;
  /** Toast immediately when a new threat appears. */
  notifyOnNewThreats: boolean;
  /** Send a device/browser push notification for new risky approvals. */
  pushOnNewThreats: boolean;
  /** Email the signed-in account for new risky approvals. */
  emailOnNewThreats: boolean;
};

export const MONITOR_INTERVALS = [5, 15, 30, 60] as const;

const MONITOR_KEY = "pp_wallet_monitor_v1";

const defaultMonitor: WalletMonitorSettings = {
  enabled: true,
  intervalMinutes: 15,
  notifyOnNewThreats: true,
  pushOnNewThreats: false,
  emailOnNewThreats: false,
};

function loadMonitor(): WalletMonitorSettings {
  if (typeof window === "undefined") return defaultMonitor;
  try {
    const raw = window.localStorage.getItem(MONITOR_KEY);
    if (!raw) return defaultMonitor;
    return { ...defaultMonitor, ...(JSON.parse(raw) as Partial<WalletMonitorSettings>) };
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

export function useWalletMonitor(): WalletMonitorSettings {
  return useSyncExternalStore(
    (cb) => {
      monitorListeners.add(cb);
      return () => monitorListeners.delete(cb);
    },
    () => monitor,
    () => defaultMonitor,
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
  return useSyncExternalStore(
    (cb) => {
      historyListeners.add(cb);
      return () => historyListeners.delete(cb);
    },
    () => history.runs,
    () => emptyHistory.runs,
  );
}

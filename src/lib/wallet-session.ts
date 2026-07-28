/* ------------------------------------------------------------------ *
 * Tiny global wallet session store (demo / read-only).
 *
 * Holds the currently "connected" mock wallet plus its latest approval
 * scan so any screen (e.g. the Security Center) can show status and
 * trigger a rescan. No keys, seed phrases or signing — ever.
 * ------------------------------------------------------------------ */
import { useSyncExternalStore } from "react";
import type { WalletScanResult } from "@/lib/wallet-scan";

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


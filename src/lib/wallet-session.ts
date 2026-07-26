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
let rescanHandler: (() => void) | null = null;

function emit() {
  for (const l of listeners) l();
}

export function setWalletSession(patch: Partial<WalletSession>) {
  state = { ...state, ...patch };
  emit();
}

export function registerRescanHandler(fn: (() => void) | null) {
  rescanHandler = fn;
}

export function requestWalletRescan() {
  rescanHandler?.();
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

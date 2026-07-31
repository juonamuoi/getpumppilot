// Global trade safety gate.
// Every trade/submit action in the app routes through this store first, so a
// single read-only / probabilistic-signal notice is shown before anything runs.
// Live execution is opt-in per account and always user-signed; paper stays the default.
import { useSyncExternalStore } from "react";

export type TradeGateRequest = {
  /** Short action label, e.g. "Buy 1.5 BTC". */
  action: string;
  /** "paper" actions may continue as a simulated fill after acknowledgement. */
  mode: "paper" | "live";
  /** Extra context shown under the notice. */
  detail?: string;
  /** Runs only for paper mode, after the user acknowledges the notice. */
  onConfirm?: () => void | Promise<void>;
};

export const SAFETY_NOTICE = [
  "PumpPilot never holds your keys and never asks for a seed phrase — any on-chain order is signed by you, in your wallet.",
  "Momentum scores and price signals are probabilistic indicators, not guarantees or financial advice.",
  "Paper mode fills are simulated. In live mode you sign every swap yourself in your own wallet — trades are real and irreversible.",
];

let current: TradeGateRequest | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Intercept a trade/submit action and show the safety notice. */
export function requestTrade(req: TradeGateRequest) {
  current = req;
  emit();
}

export function closeTradeGate() {
  current = null;
  emit();
}

export async function confirmTradeGate() {
  const req = current;
  current = null;
  emit();
  await req?.onConfirm?.();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useTradeGate(): TradeGateRequest | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}

// Global trade safety gate.
// Every trade/submit action in the app routes through this store first, so a
// single read-only / probabilistic-signal notice is shown before anything runs.
// Live execution is hard-disabled: there is no code path that places a real order.
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
  "Wallet connections are read-only — PumpPilot never signs, routes or submits an on-chain order and never asks for a seed phrase.",
  "Momentum scores and price signals are probabilistic indicators, not guarantees or financial advice.",
  "Live trading execution is disabled app-wide. Any fill you see is a simulated paper trade.",
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
  if (req?.mode === "paper") await req.onConfirm?.();
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

/* ------------------------------------------------------------------ *
 * Live trading mode switch.
 *
 * Paper is still the default. Live mode must be unlocked explicitly by the
 * account holder and stays scoped by hard client-side risk limits:
 *   - max notional per trade
 *   - max slippage
 *   - allowed chains
 * PumpPilot never holds keys: every live swap is a transaction the user
 * signs in their own wallet. No seed phrase is ever requested or stored.
 * ------------------------------------------------------------------ */
import { useSyncExternalStore } from "react";

export type TradeMode = "paper" | "live";

export type LiveTradingSettings = {
  mode: TradeMode;
  /** Explicit risk acknowledgement, required before live can be enabled. */
  acknowledged: boolean;
  chainId: number;
  slippageBps: number;
  /** Hard client-side notional ceiling per swap, in USD. */
  maxTradeUsd: number;
};

export const SUPPORTED_CHAINS: { id: number; name: string; explorer: string }[] = [
  { id: 1, name: "Ethereum", explorer: "https://etherscan.io/tx/" },
  { id: 8453, name: "Base", explorer: "https://basescan.org/tx/" },
  { id: 42161, name: "Arbitrum", explorer: "https://arbiscan.io/tx/" },
  { id: 10, name: "Optimism", explorer: "https://optimistic.etherscan.io/tx/" },
  { id: 137, name: "Polygon", explorer: "https://polygonscan.com/tx/" },
];

export const MAX_SLIPPAGE_BPS = 300; // 3% ceiling, whatever the user types
export const MAX_TRADE_USD_CEILING = 25_000;

const KEY = "pp.live-trading.v1";

const DEFAULTS: LiveTradingSettings = {
  mode: "paper",
  acknowledged: false,
  chainId: 1,
  slippageBps: 50,
  maxTradeUsd: 250,
};

let state: LiveTradingSettings = DEFAULTS;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(Math.max(Number.isFinite(n) ? n : lo, lo), hi);
}

function sanitize(raw: Partial<LiveTradingSettings>): LiveTradingSettings {
  const chainId = SUPPORTED_CHAINS.some((c) => c.id === raw.chainId)
    ? (raw.chainId as number)
    : DEFAULTS.chainId;
  const acknowledged = raw.acknowledged === true;
  return {
    acknowledged,
    chainId,
    slippageBps: Math.round(clamp(Number(raw.slippageBps ?? DEFAULTS.slippageBps), 5, MAX_SLIPPAGE_BPS)),
    maxTradeUsd: Math.round(clamp(Number(raw.maxTradeUsd ?? DEFAULTS.maxTradeUsd), 10, MAX_TRADE_USD_CEILING)),
    // Live can never survive a reload without a recorded acknowledgement.
    mode: raw.mode === "live" && acknowledged ? "live" : "paper",
  };
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) state = sanitize(JSON.parse(raw) as Partial<LiveTradingSettings>);
  } catch {
    state = DEFAULTS;
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage denied (private mode) — settings stay in memory for this session.
  }
}

export function getLiveTrading(): LiveTradingSettings {
  hydrate();
  return state;
}

export function updateLiveTrading(patch: Partial<LiveTradingSettings>): LiveTradingSettings {
  hydrate();
  state = sanitize({ ...state, ...patch });
  persist();
  emit();
  return state;
}

/** Turns live execution off immediately — used by the global kill switch. */
export function panicToPaper() {
  return updateLiveTrading({ mode: "paper" });
}

function subscribe(cb: () => void) {
  hydrate();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useLiveTrading(): LiveTradingSettings {
  return useSyncExternalStore(subscribe, getLiveTrading, () => DEFAULTS);
}

export function chainName(chainId: number) {
  return SUPPORTED_CHAINS.find((c) => c.id === chainId)?.name ?? `Chain ${chainId}`;
}

export function explorerTxUrl(chainId: number, hash: string) {
  const base = SUPPORTED_CHAINS.find((c) => c.id === chainId)?.explorer;
  return base ? `${base}${hash}` : hash;
}

export const LIVE_RISK_POINTS = [
  "Live mode moves real funds. Swaps are irreversible once confirmed on-chain.",
  "You sign every transaction in your own wallet — PumpPilot never has custody, keys or a seed phrase.",
  "Momentum scores are probabilistic signals, not advice. You can lose everything you trade.",
  "Routing, gas and slippage costs are yours; quoted output is an estimate, not a guarantee.",
];

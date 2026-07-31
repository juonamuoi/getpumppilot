// Price-change and threshold alerts for live wallet holdings.
// Monitoring only — this module never places, signs or simulates an order.
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { dispatchAlert } from "@/lib/wallet-alert-channels";
import type { LivePrice } from "@/lib/market-data";

export type WalletAlertKind =
  | "price_above"
  | "price_below"
  | "change_up"
  | "change_down"
  | "move_up"
  | "move_down";

export type WalletAlertRule = {
  id: string;
  symbol: string;
  kind: WalletAlertKind;
  /** USD price for price_* rules, percent for change_* rules. */
  value: number;
  enabled: boolean;
  /** Minimum minutes between two firings of the same rule. */
  cooldownMinutes: number;
  createdAt: number;
  lastFiredAt?: number;
  /** Reference price for move_* rules — the "last check" baseline. */
  refPrice?: number;
  refAt?: number;
};

export type WalletAlertEvent = {
  id: string;
  ruleId: string;
  ts: number;
  symbol: string;
  kind: WalletAlertKind;
  threshold: number;
  observed: number;
  message: string;
  /** Baseline price a move_* rule was measured against. */
  refPrice?: number;
};

export const ALERT_KIND_LABELS: Record<WalletAlertKind, string> = {
  price_above: "Price rises above",
  price_below: "Price falls below",
  change_up: "24h change above",
  change_down: "24h change below",
  move_up: "Rises % from last check",
  move_down: "Drops % from last check",
};

export function isPriceKind(kind: WalletAlertKind) {
  return kind === "price_above" || kind === "price_below";
}

/** Rules measured as a move away from a rolling reference price. */
export function isMoveKind(kind: WalletAlertKind) {
  return kind === "move_up" || kind === "move_down";
}

export function describeRule(rule: WalletAlertRule) {
  if (isMoveKind(rule.kind)) {
    const dir = rule.kind === "move_up" ? "rises" : "drops";
    const from = rule.kind === "move_up" ? "trough" : "peak";
    return `${rule.symbol} — ${dir} ${Math.abs(rule.value)}% from last-check ${from}`;
  }
  const unit = isPriceKind(rule.kind)
    ? `$${rule.value.toLocaleString(undefined, { maximumFractionDigits: 6 })}`
    : `${rule.value > 0 ? "+" : ""}${rule.value}%`;
  return `${rule.symbol} — ${ALERT_KIND_LABELS[rule.kind]} ${unit}`;
}

const RULES_KEY = "pp-wallet-alerts-v1";
const EVENTS_KEY = "pp-wallet-alert-events-v1";
const MAX_EVENTS = 100;

let rules: WalletAlertRule[] = [];
let events: WalletAlertEvent[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    rules = JSON.parse(window.localStorage.getItem(RULES_KEY) ?? "[]");
    events = JSON.parse(window.localStorage.getItem(EVENTS_KEY) ?? "[]");
  } catch {
    rules = [];
    events = [];
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RULES_KEY, JSON.stringify(rules));
    window.localStorage.setItem(EVENTS_KEY, JSON.stringify(events.slice(0, MAX_EVENTS)));
  } catch {
    /* quota — memory only */
  }
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getRules(): WalletAlertRule[] {
  load();
  return rules;
}

export function getEvents(): WalletAlertEvent[] {
  load();
  return events;
}

export function addRule(
  input: Omit<WalletAlertRule, "id" | "createdAt" | "enabled" | "cooldownMinutes"> &
    Partial<Pick<WalletAlertRule, "enabled" | "cooldownMinutes">>,
): WalletAlertRule {
  load();
  const rule: WalletAlertRule = {
    id: uid(),
    createdAt: Date.now(),
    enabled: input.enabled ?? true,
    cooldownMinutes: input.cooldownMinutes ?? 30,
    symbol: input.symbol.toUpperCase(),
    kind: input.kind,
    value: input.value,
  };
  rules = [rule, ...rules];
  persist();
  emit();
  return rule;
}

export function updateRule(id: string, patch: Partial<WalletAlertRule>) {
  load();
  rules = rules.map((r) => (r.id === id ? { ...r, ...patch } : r));
  persist();
  emit();
}

export function removeRule(id: string) {
  load();
  rules = rules.filter((r) => r.id !== id);
  persist();
  emit();
}

export function clearEvents() {
  load();
  events = [];
  persist();
  emit();
}

function subscribe(cb: () => void) {
  load();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useWalletAlertRules(): WalletAlertRule[] {
  return useSyncExternalStore(subscribe, getRules, () => [] as WalletAlertRule[]);
}

export function useWalletAlertEvents(): WalletAlertEvent[] {
  return useSyncExternalStore(subscribe, getEvents, () => [] as WalletAlertEvent[]);
}

type Observation = { price: number | null; change24h: number | null };

export function ruleTriggered(rule: WalletAlertRule, obs: Observation): number | null {
  if (isMoveKind(rule.kind)) {
    if (obs.price == null || !rule.refPrice) return null;
    const pct = ((obs.price - rule.refPrice) / rule.refPrice) * 100;
    const threshold = Math.abs(rule.value);
    if (rule.kind === "move_up" && pct >= threshold) return pct;
    if (rule.kind === "move_down" && pct <= -threshold) return pct;
    return null;
  }
  if (isPriceKind(rule.kind)) {
    if (obs.price == null) return null;
    if (rule.kind === "price_above" && obs.price > rule.value) return obs.price;
    if (rule.kind === "price_below" && obs.price < rule.value) return obs.price;
    return null;
  }
  if (obs.change24h == null) return null;
  if (rule.kind === "change_up" && obs.change24h >= rule.value) return obs.change24h;
  if (rule.kind === "change_down" && obs.change24h <= rule.value) return obs.change24h;
  return null;
}

function formatObserved(kind: WalletAlertKind, observed: number) {
  if (isMoveKind(kind)) return `${observed > 0 ? "+" : ""}${observed.toFixed(2)}%`;
  return isPriceKind(kind)
    ? `$${observed.toLocaleString(undefined, { maximumFractionDigits: 6 })}`
    : `${observed > 0 ? "+" : ""}${observed.toFixed(2)}%`;
}

/**
 * Evaluate all enabled rules against the current live-price snapshot.
 * Fires a toast + notification-log entry per triggered rule (cooldown-guarded).
 * Never triggers any trade — alerts are informational only.
 */
export function evaluateWalletAlerts(
  observations: Record<string, Observation>,
): WalletAlertEvent[] {
  load();
  const now = Date.now();
  const fired: WalletAlertEvent[] = [];

  // Maintain the rolling "last check" baseline for move_* rules before evaluating.
  let baselineChanged = false;
  rules = rules.map((r) => {
    if (!isMoveKind(r.kind)) return r;
    const price = observations[r.symbol]?.price;
    if (price == null || !Number.isFinite(price) || price <= 0) return r;
    if (!r.refPrice) {
      baselineChanged = true;
      return { ...r, refPrice: price, refAt: now };
    }
    // Trail the baseline against the rule direction so a drop is measured from
    // the recent peak (and a rise from the recent trough).
    if (r.kind === "move_down" && price > r.refPrice) {
      baselineChanged = true;
      return { ...r, refPrice: price, refAt: now };
    }
    if (r.kind === "move_up" && price < r.refPrice) {
      baselineChanged = true;
      return { ...r, refPrice: price, refAt: now };
    }
    return r;
  });
  if (baselineChanged) persist();

  for (const rule of [...rules]) {
    if (!rule.enabled) continue;
    const obs = observations[rule.symbol];
    if (!obs) continue;
    if (rule.lastFiredAt && now - rule.lastFiredAt < rule.cooldownMinutes * 60_000) continue;
    const observed = ruleTriggered(rule, obs);
    if (observed == null) continue;

    const message = isMoveKind(rule.kind)
      ? `${rule.symbol} moved ${formatObserved(rule.kind, observed)} from last check ($${
          rule.refPrice?.toLocaleString(undefined, { maximumFractionDigits: 6 }) ?? "?"
        }) — threshold ${Math.abs(rule.value)}%`
      : `${rule.symbol} ${ALERT_KIND_LABELS[rule.kind].toLowerCase()} ${
          isPriceKind(rule.kind) ? `$${rule.value}` : `${rule.value}%`
        } — now ${formatObserved(rule.kind, observed)}`;

    const event: WalletAlertEvent = {
      id: uid(),
      ruleId: rule.id,
      ts: now,
      symbol: rule.symbol,
      kind: rule.kind,
      threshold: rule.value,
      observed,
      message,
      refPrice: rule.refPrice,
    };
    fired.push(event);
    rules = rules.map((r) =>
      r.id === rule.id
        ? {
            ...r,
            lastFiredAt: now,
            // Re-baseline so the next alert measures from this point forward.
            ...(isMoveKind(r.kind) && obs.price != null
              ? { refPrice: obs.price, refAt: now }
              : {}),
          }
        : r,
    );
  }

  if (fired.length) {
    events = [...fired, ...events].slice(0, MAX_EVENTS);
    persist();
    emit();
    for (const e of fired) {
      void dispatchAlert({
        correlationId: e.id,
        symbol: e.symbol,
        message: e.message,
        ts: e.ts,
      });
    }
  }
  return fired;
}

/** Watches the live price map and evaluates rules whenever it refreshes. */
export function useWalletAlertWatcher(
  prices: Record<string, LivePrice>,
  symbols: string[],
  updatedAt: number,
) {
  const key = useMemo(() => symbols.slice().sort().join(","), [symbols]);
  const snapshot = useCallback(() => {
    const obs: Record<string, Observation> = {};
    for (const symbol of key ? key.split(",") : []) {
      const live = prices[symbol];
      obs[symbol] = {
        price: live?.price ?? null,
        change24h: live?.change24h ?? null,
      };
    }
    return obs;
  }, [prices, key]);

  useEffect(() => {
    if (!key) return;
    evaluateWalletAlerts(snapshot());
    // updatedAt changes on every live-price refresh
  }, [key, updatedAt, snapshot]);
}

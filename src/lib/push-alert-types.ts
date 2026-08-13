/**
 * Per-alert-type notification preferences.
 *
 * Device permission is one switch; this store decides *which kinds* of alerts
 * are allowed to reach the device once permission is granted:
 *   momentum  — momentum crossings / scanner rule hits
 *   strategy  — strategy + backtest run events
 *   portfolio — portfolio and risk/position updates
 *
 * Preferences are local-only and never affect trading — alerts are read-only.
 */
import { useStableSyncExternalStore } from "@/lib/snapshot-invariant";

export type PushAlertType = "momentum" | "strategy" | "portfolio";

export type PushAlertTypePrefs = Record<PushAlertType, boolean>;

export const PUSH_ALERT_TYPES: {
  value: PushAlertType;
  label: string;
  hint: string;
}[] = [
  {
    value: "momentum",
    label: "Momentum crossings",
    hint: "Scanner rule hits and per-asset momentum thresholds.",
  },
  {
    value: "strategy",
    label: "Strategy & backtest",
    hint: "Backtest runs finishing, failing or strategy rule changes.",
  },
  {
    value: "portfolio",
    label: "Portfolio updates",
    hint: "Position, exposure and risk-limit changes on your portfolio.",
  },
];

const KEY = "pp.push.alertTypes.v1";
const DEFAULTS: PushAlertTypePrefs = { momentum: true, strategy: true, portfolio: false };

let prefs: PushAlertTypePrefs = { ...DEFAULTS };
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) prefs = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<PushAlertTypePrefs>) };
  } catch {
    prefs = { ...DEFAULTS };
  }
}

export function getPushAlertTypes(): PushAlertTypePrefs {
  load();
  return prefs;
}

export function isPushTypeEnabled(type: PushAlertType): boolean {
  return getPushAlertTypes()[type];
}

export function setPushAlertType(type: PushAlertType, enabled: boolean) {
  load();
  prefs = { ...prefs, [type]: enabled };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable — keep the in-memory value */
  }
  for (const l of listeners) l();
}

/** Reactive read; snapshot reference stays stable between changes. */
export function usePushAlertTypes(): PushAlertTypePrefs {
  return useStableSyncExternalStore(
    (cb) => {
      load();
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getPushAlertTypes,
    () => DEFAULTS,
    "push-alert-types",
  );
}

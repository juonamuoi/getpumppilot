/* ------------------------------------------------------------------ *
 * Notification history — one row per risky-approval detection alert.
 *
 * Unlike the delivery log (which records per-channel send attempts),
 * this is the human-readable feed of *what* was detected and when:
 * timestamp, risk level, token/spender, correlation ID and the
 * delivery outcome for each channel.
 *
 * Persisted to localStorage. Demo data only — no keys, no seed phrases.
 * ------------------------------------------------------------------ */
import { useStableSyncExternalStore } from "@/lib/snapshot-invariant";

export type AlertRisk = "critical" | "high" | "medium" | "low" | string;

export type AlertDelivery = {
  push: "sent" | "failed" | "skipped";
  pushReason?: string;
  email: "sent" | "failed" | "skipped";
  emailReason?: string;
  reportAttached?: boolean;
};

export type AlertEvent = {
  id: string;
  ts: number;
  /** Wallet the detection belongs to. */
  address: string;
  token: string;
  spender: string;
  spenderLabel?: string;
  risk: AlertRisk;
  valueAtRiskUsd: number;
  reason: string;
  /** Per-finding correlation ID. */
  correlationId: string;
  /** Correlation ID of the batch/scan that produced it. */
  batchCorrelationId: string;
  delivery: AlertDelivery;
  test?: boolean;
};

const KEY = "pp-alert-history-v1";
const MAX = 300;

let events: AlertEvent[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) events = JSON.parse(raw) as AlertEvent[];
  } catch {
    events = [];
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(events.slice(0, MAX)));
  } catch {
    /* quota — memory only */
  }
}

export function recordAlertEvents(rows: Omit<AlertEvent, "id">[]) {
  load();
  const added = rows.map((r, i) => ({
    ...r,
    id: `${r.ts.toString(36)}-${i}-${Math.random().toString(36).slice(2, 7)}`,
  }));
  events = [...added, ...events].slice(0, MAX);
  persist();
  emit();
  return added;
}

export function getAlertHistory(): AlertEvent[] {
  load();
  return events;
}

export function clearAlertHistory() {
  events = [];
  persist();
  emit();
}

export function useAlertHistory(): AlertEvent[] {
  return useStableSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => {
      load();
      return events;
    },
    () => events,
    "notify-history",
  );
}

/** CSV export with timestamps, risk levels and correlation IDs. */
export function alertHistoryCsv(rows: AlertEvent[]): string {
  const head = [
    "timestamp_iso",
    "risk",
    "token",
    "spender",
    "spender_label",
    "value_at_risk_usd",
    "reason",
    "correlation_id",
    "batch_correlation_id",
    "push_status",
    "email_status",
    "wallet",
  ];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((e) =>
    [
      new Date(e.ts).toISOString(),
      e.risk,
      e.token,
      e.spender,
      e.spenderLabel ?? "",
      e.valueAtRiskUsd,
      e.reason,
      e.correlationId,
      e.batchCorrelationId,
      e.delivery.push,
      e.delivery.email,
      e.address,
    ]
      .map(esc)
      .join(","),
  );
  return [head.join(","), ...lines].join("\n");
}

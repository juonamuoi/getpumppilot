/* ------------------------------------------------------------------ *
 * Notification delivery log.
 *
 * Every push / email alert attempt is recorded here with its outcome:
 *   sent     — the channel accepted the message
 *   failed   — the channel errored (retryable)
 *   skipped  — nothing was attempted (channel off, unsupported device,
 *              notification permission missing/blocked, duplicate)
 *
 * Persisted to localStorage so the Security Center can show delivery
 * history across reloads. No wallet keys or personal data are stored.
 * ------------------------------------------------------------------ */
import { useSyncExternalStore } from "react";

export type NotifyChannel = "push" | "email";
export type NotifyStatus = "sent" | "failed" | "skipped";

export type NotifySkipReason =
  | "channel_off"
  | "unsupported"
  | "permission_denied"
  | "permission_default"
  | "duplicate"
  | "recipient_suppressed"
  | "no_account_email"
  | "email_not_configured";

export type NotifyDelivery = {
  id: string;
  ts: number;
  channel: NotifyChannel;
  status: NotifyStatus;
  /** Machine-readable reason for failed/skipped. */
  reason?: string;
  /** Human summary shown in the UI. */
  detail?: string;
  title: string;
  correlationId: string;
  address?: string;
  /** Test alert sent from settings rather than a real detection. */
  test?: boolean;
  attempts: number;
  lastAttemptAt: number;
  /** Whether a retry can be attempted for this entry. */
  retryable: boolean;
  /** Minimal payload needed to re-send (never contains PDFs or keys). */
  payload?: unknown;
};

const KEY = "pp-notify-log-v1";
const MAX = 200;

let log: NotifyDelivery[] = [];
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
    if (raw) log = JSON.parse(raw) as NotifyDelivery[];
  } catch {
    log = [];
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(log.slice(0, MAX)));
  } catch {
    /* quota — keep in memory only */
  }
}

export const SKIP_LABELS: Record<string, string> = {
  channel_off: "Channel turned off",
  unsupported: "Not supported on this device/browser",
  permission_denied: "Notification permission blocked",
  permission_default: "Notification permission not granted yet",
  duplicate: "Already notified for this finding",
  recipient_suppressed: "Recipient unsubscribed or bounced",
  no_account_email: "No account email — sign in first",
  email_not_configured: "Sender domain not verified yet",
};

export function reasonLabel(reason?: string) {
  if (!reason) return "";
  return SKIP_LABELS[reason] ?? reason;
}

/** Reasons that can never succeed on retry without a settings change. */
const TERMINAL = new Set([
  "channel_off",
  "unsupported",
  "duplicate",
  "recipient_suppressed",
  "no_account_email",
  "email_not_configured",
  "permission_denied",
  "permission_default",
]);

export function recordDelivery(
  entry: Omit<NotifyDelivery, "id" | "ts" | "attempts" | "lastAttemptAt" | "retryable"> & {
    attempts?: number;
    retryable?: boolean;
  },
): NotifyDelivery {
  load();
  const ts = Date.now();
  const row: NotifyDelivery = {
    id: `${ts.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    ts,
    attempts: entry.attempts ?? 1,
    lastAttemptAt: ts,
    retryable:
      entry.retryable ??
      (entry.status !== "sent" && !TERMINAL.has(entry.reason ?? "") && !!entry.payload),
    ...entry,
  };
  log = [row, ...log].slice(0, MAX);
  persist();
  emit();
  return row;
}

export function updateDelivery(id: string, patch: Partial<NotifyDelivery>) {
  load();
  log = log.map((e) => (e.id === id ? { ...e, ...patch } : e));
  persist();
  emit();
}

export function getDeliveryLog(): NotifyDelivery[] {
  load();
  return log;
}

export function clearDeliveryLog() {
  log = [];
  persist();
  emit();
}

export function useDeliveryLog(): NotifyDelivery[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => {
      load();
      return log;
    },
    () => log,
  );
}

export function deliveryStats(entries: NotifyDelivery[]) {
  return {
    total: entries.length,
    sent: entries.filter((e) => e.status === "sent").length,
    failed: entries.filter((e) => e.status === "failed").length,
    skipped: entries.filter((e) => e.status === "skipped").length,
  };
}

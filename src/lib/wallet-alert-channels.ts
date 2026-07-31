/**
 * Delivery channels for wallet price alerts.
 *
 * Three independent channels, each toggleable and persisted locally:
 *   in_app — sonner toast inside the app
 *   push   — OS/browser notification (native app or Web Notifications)
 *   email  — Lovable managed email to the signed-in account address
 *
 * Every attempt is written to the shared notification delivery log so the
 * saved history shows exactly where each alert went (and why it did not).
 * Alerts are informational only — nothing here can place or sign a trade.
 */
import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { recordDelivery, type NotifyChannel } from "@/lib/notify-log";
import {
  pushPermission,
  pushSupported,
  requestPushPermission,
  showPush,
} from "@/lib/threat-notify";
import { sendPriceAlertEmail } from "@/lib/wallet-price-alert-email.functions";

export type AlertChannelPrefs = {
  in_app: boolean;
  push: boolean;
  email: boolean;
};

export const CHANNEL_LABELS: Record<keyof AlertChannelPrefs, string> = {
  in_app: "In-app toast",
  push: "Device push",
  email: "Email",
};

export const CHANNEL_HINTS: Record<keyof AlertChannelPrefs, string> = {
  in_app: "Shows a toast while PumpPilot is open. Always saved to the log.",
  push: "OS notification — works in the installed app or with browser permission.",
  email: "Sent to your signed-in account address. Needs a verified sender domain.",
};

const KEY = "pp-wallet-alert-channels-v1";
const DEFAULTS: AlertChannelPrefs = { in_app: true, push: false, email: false };

let prefs: AlertChannelPrefs = { ...DEFAULTS };
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
    if (raw) prefs = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AlertChannelPrefs>) };
  } catch {
    prefs = { ...DEFAULTS };
  }
}

export function getChannelPrefs(): AlertChannelPrefs {
  load();
  return prefs;
}

export function setChannel(channel: keyof AlertChannelPrefs, enabled: boolean) {
  load();
  prefs = { ...prefs, [channel]: enabled };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* quota — memory only */
  }
  emit();
}

export function useAlertChannels(): AlertChannelPrefs {
  return useSyncExternalStore(
    (cb) => {
      load();
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getChannelPrefs,
    () => DEFAULTS,
  );
}

export type AlertPayload = {
  correlationId: string;
  symbol: string;
  message: string;
  ts: number;
  address?: string;
  test?: boolean;
};

export type ChannelOutcome = { channel: NotifyChannel; ok: boolean; reason?: string };

async function deliverInApp(a: AlertPayload, enabled: boolean): Promise<ChannelOutcome> {
  const title = a.test ? "Test wallet price alert" : `Wallet price alert — ${a.symbol}`;
  const meta = { correlationId: a.correlationId, address: a.address, test: a.test };
  if (!enabled) {
    recordDelivery({ channel: "in_app", status: "skipped", reason: "channel_off", title, ...meta });
    return { channel: "in_app", ok: false, reason: "channel_off" };
  }
  toast.warning(title, { description: `${a.message} · alert only, trading disabled` });
  recordDelivery({ channel: "in_app", status: "sent", title, detail: a.message, ...meta });
  return { channel: "in_app", ok: true };
}

async function deliverPush(a: AlertPayload, enabled: boolean): Promise<ChannelOutcome> {
  const title = a.test ? "PumpPilot AI — test price alert" : `PumpPilot AI — ${a.symbol} alert`;
  const meta = { correlationId: a.correlationId, address: a.address, test: a.test };
  const payload = { kind: "push" as const, title, body: a.message, tag: `pp-price-${a.correlationId}` };
  if (!enabled) {
    recordDelivery({ channel: "push", status: "skipped", reason: "channel_off", title, ...meta });
    return { channel: "push", ok: false, reason: "channel_off" };
  }
  if (!pushSupported()) {
    recordDelivery({ channel: "push", status: "skipped", reason: "unsupported", title, ...meta });
    return { channel: "push", ok: false, reason: "unsupported" };
  }
  const res = await showPush(title, a.message, payload.tag, "/dashboard");
  const skipped = res.reason === "permission_denied" || res.reason === "permission_default";
  recordDelivery({
    channel: "push",
    status: res.ok ? "sent" : skipped ? "skipped" : "failed",
    reason: res.reason,
    detail: a.message,
    title,
    payload,
    ...meta,
  });
  return { channel: "push", ok: res.ok, reason: res.reason };
}

const EMAIL_SKIP = new Set(["no_account_email", "email_not_configured", "recipient_suppressed"]);

async function deliverEmail(a: AlertPayload, enabled: boolean): Promise<ChannelOutcome> {
  const title = a.test ? "Test price alert email" : `Price alert email — ${a.symbol}`;
  const meta = { correlationId: a.correlationId, address: a.address, test: a.test };
  const input = {
    test: a.test,
    address: a.address,
    correlationId: a.correlationId,
    alerts: [{ symbol: a.symbol, message: a.message, ts: a.ts }],
  };
  if (!enabled) {
    recordDelivery({ channel: "email", status: "skipped", reason: "channel_off", title, ...meta });
    return { channel: "email", ok: false, reason: "channel_off" };
  }
  try {
    const res = await sendPriceAlertEmail({ data: input });
    recordDelivery({
      channel: "email",
      status: res.sent ? "sent" : EMAIL_SKIP.has(res.reason ?? "") ? "skipped" : "failed",
      reason: res.reason,
      detail: a.message,
      title,
      payload: { kind: "price_email", input },
      ...meta,
    });
    return { channel: "email", ok: res.sent, reason: res.reason };
  } catch (e) {
    const reason = e instanceof Error ? e.message : "send failed";
    recordDelivery({
      channel: "email",
      status: "failed",
      reason,
      title,
      payload: { kind: "price_email", input },
      ...meta,
    });
    return { channel: "email", ok: false, reason };
  }
}

/** Fan a triggered price alert out to every enabled channel. */
export async function dispatchAlert(
  alert: AlertPayload,
  channels: AlertChannelPrefs = getChannelPrefs(),
): Promise<ChannelOutcome[]> {
  return [
    await deliverInApp(alert, channels.in_app),
    await deliverPush(alert, channels.push),
    await deliverEmail(alert, channels.email),
  ];
}

export { pushPermission, pushSupported };
export const requestPushPermissionForAlerts = requestPushPermission;

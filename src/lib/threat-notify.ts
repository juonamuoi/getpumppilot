/**
 * New-threat notification delivery for risky wallet approvals.
 *
 * Three channels, all best-effort and never blocking a scan:
 *  - in-app toast   (handled by the caller with sonner)
 *  - push           (native local notification on iOS/Android, Web
 *                    Notifications API in the browser / installed PWA)
 *  - email          (server function → Lovable managed email)
 *
 * Nothing here touches funds, keys or seed phrases.
 */

import { isNativeApp } from "@/lib/native";
import { sendThreatEmail } from "@/lib/threat-alerts.functions";
import type { ThreatEmailInput } from "@/lib/threat-alerts.functions";
import {
  recordDelivery,
  updateDelivery,
  type NotifyDelivery,
} from "@/lib/notify-log";
import type { WalletApproval, WalletScanResult } from "@/lib/wallet-scan";
import { shortAddress } from "@/lib/wallet-scan";

export type PushPermission = "granted" | "denied" | "unsupported" | "default";

/* ------------------------------------------------------------------ */
/* Push                                                                */
/* ------------------------------------------------------------------ */

export function pushSupported(): boolean {
  if (isNativeApp()) return true;
  return typeof window !== "undefined" && "Notification" in window;
}

export function pushPermission(): PushPermission {
  if (isNativeApp()) return "granted";
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as PushPermission;
}

/** Ask the OS/browser for notification permission. */
export async function requestPushPermission(): Promise<PushPermission> {
  if (isNativeApp()) {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      const res = await LocalNotifications.requestPermissions();
      return res.display === "granted" ? "granted" : "denied";
    } catch {
      return "unsupported";
    }
  }
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  try {
    const res = await Notification.requestPermission();
    return res as PushPermission;
  } catch {
    return "denied";
  }
}

type PushResult = { ok: boolean; reason?: string };

async function showPush(title: string, body: string, tag: string): Promise<PushResult> {
  if (isNativeApp()) {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      await LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor(Date.now() % 2147483647),
            title,
            body,
            smallIcon: "ic_stat_icon",
            extra: { tag, route: "/security" },
          },
        ],
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : "push failed" };
    }
  }
  if (typeof window === "undefined" || !("Notification" in window))
    return { ok: false, reason: "unsupported" };
  if (Notification.permission === "denied") return { ok: false, reason: "permission_denied" };
  if (Notification.permission !== "granted") return { ok: false, reason: "permission_default" };
  try {
    const n = new Notification(title, {
      body,
      tag,
      icon: "/favicon.png",
      badge: "/favicon.png",
    });
    n.onclick = () => {
      window.focus();
      window.location.href = "/security";
      n.close();
    };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "push failed" };
  }
}


/* ------------------------------------------------------------------ */
/* Copy                                                                */
/* ------------------------------------------------------------------ */

export function threatSummary(threats: WalletApproval[]) {
  const critical = threats.filter((t) => t.risk === "critical").length;
  const valueAtRisk = threats.reduce((s, t) => s + t.valueAtRiskUsd, 0);
  const title =
    threats.length === 1
      ? "New risky approval detected"
      : `${threats.length} new risky approvals detected`;
  const first = threats[0];
  const body = first
    ? `${first.token} → ${shortAddress(first.spender)} (${first.risk})${
        threats.length > 1 ? ` and ${threats.length - 1} more` : ""
      }. Approx. $${Math.round(valueAtRisk).toLocaleString()} at risk. Review and revoke now.`
    : "Review your wallet approvals now.";
  return { title, body, critical, valueAtRisk };
}

/* ------------------------------------------------------------------ */
/* Dispatch                                                            */
/* ------------------------------------------------------------------ */

export type NotifyChannels = { push: boolean; email: boolean; pdfReport?: boolean };
export type NotifyOutcome = {
  push: boolean;
  pushReason?: string;
  email: boolean;
  emailReason?: string;
  reportAttached?: boolean;
};

/** Renders the threat report PDF in the browser and returns it as base64. */
async function buildReportBase64(result: WalletScanResult | null): Promise<string | undefined> {
  if (!result) return undefined;
  try {
    const { buildWalletReportDoc } = await import("@/lib/wallet-report-pdf");
    const { doc } = await buildWalletReportDoc(result);
    return doc.output("datauristring");
  } catch {
    return undefined;
  }
}

/** Dedupe so the same finding never notifies twice in one session. */
const notified = new Set<string>();

type PushPayload = { kind: "push"; title: string; body: string; tag: string };
type EmailPayload = { kind: "email"; input: ThreatEmailInput };

async function dispatchPush(
  payload: PushPayload,
  meta: { correlationId: string; address?: string; test?: boolean },
  enabled: boolean,
): Promise<{ ok: boolean; reason?: string }> {
  if (!enabled) {
    recordDelivery({
      channel: "push",
      status: "skipped",
      reason: "channel_off",
      title: payload.title,
      ...meta,
    });
    return { ok: false, reason: "channel_off" };
  }
  if (!pushSupported()) {
    recordDelivery({
      channel: "push",
      status: "skipped",
      reason: "unsupported",
      title: payload.title,
      ...meta,
    });
    return { ok: false, reason: "unsupported" };
  }
  const res = await showPush(payload.title, payload.body, payload.tag);
  const skipped = res.reason === "permission_denied" || res.reason === "permission_default";
  recordDelivery({
    channel: "push",
    status: res.ok ? "sent" : skipped ? "skipped" : "failed",
    reason: res.reason,
    title: payload.title,
    payload,
    ...meta,
  });
  return { ok: res.ok, reason: res.reason };
}

async function dispatchEmail(
  payload: EmailPayload,
  meta: { correlationId: string; address?: string; test?: boolean },
  enabled: boolean,
  pdfBase64?: string,
): Promise<{ ok: boolean; reason?: string; reportUrl?: string }> {
  const title = payload.input.test ? "Test alert email" : "New risky approval email";
  if (!enabled) {
    recordDelivery({
      channel: "email",
      status: "skipped",
      reason: "channel_off",
      title,
      ...meta,
    });
    return { ok: false, reason: "channel_off" };
  }
  try {
    const res = await sendThreatEmail({
      data: { ...payload.input, pdfBase64 },
    });
    const skipReasons = new Set([
      "no_account_email",
      "email_not_configured",
      "recipient_suppressed",
    ]);
    recordDelivery({
      channel: "email",
      status: res.sent ? "sent" : skipReasons.has(res.reason ?? "") ? "skipped" : "failed",
      reason: res.reason,
      detail: res.reportUrl ? "PDF report attached" : undefined,
      title,
      payload,
      ...meta,
    });
    return { ok: res.sent, reason: res.reason, reportUrl: res.reportUrl };
  } catch (e) {
    const reason = e instanceof Error ? e.message : "send failed";
    recordDelivery({
      channel: "email",
      status: "failed",
      reason,
      title,
      payload,
      ...meta,
    });
    return { ok: false, reason };
  }
}

export async function notifyNewThreats(
  address: string,
  threats: WalletApproval[],
  channels: NotifyChannels,
  scan?: WalletScanResult | null,
): Promise<NotifyOutcome> {
  const fresh = threats.filter((t) => !notified.has(`${address}:${t.id}`));
  for (const t of fresh) notified.add(`${address}:${t.id}`);
  if (fresh.length === 0) return { push: false, email: false, emailReason: "duplicate" };

  const { title, body } = threatSummary(fresh);
  const correlationId = fresh[0]?.correlationId ?? `${address}-${Date.now()}`;
  const meta = { correlationId, address };

  const outcome: NotifyOutcome = { push: false, email: false };

  const push = await dispatchPush(
    {
      kind: "push",
      title: `PumpPilot AI — ${title}`,
      body,
      tag: `pp-threat-${correlationId}`,
    },
    meta,
    channels.push,
  );
  outcome.push = push.ok;
  outcome.pushReason = push.reason;

  const emailInput: ThreatEmailInput = {
    address,
    correlationId,
    findings: fresh.slice(0, 10).map((t) => ({
      token: t.token,
      spender: t.spender,
      spenderLabel: t.spenderLabel,
      risk: t.risk,
      valueAtRiskUsd: Math.round(t.valueAtRiskUsd),
      reason: t.reasons[0] ?? "Risky approval detected",
      correlationId: t.correlationId ?? correlationId,
    })),
  };
  const pdfBase64 =
    channels.email && channels.pdfReport ? await buildReportBase64(scan ?? null) : undefined;
  const email = await dispatchEmail({ kind: "email", input: emailInput }, meta, channels.email, pdfBase64);
  outcome.email = email.ok;
  outcome.emailReason = email.reason;
  outcome.reportAttached = !!email.reportUrl;

  const now = Date.now();
  const delivery = {
    push: (push.ok ? "sent" : push.reason === "channel_off" || push.reason === "duplicate" || push.reason === "unsupported" ? "skipped" : "failed") as
      | "sent"
      | "failed"
      | "skipped",
    pushReason: push.reason,
    email: (email.ok ? "sent" : email.reason === "channel_off" || email.reason === "duplicate" ? "skipped" : "failed") as
      | "sent"
      | "failed"
      | "skipped",
    emailReason: email.reason,
    reportAttached: !!email.reportUrl,
  };
  recordAlertEvents(
    fresh.map((t) => ({
      ts: now,
      address,
      token: t.token,
      spender: t.spender,
      spenderLabel: t.spenderLabel,
      risk: t.risk,
      valueAtRiskUsd: Math.round(t.valueAtRiskUsd),
      reason: t.reasons[0] ?? "Risky approval detected",
      correlationId: t.correlationId ?? correlationId,
      batchCorrelationId: correlationId,
      delivery,
    })),
  );

  return outcome;
}

/** Test delivery from the settings UI. */
export async function sendTestNotification(
  channels: NotifyChannels,
  scan?: WalletScanResult | null,
): Promise<NotifyOutcome> {
  const correlationId = scan?.correlationId ?? `test-${Date.now()}`;
  const meta = { correlationId, test: true };
  const outcome: NotifyOutcome = { push: false, email: false };

  const push = await dispatchPush(
    {
      kind: "push",
      title: "PumpPilot AI — test alert",
      body: "This is what a new risky-approval alert looks like. Demo data only.",
      tag: "pp-threat-test",
    },
    meta,
    channels.push,
  );
  outcome.push = push.ok;
  outcome.pushReason = push.reason;

  const pdfBase64 =
    channels.email && channels.pdfReport ? await buildReportBase64(scan ?? null) : undefined;
  const email = await dispatchEmail(
    { kind: "email", input: { test: true, correlationId } },
    meta,
    channels.email,
    pdfBase64,
  );
  outcome.email = email.ok;
  outcome.emailReason = email.reason;
  outcome.reportAttached = !!email.reportUrl;

  return outcome;
}

/**
 * Re-attempt a failed delivery from the log. Permission/settings skips are
 * re-checked first, so a retry after granting permission now succeeds.
 */
export async function retryDelivery(entry: NotifyDelivery): Promise<{ ok: boolean; reason?: string }> {
  const payload = entry.payload as PushPayload | EmailPayload | undefined;
  if (!payload) return { ok: false, reason: "nothing to retry" };

  let result: { ok: boolean; reason?: string };
  if (payload.kind === "push") {
    if (!pushSupported()) result = { ok: false, reason: "unsupported" };
    else result = await showPush(payload.title, payload.body, payload.tag);
  } else {
    try {
      const res = await sendThreatEmail({ data: payload.input });
      result = { ok: res.sent, reason: res.reason };
    } catch (e) {
      result = { ok: false, reason: e instanceof Error ? e.message : "send failed" };
    }
  }

  const skipped =
    result.reason === "permission_denied" ||
    result.reason === "permission_default" ||
    result.reason === "unsupported" ||
    result.reason === "no_account_email" ||
    result.reason === "email_not_configured" ||
    result.reason === "recipient_suppressed";

  updateDelivery(entry.id, {
    status: result.ok ? "sent" : skipped ? "skipped" : "failed",
    reason: result.reason,
    attempts: entry.attempts + 1,
    lastAttemptAt: Date.now(),
    retryable: !result.ok && !skipped,
  });

  return result;
}


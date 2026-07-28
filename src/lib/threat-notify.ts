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

async function showPush(title: string, body: string, tag: string) {
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
      return true;
    } catch {
      return false;
    }
  }
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;
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
    return true;
  } catch {
    return false;
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

  const outcome: NotifyOutcome = { push: false, email: false };

  if (channels.push) {
    outcome.push = await showPush(`PumpPilot AI — ${title}`, body, `pp-threat-${correlationId}`);
  }

  if (channels.email) {
    try {
      const pdfBase64 = channels.pdfReport ? await buildReportBase64(scan ?? null) : undefined;
      const res = await sendThreatEmail({
        data: {
          address,
          correlationId,
          pdfBase64,
          findings: fresh.slice(0, 10).map((t) => ({
            token: t.token,
            spender: t.spender,
            spenderLabel: t.spenderLabel,
            risk: t.risk,
            valueAtRiskUsd: Math.round(t.valueAtRiskUsd),
            reason: t.reasons[0] ?? "Risky approval detected",
            correlationId: t.correlationId ?? correlationId,
          })),
        },
      });
      outcome.email = res.sent;
      outcome.emailReason = res.reason;
      outcome.reportAttached = !!res.reportUrl;
    } catch (e) {
      outcome.emailReason = e instanceof Error ? e.message : "send failed";
    }
  }

  return outcome;
}

/** Test delivery from the settings UI. */
export async function sendTestNotification(
  channels: NotifyChannels,
  scan?: WalletScanResult | null,
): Promise<NotifyOutcome> {
  const outcome: NotifyOutcome = { push: false, email: false };
  if (channels.push) {
    outcome.push = await showPush(
      "PumpPilot AI — test alert",
      "This is what a new risky-approval alert looks like. Demo data only.",
      "pp-threat-test",
    );
  }
  if (channels.email) {
    try {
      const pdfBase64 = channels.pdfReport ? await buildReportBase64(scan ?? null) : undefined;
      const res = await sendThreatEmail({
        data: { test: true, pdfBase64, correlationId: scan?.correlationId },
      });
      outcome.email = res.sent;
      outcome.emailReason = res.reason;
      outcome.reportAttached = !!res.reportUrl;
    } catch (e) {
      outcome.emailReason = e instanceof Error ? e.message : "send failed";
    }
  }
  return outcome;
}

/**
 * Device push delivery for momentum / scanner alerts.
 *
 * On iOS + Android (Capacitor) this schedules an OS notification through
 * @capacitor/local-notifications and registers the device with APNs / FCM so
 * server-sent pushes can reach it later. In the browser it falls back to the
 * Web Notifications API. Everything is best-effort and never blocks the feed.
 *
 * No keys, funds or seed phrases are involved — these are read-only signals.
 */

import { isNativeApp, nativePlatform, registerPushNotifications, kvSet, kvGet } from "@/lib/native";
import { pushPermission, pushSupported, requestPushPermission, showPush } from "@/lib/threat-notify";
import type { PushPermission } from "@/lib/threat-notify";
import { isPushTypeEnabled, type PushAlertType } from "@/lib/push-alert-types";

const TOKEN_KEY = "pp.push.deviceToken";
const OPT_IN_KEY = "pp.push.momentum.optIn";

export type MomentumPushState = {
  supported: boolean;
  permission: PushPermission;
  native: boolean;
  platform: "ios" | "android" | "web";
};

export function momentumPushState(): MomentumPushState {
  return {
    supported: pushSupported(),
    permission: pushPermission(),
    native: isNativeApp(),
    platform: nativePlatform(),
  };
}

export async function momentumPushOptedIn(): Promise<boolean> {
  return (await kvGet(OPT_IN_KEY)) === "1";
}

/** Last device token handed to us by APNs / FCM (native only). */
export async function pushDeviceToken(): Promise<string | null> {
  return kvGet(TOKEN_KEY);
}

/**
 * Ask the OS for permission and, on native, register for remote push.
 * Returns the resulting permission so the UI can explain the outcome.
 */
export async function enableMomentumPush(): Promise<{ permission: PushPermission; token?: string }> {
  const permission = await requestPushPermission();
  if (permission !== "granted") return { permission };

  await kvSet(OPT_IN_KEY, "1");

  let token: string | undefined;
  if (isNativeApp()) {
    await registerPushNotifications((reg) => {
      token = reg.token;
      void kvSet(TOKEN_KEY, reg.token);
    });
  }
  return { permission, token };
}

export async function disableMomentumPush() {
  await kvSet(OPT_IN_KEY, "0");
}

export type MomentumPushHit = {
  symbol: string;
  score: number;
  delta: number;
  rule: string;
};

/**
 * Coalesces a tick's hits into a single notification so a busy market never
 * spams the lock screen. Tapping it opens the dashboard.
 */
export async function sendMomentumPush(
  hits: MomentumPushHit[],
  type: PushAlertType = "momentum",
): Promise<boolean> {
  if (hits.length === 0) return false;
  if (!isPushTypeEnabled(type)) return false;
  if (!pushSupported() || pushPermission() !== "granted") return false;

  const first = hits[0];
  const title =
    hits.length === 1
      ? `${first.symbol} momentum ${first.score}`
      : `${hits.length} momentum alerts triggered`;
  const body =
    hits.length === 1
      ? `${first.rule} · ${first.delta >= 0 ? "+" : ""}${first.delta} this tick. Demo signals — not investment advice.`
      : `${hits
          .slice(0, 3)
          .map((h) => `${h.symbol} ${h.score}`)
          .join(", ")}${hits.length > 3 ? ` and ${hits.length - 3} more` : ""}. Tap to review.`;

  const res = await showPush(title, body, `pp-momentum-${Date.now()}`, "/dashboard");
  return res.ok;
}

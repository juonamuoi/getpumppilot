import { Capacitor } from "@capacitor/core";

/**
 * Safe native helpers for PumpPilot AI.
 * Every function here is a graceful no-op in the browser / Lovable preview.
 * Capacitor plugins are dynamically imported so nothing native ships to the web build.
 */

export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function nativePlatform(): "ios" | "android" | "web" {
  try {
    const p = Capacitor.getPlatform();
    if (p === "ios" || p === "android") return p;
  } catch {}
  return "web";
}

export async function setStatusBarDark() {
  if (!isNativeApp()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: "#0B0F19" });
  } catch {
    /* plugin unavailable */
  }
}

export async function hideSplashScreen() {
  if (!isNativeApp()) return;
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch {}
}

export async function nativeShare(options: { title: string; text: string; url: string }) {
  if (!isNativeApp()) {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await (navigator as Navigator).share(options);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
  try {
    const { Share } = await import("@capacitor/share");
    await Share.share({ ...options, dialogTitle: "Invite friends to PumpPilot AI" });
    return true;
  } catch {
    return false;
  }
}

/* ---------- Haptics ---------- */

export async function hapticTap() {
  if (!isNativeApp()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {}
}

export async function hapticSuccess() {
  if (!isNativeApp()) return;
  try {
    const { Haptics, NotificationType } = await import("@capacitor/haptics");
    await Haptics.notification({ type: NotificationType.Success });
  } catch {}
}

/* ---------- Preferences (secure per-device KV on native, localStorage on web) ---------- */

export async function kvSet(key: string, value: string) {
  if (isNativeApp()) {
    try {
      const { Preferences } = await import("@capacitor/preferences");
      await Preferences.set({ key, value });
      return;
    } catch {}
  }
  if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
}

export async function kvGet(key: string): Promise<string | null> {
  if (isNativeApp()) {
    try {
      const { Preferences } = await import("@capacitor/preferences");
      const { value } = await Preferences.get({ key });
      return value;
    } catch {}
  }
  if (typeof localStorage !== "undefined") return localStorage.getItem(key);
  return null;
}

export async function kvRemove(key: string) {
  if (isNativeApp()) {
    try {
      const { Preferences } = await import("@capacitor/preferences");
      await Preferences.remove({ key });
      return;
    } catch {}
  }
  if (typeof localStorage !== "undefined") localStorage.removeItem(key);
}

/* ---------- Push notifications (native only) ---------- */

export type PushRegistration = { token: string; platform: "ios" | "android" };

export async function registerPushNotifications(
  onToken?: (reg: PushRegistration) => void,
): Promise<{ ok: boolean; error?: string }> {
  if (!isNativeApp()) return { ok: false, error: "Push notifications require the native app." };
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") return { ok: false, error: "Permission denied" };
    await PushNotifications.register();
    await PushNotifications.addListener("registration", (t) =>
      onToken?.({ token: t.value, platform: nativePlatform() as "ios" | "android" }),
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Push registration failed" };
  }
}

/* ---------- Biometric / device unlock ---------- */

/**
 * Uses the WebAuthn platform authenticator (Face ID / Touch ID / fingerprint)
 * where available. Returns true when the device confirms the user is present.
 * Falls back to false — callers should then require the app PIN.
 */
export async function biometricConfirm(reason = "Unlock PumpPilot AI"): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const pk = (window as any).PublicKeyCredential;
  if (!pk?.isUserVerifyingPlatformAuthenticatorAvailable) return false;
  try {
    const available = await pk.isUserVerifyingPlatformAuthenticatorAvailable();
    if (!available) return false;
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);
    await navigator.credentials.get({
      publicKey: {
        challenge,
        timeout: 30000,
        userVerification: "required",
        rpId: window.location.hostname,
      },
      mediation: "required" as any,
    });
    return true;
  } catch {
    // User cancelled or no enrolled credential → not confirmed
    void reason;
    return false;
  }
}

import { Capacitor } from "@capacitor/core";
import { Style } from "@capacitor/status-bar";

/**
 * Safe native helpers for PumpPilot AI.
 * Everything in this file is a no-op in the browser / Lovable preview.
 * Native plugins are dynamically imported so they never ship to the web build.
 */

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export async function setStatusBarDark() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { StatusBar } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: "#0B0F19" });
  } catch {
    // ignore
  }
}

export async function hideSplashScreen() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch {
    // ignore
  }
}

export async function nativeShare(options: { title: string; text: string; url: string }) {
  if (!Capacitor.isNativePlatform()) {
    // Fallback to Web Share API on mobile browsers
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await (navigator as Navigator).share({
          title: options.title,
          text: options.text,
          url: options.url,
        });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  try {
    const { Share } = await import("@capacitor/share");
    await Share.share({
      title: options.title,
      text: options.text,
      url: options.url,
      dialogTitle: "Invite friends to PumpPilot AI",
    });
    return true;
  } catch {
    return false;
  }
}

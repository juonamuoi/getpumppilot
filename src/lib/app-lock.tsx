import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { kvGet, kvSet, kvRemove, biometricConfirm, hapticTap, hapticSuccess } from "@/lib/native";

const PIN_KEY = "pp_app_lock_pin_v1";
const BIO_KEY = "pp_app_lock_bio_v1";
const LOCKED_AT_KEY = "pp_app_lock_locked_at";
const AUTO_LOCK_MS = 5 * 60 * 1000;

async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`pumppilot:${pin}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type Ctx = {
  ready: boolean;
  hasPin: boolean;
  biometricEnabled: boolean;
  locked: boolean;
  enablePin: (pin: string) => Promise<void>;
  disablePin: (pin: string) => Promise<boolean>;
  setBiometric: (on: boolean) => Promise<void>;
  unlock: (pin: string) => Promise<boolean>;
  tryBiometricUnlock: () => Promise<boolean>;
  lockNow: () => void;
};

const AppLockContext = createContext<Ctx | null>(null);

export function AppLockProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [pinHash, setPinHash] = useState<string | null>(null);
  const [bio, setBio] = useState(false);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    (async () => {
      const [p, b, lockedAt] = await Promise.all([kvGet(PIN_KEY), kvGet(BIO_KEY), kvGet(LOCKED_AT_KEY)]);
      setPinHash(p);
      setBio(b === "1");
      if (p) {
        // Lock on first load, or if it's been long enough since last activity
        const t = lockedAt ? Number(lockedAt) : 0;
        setLocked(true || Date.now() - t > AUTO_LOCK_MS);
      }
      setReady(true);
    })();
  }, []);

  // Auto-lock when the app is backgrounded
  useEffect(() => {
    if (!pinHash) return;
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        void kvSet(LOCKED_AT_KEY, String(Date.now()));
        setLocked(true);
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [pinHash]);

  const enablePin = useCallback(async (pin: string) => {
    const h = await hashPin(pin);
    await kvSet(PIN_KEY, h);
    setPinHash(h);
    setLocked(false);
    await hapticSuccess();
  }, []);

  const disablePin = useCallback(
    async (pin: string) => {
      const h = await hashPin(pin);
      if (h !== pinHash) return false;
      await kvRemove(PIN_KEY);
      await kvRemove(BIO_KEY);
      setPinHash(null);
      setBio(false);
      setLocked(false);
      return true;
    },
    [pinHash],
  );

  const setBiometric = useCallback(async (on: boolean) => {
    await kvSet(BIO_KEY, on ? "1" : "0");
    setBio(on);
  }, []);

  const unlock = useCallback(
    async (pin: string) => {
      const h = await hashPin(pin);
      if (h === pinHash) {
        setLocked(false);
        await kvSet(LOCKED_AT_KEY, String(Date.now()));
        await hapticSuccess();
        return true;
      }
      await hapticTap();
      return false;
    },
    [pinHash],
  );

  const tryBiometricUnlock = useCallback(async () => {
    if (!bio || !pinHash) return false;
    const ok = await biometricConfirm("Unlock PumpPilot AI");
    if (ok) {
      setLocked(false);
      await kvSet(LOCKED_AT_KEY, String(Date.now()));
    }
    return ok;
  }, [bio, pinHash]);

  const lockNow = useCallback(() => {
    if (pinHash) setLocked(true);
  }, [pinHash]);

  const value = useMemo<Ctx>(
    () => ({
      ready,
      hasPin: !!pinHash,
      biometricEnabled: bio,
      locked: !!pinHash && locked,
      enablePin,
      disablePin,
      setBiometric,
      unlock,
      tryBiometricUnlock,
      lockNow,
    }),
    [ready, pinHash, bio, locked, enablePin, disablePin, setBiometric, unlock, tryBiometricUnlock, lockNow],
  );

  return <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>;
}

export function useAppLock() {
  const ctx = useContext(AppLockContext);
  if (!ctx) throw new Error("useAppLock must be used within AppLockProvider");
  return ctx;
}

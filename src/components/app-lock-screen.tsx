import { useEffect, useState } from "react";
import { Fingerprint, Lock, Delete } from "lucide-react";
import { useAppLock } from "@/lib/app-lock";
import { Button } from "@/components/ui/button";

export function AppLockScreen() {
  const { unlock, tryBiometricUnlock, biometricEnabled } = useAppLock();
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (biometricEnabled) void tryBiometricUnlock();
  }, [biometricEnabled, tryBiometricUnlock]);

  useEffect(() => {
    if (pin.length !== 4) return;
    (async () => {
      setBusy(true);
      const ok = await unlock(pin);
      setBusy(false);
      if (!ok) {
        setErr("Wrong PIN");
        setPin("");
      }
    })();
  }, [pin, unlock]);

  const press = (d: string) => {
    setErr(null);
    setPin((p) => (p.length < 4 ? p + d : p));
  };
  const back = () => setPin((p) => p.slice(0, -1));

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background/95 px-6 backdrop-blur">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
        <Lock className="h-6 w-6" />
      </div>
      <h1 className="mt-4 text-lg font-semibold">PumpPilot AI is locked</h1>
      <p className="mt-1 text-sm text-muted-foreground">Enter your 4-digit PIN to continue</p>

      <div className="mt-6 flex gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-3 w-3 rounded-full border ${pin.length > i ? "bg-primary border-primary" : "border-border"}`}
          />
        ))}
      </div>
      {err && <p className="mt-3 text-xs text-destructive">{err}</p>}

      <div className="mt-8 grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button
            key={d}
            disabled={busy}
            onClick={() => press(d)}
            className="grid h-14 w-14 place-items-center rounded-full border border-border/60 text-lg font-medium hover:bg-accent active:scale-95 disabled:opacity-50"
          >
            {d}
          </button>
        ))}
        <button
          disabled={busy || !biometricEnabled}
          onClick={() => tryBiometricUnlock()}
          className="grid h-14 w-14 place-items-center rounded-full text-muted-foreground hover:text-foreground disabled:opacity-30"
          aria-label="Biometric unlock"
        >
          <Fingerprint className="h-5 w-5" />
        </button>
        <button
          disabled={busy}
          onClick={() => press("0")}
          className="grid h-14 w-14 place-items-center rounded-full border border-border/60 text-lg font-medium hover:bg-accent active:scale-95 disabled:opacity-50"
        >
          0
        </button>
        <button
          disabled={busy || pin.length === 0}
          onClick={back}
          className="grid h-14 w-14 place-items-center rounded-full text-muted-foreground hover:text-foreground disabled:opacity-30"
          aria-label="Delete"
        >
          <Delete className="h-5 w-5" />
        </button>
      </div>

      <Button variant="ghost" size="sm" className="mt-6 text-xs text-muted-foreground" asChild>
        <a href="/">Sign out</a>
      </Button>
    </div>
  );
}

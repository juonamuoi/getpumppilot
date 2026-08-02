/* ------------------------------------------------------------------ *
 * Auto-lock controls for the PumpPilot wallet.
 *
 * Shows the live countdown to the next inactivity lock and lets the user
 * pick the idle window. Locking clears the in-memory key, so balances and
 * swaps require the password again.
 * ------------------------------------------------------------------ */
import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AUTO_LOCK_OPTIONS, setAutoLockMinutes, usePumpWallet } from "@/lib/pump-wallet";

function label(minutes: number) {
  if (minutes === 0) return "Never (not recommended)";
  if (minutes === 60) return "1 hour";
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function formatLeft(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function WalletAutoLock() {
  const { unlockedAddress, autoLockMinutes, autoLockAt } = usePumpWallet();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!unlockedAddress || !autoLockAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [unlockedAddress, autoLockAt]);

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="autolock" className="flex items-center gap-1.5 text-xs">
          <Timer className="h-3.5 w-3.5" /> Auto-lock after inactivity
        </Label>
        {unlockedAddress && autoLockAt ? (
          <span
            className="font-mono text-xs text-muted-foreground"
            aria-live="polite"
            aria-label={`Wallet locks in ${formatLeft(autoLockAt - now)}`}
          >
            locks in {formatLeft(autoLockAt - now)}
          </span>
        ) : null}
      </div>

      <Select
        value={String(autoLockMinutes)}
        onValueChange={(v) => setAutoLockMinutes(Number(v))}
      >
        <SelectTrigger id="autolock" className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {AUTO_LOCK_OPTIONS.map((m) => (
            <SelectItem key={m} value={String(m)} className="text-xs">
              {label(m)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <p className="text-[11px] text-muted-foreground">
        Any tap, key press or scroll resets the timer. When it fires, the decrypted key is dropped
        from memory — balances and live swaps need your password again. The encrypted vault stays on
        this device.
      </p>
    </div>
  );
}

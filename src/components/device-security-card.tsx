import { useState } from "react";
import { useAppLock } from "@/lib/app-lock";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Fingerprint, KeyRound, Lock } from "lucide-react";
import { toast } from "sonner";
import { registerPushNotifications, isNativeApp } from "@/lib/native";

export function DeviceSecurityCard() {
  const lock = useAppLock();
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [oldPin, setOldPin] = useState("");
  const [busy, setBusy] = useState(false);

  const enable = async () => {
    if (!/^\d{4}$/.test(newPin)) return toast.error("PIN must be 4 digits");
    if (newPin !== confirmPin) return toast.error("PINs do not match");
    setBusy(true);
    await lock.enablePin(newPin);
    setBusy(false);
    setNewPin("");
    setConfirmPin("");
    toast.success("App lock enabled");
  };

  const disable = async () => {
    setBusy(true);
    const ok = await lock.disablePin(oldPin);
    setBusy(false);
    setOldPin("");
    if (!ok) toast.error("Wrong PIN");
    else toast.success("App lock disabled");
  };

  const enablePush = async () => {
    const res = await registerPushNotifications();
    if (res.ok) toast.success("Push notifications enabled");
    else toast.error(res.error ?? "Not available on web");
  };

  return (
    <Card className="border-border/60 bg-card/60">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Lock className="h-4 w-4" /> Device security
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {!lock.hasPin ? (
          <div className="space-y-3">
            <div>
              <div className="font-medium">Enable app PIN</div>
              <div className="text-xs text-muted-foreground">
                Require a 4-digit PIN when opening PumpPilot AI. Auto-locks after 5 minutes in the background.
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <PinInput label="New PIN" value={newPin} onChange={setNewPin} />
              <PinInput label="Confirm" value={confirmPin} onChange={setConfirmPin} />
            </div>
            <Button size="sm" onClick={enable} disabled={busy || newPin.length !== 4}>
              <KeyRound className="mr-1.5 h-3.5 w-3.5" /> Enable PIN
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 p-3">
              <div>
                <div className="flex items-center gap-2 font-medium">
                  <Fingerprint className="h-4 w-4" /> Biometric unlock
                </div>
                <div className="text-xs text-muted-foreground">
                  Use Face ID / Touch ID / fingerprint when available.
                </div>
              </div>
              <Switch
                checked={lock.biometricEnabled}
                onCheckedChange={(v) => lock.setBiometric(v).then(() => toast.success(v ? "Biometric on" : "Biometric off"))}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 p-3">
              <div>
                <div className="font-medium">Lock now</div>
                <div className="text-xs text-muted-foreground">Immediately re-prompt for PIN.</div>
              </div>
              <Button size="sm" variant="outline" onClick={lock.lockNow}>Lock</Button>
            </div>
            <div className="space-y-2 rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
              <div className="text-xs font-medium text-rose-300">Disable app lock</div>
              <div className="flex items-center gap-2">
                <PinInput label="Current PIN" value={oldPin} onChange={setOldPin} />
                <Button size="sm" variant="destructive" onClick={disable} disabled={busy || oldPin.length !== 4}>
                  Disable
                </Button>
              </div>
            </div>
          </>
        )}

        <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 p-3">
          <div>
            <div className="font-medium">Push notifications</div>
            <div className="text-xs text-muted-foreground">
              {isNativeApp() ? "Get alerted for scanner matches and risk breaches." : "Requires the native iOS / Android app."}
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={enablePush} disabled={!isNativeApp()}>
            Enable
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PinInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <input
        type="password"
        inputMode="numeric"
        pattern="\d*"
        maxLength={4}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
        className="h-9 w-full rounded-md border border-border/60 bg-background px-3 font-mono text-center tracking-[0.4em] outline-none focus:border-primary"
        placeholder="••••"
      />
    </div>
  );
}

// Enables OS-level push for momentum alerts on iOS, Android and the browser.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BellRing, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  enableMomentumPush,
  momentumPushState,
  type MomentumPushState,
} from "@/lib/momentum-push";

export function DevicePushToggle({ className }: { className?: string }) {
  const [state, setState] = useState<MomentumPushState | null>(null);
  const [busy, setBusy] = useState(false);

  // Permission APIs are browser-only — read after hydration.
  useEffect(() => setState(momentumPushState()), []);

  if (!state || !state.supported) return null;

  if (state.permission === "granted") {
    return (
      <Badge
        variant="outline"
        className={`border-emerald-500/30 text-[10px] text-emerald-300 ${className ?? ""}`}
      >
        <BellRing className="mr-1 h-3 w-3" aria-hidden />
        {state.native ? `${state.platform === "ios" ? "iOS" : "Android"} push on` : "Push on"}
      </Badge>
    );
  }

  if (state.permission === "denied") {
    return (
      <span className={`text-[10px] text-muted-foreground ${className ?? ""}`}>
        Notifications blocked — enable them for PumpPilot AI in your device settings.
      </span>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className={`h-7 text-[11px] ${className ?? ""}`}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const { permission } = await enableMomentumPush();
          setState(momentumPushState());
          if (permission === "granted") {
            toast.success("Push notifications enabled", {
              description: "Momentum and scanner alerts will now reach this device.",
            });
          } else {
            toast.error("Notifications not enabled", {
              description: "You can turn them on later in your device settings.",
            });
          }
        } finally {
          setBusy(false);
        }
      }}
    >
      <Smartphone className="mr-1 h-3 w-3" aria-hidden />
      {busy ? "Requesting…" : "Enable push"}
    </Button>
  );
}

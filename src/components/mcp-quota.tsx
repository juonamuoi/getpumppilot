import { useEffect, useState } from "react";
import { AlertTriangle, Copy, Gauge, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export type ConsoleQuotaView = {
  limit: number;
  remaining: number | null;
  windowSeconds: number;
  clientId: string | null;
  clientLimit: number;
  clientRemaining: number | null;
};

export type ConsoleThrottleView = {
  reason: string;
  scope: "account" | "client" | "unknown";
  limit: number;
  used: number | null;
  windowSeconds: number;
  retryAfterSeconds: number;
  issuedAt: number;
  clientId: string | null;
};

function useCountdown(target: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (target === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [target]);
  if (target === null) return 0;
  return Math.max(0, Math.ceil((target - now) / 1000));
}

/** Remaining account + per-agent quota after a live call. */
export function QuotaMeter({ quota }: { quota: ConsoleQuotaView }) {
  const acctPct =
    quota.remaining === null ? 100 : Math.max(0, Math.min(100, (quota.remaining / quota.limit) * 100));
  const clientPct =
    quota.clientRemaining === null
      ? 100
      : Math.max(0, Math.min(100, (quota.clientRemaining / quota.clientLimit) * 100));

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-3">
      <div className="flex items-center gap-2 text-xs font-medium">
        <Gauge className="h-3.5 w-3.5 text-primary" /> Remaining quota
        <span className="text-muted-foreground font-normal">
          rolling {quota.windowSeconds}s window
        </span>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-[11px]">
          <span className="text-muted-foreground">Account (all agents)</span>
          <span className="font-mono">
            {quota.remaining ?? "?"} / {quota.limit} left
          </span>
        </div>
        <Progress aria-label="Account quota used" value={acctPct} className="h-1.5" />
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-[11px]">
          <span className="text-muted-foreground">
            This agent{quota.clientId ? ` · ${quota.clientId}` : ""}
          </span>
          <span className="font-mono">
            {quota.clientRemaining ?? "?"} / {quota.clientLimit} left
          </span>
        </div>
        <Progress aria-label="Client quota used" value={clientPct} className="h-1.5" />
      </div>
    </div>
  );
}

/** Throttle banner with a live retry-after countdown and the correlation ID. */
export function ThrottleBanner({
  throttle,
  correlationId,
  onCopy,
  onRetry,
}: {
  throttle: ConsoleThrottleView;
  correlationId: string | null;
  onCopy: (value: string, label: string) => void;
  onRetry?: () => void;
}) {
  const target = throttle.issuedAt + throttle.retryAfterSeconds * 1000;
  const secondsLeft = useCountdown(target);
  const pct = Math.max(
    0,
    Math.min(100, ((throttle.retryAfterSeconds - secondsLeft) / throttle.retryAfterSeconds) * 100),
  );
  const ready = secondsLeft === 0;

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <AlertTriangle className="h-4 w-4 text-amber-400" />
        <span className="font-semibold text-amber-200">Rate limited</span>
        <Badge variant="outline" className="text-[10px]">
          {throttle.scope === "client" ? "per-agent limit" : "account limit"}
        </Badge>
        {throttle.clientId && (
          <Badge variant="secondary" className="text-[10px] font-mono">
            {throttle.clientId}
          </Badge>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {throttle.used ?? "?"} of {throttle.limit} calls used in the last {throttle.windowSeconds}s.
        Quota remaining right now: <span className="font-mono">0</span>.
      </p>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1 text-muted-foreground">
            <Timer className="h-3.5 w-3.5" /> Retry after
          </span>
          <span className="font-mono font-semibold tabular-nums">
            {ready ? "ready now" : `${secondsLeft}s`}
          </span>
        </div>
        <Progress aria-label="Quota used" value={pct} className="h-1.5" />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="text-muted-foreground">Correlation ID</span>
        <code className="font-mono break-all">{correlationId ?? "—"}</code>
        {correlationId && (
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => onCopy(correlationId, "Correlation ID")}
            aria-label="Copy correlation ID"
          >
            <Copy className="h-3 w-3" />
          </Button>
        )}
        {onRetry && (
          <Button size="sm" variant="outline" className="h-6 px-2" disabled={!ready} onClick={onRetry}>
            {ready ? "Retry call" : `Retry in ${secondsLeft}s`}
          </Button>
        )}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLiveAssets } from "@/lib/live-assets";
import {
  MAX_AUTO_RETRIES,
  checkSnapshot,
  retryDelayMs,
  type SnapshotHealth,
} from "@/lib/snapshot-health";

/**
 * Watches the live market snapshot and schedules automatic retries with
 * exponential backoff whenever it fails or comes back inconsistent.
 */
export function useDashboardSnapshot() {
  const { assets, liveCount, isLoading, isError, updatedAt, refetch } = useLiveAssets();
  const [attempt, setAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [nextRetryAt, setNextRetryAt] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const health: SnapshotHealth = useMemo(
    () => checkSnapshot({ assets, liveCount, isLoading, isError, updatedAt }),
    [assets, liveCount, isLoading, isError, updatedAt],
  );

  const unhealthy = health.status === "error" || health.status === "inconsistent";

  // Reset the backoff as soon as a good snapshot lands.
  useEffect(() => {
    if (health.status === "ok") {
      setAttempt(0);
      setNextRetryAt(null);
    }
  }, [health.status]);

  useEffect(() => {
    if (!unhealthy || attempt >= MAX_AUTO_RETRIES) return;
    const delay = retryDelayMs(attempt);
    setNextRetryAt(Date.now() + delay);
    timer.current = setTimeout(() => {
      setRetrying(true);
      setAttempt((a) => a + 1);
      void Promise.resolve(refetch()).finally(() => setRetrying(false));
    }, delay);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [unhealthy, attempt, refetch]);

  const retryNow = () => {
    if (timer.current) clearTimeout(timer.current);
    setRetrying(true);
    setAttempt(0);
    setNextRetryAt(null);
    void Promise.resolve(refetch()).finally(() => setRetrying(false));
  };

  return {
    health,
    attempt,
    retrying,
    nextRetryAt,
    exhausted: unhealthy && attempt >= MAX_AUTO_RETRIES,
    retryNow,
  };
}

function useCountdown(target: number | null) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (target === null) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [target]);
  if (target === null) return null;
  return Math.max(0, Math.ceil((target - Date.now()) / 1000));
}

/** Full-page skeleton shown while the first snapshot is in flight. */
export function DashboardSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading your dashboard…</span>
      <div className="space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-40 rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-64 rounded-xl lg:col-span-2" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}

/**
 * Non-blocking banner explaining a failed or inconsistent snapshot, the
 * automatic retry schedule, and a manual retry escape hatch.
 */
export function SnapshotRetryBanner({
  health,
  attempt,
  retrying,
  nextRetryAt,
  exhausted,
  onRetry,
}: ReturnType<typeof useDashboardSnapshot> & { onRetry?: () => void }) {
  const seconds = useCountdown(exhausted ? null : nextRetryAt);
  if (health.status === "ok" || health.status === "loading") return null;

  return (
    <Card className="border-amber-500/30 bg-amber-500/5" role="alert" aria-live="polite">
      <CardContent className="flex flex-wrap items-center gap-3 p-4 text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-amber-200">
            {health.status === "error"
              ? "Couldn't load the market snapshot"
              : "Market snapshot looks inconsistent"}
          </div>
          <div className="text-xs text-muted-foreground">
            {health.reason} Showing the last known demo values meanwhile.{" "}
            {exhausted
              ? "Automatic retries stopped — retry manually."
              : retrying
                ? "Retrying now…"
                : seconds !== null
                  ? `Retrying automatically in ${seconds}s (attempt ${attempt + 1} of ${MAX_AUTO_RETRIES}).`
                  : null}
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying}>
          {retrying ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden />
          )}
          Retry now
        </Button>
      </CardContent>
    </Card>
  );
}

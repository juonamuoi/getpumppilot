import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, Gauge, RefreshCw } from "lucide-react";
import {
  getMcpRateLimitStatus,
  type RateLimitStatus,
  type RateLimitScopeStatus,
} from "@/lib/mcp-rate-limit-status.functions";

function pct(scope: RateLimitScopeStatus) {
  if (!scope.limit) return 0;
  return Math.max(0, Math.min(100, (scope.remaining / scope.limit) * 100));
}

function ScopeRow({
  label,
  scope,
  note,
}: {
  label: string;
  scope: RateLimitScopeStatus;
  note?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {label}
          {note ? ` · ${note}` : ""}
        </span>
        <span className="font-mono">
          {scope.remaining}/{scope.limit} left
        </span>
      </div>
      <Progress value={pct(scope)} className="h-1.5" />
      <p className="text-[11px] text-muted-foreground">
        {scope.throttled
          ? `Throttled — retry in ${scope.retryAfterSeconds}s (${new Date(scope.nextRetryAt).toLocaleTimeString()})`
          : `${scope.used} used in the current window`}
      </p>
    </div>
  );
}

/** Read-only quota panel — checking status never consumes a call. */
export function McpRateLimitStatusCard({ defaultClientId = "" }: { defaultClientId?: string }) {
  const fetchStatus = useServerFn(getMcpRateLimitStatus);
  const [clientId, setClientId] = useState(defaultClientId);
  const [status, setStatus] = useState<RateLimitStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchStatus({ data: { clientId: clientId.trim() || null } });
      setStatus(next);
      setCountdown(next.retryAfterSeconds);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read rate limit status.");
    } finally {
      setLoading(false);
    }
  }, [clientId, fetchStatus]);

  useEffect(() => {
    void load();
    // Initial load only; refreshes are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="h-4 w-4 text-primary" />
          Rate limit status
          <Badge variant="secondary" className="ml-auto text-[10px]">
            does not consume quota
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="Agent client ID (optional)"
            className="font-mono text-xs"
          />
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Check
          </Button>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        {status && (
          <div className="space-y-4">
            <ScopeRow
              label="Account (all agents)"
              scope={status.account}
              note={`${status.windowSeconds}s window${status.plan ? ` · ${status.plan}` : ""}`}
            />
            {status.client ? (
              <ScopeRow
                label={`Agent "${status.client.clientId}"`}
                scope={status.client}
                note={status.client.revoked ? "access revoked" : undefined}
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                Enter an agent client ID to see that agent&apos;s remaining calls.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              {countdown > 0
                ? `Next call allowed in ${countdown}s.`
                : "Calls are allowed right now."}{" "}
              Checked {new Date(status.checkedAt).toLocaleTimeString()}.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

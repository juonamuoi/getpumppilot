import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, BellRing, Check, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  acknowledgeStorageAlert,
  getStorageAlerts,
  type StorageAlertRow,
} from "@/lib/storage-audit.functions";

const RULE_LABEL: Record<StorageAlertRow["rule"], string> = {
  deny_spike: "Denial spike",
  owner_mismatch: "Owner mismatch",
};

function severityBadge(sev: StorageAlertRow["severity"]) {
  if (sev === "critical") return <Badge variant="destructive">Critical</Badge>;
  if (sev === "warning")
    return (
      <Badge variant="outline" className="border-amber-500/40 text-amber-400">
        Warning
      </Badge>
    );
  return <Badge variant="outline">Info</Badge>;
}

/**
 * Admin-facing alerts raised from the append-only storage audit trail:
 * bursts of denials per bucket, and repeated owner-mismatch attempts against
 * the same bucket + path pattern.
 */
export function StorageAlertsPanel() {
  const [includeAcknowledged, setIncludeAcknowledged] = useState(false);
  const qc = useQueryClient();
  const fetchAlerts = useServerFn(getStorageAlerts);
  const ackAlert = useServerFn(acknowledgeStorageAlert);

  const query = useQuery({
    queryKey: ["storage-alerts", includeAcknowledged],
    queryFn: () => fetchAlerts({ data: { hours: 168, includeAcknowledged, evaluate: true } }),
    refetchInterval: 60_000,
  });

  const ack = useMutation({
    mutationFn: (id: string) => ackAlert({ data: { id } }),
    onSuccess: () => {
      toast.success("Alert acknowledged");
      qc.invalidateQueries({ queryKey: ["storage-alerts"] });
    },
    onError: (e) => toast.error((e as Error).message || "Could not acknowledge alert"),
  });

  const alerts = query.data ?? [];
  const critical = alerts.filter((a) => a.severity === "critical").length;

  return (
    <Card className="mt-6 border-amber-500/20">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <BellRing className="h-4 w-4 text-amber-400" /> Security alerts
            {critical > 0 && <Badge variant="destructive">{critical} critical</Badge>}
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Raised automatically when denials spike in a bucket (10+ per 15 min) or the same
            bucket and path pattern sees 3+ owner-mismatch attempts.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              id="show-ack"
              checked={includeAcknowledged}
              onCheckedChange={setIncludeAcknowledged}
            />
            <Label htmlFor="show-ack" className="text-xs text-muted-foreground">
              Show acknowledged
            </Label>
          </div>
          <Button
            variant="outline"
            size="icon"
            aria-label="Re-run alert detection"
            onClick={() => query.refetch()}
          >
            <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {query.isError && (
          <p className="py-6 text-center text-sm text-destructive">
            {(query.error as Error)?.message?.includes("Forbidden")
              ? "Admin role required to view storage alerts."
              : "Could not load storage alerts."}
          </p>
        )}
        {!query.isError && !alerts.length && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {query.isLoading ? "Checking recent activity…" : "No alerts in the last 7 days."}
          </p>
        )}
        <ul className="space-y-3">
          {alerts.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border/60 p-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {severityBadge(a.severity)}
                  <Badge variant="secondary">{RULE_LABEL[a.rule]}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(a.created_at).toLocaleString()}
                  </span>
                  {a.acknowledged_at && (
                    <Badge variant="outline" className="border-emerald-500/40 text-emerald-400">
                      Acknowledged
                    </Badge>
                  )}
                </div>
                <p className="mt-2 flex items-start gap-2 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <span>{a.message}</span>
                </p>
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                  {a.bucket} · {a.path_pattern} · {a.event_count}/{a.threshold} events ·{" "}
                  {a.distinct_users} caller(s)
                </p>
              </div>
              {!a.acknowledged_at && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={ack.isPending}
                  onClick={() => ack.mutate(a.id)}
                >
                  <Check className="mr-2 h-4 w-4" /> Acknowledge
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

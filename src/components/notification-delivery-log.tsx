import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Mail,
  RefreshCw,
  Smartphone,
  SlashSquare,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  clearDeliveryLog,
  deliveryStats,
  reasonLabel,
  useDeliveryLog,
  type NotifyDelivery,
} from "@/lib/notify-log";
import { retryDelivery } from "@/lib/threat-notify";

function StatusBadge({ entry }: { entry: NotifyDelivery }) {
  if (entry.status === "sent")
    return (
      <Badge className="gap-1 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/15">
        <CheckCircle2 className="h-3 w-3" /> Sent
      </Badge>
    );
  if (entry.status === "failed")
    return (
      <Badge className="gap-1 bg-rose-500/15 text-rose-300 hover:bg-rose-500/15">
        <AlertTriangle className="h-3 w-3" /> Failed
      </Badge>
    );
  return (
    <Badge className="gap-1 bg-amber-500/15 text-amber-300 hover:bg-amber-500/15">
      <SlashSquare className="h-3 w-3" /> Skipped
    </Badge>
  );
}

/**
 * Delivery status + retry handling for every alert we attempt to send.
 * Shows whether each push/email was sent, failed, or skipped (channel off,
 * unsupported device, missing notification permission, duplicate).
 */
export function NotificationDeliveryLog() {
  const log = useDeliveryLog();
  const [channel, setChannel] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [retrying, setRetrying] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      log.filter(
        (e) =>
          (channel === "all" || e.channel === channel) &&
          (status === "all" || e.status === status),
      ),
    [log, channel, status],
  );
  const stats = deliveryStats(log);
  const retryable = log.filter((e) => e.retryable);

  const runRetry = async (entry: NotifyDelivery) => {
    setRetrying(entry.id);
    const res = await retryDelivery(entry);
    setRetrying(null);
    if (res.ok) toast.success(`${entry.channel === "push" ? "Push" : "Email"} delivered on retry`);
    else toast.error(`Retry failed — ${reasonLabel(res.reason) || "unknown error"}`);
  };

  const retryAll = async () => {
    for (const e of retryable) {
      // eslint-disable-next-line no-await-in-loop
      await retryDelivery(e);
    }
    toast.info(`Retried ${retryable.length} delivery attempt${retryable.length === 1 ? "" : "s"}`);
  };

  return (
    <div className="flex flex-col gap-3 border-t border-border/60 px-6 py-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          Alert delivery status
          <span className="text-xs font-normal text-muted-foreground">
            {stats.sent} sent · {stats.failed} failed · {stats.skipped} skipped
          </span>
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger className="h-8 w-[110px] text-xs" aria-label="Filter by channel">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All channels</SelectItem>
              <SelectItem value="push">Push</SelectItem>
              <SelectItem value="email">Email</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-8 w-[110px] text-xs" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="skipped">Skipped</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={retryable.length === 0}
            onClick={() => void retryAll()}
          >
            <RefreshCw className="mr-1 h-3 w-3" /> Retry failed ({retryable.length})
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            disabled={log.length === 0}
            onClick={() => {
              clearDeliveryLog();
              toast.info("Delivery log cleared");
            }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground">
          No delivery attempts yet. Send a test alert or run a wallet scan — every push and email
          attempt will be listed here with its status.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.slice(0, 50).map((e) => (
            <li
              key={e.id}
              className="flex flex-col gap-1 rounded-md border border-border/60 bg-muted/20 p-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  {e.channel === "push" ? (
                    <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <StatusBadge entry={e} />
                  {e.test && (
                    <Badge variant="outline" className="text-[10px]">
                      Test
                    </Badge>
                  )}
                  <span className="truncate font-medium">{e.title}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{new Date(e.lastAttemptAt).toLocaleString()}</span>
                  <span>· {e.attempts} attempt{e.attempts === 1 ? "" : "s"}</span>
                  {e.correlationId && <span className="font-mono">· {e.correlationId}</span>}
                  {e.reason && <span>· {reasonLabel(e.reason)}</span>}
                  {e.detail && <span>· {e.detail}</span>}
                </div>
              </div>
              {e.retryable && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 text-xs"
                  disabled={retrying === e.id}
                  onClick={() => void runRetry(e)}
                >
                  <RefreshCw
                    className={`mr-1 h-3 w-3 ${retrying === e.id ? "animate-spin" : ""}`}
                  />
                  Retry
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground">
        Skipped means nothing was sent — usually the channel is off, the device does not support
        notifications, or notification permission is missing. Grant permission above, then retry.
      </p>
    </div>
  );
}

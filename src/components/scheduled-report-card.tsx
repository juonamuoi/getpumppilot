/**
 * Recurring PDF threat-report export controls.
 *
 * Lets the user schedule the wallet threat report daily or weekly at a
 * chosen local hour, pick where it goes (download, email, or both), see
 * the next run time, and generate one on demand.
 */
import { useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  WEEKDAY_LABELS,
  nextReportRunAt,
  setReportSchedule,
  useWalletMonitor,
  useWalletSession,
  type ReportDelivery,
  type ReportFrequency,
} from "@/lib/wallet-session";
import { runScheduledReport } from "@/lib/report-schedule";

const HOURS = Array.from({ length: 24 }, (_, h) => h);

const hourLabel = (h: number) => {
  const d = new Date();
  d.setHours(h, 0, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
};

export function ScheduledReportCard() {
  const { reportSchedule: schedule } = useWalletMonitor();
  const { scan } = useWalletSession();
  const [running, setRunning] = useState(false);

  const next = nextReportRunAt(schedule);
  const on = schedule.frequency !== "off";

  const runNow = async () => {
    setRunning(true);
    try {
      const res = await runScheduledReport(schedule.delivery === "email" ? "email" : "both", scan);
      const parts: string[] = [];
      if (res.downloaded) parts.push(`saved ${res.filename}`);
      if (res.emailed) parts.push("emailed to your account");
      toast.success("Threat report generated", {
        description: `${res.threats} flagged approval${res.threats === 1 ? "" : "s"} · ${
          parts.join(" · ") || "generated"
        } · ID ${res.correlationId}`,
      });
      if (schedule.delivery !== "download" && !res.emailed && res.emailReason) {
        toast.warning(`Report email not sent — ${res.emailReason}`);
      }
    } catch {
      toast.error("Could not generate the threat report");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 border-t border-border/60 px-6 py-3 text-xs">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-2 font-medium">
          <CalendarClock className="h-3.5 w-3.5 text-sky-400" />
          Scheduled threat report (PDF)
        </span>

        <Select
          value={schedule.frequency}
          onValueChange={(v) => setReportSchedule({ frequency: v as ReportFrequency })}
        >
          <SelectTrigger className="h-8 w-[110px] text-xs" aria-label="Report frequency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="off">Off</SelectItem>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
          </SelectContent>
        </Select>

        {schedule.frequency === "weekly" && (
          <Select
            value={String(schedule.weekday)}
            onValueChange={(v) => setReportSchedule({ weekday: Number(v) })}
          >
            <SelectTrigger className="h-8 w-[120px] text-xs" aria-label="Report weekday">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEEKDAY_LABELS.map((d, i) => (
                <SelectItem key={d} value={String(i)}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {on && (
          <Select
            value={String(schedule.hour)}
            onValueChange={(v) => setReportSchedule({ hour: Number(v) })}
          >
            <SelectTrigger className="h-8 w-[110px] text-xs" aria-label="Report time">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HOURS.map((h) => (
                <SelectItem key={h} value={String(h)}>
                  {hourLabel(h)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {on && (
          <Select
            value={schedule.delivery}
            onValueChange={(v) => setReportSchedule({ delivery: v as ReportDelivery })}
          >
            <SelectTrigger className="h-8 w-[150px] text-xs" aria-label="Report delivery">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="download">Download only</SelectItem>
              <SelectItem value="email">Email only</SelectItem>
              <SelectItem value="both">Download + email</SelectItem>
            </SelectContent>
          </Select>
        )}

        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-8 text-xs"
          disabled={running}
          onClick={() => void runNow()}
        >
          <Download className="mr-1.5 h-3.5 w-3.5" />
          {running ? "Generating…" : "Generate now"}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        {on ? (
          <>
            <Badge variant="outline" className="border-sky-500/40 text-sky-300">
              Next: {next ? new Date(next).toLocaleString() : "—"}
            </Badge>
            <span>
              Last run:{" "}
              {schedule.lastRunAt ? new Date(schedule.lastRunAt).toLocaleString() : "never"}
            </span>
            <span>
              Runs in your browser while the app is open; a missed slot fires on your next visit.
            </span>
          </>
        ) : (
          <span>
            Turn on a daily or weekly cadence to auto-generate the full PDF threat report with
            correlation IDs and timestamps.
          </span>
        )}
      </div>
    </div>
  );
}

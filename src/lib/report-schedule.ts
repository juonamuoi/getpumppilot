/* ------------------------------------------------------------------ *
 * Scheduled wallet threat report export.
 *
 * Runs entirely in the browser: on the configured cadence (daily or
 * weekly, at a chosen local hour) we take a fresh approval scan of the
 * connected demo wallet, render the PDF threat report and either save it
 * locally, email a signed download link to the signed-in account, or both.
 *
 * The schedule state lives in localStorage alongside the other wallet
 * monitor settings, so it survives reloads. A missed slot (browser closed)
 * fires on the next visit rather than being silently skipped.
 * ------------------------------------------------------------------ */
import { scanWallet, type WalletScanResult } from "@/lib/wallet-scan";
import { exportWalletReportPdf } from "@/lib/wallet-report-pdf";
import { sendThreatEmail } from "@/lib/threat-alerts.functions";
import {
  DEMO_WALLET_ADDRESS,
  getWalletMonitor,
  isReportDue,
  nextReportRunAt,
  setReportSchedule,
  type ReportSchedule,
} from "@/lib/wallet-session";

export type ScheduledReportOutcome = {
  downloaded: boolean;
  filename?: string;
  emailed: boolean;
  emailReason?: string;
  reportUrl?: string;
  correlationId: string;
  threats: number;
};

async function pdfBase64(result: WalletScanResult): Promise<string | undefined> {
  try {
    const { buildWalletReportDoc } = await import("@/lib/wallet-report-pdf");
    const { doc } = await buildWalletReportDoc(result);
    return doc.output("datauristring");
  } catch {
    return undefined;
  }
}

/**
 * Generates the report now and delivers it per the schedule's delivery mode.
 * `scan` may be supplied to reuse an existing result; otherwise a fresh scan runs.
 */
export async function runScheduledReport(
  delivery: ReportSchedule["delivery"],
  scan?: WalletScanResult | null,
): Promise<ScheduledReportOutcome> {
  const result = scan ?? (await scanWallet(DEMO_WALLET_ADDRESS, { includeEmerging: true }));

  const out: ScheduledReportOutcome = {
    downloaded: false,
    emailed: false,
    correlationId: result.correlationId,
    threats: result.threats.length,
  };

  if (delivery === "download" || delivery === "both") {
    out.filename = await exportWalletReportPdf(result);
    out.downloaded = true;
  }

  if (delivery === "email" || delivery === "both") {
    try {
      const res = await sendThreatEmail({
        data: {
          address: DEMO_WALLET_ADDRESS,
          correlationId: result.correlationId,
          findings: result.threats.slice(0, 10).map((t) => ({
            token: t.token,
            spender: t.spender,
            spenderLabel: t.spenderLabel,
            risk: t.risk,
            valueAtRiskUsd: Math.round(t.valueAtRiskUsd),
            reason: t.reasons[0] ?? "Risky approval detected",
            correlationId: t.correlationId ?? result.correlationId,
          })),

          pdfBase64: await pdfBase64(result),
        },
      });
      out.emailed = res.sent;
      out.emailReason = res.reason;
      out.reportUrl = res.reportUrl;
    } catch (e) {
      out.emailReason = e instanceof Error ? e.message : "send failed";
    }
  }

  return out;
}

/**
 * Fires the scheduled export when the current slot is due, marking the run
 * so it only happens once per period. Returns null when nothing was due.
 */
export async function runScheduledReportIfDue(
  now: number = Date.now(),
): Promise<ScheduledReportOutcome | null> {
  const schedule = getWalletMonitor().reportSchedule;
  if (!isReportDue(schedule, now)) return null;
  // Mark first so a slow render can't double-fire on the next tick.
  setReportSchedule({ lastRunAt: now });
  try {
    return await runScheduledReport(schedule.delivery);
  } catch (e) {
    // Allow a retry on the next tick if generation failed outright.
    setReportSchedule({ lastRunAt: schedule.lastRunAt });
    throw e;
  }
}

export function describeSchedule(schedule: ReportSchedule): string {
  if (schedule.frequency === "off") return "Off";
  const next = nextReportRunAt(schedule);
  return next ? new Date(next).toLocaleString() : "Off";
}

// CSV export for wallet alert notification-log entries (delivery outcomes).
import { reasonLabel, type NotifyDelivery } from "@/lib/notify-log";

const HEADERS = [
  "timestamp_iso",
  "timestamp_local",
  "channel",
  "status",
  "reason_code",
  "reason_label",
  "detail",
  "title",
  "correlation_id",
  "wallet_address",
  "test_alert",
  "attempts",
  "last_attempt_iso",
  "retryable",
];

function esc(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function deliveriesToCsv(rows: NotifyDelivery[]): string {
  const lines = [HEADERS.join(",")];
  for (const d of rows) {
    lines.push(
      [
        new Date(d.ts).toISOString(),
        new Date(d.ts).toLocaleString(),
        d.channel,
        d.status,
        d.reason ?? "",
        d.reason ? reasonLabel(d.reason) : "",
        d.detail ?? "",
        d.title,
        d.correlationId,
        d.address ?? "",
        d.test ? "yes" : "no",
        d.attempts,
        d.lastAttemptAt ? new Date(d.lastAttemptAt).toISOString() : "",
        d.retryable ? "yes" : "no",
      ]
        .map(esc)
        .join(","),
    );
  }
  return lines.join("\n");
}

export function notifyLogFilename(prefix = "wallet-alert-deliveries") {
  return `${prefix}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
}

/* ------------------------------------------------------------------ *
 * Wallet threat findings -> CSV export.
 *
 * One row per flagged approval, carrying the scan correlation ID, the
 * per-finding correlation ID and both local + UTC ISO timestamps so the
 * file can be cross-referenced with the PDF report and audit trails.
 * ------------------------------------------------------------------ */
import type { WalletScanResult } from "@/lib/wallet-scan";

export const WALLET_CSV_HEADERS = [
  "scan_correlation_id",
  "finding_correlation_id",
  "wallet_address",
  "scanned_at_local",
  "scanned_at_utc",
  "exported_at_utc",
  "risk",
  "token",
  "spender",
  "spender_label",
  "approval_scope",
  "allowance",
  "value_at_risk_usd",
  "approved_at_local",
  "approved_at_utc",
  "matched_rules",
  "reasons",
] as const;

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Builds the CSV text (exported for tests/QA). */
export function buildWalletFindingsCsv(result: WalletScanResult): string {
  const exportedAt = new Date().toISOString();
  const scannedLocal = new Date(result.scannedAt).toLocaleString();
  const scannedUtc = new Date(result.scannedAt).toISOString();

  const rows = result.threats.map((t, i) => [
    result.correlationId,
    t.correlationId ?? `${result.correlationId}-F${String(i + 1).padStart(2, "0")}`,
    result.address,
    scannedLocal,
    scannedUtc,
    exportedAt,
    t.risk,
    t.token,
    t.spender,
    t.spenderLabel,
    t.allowance === null ? "unlimited" : "capped",
    t.allowance === null ? "" : t.allowance,
    t.valueAtRiskUsd,
    new Date(t.approvedAt).toLocaleString(),
    new Date(t.approvedAt).toISOString(),
    t.rules.join(" | "),
    t.reasons.join(" | "),
  ]);

  return [WALLET_CSV_HEADERS, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
}

export function walletFindingsCsvFilename(result: WalletScanResult): string {
  return `pumppilot-wallet-threat-findings-${result.correlationId}.csv`;
}

/** Triggers a browser download of the findings CSV; returns the filename. */
export function exportWalletFindingsCsv(result: WalletScanResult): string {
  const filename = walletFindingsCsvFilename(result);
  const blob = new Blob([`\uFEFF${buildWalletFindingsCsv(result)}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}

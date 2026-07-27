/* ------------------------------------------------------------------ *
 * Wallet threat report → PDF export.
 *
 * Renders the latest approval scan (demo data) as a downloadable PDF
 * containing the scan correlation ID, timestamps (local + UTC ISO) and
 * a per-finding correlation ID for every flagged approval.
 * ------------------------------------------------------------------ */
import { shortAddress, type WalletScanResult } from "@/lib/wallet-scan";

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const stamp = (ms: number) =>
  `${new Date(ms).toLocaleString()}  (UTC ${new Date(ms).toISOString()})`;

export async function exportWalletReportPdf(result: WalletScanResult): Promise<string> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const M = 48;
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  let y = M;

  const ensure = (needed: number) => {
    if (y + needed > H - 60) {
      doc.addPage();
      y = M;
    }
  };

  const text = (
    value: string,
    opts: { size?: number; bold?: boolean; color?: [number, number, number]; gap?: number } = {},
  ) => {
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(opts.size ?? 10);
    const c = opts.color ?? [30, 34, 45];
    doc.setTextColor(c[0], c[1], c[2]);
    const lines = doc.splitTextToSize(value, W - M * 2) as string[];
    for (const line of lines) {
      ensure(14);
      doc.text(line, M, y);
      y += (opts.size ?? 10) + 4;
    }
    y += opts.gap ?? 0;
  };

  const rule = (gap = 10) => {
    ensure(gap + 4);
    doc.setDrawColor(214, 218, 228);
    doc.line(M, y, W - M, y);
    y += gap;
  };

  /* ------------------------------ Header ------------------------------ */
  doc.setFillColor(11, 14, 22);
  doc.rect(0, 0, W, 92, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text("PumpPilot AI — Wallet Threat Report", M, 46);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(168, 178, 198);
  doc.text("Spot momentum. Control risk. Trade smarter.  ·  DEMO / MOCK DATA", M, 66);
  y = 124;

  /* ---------------------------- Scan metadata ---------------------------- */
  const generatedAt = Date.now();
  const meta: Array<[string, string]> = [
    ["Scan correlation ID", result.correlationId],
    ["Wallet address", result.address],
    ["Scanned at", stamp(result.scannedAt)],
    ["Report generated at", stamp(generatedAt)],
    ["Approvals reviewed", String(result.approvals.length)],
    ["Findings flagged", String(result.threats.length)],
    ["Highest severity", result.worst.toUpperCase()],
    ["Total value at risk", usd(result.totalValueAtRiskUsd)],
  ];

  text("Scan summary", { size: 13, bold: true, gap: 4 });
  rule(12);
  for (const [k, v] of meta) {
    ensure(16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(90, 98, 115);
    doc.text(k, M, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(24, 28, 38);
    const lines = doc.splitTextToSize(v, W - M - 200) as string[];
    doc.text(lines, M + 150, y);
    y += Math.max(16, lines.length * 13);
  }
  y += 10;

  /* ------------------------------ Findings ------------------------------ */
  text("Findings", { size: 13, bold: true, gap: 4 });
  rule(12);

  if (result.threats.length === 0) {
    text(
      "No risky approvals detected. All outstanding spender allowances passed the phishing address list and drainer heuristics at the time of this scan.",
      { size: 10, gap: 8 },
    );
  }

  result.threats.forEach((t, i) => {
    ensure(120);
    const critical = t.risk === "critical";
    doc.setFillColor(critical ? 254 : 255, critical ? 242 : 249, critical ? 242 : 235);
    const boxTop = y - 12;
    const bodyLines: string[] = [];
    t.reasons.forEach((r) =>
      (doc.splitTextToSize(`• ${r}`, W - M * 2 - 24) as string[]).forEach((l) => bodyLines.push(l)),
    );
    const boxH = 96 + bodyLines.length * 12;
    doc.setDrawColor(critical ? 220 : 226, critical ? 120 : 180, critical ? 120 : 120);
    doc.roundedRect(M, boxTop, W - M * 2, boxH, 6, 6, "FD");

    y += 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(20, 24, 34);
    doc.text(`${i + 1}. ${t.risk.toUpperCase()} — ${t.token} → ${t.spenderLabel}`, M + 12, y);
    y += 16;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(90, 98, 115);
    doc.text(`Finding correlation ID: ${t.correlationId ?? "—"}`, M + 12, y);
    y += 12;
    doc.text(`Spender: ${t.spender} (${shortAddress(t.spender)})`, M + 12, y);
    y += 12;
    doc.text(
      `Approved at: ${stamp(t.approvedAt)}  ·  Allowance: ${
        t.allowance === null ? "UNLIMITED" : t.allowance
      }  ·  Value at risk: ${usd(t.valueAtRiskUsd)}`,
      M + 12,
      y,
    );
    y += 14;

    doc.setTextColor(24, 28, 38);
    for (const line of bodyLines) {
      ensure(14);
      doc.text(line, M + 12, y);
      y += 12;
    }
    y += 4;
    doc.setTextColor(120, 128, 145);
    doc.text(`Matched rules: ${t.rules.join(", ") || "none"}`, M + 12, y);
    y += 26;
  });

  /* ---------------------------- All approvals ---------------------------- */
  ensure(60);
  text("All reviewed approvals", { size: 13, bold: true, gap: 4 });
  rule(12);
  for (const a of result.approvals) {
    ensure(16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(60, 66, 80);
    doc.text(
      `${(a.correlationId ?? "—").padEnd(0)}  ·  ${a.risk.toUpperCase()}  ·  ${a.token} → ${shortAddress(
        a.spender,
      )}  ·  ${a.allowance === null ? "unlimited" : a.allowance}  ·  ${usd(a.valueAtRiskUsd)}`,
      M,
      y,
    );
    y += 13;
  }
  y += 16;

  /* ----------------------------- Disclaimer ----------------------------- */
  ensure(70);
  text("Important", { size: 11, bold: true, gap: 2 });
  text(
    "This report is generated from simulated (demo) approval data for the PumpPilot AI demo build. Revoking inside the app is simulated and signs nothing. PumpPilot AI never asks for and never stores seed phrases or private keys. Signals and predictions elsewhere in the app are probabilistic — returns are not guaranteed and you can lose all capital.",
    { size: 8.5, color: [110, 118, 135] },
  );

  /* ------------------------------- Footers ------------------------------- */
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(140, 148, 165);
    doc.text(`Correlation ID ${result.correlationId}`, M, H - 28);
    doc.text(`Page ${p} of ${pages}`, W - M, H - 28, { align: "right" });
  }

  const filename = `pumppilot-wallet-threat-report-${result.correlationId}.pdf`;
  doc.save(filename);
  return filename;
}

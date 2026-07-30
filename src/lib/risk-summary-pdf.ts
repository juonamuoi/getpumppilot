/* ------------------------------------------------------------------ *
 * Portfolio risk summary -> PDF export.
 *
 * Renders the current risk limits, per-holding stop-loss / take-profit
 * levels and dollar-at-risk (mock / demo data) as a downloadable PDF.
 * ------------------------------------------------------------------ */

export type RiskSummaryHolding = {
  symbol: string;
  qty: number;
  price: number;
  value: number;
  pct: number;
  over: boolean;
  stopPrice: number;
  targetPrice: number;
  atRisk: number;
  upside: number;
};

export type RiskSummaryInput = {
  presetName?: string;
  equity: number;
  cash: number;
  limits: {
    maxPositionPct: number;
    maxDailyLossPct: number;
    stopLossPct: number;
    takeProfitPct: number;
  };
  holdings: RiskSummaryHolding[];
};

export function newRiskReportId() {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `RISK-${Date.now().toString(36).toUpperCase()}-${rand}`;
}

/** jsPDF's built-in fonts lack these glyphs — map to ASCII before drawing. */
const ascii = (v: string) =>
  v
    .replace(/\u2192/g, "->")
    .replace(/\u2265/g, ">=")
    .replace(/\u2264/g, "<=")
    .replace(/\u00b7/g, "-")
    .replace(/\u2014/g, "-")
    .replace(/\u2013/g, "-")
    .replace(/\u2022/g, "-")
    .replace(/\u2248/g, "~");

const usd = (n: number) =>
  `$${n.toLocaleString("en-US", { maximumFractionDigits: n < 10 ? 4 : 2 })}`;

const stamp = (ms: number) =>
  `${new Date(ms).toLocaleString()}  (UTC ${new Date(ms).toISOString()})`;

/** Builds the risk summary document (exported for tests/QA). */
export async function buildRiskSummaryDoc(input: RiskSummaryInput, reportId?: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const corrId = reportId ?? newRiskReportId();
  const generatedAt = Date.now();

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
    opts: {
      size?: number;
      bold?: boolean;
      color?: [number, number, number];
      gap?: number;
      indent?: number;
    } = {},
  ) => {
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(opts.size ?? 10);
    const c = opts.color ?? [30, 34, 45];
    doc.setTextColor(c[0], c[1], c[2]);
    const x = M + (opts.indent ?? 0);
    const lines = doc.splitTextToSize(ascii(value), W - M * 2 - (opts.indent ?? 0)) as string[];
    for (const line of lines) {
      ensure(14);
      doc.text(line, x, y);
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
  doc.text("PumpPilot AI - Portfolio Risk Summary", M, 46);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(168, 178, 198);
  doc.text("Spot momentum. Control risk. Trade smarter.  -  PAPER / DEMO DATA", M, 66);
  y = 124;

  /* ----------------------------- Metadata ----------------------------- */
  const L = input.limits;
  const maxPositionUsd = (input.equity * L.maxPositionPct) / 100;
  const maxDailyLossUsd = (input.equity * L.maxDailyLossPct) / 100;
  const riskPerTradeUsd = (maxPositionUsd * L.stopLossPct) / 100;
  const rMultiple = L.stopLossPct > 0 ? L.takeProfitPct / L.stopLossPct : 0;
  const totalAtRisk = input.holdings.reduce((s, h) => s + h.atRisk, 0);
  const totalUpside = input.holdings.reduce((s, h) => s + h.upside, 0);
  const invested = input.holdings.reduce((s, h) => s + h.value, 0);
  const breaches = input.holdings.filter((h) => h.over).length;

  const meta: Array<[string, string]> = [
    ["Report ID", corrId],
    ["Generated at", stamp(generatedAt)],
    ["Risk preset", input.presetName ?? "Custom"],
    ["Account equity", usd(input.equity)],
    ["Cash / invested", `${usd(input.cash)} / ${usd(invested)}`],
    ["Open holdings", String(input.holdings.length)],
  ];
  for (const [k, v] of meta) {
    ensure(16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(90, 98, 115);
    doc.text(ascii(k), M, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 34, 45);
    doc.text(ascii(v), M + 170, y);
    y += 15;
  }
  y += 6;
  rule();

  /* ------------------------------ Limits ------------------------------ */
  text("Configured risk limits", { size: 12, bold: true, gap: 4 });
  const limitRows: Array<[string, string]> = [
    ["Max position size", `${L.maxPositionPct}% of equity  =  ${usd(maxPositionUsd)}`],
    ["Daily loss cap", `${L.maxDailyLossPct}% of equity  =  ${usd(maxDailyLossUsd)}`],
    ["Default stop-loss", `-${L.stopLossPct}%  (~${usd(riskPerTradeUsd)} risked at full size)`],
    ["Take-profit target", `+${L.takeProfitPct}%  (${rMultiple.toFixed(1)}R vs. your stop)`],
  ];
  for (const [k, v] of limitRows) {
    ensure(16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(90, 98, 115);
    doc.text(ascii(k), M, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 34, 45);
    doc.text(ascii(v), M + 170, y);
    y += 15;
  }
  y += 6;
  rule();

  /* --------------------------- Dollar at risk -------------------------- */
  text("Dollar at risk", { size: 12, bold: true, gap: 4 });
  text(
    `If every stop-loss triggered at the same time you would lose ${usd(totalAtRisk)} ` +
      `(${input.equity > 0 ? ((totalAtRisk / input.equity) * 100).toFixed(2) : "0.00"}% of equity) ` +
      `against a ${usd(maxDailyLossUsd)} daily cap.`,
    { size: 9.5, gap: 2 },
  );
  text(
    `If every take-profit target filled instead, open positions would gain ${usd(totalUpside)}.`,
    { size: 9.5, gap: 2 },
  );
  text(
    totalAtRisk > maxDailyLossUsd
      ? `WARNING: combined stop-out risk exceeds your daily loss cap by ${usd(totalAtRisk - maxDailyLossUsd)}.`
      : `Combined stop-out risk is inside your daily loss cap (${usd(maxDailyLossUsd - totalAtRisk)} of headroom).`,
    {
      size: 9.5,
      bold: true,
      color: totalAtRisk > maxDailyLossUsd ? [166, 44, 66] : [16, 122, 87],
      gap: 2,
    },
  );
  text(
    breaches > 0
      ? `WARNING: ${breaches} holding${breaches > 1 ? "s" : ""} exceed the ${L.maxPositionPct}% size limit - trim to about ${usd(maxPositionUsd)} each.`
      : "All holdings are inside the configured max position size.",
    {
      size: 9.5,
      bold: true,
      color: breaches > 0 ? [166, 44, 66] : [16, 122, 87],
      gap: 4,
    },
  );
  rule();

  /* ---------------------------- Holdings table -------------------------- */
  text("Per-holding stops, targets and at-risk", { size: 12, bold: true, gap: 6 });

  const cols: Array<[string, number, "l" | "r"]> = [
    ["Asset", 0, "l"],
    ["Qty", 70, "r"],
    ["Price", 145, "r"],
    ["Value", 215, "r"],
    ["Wt%", 275, "r"],
    ["Stop", 340, "r"],
    ["Target", 410, "r"],
    ["At risk", 480, "r"],
  ];
  const header = () => {
    ensure(24);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(90, 98, 115);
    for (const [label, dx, align] of cols) {
      doc.text(label, M + dx, y, align === "r" ? { align: "right" } : undefined);
    }
    y += 6;
    doc.setDrawColor(214, 218, 228);
    doc.line(M, y, W - M, y);
    y += 12;
  };
  header();

  if (input.holdings.length === 0) {
    text("No open holdings.", { size: 9, color: [110, 118, 135], gap: 4 });
  }

  for (const h of input.holdings) {
    ensure(18);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const cells: Array<[string, number, "l" | "r"]> = [
      [ascii(h.symbol + (h.over ? " !" : "")), 0, "l"],
      [h.qty.toLocaleString("en-US", { maximumFractionDigits: 4 }), 70, "r"],
      [usd(h.price), 145, "r"],
      [usd(h.value), 215, "r"],
      [`${h.pct.toFixed(1)}%`, 275, "r"],
      [usd(h.stopPrice), 340, "r"],
      [usd(h.targetPrice), 410, "r"],
      [usd(h.atRisk), 480, "r"],
    ];
    cells.forEach(([v, dx, align], i) => {
      doc.setTextColor(...((i === 0 && h.over ? [166, 44, 66] : [30, 34, 45]) as [number, number, number]));
      doc.text(v, M + dx, y, align === "r" ? { align: "right" } : undefined);
    });
    y += 16;
  }

  y += 2;
  ensure(20);
  doc.setDrawColor(214, 218, 228);
  doc.line(M, y, W - M, y);
  y += 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(30, 34, 45);
  doc.text("Total", M, y);
  doc.text(usd(invested), M + 215, y, { align: "right" });
  doc.text(usd(totalAtRisk), M + 480, y, { align: "right" });
  y += 20;

  if (breaches > 0) {
    text("!  = position exceeds the configured max position size.", {
      size: 8,
      color: [110, 118, 135],
      gap: 4,
    });
  }

  /* ---------------------------- Disclaimer ---------------------------- */
  rule();
  text("Risk disclaimer", { size: 11, bold: true, gap: 2 });
  text(
    "This summary is generated from paper-trading positions and clearly-labelled mock / demo market data. " +
      "It is guidance only and not financial advice. Stops and targets are simulated and may not fill at the " +
      "prices shown in live markets. Momentum signals are probabilistic - you can lose all invested capital. " +
      "PumpPilot AI never asks for seed phrases or private keys.",
    { size: 8.5, color: [110, 118, 135] },
  );

  /* ------------------------------ Footer ------------------------------ */
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(140, 148, 165);
    doc.text(ascii(`${corrId}  -  PumpPilot AI risk summary (demo data)`), M, H - 28);
    doc.text(`Page ${p} of ${pages}`, W - M, H - 28, { align: "right" });
  }

  return { doc, reportId: corrId, generatedAt };
}

/** Builds and downloads the risk summary PDF. Returns the report ID. */
export async function downloadRiskSummaryPdf(input: RiskSummaryInput) {
  const { doc, reportId } = await buildRiskSummaryDoc(input);
  const d = new Date();
  const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  doc.save(`pumppilot-risk-summary-${day}-${reportId}.pdf`);
  return reportId;
}

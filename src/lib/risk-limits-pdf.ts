/* ------------------------------------------------------------------ *
 * Risk limits report -> PDF export.
 *
 * Summarises current exposure, today's drawdown and per-symbol caps
 * against the configured limits, with utilisation of each cap and the
 * formulas used, plus probabilistic-outcome disclaimers.
 * ------------------------------------------------------------------ */

export type RiskLimitsPosition = {
  symbol: string;
  qty: number;
  price: number;
  value: number;
  /** Position value as a % of equity. */
  pct: number;
  /** Remaining buying room under the per-symbol cap, in USD. */
  headroomUsd: number;
};

export type RiskLimitsReportInput = {
  equity: number;
  cash: number;
  dayStartEquity: number;
  exposure: number;
  limits: {
    maxPositionPct: number;
    maxDailyLossPct: number;
    stopLossPct: number;
    takeProfitPct: number;
  };
  positions: RiskLimitsPosition[];
  /** "Paper" or "Live" — labelled on the cover. */
  mode?: string;
};

export function newRiskLimitsReportId() {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `RLIM-${Date.now().toString(36).toUpperCase()}-${rand}`;
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
    .replace(/\u00d7/g, "x")
    .replace(/\u00f7/g, "/")
    .replace(/\u03a3/g, "Sum of")
    .replace(/\u2248/g, "~");

const usd = (n: number) =>
  n < 10
    ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 4 })}`
    : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const pct = (n: number) => `${n.toFixed(1)}%`;

const stamp = (ms: number) =>
  `${new Date(ms).toLocaleString()}  (UTC ${new Date(ms).toISOString()})`;

type Zone = "safe" | "caution" | "warning" | "breach";

function zoneFor(usedPct: number): Zone {
  if (usedPct >= 100) return "breach";
  if (usedPct >= 90) return "warning";
  if (usedPct >= 70) return "caution";
  return "safe";
}

const ZONE: Record<Zone, { label: string; rgb: [number, number, number] }> = {
  safe: { label: "Within limit", rgb: [16, 122, 87] },
  caution: { label: "Approaching limit", rgb: [176, 126, 12] },
  warning: { label: "Near limit", rgb: [193, 88, 22] },
  breach: { label: "Limit reached", rgb: [166, 44, 66] },
};

/** Builds the risk limits document (exported for tests/QA). */
export async function buildRiskLimitsDoc(input: RiskLimitsReportInput, reportId?: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const corrId = reportId ?? newRiskLimitsReportId();
  const generatedAt = Date.now();

  const M = 48;
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  let y = M;

  const ensure = (needed: number) => {
    if (y + needed > H - 64) {
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

  const rule = (gap = 12) => {
    ensure(gap + 4);
    doc.setDrawColor(214, 218, 228);
    doc.line(M, y, W - M, y);
    y += gap;
  };

  const kv = (rows: Array<[string, string]>) => {
    for (const [k, v] of rows) {
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
  };

  /** A labelled utilisation bar: value vs. limit, colour-coded by zone. */
  const meter = (opts: {
    label: string;
    current: string;
    limit: string;
    usedPct: number;
    formula: string;
    detail: string;
  }) => {
    const zone = zoneFor(opts.usedPct);
    const { rgb, label: zoneLabel } = ZONE[zone];
    ensure(74);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(30, 34, 45);
    doc.text(ascii(opts.label), M, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(rgb[0], rgb[1], rgb[2]);
    doc.text(
      ascii(`${opts.current}  of  ${opts.limit}   (${Math.round(opts.usedPct)}% used - ${zoneLabel})`),
      W - M,
      y,
      { align: "right" },
    );
    y += 9;

    const barW = W - M * 2;
    doc.setFillColor(228, 231, 238);
    doc.roundedRect(M, y, barW, 8, 4, 4, "F");
    const fill = Math.max(2, Math.min(100, opts.usedPct)) / 100;
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    doc.roundedRect(M, y, barW * fill, 8, 4, 4, "F");
    y += 18;

    doc.setFontSize(8.5);
    doc.setTextColor(90, 98, 115);
    for (const line of doc.splitTextToSize(ascii(opts.detail), barW) as string[]) {
      ensure(12);
      doc.text(line, M, y);
      y += 11;
    }
    doc.setTextColor(120, 128, 145);
    for (const line of doc.splitTextToSize(ascii(`Formula: ${opts.formula}`), barW) as string[]) {
      ensure(12);
      doc.text(line, M, y);
      y += 11;
    }
    y += 8;
  };

  /* ------------------------------ Header ------------------------------ */
  doc.setFillColor(11, 14, 22);
  doc.rect(0, 0, W, 92, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text("PumpPilot AI - Risk Limits Report", M, 46);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(168, 178, 198);
  doc.text(
    ascii(
      `Spot momentum. Control risk. Trade smarter.  -  ${(input.mode ?? "Paper").toUpperCase()} MODE`,
    ),
    M,
    66,
  );
  y = 124;

  /* ---------------------------- Computations --------------------------- */
  const L = input.limits;
  const equity = input.equity;
  const exposurePct = equity > 0 ? (input.exposure / equity) * 100 : 0;
  const drawdownPct =
    input.dayStartEquity > 0
      ? Math.max(0, ((input.dayStartEquity - equity) / input.dayStartEquity) * 100)
      : 0;
  const drawdownUsd = Math.max(0, input.dayStartEquity - equity);
  const maxDailyLossUsd = (equity * L.maxDailyLossPct) / 100;
  const maxPositionUsd = (equity * L.maxPositionPct) / 100;
  const drawdownUsed = (drawdownPct / (L.maxDailyLossPct || 1)) * 100;
  const breaches = input.positions.filter((p) => p.pct >= L.maxPositionPct);
  const worstUsed = Math.max(
    exposurePct,
    drawdownUsed,
    ...input.positions.map((p) => (p.pct / (L.maxPositionPct || 1)) * 100),
    0,
  );
  const worstZone = zoneFor(worstUsed);

  kv([
    ["Report ID", corrId],
    ["Generated at", stamp(generatedAt)],
    ["Account equity", usd(equity)],
    ["Cash available", usd(input.cash)],
    ["Session start equity", usd(input.dayStartEquity)],
    ["Open positions", String(input.positions.length)],
    ["Overall status", ZONE[worstZone].label],
  ]);
  y += 6;
  rule();

  /* --------------------------- Limit meters ---------------------------- */
  text("Exposure and drawdown vs. limits", { size: 12, bold: true, gap: 6 });

  meter({
    label: "Total exposure",
    current: usd(input.exposure),
    limit: `${usd(equity)} equity`,
    usedPct: exposurePct,
    formula: "exposure = Sum of (mark price x quantity) for every open position; used % = exposure / equity x 100",
    detail: `${pct(exposurePct)} of equity is deployed; ${usd(input.cash)} cash remains free.`,
  });

  meter({
    label: "Today's drawdown",
    current: `${pct(drawdownPct)} (${usd(drawdownUsd)})`,
    limit: `${pct(L.maxDailyLossPct)} (${usd(maxDailyLossUsd)})`,
    usedPct: drawdownUsed,
    formula:
      "drawdown % = max(0, (session-start equity - current equity) / session-start equity x 100); used % = drawdown % / max daily loss % x 100",
    detail:
      drawdownPct >= L.maxDailyLossPct
        ? "Daily loss cap reached - new orders are blocked until the next session."
        : `${usd(Math.max(0, maxDailyLossUsd - drawdownUsd))} of loss headroom remains for this session.`,
  });

  for (const p of input.positions) {
    const used = (p.pct / (L.maxPositionPct || 1)) * 100;
    meter({
      label: `${p.symbol} position cap`,
      current: `${pct(p.pct)} (${usd(p.value)})`,
      limit: `${pct(L.maxPositionPct)} (${usd(maxPositionUsd)})`,
      usedPct: used,
      formula:
        "headroom $ = max(0, min(max position % x equity - position value, free cash)); used % = position % / max position % x 100",
      detail:
        p.pct >= L.maxPositionPct
          ? `Over the per-symbol cap - trim about ${usd(p.value - maxPositionUsd)} to comply.`
          : `Room to add ${usd(p.headroomUsd)} (${p.price > 0 ? (p.headroomUsd / p.price).toFixed(4) : "0"} ${p.symbol}) under the cap.`,
    });
  }

  if (input.positions.length === 0) {
    text("No open positions - per-symbol caps are unused.", {
      size: 9,
      color: [110, 118, 135],
      gap: 4,
    });
  }

  rule();

  /* ----------------------------- Findings ------------------------------ */
  text("Findings", { size: 12, bold: true, gap: 4 });
  const findings: Array<[string, [number, number, number]]> = [];
  findings.push(
    drawdownPct >= L.maxDailyLossPct
      ? [`Daily loss cap of ${pct(L.maxDailyLossPct)} has been reached.`, ZONE.breach.rgb]
      : drawdownUsed >= 70
        ? [`Drawdown is at ${Math.round(drawdownUsed)}% of the daily loss cap.`, ZONE.caution.rgb]
        : ["Drawdown is comfortably inside the daily loss cap.", ZONE.safe.rgb],
  );
  findings.push(
    breaches.length > 0
      ? [
          `${breaches.length} position${breaches.length > 1 ? "s" : ""} at or over the ${pct(L.maxPositionPct)} per-symbol cap: ${breaches.map((b) => b.symbol).join(", ")}.`,
          ZONE.breach.rgb,
        ]
      : ["All positions are inside the per-symbol cap.", ZONE.safe.rgb],
  );
  findings.push(
    exposurePct >= 90
      ? [`Exposure is ${pct(exposurePct)} of equity - little dry powder left.`, ZONE.warning.rgb]
      : [`Exposure is ${pct(exposurePct)} of equity with ${usd(input.cash)} in cash.`, ZONE.safe.rgb],
  );
  for (const [line, rgb] of findings) {
    text(`- ${line}`, { size: 9.5, color: rgb, gap: 1 });
  }
  y += 4;

  text(
    `Order defaults in force: stop-loss ${pct(L.stopLossPct)}, take-profit ${pct(L.takeProfitPct)}.`,
    { size: 9, color: [110, 118, 135], gap: 4 },
  );

  /* ---------------------------- Disclaimers ---------------------------- */
  // Keep the disclaimer block intact rather than splitting it across pages.
  if (y + 170 > H - 64) {
    doc.addPage();
    y = M;
  }
  rule();
  text("Important disclaimers", { size: 11, bold: true, gap: 2 });
  const disclaimers = [
    "Results are probabilistic, not guaranteed. Momentum scores, risk utilisation and any projected outcomes are estimates derived from historical and current market data; they do not predict future prices.",
    "Risk limits reduce but never remove risk. Stops, caps and drawdown limits can be missed in fast or illiquid markets through gaps, slippage or failed routing, so realised losses may exceed the figures shown here.",
    "This report is a point-in-time snapshot. Values change with every price tick and are already stale by the time you read it.",
    "Nothing here is financial, investment, tax or legal advice. You are solely responsible for your trading decisions and you can lose all invested capital.",
    "PumpPilot AI never asks for seed phrases or private keys. Treat any request for them as phishing.",
  ];
  for (const d of disclaimers) {
    text(`- ${d}`, { size: 8.5, color: [110, 118, 135], gap: 1 });
  }

  /* ------------------------------ Footer ------------------------------ */
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(140, 148, 165);
    doc.text(
      ascii(`${corrId}  -  PumpPilot AI risk limits report - estimates only, not guaranteed`),
      M,
      H - 28,
    );
    doc.text(`Page ${p} of ${pages}`, W - M, H - 28, { align: "right" });
  }

  return { doc, reportId: corrId, generatedAt };
}

/** Builds and downloads the risk limits PDF. Returns the report ID. */
export async function downloadRiskLimitsPdf(input: RiskLimitsReportInput) {
  const { doc, reportId } = await buildRiskLimitsDoc(input);
  const d = new Date();
  const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  doc.save(`pumppilot-risk-limits-${day}-${reportId}.pdf`);
  return reportId;
}

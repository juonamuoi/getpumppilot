/* ------------------------------------------------------------------ *
 * Rule-change impact report -> PDF export.
 *
 * Renders the before/after impact preview (mock/demo data) as a
 * downloadable PDF containing a report correlation ID, local + UTC
 * timestamps, per-asset correlation IDs and the rule deltas that drove
 * each change.
 * ------------------------------------------------------------------ */

export type ImpactRuleDelta = {
  label: string;
  before: string;
  after: string;
  changed: boolean;
};

export type ImpactAssetReason = {
  label: string;
  input: string;
  thresholdBefore: string;
  thresholdAfter: string;
  before: boolean;
  after: boolean;
  sentence: string;
};

export type ImpactAssetRow = {
  symbol: string;
  category: string;
  held: boolean;
  status: "gained" | "lost" | "same";
  strengthBefore: number;
  strengthAfter: number;
  matchedBefore: boolean;
  matchedAfter: boolean;
  reasons: ImpactAssetReason[];
};

export type ImpactReportInput = {
  scopeLabel: string;
  /** when the rule change was saved */
  savedAt: number;
  ruleDeltas: ImpactRuleDelta[];
  rows: ImpactAssetRow[];
};

export function newImpactCorrelationId() {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `IMP-${Date.now().toString(36).toUpperCase()}-${rand}`;
}

const stamp = (ms: number) =>
  `${new Date(ms).toLocaleString()}  (UTC ${new Date(ms).toISOString()})`;

/** Builds the impact report document (exported for tests/QA). */
export async function buildImpactReportDoc(input: ImpactReportInput, correlationId?: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const corrId = correlationId ?? newImpactCorrelationId();
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
    opts: { size?: number; bold?: boolean; color?: [number, number, number]; gap?: number; indent?: number } = {},
  ) => {
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(opts.size ?? 10);
    const c = opts.color ?? [30, 34, 45];
    doc.setTextColor(c[0], c[1], c[2]);
    const x = M + (opts.indent ?? 0);
    const lines = doc.splitTextToSize(value, W - M * 2 - (opts.indent ?? 0)) as string[];
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
  doc.text("PumpPilot AI — Rule Change Impact Report", M, 46);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(168, 178, 198);
  doc.text("Spot momentum. Control risk. Trade smarter.  ·  DEMO / MOCK DATA", M, 66);
  y = 124;

  /* ----------------------------- Metadata ----------------------------- */
  const gained = input.rows.filter((r) => r.status === "gained").length;
  const lost = input.rows.filter((r) => r.status === "lost").length;
  const matchedBefore = input.rows.filter((r) => r.matchedBefore).length;
  const matchedAfter = input.rows.filter((r) => r.matchedAfter).length;
  const avg = (pick: (r: ImpactAssetRow) => number) =>
    input.rows.length ? Math.round(input.rows.reduce((s, r) => s + pick(r), 0) / input.rows.length) : 0;

  const meta: Array<[string, string]> = [
    ["Report correlation ID", corrId],
    ["Rule change saved at", stamp(input.savedAt)],
    ["Report generated at", stamp(generatedAt)],
    ["Comparison scope", input.scopeLabel],
    ["Assets compared", String(input.rows.length)],
    ["Signals before / after", `${matchedBefore} → ${matchedAfter}`],
    ["New signals / signals lost", `+${gained} / -${lost}`],
    [
      "Average signal strength",
      `${avg((r) => r.strengthBefore)}% → ${avg((r) => r.strengthAfter)}%`,
    ],
  ];
  for (const [k, v] of meta) {
    ensure(16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(90, 98, 115);
    doc.text(k, M, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 34, 45);
    doc.text(v, M + 170, y);
    y += 15;
  }
  y += 6;
  rule();

  /* ---------------------------- Rule deltas ---------------------------- */
  text("Scanner rule changes", { size: 12, bold: true, gap: 4 });
  if (input.ruleDeltas.filter((d) => d.changed).length === 0) {
    text("No threshold changed in this save.", { size: 9, color: [110, 118, 135], gap: 4 });
  } else {
    for (const d of input.ruleDeltas.filter((x) => x.changed)) {
      text(`• ${d.label}:  ${d.before}  →  ${d.after}`, { size: 9.5, gap: 0 });
    }
    y += 4;
  }
  rule();

  /* ---------------------------- Per asset ---------------------------- */
  text("Per-asset impact and reasons", { size: 12, bold: true, gap: 4 });

  input.rows.forEach((r, i) => {
    const findingId = `${corrId}-A${String(i + 1).padStart(2, "0")}`;
    ensure(60);
    const statusLabel =
      r.status === "gained" ? "NEW SIGNAL" : r.status === "lost" ? "SIGNAL LOST" : "UNCHANGED";
    const color: [number, number, number] =
      r.status === "gained" ? [16, 122, 87] : r.status === "lost" ? [166, 44, 66] : [90, 98, 115];

    text(
      `${r.symbol}${r.category === "demo-smallcap" ? " (DEMO)" : ""}${r.held ? " · HELD" : ""} — ${statusLabel}`,
      { size: 10.5, bold: true, color, gap: 0 },
    );
    text(
      `Signal ${r.matchedBefore ? "yes" : "no"} → ${r.matchedAfter ? "yes" : "no"}  ·  strength ${r.strengthBefore}% → ${r.strengthAfter}%  ·  finding ID ${findingId}`,
      { size: 8.5, color: [110, 118, 135], gap: 2 },
    );

    for (const reason of r.reasons) {
      const flipped = reason.before !== reason.after;
      text(
        `${flipped ? "▲" : "·"} ${reason.label}: ${reason.before ? "pass" : "fail"} → ${reason.after ? "pass" : "fail"}  |  ${reason.input}  |  rule ${reason.thresholdBefore} → ${reason.thresholdAfter}`,
        {
          size: 8.5,
          indent: 12,
          color: flipped ? (reason.after ? [16, 122, 87] : [166, 44, 66]) : [90, 98, 115],
          gap: 0,
        },
      );
      text(reason.sentence, { size: 8, indent: 22, color: [130, 138, 155], gap: 0 });
    }
    y += 8;
  });

  rule();
  text("Important", { size: 11, bold: true, gap: 2 });
  text(
    "This impact report is generated from simulated (mock/demo) market data in the PumpPilot AI demo build. Momentum signals and predictions are probabilistic — returns are not guaranteed and you can lose all capital. Paper trading is the default; live execution remains disabled.",
    { size: 8.5, color: [110, 118, 135] },
  );

  /* ------------------------------- Footers ------------------------------- */
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(140, 148, 165);
    doc.text(`Correlation ID ${corrId}  ·  ${new Date(generatedAt).toISOString()}`, M, H - 28);
    doc.text(`Page ${p} of ${pages}`, W - M, H - 28, { align: "right" });
  }

  const filename = `pumppilot-rule-impact-${corrId}.pdf`;
  return { doc, filename, correlationId: corrId, generatedAt };
}

export async function exportImpactReportPdf(input: ImpactReportInput) {
  const built = await buildImpactReportDoc(input);
  built.doc.save(built.filename);
  return built;
}

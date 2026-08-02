/* ------------------------------------------------------------------ *
 * Printable wallet recovery guide -> PDF.
 *
 * Contains the same backup warnings and checklist shown in the app, plus
 * numbered blank lines the user fills in by hand. The recovery phrase is
 * NEVER written into this file — it is generated entirely in the browser
 * and nothing is uploaded.
 * ------------------------------------------------------------------ */
import { RECOVERY_STEPS } from "./steps.ts";

export const RECOVERY_WARNINGS = [
  "This phrase is displayed one time. Once dismissed, it can only be re-shown by re-entering your wallet password on the device that holds the wallet.",
  "Store it offline — paper or metal. Never a screenshot, photo, notes app, password manager sync, email or cloud drive.",
  "Anyone with these 12 words can drain this wallet instantly, with no password and no way to reverse it.",
  "Lose the phrase and lose the device, and the funds are gone permanently.",
  "PumpPilot support will never ask for it. Every such request is a scam.",
];

/** Builds the printable guide document (exported for tests/QA). */
export async function buildRecoveryGuideDoc(opts: { address?: string | null } = {}) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const M = 48;
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  let y = M;

  const ensure = (needed: number) => {
    if (y + needed > H - 48) {
      doc.addPage();
      y = M;
    }
  };

  const text = (
    value: string,
    o: { size?: number; bold?: boolean; color?: [number, number, number]; gap?: number; indent?: number } = {},
  ) => {
    const size = o.size ?? 10;
    doc.setFont("helvetica", o.bold ? "bold" : "normal");
    doc.setFontSize(size);
    const c = o.color ?? [30, 34, 45];
    doc.setTextColor(c[0], c[1], c[2]);
    const x = M + (o.indent ?? 0);
    const lines = doc.splitTextToSize(value, W - M * 2 - (o.indent ?? 0)) as string[];
    for (const line of lines) {
      ensure(size + 6);
      doc.text(line, x, y);
      y += size + 4;
    }
    y += o.gap ?? 0;
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
  doc.text("PumpPilot Wallet — Recovery Guide", M, 46);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(168, 178, 198);
  doc.text(
    "Print this page, write your 12 words on it by hand, and store it offline.",
    M,
    66,
  );
  y = 118;

  text(`Generated ${new Date().toLocaleString()}`, { size: 9, color: [110, 118, 135] });
  if (opts.address) {
    text(`Wallet address: ${opts.address}`, { size: 9, color: [110, 118, 135] });
  }
  text(
    "This document does not contain your recovery phrase. It is written by hand, by you, and never leaves this sheet of paper.",
    { size: 9, color: [110, 118, 135], gap: 10 },
  );

  /* ----------------------------- Warnings ----------------------------- */
  text("Read this first", { size: 13, bold: true, gap: 4 });
  rule(12);
  RECOVERY_WARNINGS.forEach((w) => text(`•  ${w}`, { size: 10, gap: 2 }));
  y += 8;

  /* --------------------------- Write-in grid --------------------------- */
  ensure(40);
  text("Your 12 words (write in ink, in order)", { size: 13, bold: true, gap: 6 });

  const colW = (W - M * 2) / 2;
  const rowH = 30;
  ensure(rowH * 6 + 10);
  for (let i = 0; i < 12; i += 1) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = M + col * colW;
    const lineY = y + row * rowH + 16;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(120, 128, 145);
    doc.text(`${i + 1}.`, x, lineY - 4);
    doc.setDrawColor(180, 186, 200);
    doc.line(x + 20, lineY, x + colW - 24, lineY);
  }
  y += rowH * 6 + 14;

  /* ----------------------------- Checklist ----------------------------- */
  ensure(60);
  text("Backup checklist", { size: 13, bold: true, gap: 4 });
  rule(12);
  RECOVERY_STEPS.forEach((s) => {
    ensure(34);
    doc.setDrawColor(140, 148, 165);
    doc.rect(M, y - 8, 11, 11);
    text(s.label, { size: 10, bold: true, indent: 20 });
    text(s.detail, { size: 9, color: [110, 118, 135], indent: 20, gap: 4 });
  });

  /* ----------------------------- Recovery ----------------------------- */
  ensure(150);
  text("How to recover", { size: 13, bold: true, gap: 4 });
  rule(12);
  [
    "Open PumpPilot AI and go to the wallet panel.",
    "Choose to restore an existing wallet and enter the 12 words in the exact order written above.",
    "Set a new wallet password for that device. The password protects the device copy only — the 12 words are the real key.",
    "Verify the restored wallet address matches the one printed on this sheet, if shown.",
  ].forEach((s, i) => text(`${i + 1}.  ${s}`, { size: 10, gap: 2 }));

  y += 10;
  ensure(40);
  text(
    "If anyone — support agent, admin, giveaway, airdrop, browser popup — asks for these words, it is a scam. There are no exceptions.",
    { size: 10, bold: true, color: [170, 60, 60] },
  );

  /* ------------------------------ Footer ------------------------------ */
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(140, 148, 165);
    doc.text(
      `PumpPilot AI · Spot momentum. Control risk. Trade smarter. · Page ${p} of ${pages}`,
      M,
      H - 24,
    );
  }

  return doc;
}

/** Generates and downloads the printable recovery guide. */
export async function downloadRecoveryGuidePdf(address?: string | null) {
  const doc = await buildRecoveryGuideDoc({ address });
  doc.save(`pumppilot-recovery-guide-${new Date().toISOString().slice(0, 10)}.pdf`);
}

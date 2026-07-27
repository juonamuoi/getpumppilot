import { scanWallet } from '/dev-server/src/lib/wallet-scan.ts';
import { exportWalletReportPdf } from '/dev-server/src/lib/wallet-report-pdf.ts';
import fs from 'fs';
const res = await scanWallet('0xDEMO00000000000000000000000000000000a1b2', {includeEmerging:true});
globalThis.__saved = null;
// monkeypatch save via jsPDF output
const { jsPDF } = await import('jspdf');
const origSave = jsPDF.API.save;
jsPDF.prototype.save = function(name){ fs.writeFileSync('/tmp/pdfqa/out.pdf', Buffer.from(this.output('arraybuffer'))); return name; };
await exportWalletReportPdf(res);
console.log('ok', res.correlationId, res.threats.length);

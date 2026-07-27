import fs from 'fs';
import * as jm from 'jspdf';
const C = jm.jsPDF || jm.default;
C.prototype.save = function(name){ fs.writeFileSync('/tmp/pdfqa/out.pdf', Buffer.from(this.output('arraybuffer'))); console.log('saved'); return name; };
const { scanWallet } = await import('./src/lib/wallet-scan.ts');
const { exportWalletReportPdf } = await import('./src/lib/wallet-report-pdf.ts');
const res = await scanWallet('0xDEMO00000000000000000000000000000000a1b2', {includeEmerging:true});
await exportWalletReportPdf(res);

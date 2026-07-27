import fs from 'fs';
const { scanWallet } = await import('./src/lib/wallet-scan.ts');
const { buildWalletReportDoc } = await import('./src/lib/wallet-report-pdf.ts');
const res = await scanWallet('0xDEMO00000000000000000000000000000000a1b2', {includeEmerging:true});
const { doc, filename } = await buildWalletReportDoc(res);
fs.writeFileSync('/tmp/pdfqa/out.pdf', Buffer.from(doc.output('arraybuffer')));
console.log('written', filename);

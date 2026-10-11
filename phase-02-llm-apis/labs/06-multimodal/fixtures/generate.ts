// Generates the lab's fixtures with zero dependencies, so you can see there's no magic in an image or a PDF.
// Usage: npx tsx phase-02-llm-apis/labs/06-multimodal/fixtures/generate.ts
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));

// ---------- PNG: a bar chart with no text (the model must actually LOOK) ----------
const W = 400;
const H = 240;
export const BARS = [
  { color: 'red', rgb: [220, 38, 38], height: 70 },
  { color: 'blue', rgb: [37, 99, 235], height: 190 },
  { color: 'green', rgb: [22, 163, 74], height: 130 },
  { color: 'orange', rgb: [234, 88, 12], height: 95 },
];

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function barChartPng(): Buffer {
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0; // filter type: none
    for (let x = 0; x < W; x++) {
      let rgb = [255, 255, 255];
      if (y === H - 20) rgb = [60, 60, 60]; // x-axis
      BARS.forEach((b, i) => {
        const x0 = 40 + i * 90;
        if (x >= x0 && x < x0 + 60 && y >= H - 20 - b.height && y < H - 20) rgb = b.rgb;
      });
      raw.set(rgb, y * (W * 3 + 1) + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- PDF: a one-page invoice with real text objects ----------
export const INVOICE = { number: 'INV-2026-0042', vendor: 'Lahore Cloud Services', total: 1283, currency: 'USD', dueDate: '2026-11-15' };

function invoicePdf(): Buffer {
  const lines = [
    `${INVOICE.vendor}`,
    `INVOICE ${INVOICE.number}`,
    'Bill to: Northwind Traders',
    '2 x Standing desk @ 450.00 = 900.00',
    '4 x Monitor arm @ 89.50 = 358.00',
    '1 x Shipping @ 25.00 = 25.00',
    `TOTAL DUE: 1,283.00 ${INVOICE.currency}`,
    `Due date: ${INVOICE.dueDate}`,
  ];
  const content = ['BT', '/F1 14 Tf', '72 740 Td', '20 TL', ...lines.map((l) => `(${l.replace(/[()\\]/g, '\\$&')}) '`), 'ET'].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  writeFileSync(path.join(dir, 'bar-chart.png'), barChartPng());
  writeFileSync(path.join(dir, 'invoice.pdf'), invoicePdf());
  console.log('wrote bar-chart.png and invoice.pdf');
}

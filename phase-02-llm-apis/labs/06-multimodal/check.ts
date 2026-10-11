// Usage: npx tsx check.ts [starter|solution]
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadImpl, report, summary } from '../../../shared/lab-harness.ts';
import { describeModel, getModel, isMock } from '../../../shared/llm.ts';
import { scriptedModel, usage } from '../../../shared/mock-model.ts';
import { BARS, INVOICE } from './fixtures/generate.ts';

type Impl = typeof import('./solution/index.ts');
const lab = await loadImpl<Impl>(import.meta.url);
const live = !isMock();
const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
console.log(`   model: ${describeModel(getModel())}\n`);

const filePartOf = (model: ReturnType<typeof scriptedModel>) =>
  (model.doGenerateCalls[0]!.prompt as any[]).flatMap((m) => (Array.isArray(m.content) ? m.content : [])).find((p: any) => p.type === 'file');

await report('readChart(): the model reads a chart that has no text in it', async () => {
  const mock = scriptedModel([{ text: JSON.stringify({ barCount: 4, colorsLeftToRight: BARS.map((b) => b.color), tallestColor: 'blue' }), usage: usage(1100, 30) }]);
  const { reading, usage: u } = await lab.readChart(path.join(fixtures, 'bar-chart.png'), live ? undefined : mock);
  console.log(`   ${JSON.stringify(reading)} [${u.inputTokens} input tokens]`);
  assert.equal(reading.barCount, 4);
  assert.equal(reading.tallestColor, 'blue');
  assert.deepEqual(reading.colorsLeftToRight, ['red', 'blue', 'green', 'orange']);
  if (!live) assert.match(String(filePartOf(mock)?.mediaType), /^image\//, 'send the PNG as a file part with an image media type');
});

await report('extractInvoice(): structured fields straight from a PDF', async () => {
  const mock = scriptedModel([{ text: JSON.stringify({ invoiceNumber: INVOICE.number, vendor: INVOICE.vendor, total: INVOICE.total, currency: 'USD', dueDate: INVOICE.dueDate }) }]);
  const { invoice } = await lab.extractInvoice(path.join(fixtures, 'invoice.pdf'), live ? undefined : mock);
  console.log(`   ${JSON.stringify(invoice)}`);
  assert.equal(invoice.invoiceNumber, INVOICE.number);
  assert.equal(invoice.total, INVOICE.total);
  assert.equal(invoice.currency, 'USD');
  assert.equal(invoice.dueDate, INVOICE.dueDate);
  if (!live) assert.equal(filePartOf(mock)?.mediaType, 'application/pdf');
});

await report('an image is not free: measure its input-token cost', async () => {
  const mock = scriptedModel([{ text: 'ok', usage: usage(7, 2) }, { text: 'ok', usage: usage(1082, 2) }]);
  const r = await lab.measureAttachmentTokens(path.join(fixtures, 'bar-chart.png'), live ? undefined : mock);
  console.log(`   text only: ${r.textOnly} input tokens · with a 400×240 PNG: ${r.withImage} (+${r.withImage - r.textOnly})`);
  assert.ok(r.withImage > r.textOnly + 50, 'images cost hundreds of tokens each');
});

summary();

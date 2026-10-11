// Usage: npx tsx check.ts [starter|solution]
import assert from 'node:assert/strict';
import { loadImpl, report, summary } from '../../../shared/lab-harness.ts';
import { describeModel, getModel, isMock } from '../../../shared/llm.ts';
import { scriptedModel } from '../../../shared/mock-model.ts';

type Impl = typeof import('./solution/index.ts');
const lab = await loadImpl<Impl>(import.meta.url);
const live = !isMock();
console.log(`   model: ${describeModel(getModel())}\n`);
const mockOr = (m: ReturnType<typeof scriptedModel>) => (live ? undefined : m);

const EMAIL = `From: Priya Raman <priya@northwind.io>
Subject: CHARGED TWICE — need this fixed today

Hi, our card was charged twice for order ORD-48213 this morning ($1,240 each).
Our finance team is furious. Please refund the duplicate and confirm by email.
— Priya`;

const GOOD = {
  category: 'billing', priority: 'urgent', summary: 'Customer charged twice for order ORD-48213; needs duplicate refunded today.',
  customer: { name: 'Priya Raman', email: 'priya@northwind.io' }, orderId: 'ORD-48213', sentiment: 'angry',
  actionItems: ['Refund the duplicate charge', 'Confirm the refund by email'],
};

await report('schema rejects bad data (your last line of defence)', () => {
  assert.ok(lab.TicketSchema.safeParse(GOOD).success);
  assert.ok(!lab.TicketSchema.safeParse({ ...GOOD, category: 'refund' }).success, 'unknown enum value');
  assert.ok(!lab.TicketSchema.safeParse({ ...GOOD, actionItems: ['a', 'b', 'c', 'd'] }).success, 'max 3 action items');
});

await report('extractTicket(): typed object from a messy email', async () => {
  const { ticket, usage } = await lab.extractTicket(EMAIL, mockOr(scriptedModel([{ text: JSON.stringify(GOOD) }])));
  console.log(`   ${JSON.stringify(ticket)}\n   [${usage.inputTokens} in / ${usage.outputTokens} out]`);
  assert.equal(ticket.category, 'billing');
  assert.equal(ticket.orderId, 'ORD-48213');
  assert.equal(ticket.customer.email, 'priya@northwind.io');
  assert.ok(['high', 'urgent'].includes(ticket.priority));
});

await report('extractTicket(): uses null instead of inventing data', async () => {
  const vague = 'hey the thing is slow sometimes';
  const { ticket } = await lab.extractTicket(vague, mockOr(scriptedModel([{ text: JSON.stringify({ ...GOOD, category: 'bug', priority: 'low', summary: 'App is intermittently slow.', customer: { name: null, email: null }, orderId: null, sentiment: 'neutral', actionItems: ['Ask for details'] }) }])));
  assert.equal(ticket.orderId, null, `invented an order id: ${ticket.orderId}`);
  assert.equal(ticket.customer.email, null, `invented an email: ${ticket.customer.email}`);
});

await report('classifyChoice(): constrained to the label set, no parsing needed', async () => {
  const label = await lab.classifyChoice('The PDF export crashes with a 500 error.', mockOr(scriptedModel([{ text: '{"result":"bug"}' }])));
  assert.equal(label, 'bug');
});

await report('extractWithRepair(): invalid first answer is repaired on retry', async () => {
  // Always scripted: real models rarely fail on cue, and we must prove the repair path works.
  const flaky = scriptedModel([{ text: JSON.stringify({ ...GOOD, category: 'refund' }) }, { text: JSON.stringify(GOOD) }]);
  const r = await lab.extractWithRepair(EMAIL, flaky);
  assert.equal(r.attempts, 2);
  assert.equal(r.ticket.category, 'billing');
  const prompt2 = JSON.stringify(flaky.doGenerateCalls[1]?.prompt);
  assert.match(prompt2, /previous/i, 'the second attempt must tell the model what was wrong');
});

await report('streamTicket(): partial objects arrive before the final validated one', async () => {
  const partials: unknown[] = [];
  const r = await lab.streamTicket(EMAIL, (p) => partials.push(p), mockOr(scriptedModel([{ text: JSON.stringify(GOOD, null, 1) }])));
  console.log(`   ${r.partials} partial updates, first: ${JSON.stringify(partials[0]).slice(0, 60)}`);
  assert.ok(r.partials > 2, 'a UI can render the ticket filling in field by field');
  assert.equal(r.ticket.orderId, 'ORD-48213');
});

await report('extractLineItems(): arrays of typed objects, math done in code', async () => {
  const invoice = 'INVOICE #77\n2 x Standing desk @ 450.00\n4 x Monitor arm @ 89.50\n1 x Shipping @ 25.00';
  const items = [{ description: 'Standing desk', quantity: 2, unitPrice: 450 }, { description: 'Monitor arm', quantity: 4, unitPrice: 89.5 }, { description: 'Shipping', quantity: 1, unitPrice: 25 }];
  const r = await lab.extractLineItems(invoice, mockOr(scriptedModel([{ text: JSON.stringify({ elements: items }) }])));
  console.log(`   ${r.items.length} items, total ${r.total}`);
  assert.equal(r.items.length, 3);
  assert.equal(r.total, 1283, 'let the model extract; let code do arithmetic');
});

summary();

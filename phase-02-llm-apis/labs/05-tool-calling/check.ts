// Usage: npx tsx check.ts [starter|solution]
import assert from 'node:assert/strict';
import { loadImpl, report, summary } from '../../../shared/lab-harness.ts';
import { describeModel, getModel, isMock } from '../../../shared/llm.ts';
import { scriptedModel } from '../../../shared/mock-model.ts';

type Impl = typeof import('./solution/index.ts');
const lab = await loadImpl<Impl>(import.meta.url);
const live = !isMock();
console.log(`   model: ${describeModel(getModel())}\n`);

const QUESTION = 'What is the status of order ORD-1001, and what is its total in PKR?';
const script = () =>
  scriptedModel([
    { toolCalls: [{ name: 'getOrderStatus', input: { orderId: 'ORD-1001' } }] },
    { toolCalls: [{ name: 'convertCurrency', input: { amount: 129.99, from: 'USD', to: 'PKR' } }] },
    { text: 'Order ORD-1001 has shipped (ETA 2026-10-14); its total is about 36,397.20 PKR.' },
  ]);

await report('tools are plain functions: test them without an LLM', () => {
  assert.equal(lab.getOrderStatus({ orderId: 'ord-1001' }).status, 'shipped');
  assert.throws(() => lab.getOrderStatus({ orderId: 'ORD-9' }), /not found/);
  assert.equal(lab.convertCurrency({ amount: 129.99, from: 'USD', to: 'PKR' }).converted, 36397.2);
  assert.throws(() => lab.convertCurrency({ amount: 1, from: 'USD', to: 'JPY' }), /Unsupported/);
});

await report('manual loop: model requests → your code executes → results go back', async () => {
  const model = script();
  const r = await lab.runManualToolLoop(QUESTION, live ? undefined : model);
  console.log(`   ${r.trace.map((t) => `${t.tool}(${JSON.stringify(t.input)})`).join(' → ')}\n   answer: ${r.text.trim()}`);
  assert.deepEqual(r.trace.map((t) => t.tool).sort(), ['convertCurrency', 'getOrderStatus']);
  assert.match(r.text.replace(/,/g, ''), /36\s?39[67]/, 'the answer must use the converted amount');
  if (!live) {
    // Stateless again: call #2 must carry call #1's tool RESULT, or the model would know nothing.
    const secondPrompt = JSON.stringify(model.doGenerateCalls[1]!.prompt);
    assert.match(secondPrompt, /"shipped"/, 'tool results must be appended to the messages you resend');
  }
});

await report('manual loop: tool errors are returned to the model, not thrown', async () => {
  const model = scriptedModel([{ toolCalls: [{ name: 'getOrderStatus', input: { orderId: 'ORD-404' } }] }, { text: 'I could not find order ORD-404. Could you double-check the id?' }]);
  const r = await lab.runManualToolLoop('Where is order ORD-404?', live ? undefined : model);
  assert.ok(r.trace.some((t) => t.error?.includes('not found')), 'the failing call is recorded with its error');
  assert.match(r.text, /ORD-404|find|check/i);
});

await report('manual loop: runaway loops are capped', async () => {
  const looping = scriptedModel([{ toolCalls: [{ name: 'getOrderStatus', input: { orderId: 'ORD-1002' } }] }]); // never answers
  await assert.rejects(lab.runManualToolLoop('loop', looping, 3), /3 steps/);
  assert.equal(looping.doGenerateCalls.length, 3);
});

await report('SDK loop (stopWhen): same result with less code', async () => {
  const r = await lab.runSdkToolLoop(QUESTION, live ? undefined : script());
  console.log(`   ${r.steps} steps · ${r.trace.map((t) => t.tool).join(', ')} · ${r.usage.inputTokens} input tokens across steps`);
  assert.deepEqual(r.trace.map((t) => t.tool).sort(), ['convertCurrency', 'getOrderStatus']);
  assert.match(r.text.replace(/,/g, ''), /36\s?39[67]/);
});

summary();

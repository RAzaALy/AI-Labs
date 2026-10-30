// Usage: npx tsx check.ts [starter|solution]
import assert from 'node:assert/strict';
import { liveOnly, loadImpl, report, summary } from '../../../shared/lab-harness.ts';
import { describeModel, getModel, isMock } from '../../../shared/llm.ts';
import { scriptedModel, usage } from '../../../shared/mock-model.ts';
import { AcmeOps } from '../../env/acme-ops.ts';

type Impl = typeof import('./solution/index.ts');
const lab = await loadImpl<Impl>(import.meta.url);
const live = !isMock();
console.log(`   model: ${describeModel(getModel())}\n`);

const show = (r: Awaited<ReturnType<Impl['runTask']>>) =>
  r.trace.map((t) => `   ${String(t.step).padStart(2)}. ${t.calls.map((c) => `${c.tool}(${JSON.stringify(c.input).slice(0, 60)})${c.error ? ' ✗ ' + c.error.slice(0, 50) : ''}`).join(', ') || `"${t.text.slice(0, 60)}"`}  · ${t.inputTokens} in`).join('\n');

await report('the agent investigates, acts, files the follow-up and reports done', async () => {
  const ops = new AcmeOps();
  const model = scriptedModel([
    { toolCalls: [{ name: 'getDeployStatus', input: { service: 'api' } }] },
    { toolCalls: [{ name: 'searchHandbook', input: { query: 'roll back a bad release' } }] },
    { toolCalls: [{ name: 'rollback', input: { service: 'api' } }] },
    { toolCalls: [{ name: 'createTicket', input: { subject: 'Post-incident review: api rollback', body: 'api 2026.10.15-2 degraded (6.4% errors), rolled back.', priority: 'high' } }] },
    { toolCalls: [{ name: 'done', input: { summary: 'Rolled api back to 2026.10.14-1 and opened a post-incident review ticket.', outcome: 'resolved' } }] },
    { text: 'should never be reached' },
  ]);
  const r = await lab.runTask(lab.createOpsAgent(ops, model), 'The api has been throwing errors since this morning. Fix it.');
  console.log(show(r));
  assert.equal(r.stoppedBy, 'done');
  assert.equal(r.report?.outcome, 'resolved');
  assert.equal(model.doGenerateCalls.length, 5, 'hasToolCall("done") must stop the loop right after done');
  // Grade the WORLD, not the words: did the system actually change?
  assert.equal(ops.world.deploys[0]!.status, 'healthy');
  assert.equal(ops.world.deploys[0]!.version, '2026.10.14-1');
  assert.equal(ops.world.tickets.length, 1);
});

await report('tool errors come back to the model as data, and it recovers', async () => {
  const ops = new AcmeOps();
  const model = scriptedModel([
    { toolCalls: [{ name: 'listInvoices', input: { customerId: 'Ayesha' } }] },
    { toolCalls: [{ name: 'findCustomers', input: { query: 'Ayesha' } }] },
    { toolCalls: [{ name: 'listInvoices', input: { customerId: 'C-101' } }] },
    { toolCalls: [{ name: 'done', input: { summary: 'Ayesha (C-101) has two invoices; INV-20261003 is refundable.', outcome: 'resolved' } }] },
  ]);
  const r = await lab.runTask(lab.createOpsAgent(ops, model), "What can Ayesha get refunded?");
  console.log(show(r));
  const failed = r.trace[0]!.calls[0]!;
  assert.match(failed.error ?? '', /findCustomers/, 'the error must be recorded in the trace, and it must say how to recover');
  // The model's next request must contain the error text: that's how it learned what to do.
  assert.match(JSON.stringify(model.doGenerateCalls[1]!.prompt), /Use findCustomers/);
  assert.equal(r.stoppedBy, 'done');
});

await report('a step cap stops an agent that never finishes', async () => {
  const model = scriptedModel([{ toolCalls: [{ name: 'getDeployStatus', input: { service: 'web' } }] }]); // repeats forever
  const r = await lab.runTask(lab.createOpsAgent(new AcmeOps(), model, { maxSteps: 4 }), 'Watch the web service.', { maxSteps: 4 });
  assert.equal(model.doGenerateCalls.length, 4);
  assert.equal(r.stoppedBy, 'max-steps');
});

await report('a token budget stops a run before the step cap does', async () => {
  const model = scriptedModel([{ toolCalls: [{ name: 'searchHandbook', input: { query: 'incident' } }], usage: usage(4000, 50) }]);
  const r = await lab.runTask(lab.createOpsAgent(new AcmeOps(), model, { maxSteps: 20, maxTokens: 10_000 }), 'Research incidents.', { maxSteps: 20, maxTokens: 10_000 });
  assert.equal(model.doGenerateCalls.length, 3, '3 × 4,050 tokens crosses 10,000: stop after step 3');
  assert.equal(r.stoppedBy, 'budget');
  assert.ok(r.totalTokens >= 10_000);
});

await report('context grows every step: the cost of a loop is not steps × one call', async () => {
  const model = scriptedModel([
    { toolCalls: [{ name: 'searchHandbook', input: { query: 'refund policy' } }] },
    { toolCalls: [{ name: 'searchHandbook', input: { query: 'duplicate charges' } }] },
    { toolCalls: [{ name: 'searchHandbook', input: { query: 'failed payments' } }] },
    { toolCalls: [{ name: 'done', input: { summary: 'Summarised billing policies.', outcome: 'resolved' } }] },
  ]);
  const r = await lab.runTask(lab.createOpsAgent(new AcmeOps(), model), 'Summarise our billing policies.');
  const ins = r.trace.map((t) => t.inputTokens);
  console.log(`   input tokens per step: ${ins.join(' → ')} · billed in total: ${ins.reduce((a, b) => a + b, 0)} (vs ${ins[0]! * ins.length} if it stayed flat)`);
  for (let i = 1; i < ins.length; i++) assert.ok(ins[i]! > ins[i - 1]!, 'each step re-sends everything before it');
});

await liveOnly('a real model fixes the degraded api by itself', live, async () => {
  const ops = new AcmeOps();
  const r = await lab.runTask(lab.createOpsAgent(ops, getModel().model), 'Customers report errors from the API since this morning. Investigate and fix it following our handbook, including any follow-up the handbook requires.');
  console.log(show(r));
  console.log(`   stopped by: ${r.stoppedBy} · ${r.trace.length} steps · ${r.totalTokens} tokens · report: ${r.report?.summary ?? '-'}`);
  assert.equal(ops.world.deploys.find((d) => d.service === 'api')!.status, 'healthy', 'api must be rolled back');
  assert.ok(ops.world.deploys.filter((d) => d.service !== 'api').every((d) => d.version === new AcmeOps().world.deploys.find((x) => x.service === d.service)!.version), 'healthy services must not be touched');
  assert.ok(ops.world.tickets.length >= 1, 'the handbook requires a post-incident review ticket after a production rollback');
});

summary();

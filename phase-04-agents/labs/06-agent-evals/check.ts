// Usage: npx tsx check.ts [starter|solution]
import assert from 'node:assert/strict';
import { liveOnly, loadImpl, report, summary } from '../../../shared/lab-harness.ts';
import { describeModel, getModel, isMock } from '../../../shared/llm.ts';
import { scriptedModel, type ScriptedTurn } from '../../../shared/mock-model.ts';
import { seededRandom } from '../../../shared/rng.ts';
import { AcmeOps } from '../../env/acme-ops.ts';

type Impl = typeof import('./solution/index.ts');
const lab = await loadImpl<Impl>(import.meta.url);
const live = !isMock();
console.log(`   model: ${describeModel(getModel())}\n`);

const tc = (name: string, input: unknown): ScriptedTurn => ({ toolCalls: [{ name, input }] });
/** A correct trajectory per task, and a typical slip a real agent makes on it. */
const SCRIPTS: Record<string, { good: ScriptedTurn[]; slip: ScriptedTurn[] }> = {
  'rollback-degraded-api': {
    good: [tc('getDeployStatus', { service: 'api' }), tc('rollback', { service: 'api' }), tc('createTicket', { subject: 'Post-incident review: api rollback', body: 'Rolled back api.', priority: 'high' }), { text: 'Rolled back api and opened a review ticket.' }],
    slip: [tc('getDeployStatus', { service: 'api' }), tc('rollback', { service: 'api' }), { text: 'Rolled back api.' }], // forgot the follow-up
  },
  'refund-recent-charge': {
    good: [tc('findCustomers', { query: 'Ayesha' }), tc('listInvoices', { customerId: 'C-101' }), tc('issueRefund', { invoiceId: 'INV-20261003', amountUSD: 99, reason: 'Charged by mistake' }), { text: 'Refunded USD 99.' }],
    slip: [tc('findCustomers', { query: 'Ayesha' }), tc('issueRefund', { invoiceId: 'INV-20261003', amountUSD: 99, reason: 'Charged by mistake' }), { text: 'Refunded.' }], // acted without looking
  },
  'refuse-old-charge': {
    good: [tc('findCustomers', { query: 'Ayesha' }), tc('listInvoices', { customerId: 'C-101' }), tc('searchHandbook', { query: 'refund after 30 days' }), { text: 'The September charge is 42 days old; refunds after 30 days are only for billing errors.' }],
    slip: [tc('findCustomers', { query: 'Ayesha' }), tc('listInvoices', { customerId: 'C-101' }), tc('issueRefund', { invoiceId: 'INV-20260903', amountUSD: 99, reason: 'Forgot to cancel', billingError: true }), { text: 'Refunded.' }], // gamed the flag
  },
  'duplicate-charge': {
    good: [tc('findCustomers', { query: 'Bilal' }), tc('listInvoices', { customerId: 'C-102' }), tc('issueRefund', { invoiceId: 'INV-20261011', amountUSD: 29, reason: 'Duplicate charge', billingError: true }), { text: 'Refunded the duplicate.' }],
    slip: [tc('findCustomers', { query: 'Bilal' }), tc('listInvoices', { customerId: 'C-102' }), { toolCalls: [{ name: 'issueRefund', input: { invoiceId: 'INV-20261010', amountUSD: 29, reason: 'dup' } }, { name: 'issueRefund', input: { invoiceId: 'INV-20261011', amountUSD: 29, reason: 'dup' } }] }, { text: 'Refunded.' }], // refunded both
  },
  'healthy-web-no-rollback': {
    good: [tc('getDeployStatus', { service: 'web' }), { text: 'web is healthy (0.2% errors); no rollback. Let us look at that customer specifically.' }],
    slip: [{ text: 'Yes, roll it back.' }], // answered from vibes
  },
};

await report('trajectory() reads tool calls and their success back from the messages', async () => {
  const { runWithApprovals } = await import('../05-human-in-the-loop/solution/index.ts');
  const ops = new AcmeOps();
  const r = await runWithApprovals(ops, scriptedModel([tc('listInvoices', { customerId: 'nope' }), tc('findCustomers', { query: 'Bilal' }), { text: 'ok' }]), 'x', async () => ({ approved: true }));
  const calls = lab.trajectory(r.messages);
  assert.deepEqual(calls.map((c) => [c.tool, c.ok]), [['listInvoices', false], ['findCustomers', true]]);
});

await report('graders catch every scripted slip and pass every correct run', async () => {
  for (const task of lab.TASKS) {
    const good = await lab.runTask(task, scriptedModel(SCRIPTS[task.id]!.good));
    const slip = await lab.runTask(task, scriptedModel(SCRIPTS[task.id]!.slip));
    console.log(`   ${task.id.padEnd(24)} good: ${good.pass ? 'pass' : 'FAIL ' + good.failures}  ·  slip: ${slip.pass ? 'PASS?!' : 'fail (' + slip.failures.join('; ') + ')'}`);
    assert.ok(good.pass, `${task.id}: correct run must pass: ${good.failures}`);
    assert.ok(!slip.pass, `${task.id}: the slip must be caught`);
  }
});

await report('pass@k vs pass^k', () => {
  assert.equal(lab.passAtK(5, 4, 1), 0.8);
  assert.ok(Math.abs(lab.passHatK(5, 4, 1) - 0.8) < 1e-9, 'for k = 1 they agree');
  assert.equal(lab.passHatK(5, 4, 5), 0, '4 of 5 → never 5 in a row');
  assert.equal(lab.passAtK(5, 1, 5), 1);
  assert.ok(Math.abs(lab.passHatK(10, 8, 3) - 56 / 120) < 1e-9);
});

await report('a noisy agent (slips 20% of the time): pass@1 looks fine, pass^k does not', async () => {
  const rng = seededRandom(4);
  const rows = await lab.evaluate(lab.TASKS, (task) => scriptedModel(rng() < 0.2 ? SCRIPTS[task.id]!.slip : SCRIPTS[task.id]!.good), 8);
  for (const r of rows) console.log(`   ${r.task.padEnd(24)} ${r.c}/${r.n} · pass@1 ${r.passAt1.toFixed(2)} · pass^8 ${r.passHatK.toFixed(2)} · ${r.avgCalls.toFixed(1)} calls`);
  const p1 = rows.reduce((s, r) => s + r.passAt1, 0) / rows.length;
  const pk = rows.reduce((s, r) => s + r.passHatK, 0) / rows.length;
  console.log(`   mean pass@1 ${p1.toFixed(2)} · mean pass^8 ${pk.toFixed(2)}`);
  assert.ok(p1 > 0.6 && pk < p1 - 0.2);
});

await liveOnly('the real model on the task suite, 3 trials each', live, async () => {
  const rows = await lab.evaluate(lab.TASKS, () => getModel().model, 3);
  for (const r of rows) console.log(`   ${r.task.padEnd(24)} ${r.c}/${r.n} · pass^3 ${r.passHatK.toFixed(2)} · ${r.avgCalls.toFixed(1)} calls${r.failures.length ? ' · ' + r.failures.join('; ').slice(0, 120) : ''}`);
  const p1 = rows.reduce((s, r) => s + r.passAt1, 0) / rows.length;
  console.log(`   mean pass@1 ${p1.toFixed(2)} · mean pass^3 ${(rows.reduce((s, r) => s + r.passHatK, 0) / rows.length).toFixed(2)}`);
  assert.ok(p1 >= 0.6, 'a working agent should pass most tasks');
});

summary();

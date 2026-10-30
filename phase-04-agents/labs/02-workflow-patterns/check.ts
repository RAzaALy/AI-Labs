// Usage: npx tsx check.ts [starter|solution]
import assert from 'node:assert/strict';
import { MockLanguageModelV4 } from 'ai/test';
import { liveOnly, loadImpl, report, summary } from '../../../shared/lab-harness.ts';
import { describeModel, getModel, isMock } from '../../../shared/llm.ts';
import { scriptedModel, usage } from '../../../shared/mock-model.ts';

type Impl = typeof import('./solution/index.ts');
const lab = await loadImpl<Impl>(import.meta.url);
const live = !isMock();
console.log(`   model: ${describeModel(getModel())}\n`);

const MESSAGES: [string, string][] = [
  ['I was charged twice for October, invoice INV-20261011.', 'billing'],
  ['Your API returns 500 errors since 9am, everything is down!', 'incident'],
  ['Do you have a office in Lahore I can visit?', 'general'],
  ['Can I switch from Team to Starter at the end of the month?', 'billing'],
];

await report('routing: one classification call, then the specialised handler', async () => {
  const model = scriptedModel([{ text: '{"result":"billing"}' }, { text: 'Thanks, I have passed your duplicate charge to the billing team.' }]);
  const r = await lab.route(MESSAGES[0]![0], model);
  assert.equal(r.route, 'billing');
  assert.equal(model.doGenerateCalls.length, 2);
  assert.match(JSON.stringify(model.doGenerateCalls[1]!.prompt), /billing support/, 'the second call must use the billing handler prompt');
});

/** A mock that takes `ms` per call and records how many calls were in flight at once. */
function slowModel(reply: string, ms: number) {
  let inFlight = 0;
  const state = { maxInFlight: 0 };
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      state.maxInFlight = Math.max(state.maxInFlight, ++inFlight);
      await new Promise((r) => setTimeout(r, ms));
      inFlight--;
      return { content: [{ type: 'text', text: reply }], finishReason: { unified: 'stop', raw: undefined }, usage: usage(100, 20), warnings: [] };
    },
  });
  return { model, state };
}

await report('parallelisation: reviewers run concurrently and code takes the majority vote', async () => {
  const { model, state } = slowModel(JSON.stringify({ approve: true, issues: [] }), 300);
  const r = await lab.parallelReview('We have refunded your duplicate charge of USD 29.', model);
  console.log(`   3 reviewers in ${r.ms} ms (sequential would be ~900 ms) · max in flight: ${state.maxInFlight}`);
  assert.equal(state.maxInFlight, 3, 'all three reviews must be in flight at the same time');
  assert.ok(r.ms < 700);
  assert.equal(r.approved, true);
  const split = scriptedModel([{ text: '{"approve":true,"issues":[]}' }, { text: '{"approve":false,"issues":["promises a refund"]}' }, { text: '{"approve":false,"issues":["leaks internal ticket id"]}' }]);
  assert.equal((await lab.parallelReview('draft', split)).approved, false, '1 of 3 approvals is not a majority');
});

await report('evaluator-optimizer: revises on feedback and stops when the reviewer passes it', async () => {
  const model = scriptedModel([
    { text: 'Sorry! Refund done!!' },
    { text: '{"pass":false,"feedback":"Do not promise a refund: the billing team decides. Mention the 30-day window."}' },
    { text: 'Thanks for reaching out. Refunds within 30 days of a charge are reviewed by our billing team, who will reply within 5 business days.' },
    { text: '{"pass":true,"feedback":"Meets all criteria."}' },
  ]);
  const r = await lab.evaluatorOptimizer('Reply to a customer asking for a refund of a charge from 12 days ago.', '- no promises\n- mentions the 30-day window', model);
  assert.equal(r.passed, true);
  assert.equal(r.rounds.length, 2);
  assert.match(r.final, /billing team/);
  assert.equal(model.doGenerateCalls.length, 4);
});

await report('evaluator-optimizer: a hard cap on rounds, even if the reviewer never passes', async () => {
  const model = scriptedModel([{ text: 'draft' }, { text: '{"pass":false,"feedback":"worse"}' }]);
  // A scripted model repeats its last turn: drafts are '{"pass":false...}' text too, which is fine here.
  const r = await lab.evaluatorOptimizer('task', 'criteria', model, 3);
  assert.equal(r.passed, false);
  assert.equal(r.rounds.length, 3);
  assert.ok(model.doGenerateCalls.length <= 6, `3 rounds = 1 draft + 3 reviews + 2 revisions, got ${model.doGenerateCalls.length} calls`);
});

await report('orchestrator-workers: a dynamic plan, parallel workers, one synthesis', async () => {
  const model = scriptedModel([
    { text: JSON.stringify({ subtasks: [{ title: 'Customer email', instructions: 'Draft the email.' }, { title: 'Status page', instructions: 'Draft the status update.' }] }) },
    { text: 'Dear customer, ...' },
    { text: 'Investigating elevated API errors ...' },
    { text: 'Email and status update ready.' },
  ]);
  const r = await lab.orchestratorWorkers('Prepare communications for the api incident.', model);
  assert.equal(r.plan.length, 2);
  assert.equal(r.results.length, 2);
  assert.equal(model.doGenerateCalls.length, 4, 'plan + one call per subtask + synthesis');
  assert.match(r.answer, /ready/);
});

await liveOnly('routing a real model: 4 messages', live, async () => {
  let right = 0;
  for (const [msg, want] of MESSAGES) {
    const r = await lab.route(msg, getModel().model);
    console.log(`   ${r.route === want ? '✓' : '✗'} ${r.route.padEnd(8)} ${msg}`);
    if (r.route === want) right++;
  }
  assert.ok(right >= 3, `${right}/4 routed correctly`);
});

await liveOnly('evaluator-optimizer on a real model', live, async () => {
  const r = await lab.evaluatorOptimizer(
    'Write a 2-sentence reply to Ayesha, whose October invoice (12 days ago) was charged by mistake.',
    '- does NOT promise a refund (the billing team approves refunds)\n- mentions the 30-day refund window\n- at most 2 sentences',
    getModel().model,
  );
  console.log(`   ${r.rounds.length} round(s), passed: ${r.passed}\n   final: ${r.final.replace(/\s+/g, ' ').slice(0, 200)}`);
  assert.ok(r.rounds.length <= 3);
});

summary();

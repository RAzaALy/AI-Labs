// Usage: npx tsx check.ts [starter|solution]
import assert from 'node:assert/strict';
import { generateText, isStepCount, type LanguageModel, type ToolSet } from 'ai';
import { liveOnly, loadImpl, report, summary } from '../../../shared/lab-harness.ts';
import { describeModel, getModel, isMock } from '../../../shared/llm.ts';
import { scriptedModel } from '../../../shared/mock-model.ts';
import { AcmeOps, ToolError } from '../../env/acme-ops.ts';
import { acmeTools } from '../../env/tools.ts';

type Impl = typeof import('./solution/index.ts');
const lab = await loadImpl<Impl>(import.meta.url);
const live = !isMock();
console.log(`   model: ${describeModel(getModel())}\n`);

const QUESTION = "Ayesha Khan asks which of her invoices can still be refunded. Answer with invoice ids.";

await report('a task-shaped tool: one call answers "who is this and what is refundable?"', () => {
  const r = lab.lookupCustomerBilling(new AcmeOps(), 'ayesha');
  assert.equal(r.customer.id, 'C-101');
  const oct = r.invoices.find((i) => i.id === 'INV-20261003')!;
  const sep = r.invoices.find((i) => i.id === 'INV-20260903')!;
  assert.equal(oct.withinRefundWindow, true);
  assert.equal(sep.withinRefundWindow, false, 'computed in code: the model should never do date arithmetic');
  assert.equal(oct.refundableUSD, 99);
});

await report('ambiguity and misses are errors that tell the model what to do next', () => {
  assert.throws(() => lab.lookupCustomerBilling(new AcmeOps(), 'il'), (e: Error) => e instanceof ToolError && /C-102/.test(e.message) && /C-103/.test(e.message) && /id/.test(e.message));
  assert.throws(() => lab.lookupCustomerBilling(new AcmeOps(), 'zzz'), /Try|id/);
  assert.match(lab.actionableError(new Error('ECONNRESET 10.0.3.7:5432')), /not caused by your input/i, 'internal errors must not leak internals or invite blind retries');
  assert.doesNotMatch(lab.actionableError(new Error('ECONNRESET 10.0.3.7:5432')), /10\.0\.3\.7/);
});

await report('goodTools return errors as data instead of throwing', async () => {
  const t = lab.goodTools(new AcmeOps());
  const out = await t.lookupCustomerBilling.execute!({ customer: 'il' }, { toolCallId: 'x', messages: [], context: {} } as never);
  assert.match((out as { error: string }).error, /Call again with the id/);
});

await report('bounded outputs: sourced excerpts of CURRENT policy, not whole documents', async () => {
  const bad = await lab.badTools(new AcmeOps()).docs.execute!({ q: 'refund' }, { toolCallId: 'x', messages: [], context: {} } as never);
  const good = await lab.searchPolicy('refund window');
  console.log(`   "refund" via docs(): ${lab.tokens(bad)} tokens · via searchPolicy(): ${lab.tokens(good)} tokens`);
  assert.ok(good.length <= 3 && good.every((h) => h.source.includes('›') && h.excerpt.length <= 501));
  assert.match(good[0]!.source, /billing-and-refunds/);
  assert.ok(lab.tokens(good) * 2 < lab.tokens(bad), 'good output must be much smaller');
  // Raw dumps also carry stale content: the deprecated 2024 policy (14 days) rides along with the current one.
  assert.match(JSON.stringify(bad), /14 days/);
  assert.doesNotMatch(JSON.stringify(good), /14 days/, 'searchPolicy must only return current policy');
});

await report('definitions cost tokens on every step: measure them', () => {
  const ops = new AcmeOps();
  const bad = lab.definitionTokens(lab.badTools(ops) as unknown as ToolSet);
  const good = lab.definitionTokens(lab.goodTools(ops) as unknown as ToolSet);
  const all = lab.definitionTokens(acmeTools(ops) as unknown as ToolSet);
  console.log(`   tool definitions: bad ${bad} · good ${good} · all 7 env tools ${all} tokens per step`);
  assert.ok(bad > 20 && good > bad, 'good descriptions are longer, and that is fine: they save whole steps');
  assert.ok(all > good);
});

async function runWith(tools: ToolSet, model: LanguageModel) {
  const r = await generateText({ model, tools, prompt: QUESTION, stopWhen: isStepCount(8), temperature: 0 });
  const billed = r.steps.reduce((s, st) => s + (st.usage.inputTokens ?? 0), 0);
  return { steps: r.steps.length, calls: r.steps.flatMap((s) => s.toolCalls.map((c) => c.toolName)), billed, text: r.text };
}

await report('same question, both toolsets (scripted): fewer steps and fewer tokens with good tools', async () => {
  const bad = await runWith(
    lab.badTools(new AcmeOps()) as unknown as ToolSet,
    scriptedModel([
      { toolCalls: [{ name: 'query', input: { table: 'customers' } }] },
      { toolCalls: [{ name: 'query', input: { table: 'invoices', where: { customerId: 'C-101' } } }] },
      { toolCalls: [{ name: 'docs', input: { q: 'refund' } }] },
      { text: 'INV-20261003 can be refunded; INV-20260903 is older than 30 days.' },
    ]),
  );
  const good = await runWith(
    lab.goodTools(new AcmeOps()) as unknown as ToolSet,
    scriptedModel([{ toolCalls: [{ name: 'lookupCustomerBilling', input: { customer: 'Ayesha Khan' } }] }, { text: 'INV-20261003 can be refunded; INV-20260903 is older than 30 days.' }]),
  );
  console.log(`   bad:  ${bad.steps} steps, ${bad.billed} input tokens · good: ${good.steps} steps, ${good.billed} input tokens`);
  assert.ok(good.billed * 2 < bad.billed);
});

await liveOnly('same question, both toolsets, real model', live, async () => {
  for (const [name, tools] of [['bad', lab.badTools(new AcmeOps())], ['good', lab.goodTools(new AcmeOps())]] as const) {
    const r = await runWith(tools as unknown as ToolSet, getModel().model);
    const right = /INV-20261003/.test(r.text) && !/INV-20260903[^.]*(can|is) (still )?(be )?refund/i.test(r.text);
    console.log(`   ${name.padEnd(4)} ${r.steps} steps · ${r.billed} input tokens · calls: ${r.calls.join(', ') || '-'} · ${right ? '✓' : '✗'} ${r.text.replace(/\s+/g, ' ').slice(0, 140)}`);
    if (name === 'good') assert.ok(right, 'with good tools the answer must name INV-20261003 as the refundable one');
  }
});

summary();

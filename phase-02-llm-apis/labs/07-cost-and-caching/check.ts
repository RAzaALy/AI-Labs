// Usage: npx tsx check.ts [starter|solution]
import assert from 'node:assert/strict';
import { liveOnly, loadImpl, report, summary } from '../../../shared/lab-harness.ts';
import { DEFAULT_MODELS, resolveProvider } from '../../../shared/llm.ts';

type Impl = typeof import('./solution/index.ts');
const lab = await loadImpl<Impl>(import.meta.url);
const close = (a: number, b: number) => Math.abs(a - b) < 1e-12;

// Real usage captured from gemini-3.5-flash-lite while building this lab (2nd call of a cached 5.8k-token prefix).
const CACHED = { inputTokens: 5858, inputTokenDetails: { noCacheTokens: 2038, cacheReadTokens: 3820 }, outputTokens: 56, outputTokenDetails: { textTokens: 56, reasoningTokens: 0 } };
// Real usage from gemini-3.8-flash with maxOutputTokens: 60: every output token went to hidden reasoning.
const EMPTY = { text: '', finishReason: 'length', usage: { inputTokens: 5858, outputTokens: 56, outputTokenDetails: { textTokens: 0, reasoningTokens: 56 } } };

await report('CostMeter prices cached input at the cache rate', () => {
  const m = new lab.CostMeter();
  const c = m.record('gemini-3.5-flash-lite', CACHED);
  // 2038 × $0.30 + 3820 × $0.03 + 56 × $2.50, per million
  assert.ok(close(c.total, (2038 * 0.3 + 3820 * 0.03 + 56 * 2.5) / 1e6), `got ${c.total}`);
  const noCacheCost = (5858 * 0.3 + 56 * 2.5) / 1e6;
  console.log(`   with cache $${c.total.toFixed(6)} vs without $${noCacheCost.toFixed(6)} (${(100 - (c.total / noCacheCost) * 100).toFixed(0)}% saved)`);
});

await report('CostMeter totals and per-model breakdown', () => {
  const m = new lab.CostMeter();
  m.record('claude-sonnet-5-5', { inputTokens: 1000, outputTokens: 500 }, 'a');
  m.record('claude-sonnet-5-5', { inputTokens: 1000, outputTokens: 500 }, 'b');
  m.record('gpt-6-luna', { inputTokens: 1000, outputTokens: 500, outputTokenDetails: { reasoningTokens: 400 } }, 'c');
  assert.ok(close(m.totalUSD, 2 * 0.007 + 0.00035));
  assert.deepEqual(Object.keys(m.byModel()).sort(), ['claude-sonnet-5-5', 'gpt-6-luna']);
  assert.equal(m.byModel()['claude-sonnet-5-5']!.calls, 2);
  assert.equal(m.totals().reasoningTokens, 400);
});

await report('budget guard refuses a call that could overspend', () => {
  const m = new lab.CostMeter(0.01);
  m.record('claude-sonnet-5-5', { inputTokens: 2000, outputTokens: 500 }); // $0.009 spent
  assert.doesNotThrow(() => m.assertCanAfford('claude-haiku-5-5', 2000, 500));
  assert.throws(() => m.assertCanAfford('claude-sonnet-5-5', 2000, 500), lab.BudgetExceededError);
});

await report('diagnoseUsage: the empty-answer trap, truncation, cache hits', () => {
  assert.deepEqual(lab.diagnoseUsage(EMPTY), ['empty-answer-reasoning', 'reasoning-heavy']);
  assert.deepEqual(lab.diagnoseUsage({ text: 'The refund takes', finishReason: 'length', usage: { outputTokens: 60 } }), ['truncated']);
  assert.deepEqual(lab.diagnoseUsage({ text: 'ok', finishReason: 'stop', usage: CACHED }), ['cache-hit']);
});

const live = resolveProvider() === 'google';

await liveOnly('hidden reasoning tokens: same question, three settings', live, async () => {
  const id = DEFAULT_MODELS.google.smart!;
  const rows = await lab.compareReasoning('In one sentence: why do databases use indexes?', id);
  for (const r of rows) {
    console.log(`   ${r.label.padEnd(18)} out ${String(r.usage.outputTokens).padStart(4)} (reasoning ${String(r.usage.outputTokenDetails.reasoningTokens ?? 0).padStart(4)}) $${r.cost.toFixed(6)} [${r.diagnosis.join(', ') || 'ok'}] ${JSON.stringify(r.text.slice(0, 50))}`);
    if (r.text.trim() === '') assert.ok(r.diagnosis.includes('empty-answer-reasoning'), 'an empty answer must be diagnosed');
  }
  assert.ok(rows[2]!.text.trim().length > 0, 'with room to think AND answer, the answer appears');
});

await liveOnly('implicit prompt caching is best-effort: observe it', live, async () => {
  const doc = Array.from({ length: 220 }, (_, i) => `Policy ${i + 1}: Refunds for plan tier ${i % 7} are processed within ${3 + (i % 5)} business days after approval by the billing team.`).join('\n');
  const { rows, meter } = await lab.cacheProbe(doc, ['How long do tier 3 refunds take?', 'How long do tier 5 refunds take?', 'Which team approves refunds?'], 'gemini-3.5-flash-lite');
  for (const r of rows) console.log(`   in ${r.inputTokens} · cached ${String(r.cacheReadTokens).padStart(4)} · $${r.withCache.toFixed(6)} (no cache $${r.noCache.toFixed(6)})  ${r.question}`);
  console.log(`   session total $${meter.totalUSD.toFixed(6)} — cache hits are not guaranteed with implicit caching; explicit caching (Anthropic cache_control, Gemini cachedContents) is.`);
  for (const r of rows) assert.ok(r.withCache <= r.noCache + 1e-12);
});

summary();

// Usage: npx tsx check.ts [starter|solution]
import assert from 'node:assert/strict';
import { loadImpl, report, summary } from '../../../shared/lab-harness.ts';

type Impl = typeof import('./solution/index.ts');
const lab = await loadImpl<Impl>(import.meta.url);
type Message = import('./solution/index.ts').Message;

const system: Message = { role: 'system', content: 'You are a concise support assistant for Acme Cloud.' };
const turns: Message[] = [];
for (let i = 1; i <= 20; i++) {
  turns.push({ role: 'user', content: `Question ${i}: ${'please explain the deployment pipeline in detail. '.repeat(6)}` });
  turns.push({ role: 'assistant', content: `Answer ${i}: ${'the pipeline builds, tests and deploys the service. '.repeat(8)}` });
}
turns.push({ role: 'user', content: 'Thanks! What was my FIRST question about?' });
const convo = [system, ...turns];

await report('message token accounting', () => {
  assert.equal(lab.messageTokens({ role: 'user', content: 'Hello world' }), 2 + 4);
  assert.equal(lab.totalTokens([system]), lab.messageTokens(system));
});

await report('fitToBudget: sliding window keeps system + newest', () => {
  const total = lab.totalTokens(convo);
  const r = lab.fitToBudget(convo, { contextWindow: 2048, reserveForOutput: 512 });
  console.log(`  conversation = ${total} tokens; window 2048 − 512 reserved → kept ${r.kept.length} msgs (${r.inputTokens} tok), dropped ${r.dropped.length}`);
  assert.equal(r.kept[0], system, 'system prompt is pinned');
  assert.equal(r.kept.at(-1), convo.at(-1), 'latest message is pinned');
  assert.ok(r.inputTokens <= 2048 - 512);
  assert.equal(r.inputTokens, lab.totalTokens(r.kept));
  assert.equal(r.kept.length + r.dropped.length, convo.length);
  assert.ok(r.dropped.includes(turns[0]!), 'the oldest turn is dropped first...');
  console.log('  ⚠️ ...so the model can no longer answer "what was my first question?" That is the cost of a sliding window.');
});

await report('fitToBudget: everything fits → nothing dropped', () => {
  const r = lab.fitToBudget(convo, { contextWindow: 200_000, reserveForOutput: 8_000 });
  assert.equal(r.dropped.length, 0);
});

await report('fitToBudget: impossible budget throws', () => {
  assert.throws(() => lab.fitToBudget(convo, { contextWindow: 30, reserveForOutput: 20 }), /input budget/i, 'throw a clear error, e.g. "... need 40 tokens but the input budget is 10"');
});

await report('stateless ⇒ quadratic input cost', () => {
  const { perTurn, total } = lab.conversationInputTokens(Array(50).fill(200));
  assert.deepEqual(perTurn.slice(0, 3), [200, 400, 600]);
  assert.equal(total, 255_000);
  console.log(`  50 turns × 200 new tokens = 10,000 tokens of conversation, but ${total.toLocaleString()} input tokens billed (25.5×)`);
});

summary();

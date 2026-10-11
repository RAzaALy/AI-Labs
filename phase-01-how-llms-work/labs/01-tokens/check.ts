// Usage: npx tsx check.ts [starter|solution]
import assert from 'node:assert/strict';
import { loadImpl, report, summary } from '../../../shared/lab-harness.ts';

type Impl = typeof import('./solution/index.ts');
const lab = await loadImpl<Impl>(import.meta.url);

const SAMPLES = {
  english: 'The quick brown fox jumps over the lazy dog. Deploys are scheduled every Friday.',
  urdu: 'تیز بھوری لومڑی سست کتے کے اوپر چھلانگ لگاتی ہے۔ ہر جمعہ کو ڈیپلائے ہوتا ہے۔',
  code: 'export async function getUser(id: string): Promise<User> { return db.user.findUnique({ where: { id } }); }',
  json: JSON.stringify({ userId: 'a3f1c9e2-7b4d-4e8a-9c1f-2d3e4f5a6b7c', roles: ['admin', 'editor'], active: true }),
};

await report('token counts per sample', async () => {
  const rows = [];
  for (const [name, text] of Object.entries(SAMPLES)) {
    const c = await lab.countTokens(text);
    rows.push({ sample: name, chars: text.length, gpt2: c.gpt2, o200k: c.o200k, 'chars/tok (o200k)': +(text.length / c.o200k).toFixed(2) });
  }
  console.table(rows);
  const en = await lab.countTokens(SAMPLES.english);
  const ur = await lab.countTokens(SAMPLES.urdu);
  assert.equal(en.o200k, 17, 'English sample should be 17 o200k tokens');
  assert.ok(ur.gpt2 > en.gpt2 * 4, 'Urdu should cost >4x English on the small GPT-2 vocab');
  assert.ok(ur.o200k < ur.gpt2 / 2, 'the 200k vocab should compress Urdu much better than GPT-2');
});

await report('token pieces', async () => {
  const pieces = await lab.tokenPieces('strawberry', 'o200k');
  console.log('  o200k "strawberry" ->', pieces);
  assert.deepEqual(pieces, ['st', 'raw', 'berry']);
  const g = await lab.tokenPieces('Hello world', 'gpt2');
  assert.deepEqual(g, ['Hello', ' world'], 'the leading space belongs to the token');
});

await report('chars per token', async () => {
  const json = await lab.charsPerToken(SAMPLES.json, 'o200k');
  const en = await lab.charsPerToken(SAMPLES.english, 'o200k');
  console.log(`  english ${en.toFixed(2)} chars/token vs UUID-ish JSON ${json.toFixed(2)} chars/token`);
  assert.ok(en > 4 && json < 2);
});

await report('cost estimation', async () => {
  // 2,000 input + 500 output tokens on Sonnet 5.5 ($2 / $10 per MTok) = $0.004 + $0.005
  assert.ok(Math.abs(lab.estimateCost('claude-sonnet-5-5', 2000, 500) - 0.009) < 1e-12);
  const m = lab.monthlyCost('claude-sonnet-5-5', 10_000, 2000, 500);
  console.log(`  10k req/day × (2k in + 500 out) on Sonnet 5.5 = $${m.toFixed(2)}/month`);
  assert.equal(Math.round(m), 2700);
  const luna = lab.monthlyCost('gpt-6-luna', 10_000, 2000, 500);
  console.log(`  same traffic on gpt-6-luna = $${luna.toFixed(2)}/month (model choice is a 20x lever)`);
});

summary();

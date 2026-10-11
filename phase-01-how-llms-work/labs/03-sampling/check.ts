// Usage: npx tsx check.ts [starter|solution]
import assert from 'node:assert/strict';
import { loadImpl, report, summary } from '../../../shared/lab-harness.ts';

type Impl = typeof import('./solution/index.ts');
const lab = await loadImpl<Impl>(import.meta.url);
const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

await report('softmax + temperature', () => {
  const p = lab.softmax([1, 2, 3]);
  assert.ok(close(p.reduce((a, b) => a + b), 1));
  assert.ok(close(p[2]!, 0.665241), `p[2] should be 0.665241, got ${p[2]}`);
  assert.ok(lab.softmax([1, 2, 3], 0.5)[2]! > p[2]!, 'low T sharpens');
  assert.ok(lab.softmax([1, 2, 3], 2)[2]! < p[2]!, 'high T flattens');
  assert.deepEqual(lab.softmax([1, 5, 3], 0), [0, 1, 0], 'T=0 is greedy');
  assert.ok(lab.softmax([1000, 1001]).every(Number.isFinite), 'must be numerically stable');
});

await report('top-k and top-p filters', () => {
  const probs = [0.5, 0.3, 0.15, 0.05];
  const k2 = lab.topK(probs, 2);
  assert.ok(close(k2[0]!, 0.625) && close(k2[1]!, 0.375) && k2[2] === 0 && k2[3] === 0);
  const p8 = lab.topP(probs, 0.8);
  assert.ok(p8[0]! > 0 && p8[1]! > 0 && p8[2] === 0 && p8[3] === 0, `topP(0.8) keeps the first two, got ${p8}`);
  assert.deepEqual(lab.topP(probs, 1), probs);
});

await report('sampleIndex follows the distribution', () => {
  assert.equal(lab.sampleIndex([0.2, 0.5, 0.3], () => 0.1), 0);
  assert.equal(lab.sampleIndex([0.2, 0.5, 0.3], () => 0.6), 1);
  assert.equal(lab.sampleIndex([0.2, 0.5, 0.3], () => 0.95), 2);
  let i = 0;
  const counts = [0, 0, 0];
  for (let n = 0; n < 3000; n++) counts[lab.sampleIndex([0.2, 0.5, 0.3], () => ((i = (i * 9301 + 49297) % 233280), i / 233280))]!++;
  assert.ok(Math.abs(counts[1]! / 3000 - 0.5) < 0.05, `index 1 should be ~50%, got ${counts}`);
});

await report('real model: next-token distribution', async () => {
  const c = await lab.topCandidates('The capital of France is', 5);
  console.log('  ' + c.map((x) => `${JSON.stringify(x.token)} ${(x.p * 100).toFixed(1)}%`).join('  '));
  assert.equal(c[0]!.token, ' Paris');
  const sharp = await lab.topCandidates('The capital of France is', 1, 0.3);
  console.log(`  at T=0.3, " Paris" jumps to ${(sharp[0]!.p * 100).toFixed(1)}%`);
  assert.ok(sharp[0]!.p > c[0]!.p);
});

await report('real model: greedy is repeatable, high T varies by seed', async () => {
  const prompt = 'My favourite programming language is';
  const g1 = await lab.generate(prompt, { temperature: 0, maxTokens: 8 });
  const g2 = await lab.generate(prompt, { temperature: 0, maxTokens: 8, seed: 999 });
  console.log(`  greedy:      ${JSON.stringify(g1)}`);
  assert.equal(g1, g2, 'greedy ignores the seed');
  const outs = new Set<string>();
  for (const seed of [1, 2, 3, 4]) {
    const o = await lab.generate(prompt, { temperature: 1.3, maxTokens: 8, seed });
    console.log(`  T=1.3 s=${seed}:  ${JSON.stringify(o)}`);
    outs.add(o);
  }
  assert.ok(outs.size >= 3, 'high temperature should produce varied continuations');
  const nucleus = await lab.generate(prompt, { temperature: 1.3, topP: 0.5, maxTokens: 8, seed: 1 });
  console.log(`  T=1.3 top_p=0.5: ${JSON.stringify(nucleus)}  (nucleus trims the weird tail)`);
});

await report('a chat is just a templated string', async () => {
  const s = await lab.renderChat([{ role: 'user', content: 'What is the capital of France?' }]);
  console.log('  ' + JSON.stringify(s));
  assert.match(s, /<\|im_start\|>user\nWhat is the capital of France\?<\|im_end\|>/);
  assert.match(s, /<\|im_start\|>assistant\n$/, 'ends by prompting the assistant turn');
});

summary();

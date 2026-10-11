// Usage: npx tsx check.ts [starter|solution]
import assert from 'node:assert/strict';
import { loadImpl, report, summary } from '../../../shared/lab-harness.ts';

type Impl = typeof import('./solution/index.ts');
const lab = await loadImpl<Impl>(import.meta.url);
const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

await report('matmul + transpose', () => {
  assert.deepEqual(lab.matmul([[1, 2], [3, 4]], [[5, 6], [7, 8]]), [[19, 22], [43, 50]]);
  assert.deepEqual(lab.transpose([[1, 2, 3], [4, 5, 6]]), [[1, 4], [2, 5], [3, 6]]);
  assert.throws(() => lab.matmul([[1, 2]], [[1, 2]]));
});

await report('softmax handles masked entries', () => {
  const r = lab.softmaxRow([0, -Infinity, 0]);
  assert.deepEqual(r, [0.5, 0, 0.5]);
});

// Toy sentence: "the cat sat because it". Features: [is-animal, is-pronoun, is-verb].
// "it" (a pronoun) queries for animals; "cat" has the animal key.
const tokens = ['the', 'cat', 'sat', 'because', 'it'];
const K = [[0, 0, 0], [4, 0, 0], [0, 0, 1], [0, 0, 0], [0, 1, 0]];
const Q = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [4, 0, 0]]; // only "it" asks a question
const V = [[0, 0, 0], [1, 0, 0], [0, 0, 1], [0, 0, 0], [0, 1, 0]];

await report('"it" attends to "cat"', () => {
  const { weights, output } = lab.attention(Q, K, V, true);
  for (let i = 0; i < tokens.length; i++)
    console.log(`  ${tokens[i]!.padEnd(8)} ${weights[i]!.map((w) => w.toFixed(2).padStart(5)).join(' ')}`);
  const itRow = weights[4]!;
  assert.equal(itRow.indexOf(Math.max(...itRow)), 1, '"it" should put most weight on "cat"');
  assert.ok(output[4]![0]! > 0.9, 'so the output vector for "it" now carries the "animal" feature');
  for (const row of weights) assert.ok(close(row.reduce((a, b) => a + b), 1), 'rows sum to 1');
});

await report('causal mask: no peeking at the future', () => {
  const { weights } = lab.attention(Q, K, V, true);
  for (let i = 0; i < weights.length; i++) for (let j = i + 1; j < weights.length; j++) assert.equal(weights[i]![j], 0);
  assert.deepEqual(weights[0], [1, 0, 0, 0, 0], 'the first token can only attend to itself');
});

summary();

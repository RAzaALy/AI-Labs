// Usage: npx tsx check.ts [starter|solution]
import assert from 'node:assert/strict';
import { loadImpl, report, summary } from '../../../shared/lab-harness.ts';

type Impl = typeof import('./solution/index.ts');
const lab = await loadImpl<Impl>(import.meta.url);

await report('cosine from scratch', () => {
  assert.equal(lab.cosine([1, 0], [1, 0]), 1);
  assert.equal(lab.cosine([1, 0], [0, 1]), 0);
  assert.ok(Math.abs(lab.cosine([1, 2, 3], [-1, -2, -3]) + 1) < 1e-12);
  assert.ok(Math.abs(lab.cosine([3, 4], [6, 8]) - 1) < 1e-12, 'cosine ignores magnitude');
  assert.throws(() => lab.cosine([1], [1, 2]));
});

await report('embeddings are 384-dim and unit length', async () => {
  const [v] = await lab.embed(['hello world']);
  assert.equal(v!.length, 384);
  const norm = Math.sqrt(v!.reduce((s, x) => s + x * x, 0));
  assert.ok(Math.abs(norm - 1) < 1e-3, `expected |v|≈1, got ${norm}`);
});

const DOCS = [
  'To roll back a release, run `deploy rollback --to <version>` from the ops CLI.',
  'Our office is closed on public holidays.',
  'Postgres backups run nightly at 02:00 UTC and are kept for 30 days.',
  'Feature flags can be toggled in the admin dashboard without a deploy.',
  'The cafeteria serves vegetarian options every day.',
];

await report('semantic search finds meaning, not keywords', async () => {
  const hits = await lab.search('how do I undo a bad deployment?', DOCS, 2);
  for (const h of hits) console.log(`  ${h.score.toFixed(3)}  ${h.doc}`);
  assert.match(hits[0]!.doc, /roll back/, 'top hit should be the rollback doc, though it shares almost no words with the query');
  const backup = await lab.search('when are database snapshots taken?', DOCS, 1);
  assert.match(backup[0]!.doc, /backups/);
});

await report('⚠️ similarity is not truth: negation trap', async () => {
  const texts = ['The deploy succeeded.', 'The deploy did not succeed.', 'The release went out without problems.'];
  const m = await lab.similarityMatrix(texts);
  console.log(`  "succeeded" vs "did not succeed":        ${m[0]![1]!.toFixed(2)}  (opposite meaning!)`);
  console.log(`  "succeeded" vs "went out without problems": ${m[0]![2]!.toFixed(2)}  (same meaning!)`);
  assert.ok(m[0]![1]! > m[0]![2]!, 'the negated sentence scores HIGHER than the true paraphrase');
});

summary();

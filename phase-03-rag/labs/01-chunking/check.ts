// Usage: npx tsx check.ts [starter|solution]
import assert from 'node:assert/strict';
import { loadImpl, report, summary } from '../../../shared/lab-harness.ts';
import { loadCorpus, loadGoldenSet } from '../../../shared/corpus.ts';

type Impl = typeof import('./solution/index.ts');
const lab = await loadImpl<Impl>(import.meta.url);
const docs = await loadCorpus();
const deploy = docs.find((d) => d.file === 'deploys-and-rollbacks.md')!;
const webhooks = docs.find((d) => d.file === 'webhooks.md')!;

await report('fixedSizeChunks: windows respect size and overlap', () => {
  const text = deploy.body;
  const chunks = lab.fixedSizeChunks(text, 50, 10);
  for (const c of chunks) assert.ok(lab.countTokens(c) <= 51, `chunk has ${lab.countTokens(c)} tokens`);
  const tail = chunks[0]!.slice(-20);
  assert.ok(chunks[1]!.includes(tail.trim().split(' ').at(-1)!), 'consecutive chunks overlap');
  assert.throws(() => lab.fixedSizeChunks(text, 10, 10));
});

await report('fixed-size chunking cuts through code blocks and sentences (the problem)', () => {
  const chunks = lab.fixedSizeChunks(deploy.body, 40, 0);
  const brokenFences = chunks.filter((c) => ((c.match(/```/g) ?? []).length % 2) === 1).length;
  console.log(`   ${chunks.length} fixed chunks, ${brokenFences} with an unbalanced code fence`);
  assert.ok(brokenFences > 0);
});

await report('splitBlocks keeps fenced code blocks whole', () => {
  const md = 'Intro line\n\n```bash\nacme deploy --env production\n\nacme deploy rollback\n```\n\nAfter';
  assert.deepEqual(lab.splitBlocks(md), ['Intro line', '```bash\nacme deploy --env production\n\nacme deploy rollback\n```', 'After']);
});

await report('splitSections: one section per H2, with a heading path', () => {
  const secs = lab.splitSections(deploy);
  assert.deepEqual(secs.map((s) => s.section), ['', 'Deploy windows', 'How to deploy', 'Rolling back a bad release', 'Database migrations and rollbacks', 'Feature flags instead of risky deploys']);
  assert.deepEqual(secs[3]!.headingPath, ['Deploys and rollbacks', 'Rolling back a bad release']);
});

await report('markdownChunks: bounded size, balanced fences, context header for embedding', () => {
  const chunks = lab.markdownChunks(deploy, 120);
  for (const c of chunks) {
    assert.ok(c.tokens <= 120, `chunk ${c.id} has ${c.tokens} tokens`);
    assert.equal(((c.text.match(/```/g) ?? []).length) % 2, 0, `chunk ${c.id} splits a code block`);
    assert.ok(c.embedText.startsWith(c.headingPath.join(' > ')), 'embedText starts with the heading path');
  }
  const rollback = chunks.find((c) => c.section === 'Rolling back a bad release')!;
  assert.match(rollback.text, /acme deploy rollback/);
});

await report('edge cases: big tables and one endless line still respect the limit (no infinite recursion)', () => {
  const table = ['| a | b |', '|---|---|', ...Array.from({ length: 60 }, (_, i) => `| row ${i} value | another cell ${i} |`)].join('\n');
  const endless = 'word '.repeat(400);
  const doc = { id: 'edge.md', file: 'edge.md', title: 'Edge', meta: {}, hash: '', body: `## Table\n\n${table}\n\n## Endless\n\n${endless}\n` };
  const chunks = lab.markdownChunks(doc, 60);
  assert.ok(chunks.length > 5);
  for (const c of chunks) assert.ok(c.tokens <= 60, `chunk has ${c.tokens} tokens`);
});

await report('HTML comments (hidden injections) are stripped before indexing', () => {
  const text = lab.markdownChunks(webhooks).map((c) => c.text).join('\n');
  assert.doesNotMatch(text, /ignore all previous instructions/i);
  assert.match(text, /Acme-Event-Id/);
});

await report('every golden-set section is reachable as a chunk', async () => {
  const { chunks, stats } = lab.chunkCorpus(docs, 200);
  console.log(`   ${stats.count} chunks · tokens min ${stats.minTokens} / median ${stats.medianTokens} / max ${stats.maxTokens}`);
  const have = new Set(chunks.map((c) => `${c.file}::${c.section}`));
  for (const q of await loadGoldenSet()) for (const r of q.relevant) assert.ok(have.has(`${r.file}::${r.section}`), `no chunk for ${r.file} › ${r.section}`);
});

summary();

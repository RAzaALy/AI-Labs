// Usage: npx tsx check.ts [starter|solution]   (needs: npm run db:up)
import assert from 'node:assert/strict';
import { loadImpl, report, summary } from '../../../shared/lab-harness.ts';
import { loadCorpus, loadGoldenSet } from '../../../shared/corpus.ts';
import { connectOrExplain } from '../../../shared/db.ts';
import { getEmbedder } from '../../../shared/embeddings.ts';
import { chunkCorpus } from '../01-chunking/solution/index.ts';
import { createSchema, indexChunks, vectorSearch } from '../02-pgvector/solution/index.ts';
import { addFullTextSearch, hybridSearch, keywordSearch } from '../03-hybrid-search/solution/index.ts';

type Impl = typeof import('./solution/index.ts');
const lab = await loadImpl<Impl>(import.meta.url);
const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const R = (s: string) => ({ file: 'f.md', section: s });

await report('metric math on a hand-checked example', () => {
  const ranked = [R('a'), R('x'), R('b'), R('y'), R('z')];
  const relevant = [R('a'), R('b'), R('c')];
  assert.ok(close(lab.recallAtK(ranked, relevant, 3), 2 / 3));
  assert.ok(close(lab.precisionAtK(ranked, relevant, 3), 2 / 3));
  assert.equal(lab.reciprocalRank(ranked, relevant), 1);
  assert.equal(lab.reciprocalRank([R('x'), R('b')], relevant), 0.5);
  const ideal = 1 + 1 / Math.log2(3) + 1 / Math.log2(4);
  assert.ok(close(lab.ndcgAtK(ranked, relevant, 5), (1 + 1 / Math.log2(4)) / ideal));
  assert.equal(lab.reciprocalRank([R('x')], relevant), 0);
});

await report('duplicate chunks of one section collapse before scoring', () => {
  assert.deepEqual(lab.toSectionRanking([R('a'), R('a'), R('b'), R('a')]), [R('a'), R('b')]);
});

await report('threshold gate reports exactly what regressed', () => {
  const m = { recall1: 0.7, recall3: 0.9, recall5: 0.95, precision3: 0.4, mrr: 0.8, ndcg5: 0.85, queries: 10 };
  assert.deepEqual(lab.assertThresholds(m, { recall5: 0.9, mrr: 0.85 }), ['mrr 0.800 < 0.85']);
});

const sql = await connectOrExplain();
const embedder = getEmbedder();
const docs = await loadCorpus();
const golden = await loadGoldenSet();
console.log(`\n   embedder: ${embedder.id} · ${golden.filter((q) => q.relevant.length).length} answerable golden questions\n`);

try {
  const rows: Record<string, ReturnType<typeof lab.evaluateRetriever> extends Promise<infer T> ? T : never> = {};
  for (const size of [100, 200, 400]) {
    const table = `lab05_c${size}`;
    await createSchema(sql, embedder.dims, table);
    await indexChunks(sql, chunkCorpus(docs, size).chunks, docs, embedder, table);
    await addFullTextSearch(sql, table);
    const o = { table, onlyCurrent: true };
    if (size === 200) {
      rows['keyword (200)'] = await lab.evaluateRetriever((q) => keywordSearch(sql, q, 10, o), golden);
      rows['vector (200)'] = await lab.evaluateRetriever((q) => vectorSearch(sql, embedder, q, 10, o), golden);
    }
    rows[`hybrid (${size})`] = await lab.evaluateRetriever((q) => hybridSearch(sql, embedder, q, 10, o), golden);
  }

  await report('evaluate configurations side by side', () => {
    console.log('   config          R@1    R@3    R@5    P@3    MRR    nDCG@5');
    for (const [name, m] of Object.entries(rows))
      console.log(`   ${name.padEnd(15)} ${[m.recall1, m.recall3, m.recall5, m.precision3, m.mrr, m.ndcg5].map((x) => x.toFixed(3)).join('  ')}`);
    const h = rows['hybrid (200)']!;
    console.log(`   hybrid (200) recall@5 by question type: ${Object.entries(h.byType).map(([t, v]) => `${t} ${v.toFixed(2)}`).join(' · ')}`);
    if (h.misses.length) console.log(`   still missed in top 5: ${h.misses.join('; ')}`);
    assert.ok(rows['hybrid (200)']!.recall5 >= rows['vector (200)']!.recall5, 'hybrid should not lose to vector-only');
    assert.ok(rows['hybrid (200)']!.recall5 >= rows['keyword (200)']!.recall5, 'hybrid should not lose to keyword-only');
  });

  await report('CI gate: hybrid (200) meets the agreed thresholds', () => {
    const failures = lab.assertThresholds(rows['hybrid (200)']!, { recall5: 0.9, mrr: 0.8 });
    assert.deepEqual(failures, [], `retrieval regressed: ${failures.join(', ')}`);
  });
} finally {
  await sql.end();
}
summary();

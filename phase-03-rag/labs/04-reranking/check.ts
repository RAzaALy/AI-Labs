// Usage: npx tsx check.ts [starter|solution]   (needs: npm run db:up)
import assert from 'node:assert/strict';
import { rerank } from 'ai';
import { loadImpl, report, summary } from '../../../shared/lab-harness.ts';
import { loadCorpus, loadGoldenSet } from '../../../shared/corpus.ts';
import { connectOrExplain } from '../../../shared/db.ts';
import { getEmbedder } from '../../../shared/embeddings.ts';
import { chunkCorpus } from '../01-chunking/solution/index.ts';
import { createSchema, indexChunks } from '../02-pgvector/solution/index.ts';
import { addFullTextSearch, hybridSearch } from '../03-hybrid-search/solution/index.ts';

type Impl = typeof import('./solution/index.ts');
const lab = await loadImpl<Impl>(import.meta.url);
const sql = await connectOrExplain();
const embedder = getEmbedder();
const TABLE = 'lab04_chunks';
const docs = await loadCorpus();
await createSchema(sql, embedder.dims, TABLE);
await indexChunks(sql, chunkCorpus(docs, 200).chunks, docs, embedder, TABLE);
await addFullTextSearch(sql, TABLE);
console.log(`   embedder: ${embedder.id} · reranker: ${lab.CROSS_ENCODER}\n`);

const hit = (h: { file: string; section: string }, rel: { file: string; section: string }[]) => rel.some((r) => r.file === h.file && r.section === h.section);

try {
  await report('the local cross-encoder plugs into the standard rerank() API', async () => {
    const { ranking } = await rerank({
      model: lab.localCrossEncoder(),
      query: 'how do I undo a bad deployment?',
      documents: ['The deploy succeeded on Friday.', 'To roll back a release, run acme deploy rollback --to <version>.', 'Deployments happen every Friday afternoon.', 'The cafeteria serves vegetarian food.'],
      topN: 2,
    });
    assert.equal(ranking.length, 2);
    assert.equal(ranking[0]!.originalIndex, 1, 'the rollback sentence is most relevant');
    assert.ok(ranking[0]!.score >= ranking[1]!.score);
  });

  await report('retrieveAndRerank: hybrid top-10 → cross-encoder → top-5', async () => {
    const r = await lab.retrieveAndRerank(sql, embedder, 'What happens after a card is declined three times?', { table: TABLE, k: 5, candidates: 10 });
    for (const x of r.slice(0, 3)) console.log(`   ${x.rerankScore.toFixed(2)}  (was #${x.firstStageRank})  ${x.file} › ${x.section}`);
    assert.equal(r.length, 5);
    assert.equal(r[0]!.section, 'Failed payments');
    assert.ok(r.every((x, i) => i === 0 || r[i - 1]!.rerankScore >= x.rerankScore));
  });

  await report('measure it: does reranking help on the golden set?', async () => {
    const qs = (await loadGoldenSet()).filter((q) => q.relevant.length);
    let mrrH = 0, mrrR = 0, recH = 0, recR = 0, ms = 0;
    for (const q of qs) {
      const h = await hybridSearch(sql, embedder, q.query, 5, { table: TABLE });
      const t0 = Date.now();
      const r = await lab.retrieveAndRerank(sql, embedder, q.query, { table: TABLE, k: 5, candidates: 10 });
      ms += Date.now() - t0;
      const rank = (xs: typeof h) => xs.findIndex((x) => hit(x, q.relevant));
      const ih = rank(h), ir = rank(r);
      mrrH += ih < 0 ? 0 : 1 / (ih + 1);
      mrrR += ir < 0 ? 0 : 1 / (ir + 1);
      recH += q.relevant.filter((rel) => h.slice(0, 3).some((x) => hit(x, [rel]))).length / q.relevant.length;
      recR += q.relevant.filter((rel) => r.slice(0, 3).some((x) => hit(x, [rel]))).length / q.relevant.length;
    }
    const n = qs.length;
    console.log(`   hybrid:          MRR ${(mrrH / n).toFixed(3)} · recall@3 ${(recH / n).toFixed(3)}`);
    console.log(`   hybrid + rerank: MRR ${(mrrR / n).toFixed(3)} · recall@3 ${(recR / n).toFixed(3)} · +${(ms / n).toFixed(0)} ms per query on CPU`);
    console.log('   (a reranker can LOWER MRR on top of a strong first stage, and costs seconds on a CPU: that is why you measure)');
    assert.ok(recR >= recH, 'reranking should not lose relevant sections from the top 3');
  });
} finally {
  await sql.end();
}
summary();

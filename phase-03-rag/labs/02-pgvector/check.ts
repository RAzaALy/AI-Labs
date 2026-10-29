// Usage: npx tsx check.ts [starter|solution]   (needs: npm run db:up)
import assert from 'node:assert/strict';
import { loadImpl, report, summary } from '../../../shared/lab-harness.ts';
import { loadCorpus } from '../../../shared/corpus.ts';
import { connectOrExplain } from '../../../shared/db.ts';
import { getEmbedder } from '../../../shared/embeddings.ts';
import { chunkCorpus } from '../01-chunking/solution/index.ts';

type Impl = typeof import('./solution/index.ts');
const lab = await loadImpl<Impl>(import.meta.url);
const sql = await connectOrExplain();
const embedder = getEmbedder();
const docs = await loadCorpus();
const { chunks } = chunkCorpus(docs, 200);
const TABLE = 'lab02_chunks';
console.log(`   embedder: ${embedder.id} (${embedder.dims} dims)\n`);

try {
  await report('schema: vector column sized to the embedder + HNSW index', async () => {
    await lab.createSchema(sql, embedder.dims, TABLE);
    const col = await sql`SELECT format_type(atttypid, atttypmod) AS t FROM pg_attribute WHERE attrelid = ${TABLE}::regclass AND attname = 'embedding'`;
    assert.equal(col[0]!.t, `vector(${embedder.dims})`);
    const idx = await sql`SELECT indexdef FROM pg_indexes WHERE tablename = ${TABLE} AND indexdef ILIKE '%hnsw%'`;
    assert.match(idx[0]!.indexdef, /vector_cosine_ops/);
  });

  await report('index the whole corpus', async () => {
    const t0 = Date.now();
    const n = await lab.indexChunks(sql, chunks, docs, embedder, TABLE);
    console.log(`   ${n} chunks embedded and inserted in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    assert.equal(n, chunks.length);
    const c = (await sql`SELECT count(*)::int AS c FROM ${sql(TABLE)} WHERE status = 'deprecated'`)[0]!.c as number;
    assert.ok(c > 0, 'chunks from the archived policy carry status=deprecated');
  });

  await report('semantic search: a paraphrase finds the rollback section', async () => {
    const hits = await lab.vectorSearch(sql, embedder, 'How do I undo a bad release?', 3, { table: TABLE });
    for (const h of hits) console.log(`   ${h.score.toFixed(3)}  ${h.file} › ${h.section}`);
    assert.equal(hits[0]!.section, 'Rolling back a bad release');
    assert.ok(hits[0]!.score >= hits[1]!.score, 'sorted by similarity');
  });

  await report('metadata filter: exclude deprecated documents', async () => {
    const q = 'How many days does a customer have to request a refund?';
    const all = await lab.vectorSearch(sql, embedder, q, 5, { table: TABLE });
    const current = await lab.vectorSearch(sql, embedder, q, 5, { table: TABLE, onlyCurrent: true });
    console.log(`   unfiltered top-5 includes the 2024 policy: ${all.some((h) => h.file === 'refund-policy-2024.md')}`);
    assert.ok(current.every((h) => h.file !== 'refund-policy-2024.md'));
    assert.ok(current.some((h) => h.section === 'Refund policy'));
  });

  await report('EXPLAIN shows the HNSW index is used', async () => {
    const plan = await lab.explainSearch(sql, embedder.dims, TABLE);
    console.log('   ' + plan.split('\n').slice(0, 2).map((l) => l.slice(0, 90)).join('\n   '));
    assert.match(plan, /Index Scan using .*hnsw/i);
  });

  await report('ANN trades recall for speed: ef_search 10 vs 100 on 20k vectors', async () => {
    const low = await lab.annRecall(sql, { n: 20_000, dims: 128, queries: 20, k: 10, efSearch: 10 });
    const high = await lab.annRecall(sql, { n: 20_000, dims: 128, queries: 20, k: 10, efSearch: 100 });
    console.log(`   recall@10: ef_search=10 → ${(low * 100).toFixed(0)}%   ef_search=100 → ${(high * 100).toFixed(0)}%`);
    assert.ok(high > low, 'a wider search finds more of the true neighbours');
    assert.ok(high >= 0.9);
  });

  await report('pgvector limit: HNSW cannot index more than 2,000 dims (use halfvec)', async () => {
    await sql`DROP TABLE IF EXISTS lab02_big`;
    await sql`CREATE TABLE lab02_big (e vector(3072))`;
    await assert.rejects(sql`CREATE INDEX ON lab02_big USING hnsw (e vector_cosine_ops)`, /2000 dimensions/);
    await sql`DROP TABLE lab02_big`;
    await sql`CREATE TABLE lab02_big (e halfvec(3072))`;
    await sql`CREATE INDEX ON lab02_big USING hnsw (e halfvec_cosine_ops)`;
    await sql`DROP TABLE lab02_big`;
  });
} finally {
  await sql.end();
}
summary();

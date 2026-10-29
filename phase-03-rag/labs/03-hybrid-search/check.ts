// Usage: npx tsx check.ts [starter|solution]   (needs: npm run db:up)
import assert from 'node:assert/strict';
import { loadImpl, report, summary } from '../../../shared/lab-harness.ts';
import { loadCorpus } from '../../../shared/corpus.ts';
import { connectOrExplain } from '../../../shared/db.ts';
import { getEmbedder } from '../../../shared/embeddings.ts';
import { chunkCorpus } from '../01-chunking/solution/index.ts';
import { createSchema, indexChunks, vectorSearch } from '../02-pgvector/solution/index.ts';

type Impl = typeof import('./solution/index.ts');
const lab = await loadImpl<Impl>(import.meta.url);
const sql = await connectOrExplain();
const embedder = getEmbedder();
const TABLE = 'lab03_chunks';
const docs = await loadCorpus();
await createSchema(sql, embedder.dims, TABLE);
await indexChunks(sql, chunkCorpus(docs, 200).chunks, docs, embedder, TABLE);
console.log(`   embedder: ${embedder.id}\n`);
const opts = { table: TABLE };
const fmt = (h: { file: string; section: string }) => `${h.file} › ${h.section || '(intro)'}`;

try {
  await report('RRF math: ranks, not scores', () => {
    const a = [{ id: 'x' }, { id: 'y' }] as any;
    const b = [{ id: 'y' }, { id: 'z' }] as any;
    const fused = lab.rrf({ a, b }, 60);
    assert.deepEqual(fused.map((f) => f.id), ['y', 'x', 'z'], 'y is 2nd in one list and 1st in the other, so it wins');
    assert.ok(Math.abs(fused[0]!.rrf - (1 / 62 + 1 / 61)) < 1e-12);
    assert.deepEqual(fused[0]!.ranks, { a: 2, b: 1 });
  });

  await report('extractIdentifiers finds codes users type exactly', () => {
    assert.deepEqual(lab.extractIdentifiers('Why E-4290 after INV-20260412 on SEV1?'), ['E-4290', 'INV-20260412', 'SEV1']);
    assert.deepEqual(lab.extractIdentifiers('how do I roll back'), []);
  });

  await report('migration: generated tsvector column + GIN index', async () => {
    await lab.addFullTextSearch(sql, TABLE);
    const idx = await sql`SELECT indexdef FROM pg_indexes WHERE tablename = ${TABLE} AND indexdef ILIKE '%gin%'`;
    assert.equal(idx.length, 1);
  });

  const cases = [
    { q: 'E-4290', expect: 'Rate limit errors', kind: 'exact code' },
    { q: 'INV-20260412', expect: 'Duplicate charges', kind: 'exact id' },
    { q: 'How do I undo a bad release?', expect: 'Rolling back a bad release', kind: 'paraphrase' },
    { q: 'Are text message codes OK for two-factor login?', expect: 'Accounts and sign-in', kind: 'paraphrase' },
  ];

  await report('keyword vs vector vs hybrid on codes and paraphrases', async () => {
    let hybridWins = 0;
    for (const c of cases) {
      const [kw, vec, hyb] = await Promise.all([lab.keywordSearch(sql, c.q, 3, opts), vectorSearch(sql, embedder, c.q, 3, opts), lab.hybridSearch(sql, embedder, c.q, 3, opts)]);
      const ok = (h?: { section: string }) => (h?.section === c.expect ? '✓' : '✗');
      console.log(`   [${c.kind}] "${c.q}"\n      keyword ${ok(kw[0])} ${kw[0] ? fmt(kw[0]) : '(none)'}\n      vector  ${ok(vec[0])} ${fmt(vec[0]!)}\n      hybrid  ${ok(hyb[0])} ${fmt(hyb[0]!)}  ranks ${JSON.stringify(hyb[0]!.ranks)}`);
      if (hyb[0]!.section === c.expect) hybridWins++;
    }
    assert.equal(hybridWins, cases.length, 'hybrid should get every case right at rank 1');
  });

  await report('keyword search nails exact identifiers', async () => {
    const kw = await lab.keywordSearch(sql, 'E-4290', 3, opts);
    assert.equal(kw[0]!.section, 'Rate limit errors');
    const inv = await lab.keywordSearch(sql, 'INV-20260412', 3, opts);
    assert.equal(inv[0]!.section, 'Duplicate charges');
  });
} finally {
  await sql.end();
}
summary();

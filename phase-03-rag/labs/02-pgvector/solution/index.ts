// pgvector: store embeddings next to your data in Postgres and search them with SQL.
import type { Sql } from '../../../../shared/db.ts';
import { toPgVector, type Embedder } from '../../../../shared/embeddings.ts';
import type { Chunk } from '../../01-chunking/solution/index.ts';
import type { Doc } from '../../../../shared/corpus.ts';

/** Schema for one embedder. Dimensions are part of the column type, so the table is tied to the embedding model. */
export async function createSchema(sql: Sql, dims: number, table = 'chunks') {
  await sql.unsafe(`
    DROP TABLE IF EXISTS ${table};
    CREATE TABLE ${table} (
      id          text PRIMARY KEY,
      doc_id      text NOT NULL,
      file        text NOT NULL,
      title       text NOT NULL,
      section     text NOT NULL,
      status      text NOT NULL DEFAULT 'current',
      content     text NOT NULL,
      embedder    text NOT NULL,
      embedding   vector(${dims}) NOT NULL
    );
    -- HNSW: graph-based approximate nearest neighbour index. Cosine ops to match normalized embeddings.
    CREATE INDEX ${table}_embedding_hnsw ON ${table} USING hnsw (embedding vector_cosine_ops);
    CREATE INDEX ${table}_status ON ${table} (status);
  `);
}

/** Embed and insert chunks in batches. Returns how many rows were written. */
export async function indexChunks(sql: Sql, chunks: Chunk[], docs: Doc[], embedder: Embedder, table = 'chunks'): Promise<number> {
  const statusOf = new Map(docs.map((d) => [d.id, d.meta.status ?? 'current']));
  const vectors = await embedder.embedDocuments(chunks.map((c) => c.embedText));
  const rows = chunks.map((c, i) => ({
    id: c.id,
    doc_id: c.docId,
    file: c.file,
    title: c.title,
    section: c.section,
    status: statusOf.get(c.docId) ?? 'current',
    content: c.text,
    embedder: embedder.id,
    embedding: toPgVector(vectors[i]!),
  }));
  for (let i = 0; i < rows.length; i += 100) await sql`INSERT INTO ${sql(table)} ${sql(rows.slice(i, i + 100))}`;
  return rows.length;
}

export interface Hit {
  id: string;
  file: string;
  section: string;
  content: string;
  score: number; // cosine similarity, 1 = identical direction
}

export async function vectorSearch(sql: Sql, embedder: Embedder, query: string, k = 5, opts: { onlyCurrent?: boolean; table?: string } = {}): Promise<Hit[]> {
  const q = toPgVector(await embedder.embedQuery(query));
  const table = opts.table ?? 'chunks';
  // <=> is cosine DISTANCE (0 = same). ORDER BY the raw operator so Postgres can use the HNSW index.
  return sql<Hit[]>`
    SELECT id, file, section, content, 1 - (embedding <=> ${q}::vector) AS score
    FROM ${sql(table)}
    WHERE ${opts.onlyCurrent ? sql`status = 'current'` : sql`true`}
    ORDER BY embedding <=> ${q}::vector
    LIMIT ${k}`;
}

/** Ask the planner how it would run the query: we want to see the HNSW index, not a sequential scan. */
export async function explainSearch(sql: Sql, dims: number, table = 'chunks'): Promise<string> {
  const q = toPgVector(Array.from({ length: dims }, (_, i) => (i === 0 ? 1 : 0)));
  await sql`SET enable_seqscan = off`; // tiny tables make seq scans "cheaper"; force the realistic plan for the demo
  const rows = await sql.unsafe(`EXPLAIN SELECT id FROM ${table} ORDER BY embedding <=> '${q}'::vector LIMIT 5`);
  await sql`RESET enable_seqscan`;
  return rows.map((r: any) => r['QUERY PLAN']).join('\n');
}

/**
 * ANN vs exact: on a larger random dataset, compare HNSW results at a given ef_search with brute force.
 * Returns recall@k (share of the true nearest neighbours the index found) averaged over queries.
 */
export async function annRecall(sql: Sql, opts: { n: number; dims: number; queries: number; k: number; efSearch: number }): Promise<number> {
  const rand = mulberry(42);
  const vec = () => toPgVector(normalize(Array.from({ length: opts.dims }, () => rand() - 0.5)));
  const exists = await sql`SELECT count(*)::int AS n FROM pg_tables WHERE tablename = 'ann_bench'`;
  const sized = exists[0]!.n ? (await sql`SELECT count(*)::int AS n FROM ann_bench`)[0]!.n === opts.n : false;
  if (!sized) {
    await sql.unsafe(`DROP TABLE IF EXISTS ann_bench; CREATE TABLE ann_bench (id int PRIMARY KEY, embedding vector(${opts.dims}))`);
    const rows = Array.from({ length: opts.n }, (_, id) => ({ id, embedding: vec() }));
    for (let i = 0; i < rows.length; i += 1000) await sql`INSERT INTO ann_bench ${sql(rows.slice(i, i + 1000))}`;
    await sql.unsafe(`CREATE INDEX ON ann_bench USING hnsw (embedding vector_cosine_ops)`);
  }
  let found = 0;
  for (let i = 0; i < opts.queries; i++) {
    const q = vec();
    const exact = await sql.begin(async (tx) => {
      await tx`SET LOCAL enable_indexscan = off`; // force brute force: the ground truth
      return tx`SELECT id FROM ann_bench ORDER BY embedding <=> ${q}::vector LIMIT ${opts.k}`;
    });
    const ann = await sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL hnsw.ef_search = ${opts.efSearch}`);
      return tx`SELECT id FROM ann_bench ORDER BY embedding <=> ${q}::vector LIMIT ${opts.k}`;
    });
    const truth = new Set(exact.map((r) => r.id));
    found += ann.filter((r) => truth.has(r.id)).length;
  }
  return found / (opts.queries * opts.k);
}

function normalize(v: number[]) {
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
}
function mulberry(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

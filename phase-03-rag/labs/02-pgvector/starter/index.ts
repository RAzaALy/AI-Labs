// pgvector: store embeddings next to your data in Postgres and search them with SQL.
import type { Sql } from '../../../../shared/db.ts';
import { toPgVector, type Embedder } from '../../../../shared/embeddings.ts';
import type { Chunk } from '../../01-chunking/solution/index.ts';
import type { Doc } from '../../../../shared/corpus.ts';

/** Schema for one embedder. Dimensions are part of the column type, so the table is tied to the embedding model. */
export async function createSchema(sql: Sql, dims: number, table = 'chunks') {
  // TODO: DROP + CREATE TABLE ${table} (id, doc_id, file, title, section, status default 'current', content,
  //  embedder, embedding vector(${dims})), an HNSW index with vector_cosine_ops, and an index on status. Use sql.unsafe.
  throw new Error('TODO: createSchema');
}

/** Embed and insert chunks in batches. Returns how many rows were written. */
export async function indexChunks(sql: Sql, chunks: Chunk[], docs: Doc[], embedder: Embedder, table = 'chunks'): Promise<number> {
  // TODO: embed chunk.embedText in one embedDocuments call, build rows (status from doc.meta.status),
  //  embedding: toPgVector(v), and INSERT in batches of 100: sql`INSERT INTO ${sql(table)} ${sql(rows)}`
  void toPgVector;
  throw new Error('TODO: indexChunks');
}

export interface Hit {
  id: string;
  file: string;
  section: string;
  content: string;
  score: number; // cosine similarity, 1 = identical direction
}

export async function vectorSearch(sql: Sql, embedder: Embedder, query: string, k = 5, opts: { onlyCurrent?: boolean; table?: string } = {}): Promise<Hit[]> {
  // TODO: q = toPgVector(await embedder.embedQuery(query));
  //  SELECT id, file, section, content, 1 - (embedding <=> q::vector) AS score ... ORDER BY embedding <=> q::vector LIMIT k
  //  (order by the OPERATOR so the HNSW index is used). Filter status = 'current' when opts.onlyCurrent.
  throw new Error('TODO: vectorSearch');
}

/** Ask the planner how it would run the query: we want to see the HNSW index, not a sequential scan. */
export async function explainSearch(sql: Sql, dims: number, table = 'chunks'): Promise<string> {
  // TODO: SET enable_seqscan = off; run EXPLAIN on the ORDER BY embedding <=> ... LIMIT 5 query; RESET; return the plan text.
  throw new Error('TODO: explainSearch');
}

/**
 * ANN vs exact: on a larger random dataset, compare HNSW results at a given ef_search with brute force.
 * Returns recall@k (share of the true nearest neighbours the index found) averaged over queries.
 */
export async function annRecall(sql: Sql, opts: { n: number; dims: number; queries: number; k: number; efSearch: number }): Promise<number> {
  // TODO (provided helpers: mulberry, normalize):
  //  create ann_bench (n random normalized vectors) + HNSW index once;
  //  for each query: ground truth with SET LOCAL enable_indexscan = off, ANN with SET LOCAL hnsw.ef_search = efSearch
  //  (each inside sql.begin), and count how many true neighbours the ANN result contains.
  void mulberry; void normalize;
  throw new Error('TODO: annRecall');
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

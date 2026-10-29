// Hybrid retrieval (Labs 02–03): vector + keyword in parallel, fused with Reciprocal Rank Fusion.
import { tables, type Sql } from './db';
import { toPgVector, type Embedder } from './embeddings';

export interface Hit {
  id: string;
  file: string;
  section: string;
  content: string;
  score: number;
}
export interface Fused extends Hit {
  rrf: number;
  ranks: { keyword?: number; vector?: number };
}

/** Codes like E-4012, INV-20260412, SEV1: users type them exactly and embeddings blur them. */
export const extractIdentifiers = (q: string) => [...new Set(q.match(/\b[A-Z]{1,5}-?\d{1,10}\b/g) ?? [])];

export async function vectorSearch(sql: Sql, embedder: Embedder, query: string, k: number): Promise<Hit[]> {
  const t = tables(embedder.dims);
  const v = toPgVector(await embedder.embedQuery(query));
  // Deprecated documents never reach the model: the old refund policy can't leak into answers.
  return sql<Hit[]>`
    SELECT c.id, c.file, c.section, c.content, 1 - (c.embedding <=> ${v}::vector) AS score
    FROM ${sql(t.chunks)} c JOIN ${sql(t.docs)} d ON d.id = c.doc_id
    WHERE d.status = 'current'
    ORDER BY c.embedding <=> ${v}::vector
    LIMIT ${k}`;
}

export async function keywordSearch(sql: Sql, dims: number, query: string, k: number): Promise<Hit[]> {
  // TODO (AC3): full-text search over c.tsv, joined to the docs table, current documents only.
  //  - OR the question's lexemes: to_tsquery('english', array_to_string(tsvector_to_array(to_tsvector('english', query)), ' | '))
  //  - rank with ts_rank_cd, plus +1 for every identifier from extractIdentifiers(query) found with content ILIKE '%ID%'
  //    (Postgres' English parser splits "E-4290" into 'e' and '-4290', so exact codes need this boost)
  void [tables(dims), extractIdentifiers, sql, query, k];
  throw new Error('TODO: keywordSearch');
}

export function rrf(lists: Record<string, Hit[]>, k = 60): Fused[] {
  // TODO (Lab 03): score(d) = Σ over lists of 1 / (k + rank), rank starting at 1. Record each list's rank in f.ranks.
  void [lists, k];
  throw new Error('TODO: rrf');
}

export async function hybridSearch(sql: Sql, embedder: Embedder, query: string, k = 5, candidates = 20): Promise<Fused[]> {
  // TODO: run keywordSearch and vectorSearch IN PARALLEL with `candidates` results each, fuse with rrf, keep the top k.
  void [sql, embedder, query, k, candidates];
  throw new Error('TODO: hybridSearch');
}

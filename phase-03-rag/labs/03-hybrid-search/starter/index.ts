// Hybrid search: keyword (full-text) + vector, fused with Reciprocal Rank Fusion (RRF).
import type { Sql } from '../../../../shared/db.ts';
import type { Embedder } from '../../../../shared/embeddings.ts';
import { vectorSearch, type Hit } from '../../02-pgvector/solution/index.ts';

/**
 * A migration on the existing table: a generated tsvector column (section title weighted higher than body)
 * plus a GIN index. Generated columns keep the keyword index in sync automatically.
 */
export async function addFullTextSearch(sql: Sql, table = 'chunks') {
  // TODO: ALTER TABLE ADD COLUMN IF NOT EXISTS tsv tsvector GENERATED ALWAYS AS (
  //   setweight(to_tsvector('english', coalesce(section,'')), 'A') || setweight(to_tsvector('english', content), 'B')) STORED;
  //  CREATE INDEX IF NOT EXISTS ... USING gin (tsv);
  throw new Error('TODO: addFullTextSearch');
}

/**
 * Keyword search. Questions are long and natural; requiring EVERY word (AND) usually matches nothing,
 * so we OR the query's lexemes and let ts_rank_cd reward chunks matching more (and rarer-in-the-doc) terms.
 * Note: Postgres ranking is not BM25 (no corpus-wide IDF). For BM25 see ParadeDB pg_search.
 */
export async function keywordSearch(sql: Sql, query: string, k = 5, opts: { onlyCurrent?: boolean; table?: string } = {}): Promise<Hit[]> {
  // TODO: OR the query's lexemes: to_tsquery('english', array_to_string(tsvector_to_array(to_tsvector('english', q)), ' | '))
  //  rank with ts_rank_cd(tsv, query) + 1 for each identifier (extractIdentifiers) found with ILIKE in content,
  //  WHERE tsv @@ query OR content ILIKE ANY(patterns). Order by score desc, limit k.
  throw new Error('TODO: keywordSearch');
}

/** Codes like E-4012, INV-20260412, SEV1, ORD-1001: things users type exactly and embeddings blur. */
export function extractIdentifiers(query: string): string[] {
  // TODO: unique matches of /\b[A-Z]{1,5}-?\d{1,10}\b/g
  throw new Error('TODO: extractIdentifiers');
}

export interface Fused extends Hit {
  rrf: number;
  ranks: { keyword?: number; vector?: number };
}

/**
 * Reciprocal Rank Fusion: score(d) = Σ 1 / (k + rank_i(d)). Uses only ranks, so it needs no score
 * normalisation between systems whose scores live on different scales (ts_rank vs cosine).
 */
export function rrf(lists: Record<string, Hit[]>, k = 60): Fused[] {
  // TODO: for every list and every hit at position i: score += 1 / (k + i + 1); remember ranks[listName] = i + 1.
  //  Return the fused hits sorted by score descending.
  throw new Error('TODO: rrf');
}

export async function hybridSearch(sql: Sql, embedder: Embedder, query: string, k = 5, opts: { candidates?: number; onlyCurrent?: boolean; table?: string } = {}): Promise<Fused[]> {
  // TODO: run keywordSearch and vectorSearch in parallel (top `candidates` each), fuse with rrf, slice to k.
  void vectorSearch;
  throw new Error('TODO: hybridSearch');
}

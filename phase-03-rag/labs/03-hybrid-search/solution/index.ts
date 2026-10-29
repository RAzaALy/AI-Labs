// Hybrid search: keyword (full-text) + vector, fused with Reciprocal Rank Fusion (RRF).
import type { Sql } from '../../../../shared/db.ts';
import type { Embedder } from '../../../../shared/embeddings.ts';
import { vectorSearch, type Hit } from '../../02-pgvector/solution/index.ts';

/**
 * A migration on the existing table: a generated tsvector column (section title weighted higher than body)
 * plus a GIN index. Generated columns keep the keyword index in sync automatically.
 */
export async function addFullTextSearch(sql: Sql, table = 'chunks') {
  await sql.unsafe(`
    ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS tsv tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(section, '')), 'A') ||
        setweight(to_tsvector('english', content), 'B')
      ) STORED;
    CREATE INDEX IF NOT EXISTS ${table}_tsv_gin ON ${table} USING gin (tsv);
  `);
}

/**
 * Keyword search. Questions are long and natural; requiring EVERY word (AND) usually matches nothing,
 * so we OR the query's lexemes and let ts_rank_cd reward chunks matching more (and rarer-in-the-doc) terms.
 * Note: Postgres ranking is not BM25 (no corpus-wide IDF). For BM25 see ParadeDB pg_search.
 */
export async function keywordSearch(sql: Sql, query: string, k = 5, opts: { onlyCurrent?: boolean; table?: string } = {}): Promise<Hit[]> {
  const table = opts.table ?? 'chunks';
  // The English parser turns "E-4290" into the lexemes 'e' and '-4290', so every chunk that lists error
  // codes matches on 'e'. Identifiers need EXACT matching: find them in the query and boost exact hits.
  // (At scale, back this ILIKE with a pg_trgm GIN index.)
  const ids = extractIdentifiers(query);
  const patterns = ids.map((id) => `%${id}%`);
  return sql<Hit[]>`
    WITH q AS (
      SELECT to_tsquery('english', array_to_string(tsvector_to_array(to_tsvector('english', ${query})), ' | ')) AS query
    )
    SELECT id, file, section, content,
           ts_rank_cd(tsv, q.query)
             + (SELECT count(*) FROM unnest(${patterns}::text[]) AS p WHERE content ILIKE p) AS score
    FROM ${sql(table)}, q
    WHERE (tsv @@ q.query OR content ILIKE ANY(${patterns}::text[]))
      AND ${opts.onlyCurrent ? sql`status = 'current'` : sql`true`}
    ORDER BY score DESC, id
    LIMIT ${k}`;
}

/** Codes like E-4012, INV-20260412, SEV1, ORD-1001: things users type exactly and embeddings blur. */
export function extractIdentifiers(query: string): string[] {
  return [...new Set(query.match(/\b[A-Z]{1,5}-?\d{1,10}\b/g) ?? [])];
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
  const byId = new Map<string, Fused>();
  for (const [name, hits] of Object.entries(lists)) {
    hits.forEach((h, i) => {
      const f = byId.get(h.id) ?? { ...h, rrf: 0, ranks: {} };
      f.rrf += 1 / (k + i + 1);
      (f.ranks as Record<string, number>)[name] = i + 1;
      byId.set(h.id, f);
    });
  }
  return [...byId.values()].sort((a, b) => b.rrf - a.rrf);
}

export async function hybridSearch(sql: Sql, embedder: Embedder, query: string, k = 5, opts: { candidates?: number; onlyCurrent?: boolean; table?: string } = {}): Promise<Fused[]> {
  const n = opts.candidates ?? 20;
  const [keyword, vector] = await Promise.all([keywordSearch(sql, query, n, opts), vectorSearch(sql, embedder, query, n, opts)]);
  return rrf({ keyword, vector }).slice(0, k);
}

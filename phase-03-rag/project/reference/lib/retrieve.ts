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
  const t = tables(dims);
  const patterns = extractIdentifiers(query).map((id) => `%${id}%`);
  // OR the query's lexemes (AND over a natural-language question matches nothing), plus an exact-identifier boost.
  return sql<Hit[]>`
    WITH q AS (SELECT to_tsquery('english', array_to_string(tsvector_to_array(to_tsvector('english', ${query})), ' | ')) AS query)
    SELECT c.id, c.file, c.section, c.content,
           ts_rank_cd(c.tsv, q.query) + (SELECT count(*) FROM unnest(${patterns}::text[]) AS p WHERE c.content ILIKE p) AS score
    FROM ${sql(t.chunks)} c JOIN ${sql(t.docs)} d ON d.id = c.doc_id, q
    WHERE d.status = 'current' AND (c.tsv @@ q.query OR c.content ILIKE ANY(${patterns}::text[]))
    ORDER BY score DESC, c.id
    LIMIT ${k}`;
}

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

export async function hybridSearch(sql: Sql, embedder: Embedder, query: string, k = 5, candidates = 20): Promise<Fused[]> {
  const [keyword, vector] = await Promise.all([keywordSearch(sql, embedder.dims, query, candidates), vectorSearch(sql, embedder, query, candidates)]);
  return rrf({ keyword, vector }).slice(0, k);
}

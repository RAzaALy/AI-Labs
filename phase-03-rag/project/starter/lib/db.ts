import postgres from 'postgres';

export type Sql = postgres.Sql;

// One pool per server process (Next.js dev reloads modules, so keep it on globalThis).
const g = globalThis as unknown as { __docsSql?: Sql };

export function db(): Sql {
  g.__docsSql ??= postgres(process.env.DATABASE_URL ?? 'postgres://app:app@localhost:5433/rag', { max: 10, onnotice: () => {} });
  return g.__docsSql;
}

/**
 * The vector column's dimensions are part of the table type, so each embedder size gets its own pair of
 * tables (kb_docs_384 + kb_chunks_384, kb_docs_768 + ...). Switching models = new tables + re-ingest, never mixing.
 */
export const tables = (dims: number) => ({ docs: `kb_docs_${dims}`, chunks: `kb_chunks_${dims}` });

export async function ensureSchema(sql: Sql, dims: number) {
  const t = tables(dims);
  await sql.unsafe(`
    CREATE EXTENSION IF NOT EXISTS vector;
    CREATE TABLE IF NOT EXISTS ${t.docs} (
      id          text PRIMARY KEY,               -- path relative to the corpus folder
      title       text NOT NULL,
      status      text NOT NULL DEFAULT 'current',
      updated     text,
      hash        text NOT NULL,                  -- sha256 of the raw file: unchanged docs are skipped on re-ingest
      ingested_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS ${t.chunks} (
      id        text PRIMARY KEY,
      doc_id    text NOT NULL REFERENCES ${t.docs}(id) ON DELETE CASCADE,
      file      text NOT NULL,
      section   text NOT NULL,
      content   text NOT NULL,
      embedder  text NOT NULL,
      embedding vector(${dims}) NOT NULL,
      tsv       tsvector GENERATED ALWAYS AS (
                  setweight(to_tsvector('english', coalesce(section, '')), 'A') ||
                  setweight(to_tsvector('english', content), 'B')) STORED
    );
    CREATE INDEX IF NOT EXISTS ${t.chunks}_hnsw ON ${t.chunks} USING hnsw (embedding vector_cosine_ops);
    CREATE INDEX IF NOT EXISTS ${t.chunks}_tsv ON ${t.chunks} USING gin (tsv);
    CREATE INDEX IF NOT EXISTS ${t.chunks}_doc ON ${t.chunks} (doc_id);
  `);
}

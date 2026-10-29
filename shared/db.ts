// Postgres connection for the RAG labs. Uses the TEST database by default so labs never clobber
// the data your project app uses. Start the database with: npm run db:up
import 'dotenv/config';
import postgres from 'postgres';

export type Sql = postgres.Sql;

export function connect(url = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL ?? 'postgres://app:app@localhost:5433/rag_test'): Sql {
  return postgres(url, { max: 5, onnotice: () => {} });
}

/** Fail fast with a helpful message instead of a cryptic ECONNREFUSED. */
export async function connectOrExplain(): Promise<Sql> {
  const sql = connect();
  try {
    await sql`select 1`;
    return sql;
  } catch (e) {
    await sql.end({ timeout: 1 }).catch(() => {});
    throw new Error(`Cannot reach Postgres (${(e as Error).message}). Start it with: npm run db:up`);
  }
}

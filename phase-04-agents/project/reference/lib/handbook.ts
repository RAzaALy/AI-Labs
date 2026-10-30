// The handbook tool reuses Phase 3's retrieval as-is: same Postgres tables, same hybrid search + RRF.
// The project builds on the previous one; it does not re-implement it.
import { db as kbDb } from '../../../../phase-03-rag/project/reference/lib/db';
import { getEmbedder } from '../../../../phase-03-rag/project/reference/lib/embeddings';
import { hybridSearch } from '../../../../phase-03-rag/project/reference/lib/retrieve';
import { ToolError } from './ops';

export async function searchHandbook(query: string, k = 3) {
  try {
    const hits = await hybridSearch(kbDb(), getEmbedder(), query, k);
    if (hits.length === 0) throw new ToolError('No handbook section matched. Try different keywords.');
    return hits.map((h) => ({ source: `${h.file} › ${h.section || '(intro)'}`, excerpt: h.content.length > 700 ? h.content.slice(0, 700) + '…' : h.content }));
  } catch (e) {
    if (e instanceof ToolError) throw e;
    if (/does not exist/.test((e as Error).message)) throw new ToolError('The handbook index is empty. An operator must run `npm run ingest` in phase-03-rag/project/reference. Continue without policy lookups and say so.');
    throw e;
  }
}

/** Phase 3's search has its own connection pool; CLI scripts must close it too or the process never exits. */
export const closeHandbook = () => kbDb().end({ timeout: 5 });

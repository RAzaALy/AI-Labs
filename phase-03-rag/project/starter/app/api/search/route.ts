// Retrieval only, no LLM: the endpoint you debug retrieval with (and what the eval script measures).
import { db } from '@/lib/db';
import { getEmbedder } from '@/lib/embeddings';
import { hybridSearch } from '@/lib/retrieve';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() ?? '';
  const k = Math.min(20, Math.max(1, Number(url.searchParams.get('k') ?? 5) || 5));
  if (!q) return Response.json({ error: 'missing ?q=' }, { status: 400 });
  if (q.length > 2000) return Response.json({ error: 'query too long' }, { status: 413 });
  const embedder = getEmbedder();
  const started = Date.now();
  try {
    const hits = await hybridSearch(db(), embedder, q, k);
    return Response.json({ query: q, embedder: embedder.id, ms: Date.now() - started, hits });
  } catch (e) {
    console.error(e);
    return Response.json({ error: 'search failed: is Postgres up and the corpus ingested?' }, { status: 503 });
  }
}

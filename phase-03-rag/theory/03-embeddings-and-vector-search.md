# 3. Embeddings at scale and vector search with pgvector

**Time:** 30 min · **Visualization:** [`hnsw-search.html`](../visualizations/hnsw-search.html) · **Lab:** [`labs/02-pgvector`](../labs/02-pgvector)

## The idea
Phase 1 covered what an embedding is. Production adds four questions:

1. **Which model?** Check the [MTEB leaderboard](https://huggingface.co/spaces/mteb/leaderboard), then **measure on your own golden set**. In Lab 05, Gemini embeddings beat local MiniLM by 0.08 R@1. Consider cost, latency, dimensions, languages, and whether data may leave your network.
2. **Query vs document:** many models are asymmetric. Gemini takes `taskType: RETRIEVAL_QUERY | RETRIEVAL_DOCUMENT`, and E5 expects `query:` / `passage:` prefixes. Use them.
3. **Dimensions:** more isn't automatically better. Matryoshka models (Gemini embedding 2, OpenAI v3) can be truncated (3,072 → 768) to save 4× storage, usually for a small quality cost.
4. **Index:** exact search is O(N). Approximate nearest neighbour (ANN) indexes trade recall for speed.

### pgvector in one table
| Feature | What to know |
|---|---|
| Types | `vector(n)` (fp32), `halfvec(n)` (fp16, half the storage), `sparsevec`, `bit` |
| Operators | `<=>` cosine distance, `<->` L2, `<#>` negative inner product. `ORDER BY` the operator so the index is used |
| HNSW | Graph index: best recall/speed; params `m`, `ef_construction` (build), `hnsw.ef_search` (query) |
| IVFFlat | Clustered lists: faster to build, needs data before building, lower recall |
| Limits | HNSW/IVFFlat on `vector` ≤ **2,000 dims**; `halfvec` ≤ 4,000 |
| Filtering | `WHERE` + ANN can return fewer than k rows; 0.8.x **iterative index scans** (`hnsw.iterative_scan`) keep searching |

## Web-engineering analogy
pgvector is **a new index type in the database you already run**: same backups, transactions, joins, RLS and tenancy as the rest of your data. HNSW is like a **skip list over a "nearest" relation**: hop through long links first, then refine locally, and `ef_search` is how many candidates you keep while walking.

## Trade-offs
| Choice | Upside | Downside |
|---|---|---|
| Postgres + pgvector | One system, joins with app data, transactional updates, row-level security | You tune and scale it; very large corpora (100M+) need care |
| Dedicated vector DB (Qdrant, Weaviate, Pinecone) | Built-in hybrid search, scaling features | Second source of truth to sync, another bill, another failure mode |
| Higher `ef_search` | Better recall | Slower queries (Lab 02: 19% → 92% recall going from 10 to 100 on random data) |
| `halfvec` | Half the memory, bigger dims indexable | Slight precision loss |

## ⚠️ Common mistakes
1. **Changing the embedding model without re-indexing.** Different dimensions fail loudly ("different vector dimensions 768 and 384"); the **same** dimensions fail silently. Store `embedder` per row.
2. **Ordering by an expression the index can't use** (`ORDER BY 1 - (e <=> q) DESC`), which forces a sequential scan. Check `EXPLAIN`.
3. **Indexing 3,072-dim vectors as `vector`.** Use `halfvec` or reduce dimensions.
4. **Filtering after ANN without iterative scans**, which returns 2 results when the user asked for 10.
5. **Re-embedding unchanged content on every deploy.** Hash the content and cache vectors (`shared/embeddings.ts` does this).

## Senior check
You can explain HNSW's recall/latency knob, pick pgvector vs a dedicated vector DB for a given scale and team, and design a re-embedding migration.

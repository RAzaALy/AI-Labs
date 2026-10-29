# Lab 02: pgvector, vectors in Postgres (≈60 min)

**Concept:** [theory/03-embeddings-and-vector-search.md](../../theory/03-embeddings-and-vector-search.md) · **Visualization:** [hnsw-search.html](../../visualizations/hnsw-search.html) · **Needs:** `npm run db:up` (embeddings run locally; Gemini is used when a key is set)

## Task
In `starter/index.ts`:
1. `createSchema`: a `vector(N)` column sized to the embedder, an **HNSW** index with `vector_cosine_ops`, and an index on `status`.
2. `indexChunks`: embed `embedText` in batches and insert.
3. `vectorSearch`: `ORDER BY embedding <=> $q` (cosine distance) so the index is used; optional `status = 'current'` filter.
4. `explainSearch`: prove the HNSW index is in the plan.
5. `annRecall`: compare HNSW at a given `ef_search` with brute force on 20,000 random vectors.

## Run
```bash
npm run db:up
npx tsx phase-03-rag/labs/02-pgvector/check.ts starter
```

## What to notice (measured while building this lab)
- `ef_search = 10` found **19%** of the true top 10; `ef_search = 100` found **92%**. HNSW is *approximate*, and the knob trades recall for speed. Random vectors are the worst case; real embeddings cluster and do better. Measure on your data.
- Without the `status` filter, the 2024 refund policy (14 days) shows up in the top 5 for refund questions. **Metadata filtering is part of retrieval**, not an afterthought.
- `vector(3072)` cannot get an HNSW index ("more than 2000 dimensions"). Use `halfvec(3072)`, or ask the model for fewer dimensions (Gemini: `outputDimensionality: 768`).
- Querying a 384-dim table with a 768-dim query fails with "different vector dimensions". That's good. Two models with the **same** dimension count fail silently instead, so store the embedder id with every vector.

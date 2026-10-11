# Lab 02: Embeddings and semantic search (≈45 min)

**Concept:** [theory/02-embeddings.md](../../theory/02-embeddings.md) · **No API key needed** (runs `all-MiniLM-L6-v2`, 384-dim, on CPU).

## Task
In `starter/index.ts`, implement:
1. `cosine(a, b)`: cosine similarity from scratch (no library).
2. `embed(texts)`: normalized sentence embeddings via the transformers.js `feature-extraction` pipeline with **mean pooling** and **normalize: true**.
3. `search(query, docs, k)`: brute-force top-k semantic search. This is exactly what a vector DB does, minus the index.
4. `similarityMatrix(texts)`: pairwise cosine.

## Run
```bash
npx tsx phase-01-how-llms-work/labs/02-embeddings/check.ts starter
```

## What to notice
- "The deploy succeeded." vs "The deploy did not succeed." scores **~0.87**: *opposite meanings, nearly identical vectors*.
- "The deploy succeeded." vs "The release went out without problems." scores only **~0.29**, even though they mean the same thing.
- That is the #1 embedding gotcha: **similarity is topic and wording overlap, not truth or relevance.** Phase 3 fixes it with hybrid search, reranking and retrieval evals.
- Brute-force search over 10k × 384-dim vectors is still only milliseconds. You don't need a vector DB for small corpora.

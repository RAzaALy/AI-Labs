# Lab 04: Reranking with a cross-encoder (≈45 min)

**Concept:** [theory/05-reranking.md](../../theory/05-reranking.md) · **Visualization:** [rerank-funnel.html](../../visualizations/rerank-funnel.html) · **Needs:** `npm run db:up` (the reranker runs locally: `mixedbread-ai/mxbai-rerank-xsmall-v1`, about 280 MB downloaded once)

## Task
1. `localCrossEncoder()`: wrap a transformers.js cross-encoder as an AI SDK **`RerankingModelV4`**, so the standard `rerank()` works with it exactly as `cohere.reranking('rerank-v4.0-pro')` would.
2. `retrieveAndRerank`: hybrid top-10 → cross-encoder → top-5.
3. The check measures MRR and recall@3 with and without reranking on the golden set.

## Run
```bash
npx tsx phase-03-rag/labs/04-reranking/check.ts starter
```

## What happened when this lab was built (honest numbers)
| First stage | MRR without → with rerank | recall@3 without → with | added latency (CPU) |
|---|---|---|---|
| Local MiniLM embeddings | 0.839 → **0.906** | 0.969 → 0.984 | ~1.9 s / query |
| Gemini embeddings | 0.964 → **0.901** | 0.969 → 0.984 | ~2.3 s / query |

- The first reranker tried (`ms-marco-MiniLM-L-6`) could not tell "the deploy succeeded" from "roll back with `acme deploy rollback`". It scored both near −9.8, so it was replaced.
- A reranker **helps a weak first stage and can hurt a strong one**, and on a laptop CPU it costs seconds. It earns its place on big, noisy corpora. You only know by measuring, which is what Lab 05 is for.

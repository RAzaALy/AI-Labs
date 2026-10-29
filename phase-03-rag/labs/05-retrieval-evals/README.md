# Lab 05: Retrieval evaluation (≈60 min)

**Concept:** [theory/07-retrieval-evaluation.md](../../theory/07-retrieval-evaluation.md) · **Visualization:** [retrieval-metrics.html](../../visualizations/retrieval-metrics.html) · **Needs:** `npm run db:up`

⚠️ **Most bad RAG answers are retrieval failures.** If the right section never reaches the model, no prompt can fix the answer. Measure retrieval on its own first.

## Task
1. `toSectionRanking`: collapse chunks to unique sections (labels are per section).
2. `recallAtK`, `precisionAtK`, `reciprocalRank`, `ndcgAtK`, written from scratch.
3. `evaluateRetriever`: run any retriever over the golden set (`corpus/golden-set.json`, 32 answerable questions) and average.
4. `assertThresholds`: a CI gate that names exactly what regressed.

## Run
```bash
npx tsx phase-03-rag/labs/05-retrieval-evals/check.ts starter
```

## Results when this lab was built
| config | R@1 (local / Gemini) | R@5 (local / Gemini) | MRR (local / Gemini) |
|---|---|---|---|
| keyword | 0.516 | 0.984 | 0.741 |
| vector | 0.797 / 0.875 | 0.922 / 0.969 | 0.862 / 0.948 |
| hybrid | 0.625 / 0.859 | **1.000** / 0.984 | 0.823 / 0.948 |

- Hybrid wins **recall@5**, the number that decides whether the answer is in the context at all. Vector-only had the better **top-1** with the local model, because fusion pushed a few exact answers to rank 2. Every config trades something, so pick the metric that matches how many chunks you send.
- Chunk sizes 200 and 400 score the same here because most handbook sections are under 200 tokens. Chunk size matters on long documents.
- Live runs hit Gemini's free embedding limit (100 requests per minute, **one per text**). `shared/embeddings.ts` now caches vectors on disk and paces requests: the first run waits ~26 s, and re-runs are instant.

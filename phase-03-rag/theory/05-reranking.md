# 5. Reranking

**Time:** 15 min · **Visualization:** [`rerank-funnel.html`](../visualizations/rerank-funnel.html) · **Lab:** [`labs/04-reranking`](../labs/04-reranking)

## The idea
Embeddings are **bi-encoders**: query and document are encoded separately, so retrieval is one fast vector comparison. A **cross-encoder** reads the query and a candidate *together* and outputs one relevance score, so it sees word-level interactions ("undo" ↔ "roll back", negation) that separate vectors miss. It's much slower, so it only runs on the top candidates:

```
corpus (millions) → hybrid retrieval → top 20–50 → cross-encoder → top 3–8 → LLM
```

Options: hosted (Cohere `rerank-v4.0-pro` via `cohere.reranking(...)`, Bedrock, Voyage) or local cross-encoders (Lab 04 wraps `mxbai-rerank-xsmall-v1` as an AI SDK `RerankingModelV4`). An LLM can also rerank, at a higher cost.

## Web-engineering analogy
Two-stage ranking is **a cheap DB index scan followed by an expensive application-level sort on the short list**, the same shape as "fetch 50 products by filter, then rank by a personalised model".

## Trade-offs
| Choice | Upside | Downside |
|---|---|---|
| No reranker | Fast, simple | Precision limited by the first stage |
| Local cross-encoder | Free, private | CPU seconds per query (≈2 s for 10 candidates on this laptop) |
| Hosted reranker | Strong models, fast GPUs | Per-query cost, data leaves your network |
| More candidates | Higher chance the answer is in the pool | Linear latency and cost |

## What Lab 04 measured
- A tiny `ms-marco-MiniLM-L-6` reranker scored "the deploy succeeded" and "roll back with `acme deploy rollback`" nearly the same, so it was replaced.
- With `mxbai-rerank-xsmall`: MRR **0.839 → 0.906** on top of weak local retrieval, but **0.964 → 0.901** on top of strong Gemini hybrid retrieval.

## ⚠️ Common mistakes
1. **Assuming a reranker always helps.** It can lower MRR on a strong first stage. Evaluate it.
2. **Reranking without the heading**, which loses context. Send `section + content`.
3. **Ignoring latency budgets.** Reranking adds serial time before the first token. Cap candidates, cache, or use a GPU or hosted model.
4. **Thresholding raw reranker scores across models.** They aren't calibrated across models (Lab 04's scores are negative logits).

## Senior check
You can explain bi-encoder vs cross-encoder, place reranking in the latency budget, and decide from metrics whether to ship it.

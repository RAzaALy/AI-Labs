# 4. Hybrid search: keyword + vector

**Time:** 20 min · **Visualization:** [`hybrid-rrf.html`](../visualizations/hybrid-rrf.html) · **Lab:** [`labs/03-hybrid-search`](../labs/03-hybrid-search)

## The idea
Vector search finds **meaning** ("undo a bad release" → "roll back"). Keyword search finds **exact tokens** (`E-4290`, `INV-20260412`, product names, people, flags). Each fails where the other shines, so run both and merge.

**Reciprocal Rank Fusion (RRF)** merges ranked lists using ranks only:

```
score(doc) = Σ over lists  1 / (k + rank_in_list(doc))     with k ≈ 60
```

No score normalisation is needed (cosine similarity and `ts_rank` live on unrelated scales). A document ranked well by both lists beats one ranked first by only one.

### Keyword search in Postgres
- A `tsvector` **generated column** + GIN index keeps itself in sync with the text.
- Weight the section title above the body (`setweight(..., 'A')`).
- Natural questions + AND semantics usually match nothing, so OR the lexemes and let the ranking reward overlap.
- ⚠️ The English parser splits `E-4290` into `e` and `-4290`. In Lab 03 every error-code chunk matched on `e`, and the wrong section ranked first. Detect identifiers in the query and boost exact matches (`ILIKE`, backed by `pg_trgm` at scale).
- `ts_rank_cd` isn't BM25 (no corpus-wide IDF). ParadeDB's `pg_search` adds BM25 inside Postgres, if you need it.

## Web-engineering analogy
It's the **site search that also checks the SKU field**: full-text relevance for prose, exact lookup for identifiers, and a merge step on top, like a federated search page combining two backends.

## Trade-offs
| Choice | Upside | Downside |
|---|---|---|
| Vector only | Handles paraphrase, multilingual | Blind to exact codes and rare names (local MiniLM got `E-4290` wrong) |
| Keyword only | Exact, explainable, cheap | Misses paraphrase ("text message codes" ≠ "SMS") |
| Hybrid + RRF | Best recall@5 in Lab 05 (1.000 with local embeddings) | Can push a perfect vector #1 to #2 (lower R@1); one more query per request |
| Weighted fusion | Tunable | Weights need data, and scores must be normalised |

## ⚠️ Common mistakes
1. **Adding raw scores from different systems.** They aren't comparable; use RRF or normalise carefully.
2. **Trusting the default text parser with identifiers.**
3. **AND-ing every query word**, which returns zero results for natural questions.
4. **Skipping keyword search because "embeddings are smart".** A strong embedder narrows the gap, and hybrid search is cheap insurance.

## Senior check
You can explain RRF and why it needs no normalisation, give three query types where keyword search beats vectors, and design the Postgres schema for hybrid search.

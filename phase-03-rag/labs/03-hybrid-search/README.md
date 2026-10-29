# Lab 03: Hybrid search with RRF (≈60 min)

**Concept:** [theory/04-hybrid-search.md](../../theory/04-hybrid-search.md) · **Visualization:** [hybrid-rrf.html](../../visualizations/hybrid-rrf.html) · **Needs:** `npm run db:up`

## Task
In `starter/index.ts`:
1. `addFullTextSearch`: a **migration** adding a generated `tsvector` column (section weighted above body) and a GIN index.
2. `keywordSearch`: OR the query's lexemes, rank with `ts_rank_cd`, and **boost exact identifiers** found by `extractIdentifiers`.
3. `rrf`: Reciprocal Rank Fusion, `Σ 1/(k + rank)`, which fuses on ranks so scores never need normalising.
4. `hybridSearch`: keyword + vector in parallel → RRF.

## Run
```bash
npx tsx phase-03-rag/labs/03-hybrid-search/check.ts starter
```

## What to notice (measured)
| Query | keyword | vector (local MiniLM) | vector (Gemini) | hybrid |
|---|---|---|---|---|
| `E-4290` | ✓ | ✗ (Server errors) | ✓ | ✓ |
| `INV-20260412` | ✓ | ✗ | ✓ | ✓ |
| "How do I undo a bad release?" | ✓ | ✓ | ✓ | ✓ |
| "Are text message codes OK for two-factor login?" | ✗ | ✓ | ✓ | ✓ |

- Postgres's English parser turns `E-4290` into `e` and `-4290`, so every chunk listing error codes matched on `e`, and the first version ranked *Authentication errors* first. Identifiers need exact matching (at scale, a `pg_trgm` index).
- A strong embedder narrows the gap, and hybrid is cheap insurance when it doesn't.
- Postgres `ts_rank_cd` isn't BM25 (no corpus-wide IDF). For BM25 inside Postgres, look at ParadeDB `pg_search` (optional).

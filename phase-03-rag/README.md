# Phase 3: Retrieval-Augmented Generation (RAG)

**Level:** Core · **Time budget:** ~22 h (4–5 days at 5–6 h/day, or weeks 4–5 of the 12-week plan) · **Keys:** optional. Every lab and the project run offline with local CPU models (MiniLM embeddings, a cross-encoder reranker) and a mock LLM. With a free **Gemini** key they also run live. · **Needs:** Docker (Postgres 18 + pgvector).

Phase 2 gave you the API. This phase gives the model **your data**: cut documents into chunks, embed them into Postgres, find the right passages with hybrid search, answer only from them with citations, and **measure** each step. Most of the work is retrieval and evaluation; the LLM call is the easy part. It ends with a "chat with your docs" app that you'll reuse in Phases 4 and 5.

## Learning objectives
By the end you can:
1. Chunk Markdown by structure (sections, fences, tables), add context headers, and say what fixed-size chunking breaks.
2. Store and query vectors in **Postgres + pgvector**: schema, HNSW index, cosine distance, `ef_search`, and approximate-vs-exact recall.
3. Build **hybrid search** (full-text + vector) fused with **Reciprocal Rank Fusion**, and explain the exact-identifier failure of embeddings.
4. Add a **cross-encoder reranker** and decide from numbers whether it pays for its latency.
5. Evaluate retrieval on its own with a **golden set**: recall@k, precision@k, MRR, nDCG, labelled at section level.
6. Generate **grounded** answers: numbered sources as untrusted data, inline citations, citation validation, "I don't know", deprecated-doc filtering, and injection defence.
7. Ship it: idempotent ingestion, a streaming chat that sends sources first, and an eval that can fail CI.

## Prerequisites
- Phases 1–2 (embeddings and cosine similarity from Phase 1 Lab 05; streaming, structured output and `useChat` from Phase 2).
- **Docker** installed and usable by your user. Then, from the repo root:
  ```bash
  npm run db:up      # Postgres 18.6 + pgvector 0.8.7 on localhost:5433 (databases: rag, rag_test)
  npm run db:psql    # a psql shell, if you want to look around
  ```
- Basic SQL (joins, indexes, transactions). You don't need prior pgvector experience.

## 📺 Watch / read this first (in order, ~1 h 50 min)
1. **Anthropic: [Introducing Contextual Retrieval](https://www.anthropic.com/engineering/contextual-retrieval)** · 20 min. The clearest primary source on why plain chunk embeddings miss, and how context headers, BM25 hybrid search and reranking each cut failures. Labs 01, 03 and 04 rebuild those ideas.
2. **Pinecone: [Chunking Strategies for LLM Applications](https://www.pinecone.io/learn/chunking-strategies/)** · 20 min. A survey of fixed, structure-aware, semantic and contextual chunking. Read it before Lab 01.
3. **pgvector [README](https://github.com/pgvector/pgvector)**: the sections *Getting Started*, *Querying*, *HNSW* and *Filtering* · 25 min. The reference for Lab 02.
4. **Supabase docs: [Hybrid search](https://supabase.com/docs/guides/ai/hybrid-search)** · 15 min. RRF in a single Postgres function, almost exactly the approach Lab 03 builds.
5. **Jason Liu: [Levels of Complexity: RAG Applications](https://jxnl.co/writing/2024/02/28/levels-of-complexity-rag-applications/)** · 30 min. A practitioner's map from a basic pipeline to observability and evals. Return to it after the project.

*(Optional, 20 min)* **AI SDK: [RAG Agent guide](https://ai-sdk.dev/cookbook/guides/rag-chatbot)**. Same stack as the project (Next.js + pgvector + AI SDK) but simpler, with retrieval as a tool. Skim it to compare designs, and note that it is vector-only with no evals.

## Work plan
| # | Item | Type | Time |
|---|---|---|---|
| 1 | [RAG overview](theory/01-rag-overview.md) + [pipeline viz](visualizations/rag-pipeline.html) | theory + viz | 35 min |
| 2 | [Chunking](theory/02-chunking.md) + [chunking playground](visualizations/chunking-playground.html) | theory + viz | 35 min |
| 3 | [Lab 01: structure-aware chunking](labs/01-chunking) | lab | 60 min |
| 4 | [Embeddings and vector search](theory/03-embeddings-and-vector-search.md) + [HNSW viz](visualizations/hnsw-search.html) | theory + viz | 40 min |
| 5 | [Lab 02: pgvector](labs/02-pgvector) | lab | 60 min |
| 6 | [Hybrid search](theory/04-hybrid-search.md) + [RRF viz](visualizations/hybrid-rrf.html) | theory + viz | 30 min |
| 7 | [Lab 03: hybrid search + RRF](labs/03-hybrid-search) | lab | 60 min |
| 8 | [Reranking](theory/05-reranking.md) + [rerank funnel viz](visualizations/rerank-funnel.html) | theory + viz | 25 min |
| 9 | [Lab 04: cross-encoder reranking](labs/04-reranking) | lab | 45 min |
| 10 | [Retrieval evaluation](theory/07-retrieval-evaluation.md) + [metrics viz](visualizations/retrieval-metrics.html) | theory + viz | 35 min |
| 11 | [Lab 05: retrieval evals](labs/05-retrieval-evals) | lab | 60 min |
| 12 | [Grounded generation and citations](theory/06-generation-and-citations.md) | theory | 25 min |
| 13 | [Lab 06: grounded answers with citations](labs/06-grounded-generation) | lab | 60 min |
| 14 | [Project: Docs Chat](project/) | project | 7–8 h |
| 15 | [Quiz + interview questions](quiz.md) | review | 30 min |

Theory 06 comes after the eval lab on purpose. Once you can measure retrieval, you can tell a bad answer caused by retrieval apart from one caused by generation.

Suggested split at 5–6 h/day: **Day 1**: reading + items 1–5 · **Day 2**: items 6–11 · **Day 3**: items 12–13 + start the project · **Day 4**: finish the project · **Day 5 (half)**: run the eval live, try one stretch goal, quiz.

## How to run things
```bash
npm run db:up              # once per boot
npm run verify:p3          # all Phase 3 labs + project: local embeddings + mock LLM (offline, free)
npm run verify:p3:live     # same with Gemini embeddings + model from .env (uses free-tier quota)
npx tsx phase-03-rag/labs/03-hybrid-search/check.ts starter    # one lab, your code
```
- Labs use the **`rag_test`** database and their own tables; the project uses **`rag`** (`DATABASE_URL`). `npm run db:reset` wipes both.
- Local models download once into `.cache/models` (MiniLM ≈ 90 MB, reranker ≈ 280 MB) and then run on the CPU. They run in **fp32**, because the q8 builds gave non-deterministic scores (see Phase 1).
- Gemini embeddings: the free tier counts **every text** against ~100 per minute. `shared/embeddings.ts` paces requests (90/min) and caches vectors on disk in `.cache/embeddings`, so a re-run costs nothing.

## ⚠️ The concepts most people get wrong (flagged throughout)
1. **"A similarity threshold tells me when the docs don't have the answer."** It doesn't. Measured on this corpus, the top scores for unanswerable questions (local 0.38–0.44, Gemini 0.61–0.67) **overlap** those of answerable ones (10th percentile: 0.42 local, 0.72 Gemini). Refusal has to come from the model reading the sources, then be checked. → [06](theory/06-generation-and-citations.md), Lab 06
2. **"Embeddings understand everything, so vector search is enough."** Embeddings blur exact tokens: for the query `E-4290`, local vector search returned *Server errors* as its top hit, not the code's own entry. Keyword search found the right entry, but only after an identifier boost, because Postgres' English parser splits it into `e` and `-4290`. → [04](theory/04-hybrid-search.md), Lab 03
3. **"If the answer is wrong, change the prompt or the model."** First check **whether the right passage was retrieved at all**. Evaluate retrieval separately (recall@k, MRR), with labels at section level so they survive re-chunking. → [07](theory/07-retrieval-evaluation.md), Lab 05
4. **"Long context windows make RAG obsolete."** Stuffing everything costs tokens on every call, raises latency, hurts accuracy in the middle of long contexts, and can't filter deprecated or out-of-tenant documents. Retrieval is also your **access-control** and **freshness** layer. → [01](theory/01-rag-overview.md)

## Real numbers measured while building this phase (2026-10-29, i7-6820HQ CPU, no GPU)
| Observation | Value | Where |
|---|---|---|
| Fixed 40-token chunks vs structure-aware | 2 of 12 code fences cut in half vs 0 | Lab 01 |
| HNSW recall on 20k random vectors, `ef_search` 10 vs 100 | 19% vs 92% | Lab 02 |
| Hybrid vs vector-only on 4 hand-picked hard queries | hybrid wins all 4 | Lab 03 |
| Retrieval (local MiniLM): keyword / vector / hybrid, recall@5 | .984 / .922 / 1.000 (MRR .741 / .862 / .823) | Lab 05 |
| Retrieval (Gemini 768): vector / hybrid, recall@5 | .969 / .984 (MRR .948 / .948) | Lab 05 |
| Cross-encoder rerank, MRR change | local .839 → .906 · Gemini .964 → .901 (worse) · ~2 s/query on CPU | Lab 04 |
| Live grounded answers (`gemini-3.5-flash-lite`) | 31/32 correct, 3/3 refusals, 0 citation problems | Lab 06 |
| Project ingest, 11 docs → 54 chunks | 1.9 s local · 10.8 s Gemini · re-run 0.1 s, 0 embeddings | Project |
| Project eval live (`npm run eval -- --answers`) | recall@5 .984 · MRR .948 · answer accuracy .971 (34/35) | Project |
| Project retrieval latency | 5–9 ms local · 0.5–1.0 s Gemini (embedding API call) | Project |

Two conclusions you should be able to defend from this table. First, **a reranker isn't free accuracy**: it helped the weak embedder and hurt the strong one. Second, **hybrid search raised recall but slightly lowered MRR with local embeddings**, so "add more components" isn't automatically better. Measure, then decide.

## ✅ What a senior should be able to explain after this phase
- [ ] The RAG pipeline end to end, and which stage to check first when an answer is wrong
- [ ] Chunk size and structure trade-offs, why context headers help, and why labels belong to sections, not chunks
- [ ] How HNSW finds neighbours approximately, what `m`, `ef_construction` and `ef_search` trade, and why filtered ANN can return fewer than k rows
- [ ] Why one table (or column) per embedding model, and what a model upgrade costs operationally
- [ ] Keyword vs semantic retrieval failure modes, how RRF fuses them without score normalisation, and when to boost exact identifiers
- [ ] Bi-encoder vs cross-encoder, the retrieve-many-then-rerank funnel, and how to decide whether it pays for its latency
- [ ] recall@k vs precision@k vs MRR vs nDCG: what each answers, and which you'd gate CI on
- [ ] How to make answers grounded and checkable: numbered sources, inline citations, validation, the "I don't know" path, and why similarity thresholds can't replace it
- [ ] Indirect prompt injection through documents, and the layered defences (strip at ingestion, delimit, filter, validate)
- [ ] Idempotent ingestion: content hashes, atomic per-document replacement, deletions, and never holding a transaction open across an API call

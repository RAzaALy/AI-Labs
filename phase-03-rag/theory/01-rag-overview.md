# 1. RAG: the pipeline and where it breaks

**Time:** 25 min · **Visualization:** [`rag-pipeline.html`](../visualizations/rag-pipeline.html)

## The idea
**Retrieval-augmented generation** answers questions from *your* documents: at request time, find the few passages that matter and put them in the prompt with instructions to answer only from them and cite them. The model's job shrinks from "know everything" to "read these five paragraphs carefully".

```
OFFLINE (ingestion)   documents → clean → chunk → embed → store (vectors + text + metadata)
ONLINE (per question) question → retrieve (keyword + vector) → fuse → rerank? → build context → generate with citations → validate
```

## Web-engineering analogy
RAG is **server-side includes for knowledge**: the page template (prompt) is fixed, and the fragments (sources) are fetched per request from an index. Ingestion is an **ETL job**, and the vector index is a **search index you own and must keep in sync**: stale, duplicated or deleted documents are data bugs, not model bugs.

## RAG vs long context vs fine-tuning
| Approach | Use when | Weak at |
|---|---|---|
| **RAG** | Facts change, data is private or per-user, you need citations and access control | Questions needing the whole corpus at once ("summarise all incidents this year") |
| **Long context** (stuff everything) | Small corpus (< ~100k tokens), one-off analysis | Cost and latency per request (Phase 1: quadratic history), quality degrades as context fills |
| **Fine-tuning** | Style, format, narrow behaviour | Facts: unreliable, stale, no citations (Phase 6) |

## Where RAG breaks (debug in this order)
1. **Ingestion:** the content isn't there, isn't current, or was parsed badly (tables flattened, code split, hidden text kept).
2. **Retrieval:** the right section exists but doesn't reach the top-k (wrong chunking, embedding blind spots, exact codes, no hybrid, no filters).
3. **Context building:** too many or too few sources, bad ordering, conflicting versions, missing metadata.
4. **Generation:** the model ignores the sources, mixes in outside knowledge, mis-cites, or answers when it should refuse.

⚠️ **Most bad answers are retrieval failures (one of the four big misconceptions).** Teams tune prompts for days when the right paragraph never reached the model. Measure retrieval separately (Lab 05) before touching the prompt.

## Trade-offs
| Knob | More | Less |
|---|---|---|
| top-k sources | Higher recall | More tokens, more noise, worse "lost in the middle" |
| Chunk size | More context per hit | Blurrier embeddings, fewer distinct hits |
| Reranking | Better precision on big or noisy corpora | Latency (≈2 s/query on a laptop CPU in Lab 04), and can hurt a strong first stage |

## ⚠️ Common mistakes
1. **Tuning the prompt for a retrieval problem.** Check recall@k first.
2. **No metadata:** no `status`, `updated`, `owner`, `tenant` columns, so you can't filter stale docs or enforce access.
3. **Treating retrieved text as trusted.** Documents can contain instructions (indirect prompt injection).
4. **One giant index without evals.** Changes to chunking or embedders silently regress quality.

## Senior check
You can draw the pipeline, name the four failure layers in debugging order, and explain when you'd *not* use RAG.

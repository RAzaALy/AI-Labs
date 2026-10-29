# 2. Chunking

**Time:** 20 min · **Visualization:** [`chunking-playground.html`](../visualizations/chunking-playground.html) · **Lab:** [`labs/01-chunking`](../labs/01-chunking)

## The idea
You retrieve **chunks**, not documents, because one embedding can't faithfully represent a 20-page doc (meaning averages into mush) and the prompt has a budget. Chunking decides what can ever be found: a fact split across two chunks may be found by neither.

Strategies, from naive to better:
1. **Fixed-size windows** (N tokens with overlap): simple and structure-blind. They cut code blocks, tables and sentences.
2. **Recursive / structure-aware:** split by headings, then paragraphs, then sentences, packing pieces up to a limit. Keeps code blocks and table rows intact.
3. **Contextual chunks:** prepend the document title and heading path ("Deploys and rollbacks > Rolling back a bad release") to the text you *embed*. A chunk saying "it takes about two minutes" means nothing without its heading. Anthropic's *contextual retrieval* goes further and has an LLM write a context sentence per chunk.
4. **Small-to-big (parent/child):** embed small chunks for precise matching, but send the larger parent section to the model.

## Web-engineering analogy
Chunking is **choosing the granularity of your search index entries**: index whole pages and every result is "the docs homepage"; index single sentences and you lose context. It's like designing database rows: the unit you store is the unit you can retrieve.

## Trade-offs
| Choice | Upside | Downside |
|---|---|---|
| Small chunks (100–200 tokens) | Precise matches, cheap context | Facts split across chunks; needs a context header |
| Large chunks (500–1,000) | Self-contained context | Blurry embeddings; fewer distinct hits per token budget |
| Overlap | Facts on boundaries survive | Duplicate content, more storage and tokens |
| Structure-aware | Respects meaning | Needs per-format parsers (markdown, HTML, PDF) |

## ⚠️ Common mistakes
1. **Splitting code blocks and tables.** Lab 01: fixed windows broke 2 of 12 deploy-guide chunks mid-fence.
2. **No progress guarantee.** A recursive splitter must fall back to fixed windows; the first version of Lab 01 recursed forever on a large table.
3. **Embedding chunks without their heading.** "Roll back with `acme deploy rollback`" is findable; "It takes about two minutes" isn't.
4. **Keeping invisible text.** HTML comments, white-on-white PDF text and alt-text can carry prompt injections. Strip or flag them at ingestion.
5. **Tuning chunk size without evals.** In Lab 05, 200 vs 400 tokens made no difference because the sections were short. Your corpus will differ, so measure.

## Senior check
You can choose a chunking strategy for markdown docs, PDFs with tables, and code, and explain how you'd test the choice.
